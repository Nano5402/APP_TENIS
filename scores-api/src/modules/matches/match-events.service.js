const db = require('../../config/db')
const matchesService = require('./matches.service')
const { closureInfo, snapshotFromSets } = require('../../utils/matchClosure')
const { validateDelivery, assertSameDelivery, revisionOf, configurationOf } = require('./eventDelivery')
const {
  applyEvent,
  computeBreakpoint,
  createInitialState,
  projectSets,
  serializeState,
} = require('./score.engine')

exports.getManagedMatches = async (user) => {
  if (user.rol === 'admin' || user.rol === 'juez_director') return matchesService.getAll({ orden: 'asc' })
  return matchesService.getAll({ juez_id: user.id, orden: 'asc' })
}

exports.getControl = async (id, user, { lightweight = false } = {}) => {
  const matchRow = await getManageableMatch(id, user)
  const match = await matchesService.getById(id)
  const [lastEvents] = await db.query(
    `SELECT id, secuencia, tipo, ganador, motivo, servidor, numero_servicio,
            marcador_despues, created_at
     FROM eventos_partido
     WHERE partido_id = ? AND anulado_at IS NULL
     ORDER BY secuencia DESC
     LIMIT 20`,
    [id]
  )
  let state = lastEvents.length
    ? parseJson(lastEvents[0].marcador_despues)
    : createInitialState(matchRow)

  const [pointEvents] = lightweight ? [[]] : await db.query(
    `SELECT tipo, ganador, motivo, servidor, numero_servicio, marcador_antes
     FROM eventos_partido
     WHERE partido_id = ? AND anulado_at IS NULL
     ORDER BY secuencia`,
    [id]
  )
  const [liveRows] = await db.query(
    `SELECT iniciado_at, pausado_at, segundos_pausa, finalizado_at
     FROM estado_en_vivo_partido
     WHERE partido_id = ?
     LIMIT 1`,
    [id]
  )

  const [revisionRows] = await db.query(
    `SELECT COALESCE(MAX(secuencia), 0) AS sequence,
      COUNT(CASE WHEN anulado_at IS NULL THEN 1 END) AS active,
      (SELECT marcador_despues FROM eventos_partido WHERE partido_id = ? AND anulado_at IS NULL ORDER BY secuencia DESC LIMIT 1) AS latest_state
     FROM eventos_partido WHERE partido_id = ?`, [id, id]
  )
  if (revisionRows[0] && 'latest_state' in revisionRows[0]) state = parseJson(revisionRows[0].latest_state) || createInitialState(matchRow)
  if ((!lastEvents.length && !revisionRows[0]?.latest_state) || matchRow.notas?.includes('[Victoria por W.O. (6/0 6/0)]')) state = snapshotFromSets(match, match.sets) || state
  if (matchRow.estado === 'finalizado') state = { ...state, winner: matchRow.ganador || null }
  const breakpoint = computeBreakpoint(state, matchRow)
  let doublesOrder = null
  if (matchRow.equipo1_id && matchRow.equipo2_id) {
    const [orders] = await db.query("SELECT detalle FROM auditoria_control_partido WHERE partido_id = ? AND accion = 'orden_saque_dobles' ORDER BY id DESC LIMIT 1", [id])
    const order = parseJson(orders[0]?.detalle)
    if (order?.set === state.currentSet && order.team1 === matchRow.equipo1_id && order.team2 === matchRow.equipo2_id) doublesOrder = order
  }
  let suspension = null
  if (liveRows[0]?.pausado_at) {
    const [entries] = await db.query("SELECT accion, detalle FROM auditoria_control_partido WHERE partido_id = ? AND accion IN ('suspender', 'pausar', 'reanudar') ORDER BY id DESC LIMIT 1", [id])
    if (entries[0]?.accion === 'suspender') suspension = parseJson(entries[0].detalle)?.motivo || null
  }

  return {
    partido: match,
    doubles_order: doublesOrder,
    marcador: { ...serializeState(state), breakpoint },
    breakpoint,
    estadisticas: lightweight ? null : buildStats(pointEvents),
    walkover: closureInfo(match),
    revision: revisionOf(revisionRows[0]),
    configuration: configurationOf(matchRow),
    eventos_recientes: lastEvents.map(formatEvent),
    en_vivo: { ...formatLiveState(liveRows[0]), motivo_suspension: suspension },
  }
}

exports.getStats = async (id, setNumber = null) => {
  const match = await matchesService.getById(id)
  const selectedSet = setNumber === null || setNumber === undefined || setNumber === ''
    ? null
    : Number(setNumber)
  if (selectedSet !== null && (!Number.isInteger(selectedSet) || selectedSet < 1 || selectedSet > 127)) {
    throw { status: 400, message: 'El set seleccionado no es válido' }
  }

  const [events] = await db.query(
    `SELECT tipo, ganador, motivo, servidor, numero_servicio, marcador_antes
     FROM eventos_partido
     WHERE partido_id = ? AND anulado_at IS NULL
     ORDER BY secuencia`,
    [id]
  )
  const setNumbers = events
    .map((event) => Number(parseJson(event.marcador_antes)?.currentSet || 1))
    .filter((value) => Number.isInteger(value))

  return {
    estadisticas: buildStats(events, selectedSet),
    walkover: closureInfo(match),
    tiene_correcciones: events.some((event) => event.tipo === 'correccion'),
    total_sets: Math.max(0, ...setNumbers, match.sets?.length || 0),
    set: selectedSet,
  }
}

exports.startMatch = async (id, user) => {
  const connection = await db.getConnection()
  let scheduleLocked = false
  try {
    await require('./scheduling.service').lock(connection); scheduleLocked = true
    await connection.beginTransaction()
    const [[target]] = await connection.query('SELECT torneo_id FROM partidos WHERE id=?', [id])
    if (target?.torneo_id) await connection.query('SELECT id FROM torneos WHERE id=? FOR UPDATE', [target.torneo_id])
    const [matches] = await connection.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [id])
    if (!matches.length) throw { status: 404, message: 'Partido no encontrado' }
    assertCanManage(matches[0], user)
    if (matches[0].estado !== 'en_vivo') {
      await require('../torneos/retiros.service').assertAvailable(matches[0], connection)
    }
    if (matches[0].estado === 'finalizado' || matches[0].estado === 'cancelado') {
      throw { status: 409, message: 'Este partido no se puede iniciar' }
    }
    await require('./scheduling.service').assertAvailable({ ...matches[0], estado: 'en_vivo' }, connection)
    await ensureLiveState(connection, id)
    await connection.query(
      `UPDATE estado_en_vivo_partido
       SET pausado_at = NULL, finalizado_at = NULL
       WHERE partido_id = ?`,
      [id]
    )
    await connection.query("UPDATE partidos SET estado = 'en_vivo' WHERE id = ?", [id])
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    if (scheduleLocked) await require('./scheduling.service').unlock(connection)
    connection.release()
  }
  return exports.getControl(id, user)
}

exports.setPaused = async (id, paused, user, motivo) => {
  if (typeof paused !== 'boolean') throw { status: 400, message: 'El estado de pausa debe ser verdadero o falso' }
  if (motivo !== undefined && (!paused || typeof motivo !== 'string' || motivo.trim().length < 5 || motivo.trim().length > 500)) {
    throw { status: 400, message: 'Indica un motivo de suspensión entre 5 y 500 caracteres' }
  }
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [matches] = await connection.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [id])
    if (!matches.length) throw { status: 404, message: 'Partido no encontrado' }
    assertCanManage(matches[0], user)
    if (matches[0].estado !== 'en_vivo') {
      throw { status: 409, message: 'Solo puedes pausar un partido en vivo' }
    }
    await ensureLiveState(connection, id)
    const [liveRows] = await connection.query(
      'SELECT pausado_at FROM estado_en_vivo_partido WHERE partido_id = ? FOR UPDATE',
      [id]
    )
    if (Boolean(liveRows[0].pausado_at) !== paused || motivo !== undefined) {
      await connection.query('INSERT INTO auditoria_control_partido (partido_id, created_by, accion, detalle) VALUES (?, ?, ?, ?)',
        [id, user.id, paused ? (motivo === undefined ? 'pausar' : 'suspender') : 'reanudar', JSON.stringify({ motivo: motivo?.trim() || null })])
    }
    if (paused && !liveRows[0].pausado_at) {
      if (motivo !== undefined) await require('./schedule-notifications').notify(connection, matches[0], ['El encuentro fue suspendido. Consulta su estado antes de dirigirte a la cancha.'])
      await connection.query(
        'UPDATE estado_en_vivo_partido SET pausado_at = NOW() WHERE partido_id = ?',
        [id]
      )
    } else if (!paused && liveRows[0].pausado_at) {
      await connection.query(
        `UPDATE estado_en_vivo_partido
         SET segundos_pausa = segundos_pausa + TIMESTAMPDIFF(SECOND, pausado_at, NOW()),
             pausado_at = NULL
         WHERE partido_id = ?`,
        [id]
      )
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
  return exports.getControl(id, user)
}

exports.setDoublesOrder = async (id, body, user) => {
  if (![1, 2].includes(body.first1) || ![1, 2].includes(body.first2)) throw { status: 400, message: 'Selecciona el primer sacador de cada pareja' }
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [id])
    if (!rows.length) throw { status: 404, message: 'Partido no encontrado' }
    const match = rows[0]
    assertCanManage(match, user)
    if (!match.equipo1_id || !match.equipo2_id || !['programado', 'en_vivo'].includes(match.estado)) throw { status: 409, message: 'Solo disponible para dobles sin finalizar' }
    const [events] = await conn.query('SELECT marcador_despues FROM eventos_partido WHERE partido_id = ? AND anulado_at IS NULL ORDER BY secuencia DESC LIMIT 1', [id])
    const state = parseJson(events[0]?.marcador_despues) || createInitialState(match)
    const set = state.sets[state.currentSet - 1]
    if (state.currentSet !== body.set || state.winner || set.games.some(Boolean) || state.points.some(Boolean) || state.serviceAttempt !== 1) throw { status: 409, message: 'Confirma el orden antes del primer punto y del primer saque del set' }
    const [teams] = await conn.query('SELECT id, jugador1_id, jugador2_id FROM equipos_padel WHERE id IN (?, ?)', [match.equipo1_id, match.equipo2_id])
    if (teams.length !== 2 || teams.some(team => !team.jugador1_id || !team.jugador2_id)) throw { status: 409, message: 'Las parejas deben tener sus dos jugadores registrados' }
    await conn.query('INSERT INTO auditoria_control_partido (partido_id, created_by, accion, detalle) VALUES (?, ?, ?, ?)', [id, user.id, 'orden_saque_dobles', JSON.stringify({ set: state.currentSet, firstSide: state.server, first1: body.first1, first2: body.first2, team1: match.equipo1_id, team2: match.equipo2_id })])
    await conn.commit()
  } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
  return exports.getControl(id, user)
}

exports.changeServer = async (id, server, user) =>
  exports.addEvent(id, { tipo: 'cambio_servidor', ganador: server }, user)

exports.addEvent = async (id, event, user) => {
  validateDelivery(event)
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [matches] = await connection.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [id])
    if (!matches.length) throw { status: 404, message: 'Partido no encontrado' }
    assertCanManage(matches[0], user)
    if (event.client_action_id) {
      const [saved] = await connection.query('SELECT partido_id, created_by, tipo, ganador, motivo FROM eventos_partido WHERE client_action_id = ? LIMIT 1', [event.client_action_id])
      if (saved.length) {
        assertSameDelivery(saved[0], event, user, id)
        await connection.commit()
        return exports.getControl(id, user, { lightweight: true })
      }
      if (event.expected_configuration !== configurationOf(matches[0])) {
        throw { status: 409, message: 'Cambió el formato o los participantes del partido. Revisa las acciones pendientes.' }
      }
      const [versions] = await connection.query('SELECT COALESCE(MAX(secuencia), 0) AS sequence, COUNT(CASE WHEN anulado_at IS NULL THEN 1 END) AS active FROM eventos_partido WHERE partido_id = ?', [id])
      if (event.expected_revision !== revisionOf(versions[0])) {
        throw { status: 409, message: 'El marcador cambió desde otro dispositivo. Revisa la acción pendiente antes de continuar.' }
      }
    }
    if (matches[0].estado === 'finalizado' || matches[0].estado === 'cancelado') {
      throw { status: 409, message: 'Este partido ya no admite cambios' }
    }
    if (matches[0].estado === 'programado')
      await require('../torneos/retiros.service').assertAvailable(matches[0], connection)
    await ensureLiveState(connection, id)
    const [liveRows] = await connection.query(
      'SELECT pausado_at FROM estado_en_vivo_partido WHERE partido_id = ? FOR UPDATE',
      [id]
    )
    if (liveRows[0]?.pausado_at) {
      throw { status: 409, message: 'Reanuda el partido antes de registrar acciones' }
    }

    const [lastEvents] = await connection.query(
      `SELECT marcador_despues
       FROM eventos_partido
       WHERE partido_id = ? AND anulado_at IS NULL
       ORDER BY secuencia DESC
       LIMIT 1`,
      [id]
    )
    const before = lastEvents.length
      ? parseJson(lastEvents[0].marcador_despues)
      : createInitialState(matches[0])
    const after = applyEvent(before, event, matches[0])

    const [sequenceRows] = await connection.query(
      'SELECT COALESCE(MAX(secuencia), 0) + 1 AS siguiente FROM eventos_partido WHERE partido_id = ?',
      [id]
    )
    const sequence = Number(sequenceRows[0].siguiente)
    await connection.query(
      `INSERT INTO eventos_partido
         (partido_id, secuencia, tipo, ganador, motivo, servidor, numero_servicio,
          marcador_antes, marcador_despues, created_by, client_action_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sequence,
        event.tipo,
        event.ganador || null,
        event.motivo || null,
        before.server,
        before.serviceAttempt,
        JSON.stringify(serializeState(before)),
        JSON.stringify(serializeState(after)),
        user.id,
        event.client_action_id || null,
      ]
    )

    await syncProjection(connection, matches[0], after, 'en_vivo')
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  return exports.getControl(id, user, { lightweight: true })
}

exports.undoLastEvent = async (id, user) => {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [matches] = await connection.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [id])
    if (!matches.length) throw { status: 404, message: 'Partido no encontrado' }
    assertCanManage(matches[0], user)
    if (matches[0].estado === 'cancelado') {
      throw { status: 409, message: 'Reactiva el partido antes de deshacer acciones' }
    }

    const [lastEvents] = await connection.query(
      `SELECT id, tipo
       FROM eventos_partido
       WHERE partido_id = ? AND anulado_at IS NULL
       ORDER BY secuencia DESC
       LIMIT 1`,
      [id]
    )
    if (!lastEvents.length) throw { status: 409, message: 'No hay eventos para deshacer' }
    if (lastEvents[0].tipo === 'correccion') {
      throw { status: 409, message: 'Una corrección supervisada no se deshace desde la mesa. Solicita otra corrección al director.' }
    }

    await connection.query(
      'UPDATE eventos_partido SET anulado_at = NOW(), anulado_por = ? WHERE id = ?',
      [user.id, lastEvents[0].id]
    )
    const [previousEvents] = await connection.query(
      `SELECT marcador_despues
       FROM eventos_partido
       WHERE partido_id = ? AND anulado_at IS NULL
       ORDER BY secuencia DESC
       LIMIT 1`,
      [id]
    )
    const restored = previousEvents.length
      ? parseJson(previousEvents[0].marcador_despues)
      : createInitialState(matches[0])
    const [liveRows] = await connection.query(
      'SELECT iniciado_at FROM estado_en_vivo_partido WHERE partido_id = ? LIMIT 1',
      [id]
    )
    await syncProjection(
      connection,
      matches[0],
      restored,
      previousEvents.length || liveRows[0]?.iniciado_at ? 'en_vivo' : 'programado'
    )
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  return exports.getControl(id, user)
}

async function getManageableMatch(id, user) {
  const [rows] = await db.query('SELECT * FROM partidos WHERE id = ? LIMIT 1', [id])
  if (!rows.length) throw { status: 404, message: 'Partido no encontrado' }
  assertCanManage(rows[0], user)
  return rows[0]
}

function assertCanManage(match, user) {
  if (user.rol === 'admin' || user.rol === 'juez_director') return
  if (user.rol === 'juez' && Number(match.juez_id) === Number(user.id)) return
  throw { status: 403, message: 'Este partido no está asignado a tu cuenta de juez' }
}

async function syncProjection(connection, match, state, fallbackStatus) {
  const sets = projectSets(state)
  await connection.query('DELETE FROM sets_partido WHERE partido_id = ?', [match.id])
  const visibleSets = fallbackStatus === 'programado' ? [] : sets
  for (const set of visibleSets) {
    await connection.query(
      `INSERT INTO sets_partido
         (partido_id, numero_set, games_j1, games_j2, tiebreak_j1, tiebreak_j2, completado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        match.id,
        set.numero_set,
        set.games_j1,
        set.games_j2,
        set.tiebreak_j1,
        set.tiebreak_j2,
        set.completado ? 1 : 0,
      ]
    )
  }

  const status = state.winner ? 'finalizado' : fallbackStatus
  await connection.query('UPDATE partidos SET estado = ?, ganador = ? WHERE id = ?', [
    status,
    state.winner || null,
    match.id,
  ])
  if (state.winner) {
    await connection.query(
      `UPDATE estado_en_vivo_partido
       SET finalizado_at = COALESCE(finalizado_at, NOW()), pausado_at = NULL
       WHERE partido_id = ?`,
      [match.id]
    )
  }
  await propagateWinner(connection, match, status, state.winner)
}

async function propagateWinner(connection, match, status, winner) {
  const position = winner === 'jugador1' ? 1 : winner === 'jugador2' ? 2 : null
  const participantColumn = match.equipo1_id || match.equipo2_id ? 'equipo' : 'jugador'
  let participantId =
    status === 'finalizado' && position ? match[`${participantColumn}${position}_id`] : null
  participantId = await require('../torneos/retiros.service').eligibleWinner(match, participantColumn, participantId, connection)

  await connection.query(
    `UPDATE partidos SET ${participantColumn}1_id = ? WHERE origen_partido1_id = ?`,
    [participantId, match.id]
  )
  await connection.query(
    `UPDATE partidos SET ${participantColumn}2_id = ? WHERE origen_partido2_id = ?`,
    [participantId, match.id]
  )
}

function buildStats(events, selectedSet = null) {
  const stats = {
    jugador1: emptyStats(),
    jugador2: emptyStats(),
  }

  for (const event of events) {
    const eventSet = Number(parseJson(event.marcador_antes)?.currentSet || 1)
    if (selectedSet !== null && eventSet !== selectedSet) continue
    if (event.tipo === 'primera_falta') {
      stats[event.servidor].primeras_faltas += 1
      continue
    }
    if (event.tipo !== 'punto') continue

    const winner = event.ganador
    const loser = winner === 'jugador1' ? 'jugador2' : 'jugador1'
    const server = event.servidor
    stats[winner].puntos_ganados += 1
    stats[server].puntos_servicio += 1
    if (winner === server) stats[server].puntos_servicio_ganados += 1

    if (Number(event.numero_servicio) === 1) {
      stats[server].primeros_servicios_dentro += 1
      if (winner === server) stats[server].puntos_primer_servicio_ganados += 1
    } else if (winner === server) {
      stats[server].puntos_segundo_servicio_ganados += 1
    }

    if (event.motivo === 'ace') stats[winner].aces += 1
    if (event.motivo === 'tiro_ganador') stats[winner].tiros_ganadores += 1
    if (event.motivo === 'error_forzado') stats[winner].errores_forzados_provocados += 1
    if (event.motivo === 'error_no_forzado') stats[loser].errores_no_forzados += 1
    if (event.motivo === 'doble_falta') stats[server].dobles_faltas += 1
    if (event.motivo === 'penalizacion') stats[winner].puntos_penalizacion += 1
  }

  for (const side of Object.values(stats)) {
    side.porcentaje_primer_servicio = side.puntos_servicio
      ? Math.round((side.primeros_servicios_dentro / side.puntos_servicio) * 100)
      : 0
  }
  return stats
}

function emptyStats() {
  return {
    puntos_ganados: 0,
    aces: 0,
    dobles_faltas: 0,
    primeras_faltas: 0,
    primeros_servicios_dentro: 0,
    porcentaje_primer_servicio: 0,
    puntos_servicio: 0,
    puntos_servicio_ganados: 0,
    puntos_primer_servicio_ganados: 0,
    puntos_segundo_servicio_ganados: 0,
    tiros_ganadores: 0,
    errores_forzados_provocados: 0,
    errores_no_forzados: 0,
    puntos_penalizacion: 0,
  }
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

function formatEvent(event) {
  return {
    id: event.id,
    secuencia: event.secuencia,
    tipo: event.tipo,
    ganador: event.ganador,
    motivo: event.motivo,
    servidor: event.servidor,
    numero_servicio: Number(event.numero_servicio),
    marcador: serializeState(parseJson(event.marcador_despues)),
    created_at: event.created_at,
  }
}

async function ensureLiveState(connection, id) {
  await connection.query(
    `INSERT INTO estado_en_vivo_partido
       (partido_id, iniciado_at, pausado_at, segundos_pausa, finalizado_at)
     VALUES (?, NOW(), NULL, 0, NULL)
     ON DUPLICATE KEY UPDATE
       iniciado_at = COALESCE(iniciado_at, VALUES(iniciado_at))`,
    [id]
  )
}

function formatLiveState(row) {
  if (!row?.iniciado_at) return null
  return {
    iniciado_at: row.iniciado_at,
    pausado_at: row.pausado_at || null,
    segundos_pausa: Number(row.segundos_pausa || 0),
    finalizado_at: row.finalizado_at || null,
  }
}

async function validateClosure(connection, match, body) {
  if (!Number.isSafeInteger(body?.expected_control_version) || !/^\d+:\d+$/.test(body?.expected_revision || '') || typeof body?.expected_configuration !== 'string')
    throw { status: 400, message: 'Actualiza el partido antes de confirmar el cierre' }
  const [versions] = await connection.query('SELECT COALESCE(MAX(secuencia), 0) AS sequence, COUNT(CASE WHEN anulado_at IS NULL THEN 1 END) AS active FROM eventos_partido WHERE partido_id = ?', [match.id])
  if (Number(match.control_version || 0) !== body.expected_control_version || revisionOf(versions[0]) !== body.expected_revision || configurationOf(match) !== body.expected_configuration)
    throw { status: 409, message: 'El partido cambió. Cierra y vuelve a abrir la acción para revisar el estado actual.' }
  if (typeof body.motivo !== 'string' || body.motivo.trim().length < 3 || body.motivo.trim().length > 500)
    throw { status: 400, message: 'Indica un motivo de entre 3 y 500 caracteres' }
  const [dependents] = await connection.query(`SELECT p.id, p.estado,
    EXISTS (SELECT 1 FROM eventos_partido e WHERE e.partido_id = p.id) AS has_history
    FROM partidos p WHERE p.origen_partido1_id = ? OR p.origen_partido2_id = ? FOR UPDATE`, [match.id, match.id])
  if (dependents.some(p => p.estado !== 'programado' || Number(p.has_history)))
    throw { status: 409, message: 'Un partido dependiente ya comenzó. Solicita la revisión del director.' }
}

exports.walkover = async (id, body, user) => {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [matches] = await connection.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [id])
    if (!matches.length) throw { status: 404, message: 'Partido no encontrado' }
    assertCanManage(matches[0], user)
    await validateClosure(connection, matches[0], body)
    if (!['programado', 'en_vivo'].includes(matches[0].estado)) {
      throw { status: 409, message: 'Solo puedes finalizar por W partidos programados o en vivo' }
    }
    const isDoubleWalkover = body.retirado === 'ambos' || body.ganador === 'ninguno' || body.ganador === null
    const winner = isDoubleWalkover ? null : body.ganador
    const retired = winner === 'jugador1' ? 'jugador2' : winner === 'jugador2' ? 'jugador1' : 'ambos'
    if (body.retirado !== retired || (isDoubleWalkover && body.ganador != null && body.ganador !== 'ninguno'))
      throw { status: 400, message: 'El ganador y el participante retirado no coinciden' }
    for (const field of ['persona_retirada', 'tipo_incidencia']) {
      if (body[field] != null && (typeof body[field] !== 'string' || body[field].length > 250))
        throw { status: 400, message: 'El detalle de la incidencia no es válido' }
    }
    if (!(matches[0].jugador1_id && matches[0].jugador2_id) && !(matches[0].equipo1_id && matches[0].equipo2_id))
      throw { status: 409, message: 'El partido debe tener ambos participantes registrados' }
    if (winner !== null && !['jugador1', 'jugador2'].includes(winner)) {
      throw { status: 400, message: 'Selecciona el participante ganador por W.O. (jugador1 o jugador2) o indica si es doble W' }
    }
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
    if (motivo.length < 3) {
      throw { status: 400, message: 'Indica el motivo del W.O. (mínimo 3 caracteres)' }
    }
    await ensureLiveState(connection, id)
    await connection.query(
      `UPDATE estado_en_vivo_partido SET
       segundos_pausa = segundos_pausa + IF(pausado_at IS NULL, 0, TIMESTAMPDIFF(SECOND, pausado_at, NOW())),
       pausado_at = IF(pausado_at IS NULL, NOW(), pausado_at),
       finalizado_at = NOW() WHERE partido_id = ?`,
      [id]
    )
    const [history] = await connection.query(`SELECT
      EXISTS (SELECT 1 FROM eventos_partido WHERE partido_id = ? AND tipo IN ('punto', 'correccion')) AS has_points,
      EXISTS (SELECT 1 FROM sets_partido WHERE partido_id = ? AND (games_j1 > 0 OR games_j2 > 0 OR completado = 1)) AS has_score`, [id, id])
    // Missing history information is never permission to overwrite a result.
    const hasPlay = !history[0] || history[0].has_points == null || history[0].has_score == null ||
      Boolean(Number(history[0].has_points) || Number(history[0].has_score))
    const assignScore = Boolean(winner) && !hasPlay && (!body.tipo_incidencia || body.tipo_incidencia === 'No presentación (Incomparecencia / No Show)')
    const notaWo = hasPlay ? '[Retiro con juego registrado]'
      : assignScore ? '[Victoria por W.O. (6/0 6/0)]'
      : winner ? '[Victoria por W.O. - Sin parciales asignados]'
      : '[Doble W.O. - Sin ganador]'

    if (assignScore) {
      await connection.query('DELETE FROM sets_partido WHERE partido_id = ?', [id])
      const g1 = winner === 'jugador1' ? 6 : 0
      const g2 = winner === 'jugador2' ? 6 : 0
      await connection.query(`INSERT INTO sets_partido
        (partido_id, numero_set, games_j1, games_j2, tiebreak_j1, tiebreak_j2, completado)
        VALUES (?, 1, ?, ?, NULL, NULL, 1), (?, 2, ?, ?, NULL, NULL, 1)`, [id, g1, g2, id, g1, g2])
    }

    const updatedNotas = matches[0].notas ? `${matches[0].notas}\n${notaWo}` : notaWo
    await connection.query(
      "UPDATE partidos SET estado = 'finalizado', ganador = ?, notas = ?, control_version = control_version + 1 WHERE id = ?",
      [winner, updatedNotas, id]
    )
    await connection.query(
      "INSERT INTO auditoria_control_partido (partido_id, created_by, accion, detalle) VALUES (?, ?, 'walkover', ?)",
      [id, user.id, JSON.stringify({
        ganador: winner,
        retirado: retired,
        persona_retirada: body.persona_retirada || null,
        tipo_incidencia: body.tipo_incidencia || null,
        marcador_asignado: assignScore,
        conserva_juego: hasPlay,
        motivo
      })]
    )
    await propagateWinner(connection, matches[0], 'finalizado', winner)
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
  return exports.getControl(id, user)
}

exports.cancelMatch = async (id, body, user) => {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [matches] = await connection.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [id])
    if (!matches.length) throw { status: 404, message: 'Partido no encontrado' }
    assertCanManage(matches[0], user)
    await validateClosure(connection, matches[0], body)
    if (!['programado', 'en_vivo'].includes(matches[0].estado)) {
      throw { status: 409, message: 'Solo puedes cancelar partidos programados o en vivo' }
    }
    const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : ''
    if (motivo.length < 3) {
      throw { status: 400, message: 'Indica el motivo de la cancelación (mínimo 3 caracteres)' }
    }
    await ensureLiveState(connection, id)
    await connection.query(
      `UPDATE estado_en_vivo_partido SET
       segundos_pausa = segundos_pausa + IF(pausado_at IS NULL, 0, TIMESTAMPDIFF(SECOND, pausado_at, NOW())),
       pausado_at = NOW(),
       finalizado_at = NOW() WHERE partido_id = ?`,
      [id]
    )
    const notaCancel = `[Cancelado - Motivo: ${motivo}]`
    const updatedNotas = matches[0].notas ? `${matches[0].notas}\n${notaCancel}` : notaCancel
    await connection.query(
      "UPDATE partidos SET estado = 'cancelado', ganador = NULL, notas = ?, control_version = control_version + 1 WHERE id = ?",
      [updatedNotas, id]
    )
    await connection.query(
      "INSERT INTO auditoria_control_partido (partido_id, created_by, accion, detalle) VALUES (?, ?, 'cancelar', ?)",
      [id, user.id, JSON.stringify({ motivo })]
    )
    await propagateWinner(connection, matches[0], 'cancelado', null)
    await require('./schedule-notifications').notify(connection, matches[0], ['El encuentro fue cancelado.'])
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
  return exports.getControl(id, user)
}
