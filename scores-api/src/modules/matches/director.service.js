const db = require('../../config/db')
const { buildCorrection } = require('./score-correction')
const { createInitialState, projectSets, serializeState } = require('./score.engine')
const { revisionOf, configurationOf } = require('./eventDelivery')

const fail = (status, message) => {
  throw { status, message }
}
const parse = (value) => (typeof value === 'string' ? JSON.parse(value) : value)

async function change(id, user, body, action, work) {
  if (!['admin', 'juez_director'].includes(user?.rol) && !(action === 'reasignar_cancha' && user?.rol === 'juez'))
    fail(403, 'Esta acción requiere un administrador o juez director')
  if (!Number.isSafeInteger(body?.expected_control_version) || body.expected_control_version < 0)
    fail(400, 'Actualiza el partido antes de realizar esta acción')
  const connection = await db.getConnection()
  let scheduleLocked = false
  try {
    await require('./scheduling.service').lock(connection); scheduleLocked = true
    await connection.beginTransaction()
    const [[target]] = await connection.query('SELECT torneo_id FROM partidos WHERE id=?', [id])
    if (target?.torneo_id)
      await connection.query('SELECT id FROM torneos WHERE id=? FOR UPDATE', [target.torneo_id])
    const [rows] = await connection.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [id])
    if (!rows.length) fail(404, 'Partido no encontrado')
    const match = rows[0]
    if (user.rol === 'juez' && Number(match.juez_id) !== Number(user.id))
      fail(403, 'Solo puedes confirmar la cancha de tus partidos asignados')
    if (Number(match.control_version || 0) !== body.expected_control_version)
      fail(
        409,
        'Otro oficial modificó este partido. Actualiza la información y vuelve a intentarlo.'
      )
    const details = await work(connection, match)
    await require('./schedule-notifications').afterChange(connection, match)
    await connection.query(
      'UPDATE partidos SET control_version = control_version + 1 WHERE id = ?',
      [id]
    )
    await connection.query(
      'INSERT INTO auditoria_control_partido (partido_id, created_by, accion, detalle) VALUES (?, ?, ?, ?)',
      [id, user.id, action, JSON.stringify(details)]
    )
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    if (scheduleLocked) await require('./scheduling.service').unlock(connection)
    connection.release()
  }
  return require('./matches.service').getById(id)
}

exports.reassignCourt = (id, body, user) =>
  change(id, user, body, 'reasignar_cancha', async (conn, match) => {
    if (!['programado', 'en_vivo'].includes(match.estado))
      fail(409, 'Solo puedes reasignar canchas en partidos programados o en vivo')
    const courtId = (body.cancha_id === null || body.cancha_id === '' || body.cancha_id === undefined)
      ? null
      : Number(body.cancha_id)
    if (user.rol === 'juez' && courtId === null) fail(400, 'Selecciona la cancha donde se jugará el partido')
    if (courtId !== null && (!Number.isSafeInteger(courtId) || courtId <= 0))
      fail(400, 'Selecciona una cancha válida o Sin asignar')
    if (courtId !== null) {
      const [courts] = await conn.query(
        "SELECT id, deporte FROM canchas WHERE id = ? AND activa = TRUE LIMIT 1 FOR UPDATE",
        [courtId]
      )
      if (!courts.length) fail(400, 'La cancha seleccionada no está disponible')
      if (courts[0].deporte !== 'ambos' && match.deporte && courts[0].deporte !== match.deporte) {
        fail(400, `La cancha seleccionada es de ${courts[0].deporte} y el partido es de ${match.deporte}`)
      }
      const [occupied] = await conn.query(`SELECT id FROM partidos WHERE cancha_id = ? AND id <> ?
        AND estado IN ('programado', 'en_vivo')
        AND ((estado = 'en_vivo' AND ? = 'en_vivo') OR (fecha_inicio = ? AND hora_inicio = ?)) LIMIT 1`,
        [courtId, id, match.estado, match.fecha_inicio, match.hora_inicio])
      if (occupied.length) fail(409, 'La cancha ya tiene otro partido en vivo o en el mismo horario')
    }
    await require('./scheduling.service').assertAvailable({ ...match, cancha_id: courtId }, conn)
    await conn.query('UPDATE partidos SET cancha_id = ? WHERE id = ?', [courtId, id])
    return { anterior: match.cancha_id, nuevo: courtId }
  })

exports.reassignJudge = (id, body, user) =>
  change(id, user, body, 'reasignar_juez', async (conn, match) => {
    if (!['programado', 'en_vivo'].includes(match.estado))
      fail(409, 'Solo puedes reasignar jueces en partidos programados o en vivo')
    const judgeId = body.juez_id === null ? null : body.juez_id
    if (judgeId !== null && (!Number.isSafeInteger(judgeId) || judgeId <= 0))
      fail(400, 'Selecciona un juez válido o Sin asignar')
    if (judgeId !== null) {
      const [judges] = await conn.query(
        "SELECT id FROM users WHERE id = ? AND rol IN ('juez','juez_director','admin') AND activo = TRUE LIMIT 1",
        [judgeId]
      )
      if (!judges.length) fail(400, 'El juez seleccionado no está disponible')
    }
    await require('./scheduling.service').assertAvailable({ ...match, juez_id: judgeId }, conn)
    await conn.query('UPDATE partidos SET juez_id = ? WHERE id = ?', [judgeId, id])
    return { anterior: match.juez_id, nuevo: judgeId }
  })


exports.cancelMatch = (id, body, user) =>
  change(id, user, body, 'cancelar', async (conn, match) => {
    if (!['programado', 'en_vivo'].includes(match.estado))
      fail(
        409,
        'Solo puedes cancelar partidos programados o en vivo; no se modifican resultados finalizados'
      )
    const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : ''
    await conn.query(
      `UPDATE estado_en_vivo_partido SET
    segundos_pausa = segundos_pausa + IF(pausado_at IS NULL, 0, TIMESTAMPDIFF(SECOND, pausado_at, NOW())),
    pausado_at = NOW(), finalizado_at = NOW() WHERE partido_id = ?`,
      [id]
    )
    const notaCancel = motivo ? `[Cancelado - Motivo: ${motivo}]` : '[Cancelado]'
    const updatedNotas = match.notas ? `${match.notas}\n${notaCancel}` : notaCancel
    await conn.query("UPDATE partidos SET estado = 'cancelado', ganador = NULL, notas = ? WHERE id = ?", [updatedNotas, id])
    return { estado_anterior: match.estado, motivo: motivo || null }
  })

exports.reactivateMatch = (id, body, user) =>
  change(id, user, body, 'reactivar', async (conn, match) => {
    if (match.estado !== 'cancelado') fail(409, 'Solo puedes reactivar un partido cancelado')
    const [latest] = await conn.query(
      'SELECT marcador_despues FROM eventos_partido WHERE partido_id = ? AND anulado_at IS NULL ORDER BY secuencia DESC LIMIT 1',
      [id]
    )
    if (latest[0] && parse(latest[0].marcador_despues)?.winner)
      fail(409, 'El historial ya tiene un ganador. Revisa el resultado antes de reactivar.')
    await require('../torneos/grupos.service').validateMatch(match, conn)
    const [live] = await conn.query(
      'SELECT iniciado_at FROM estado_en_vivo_partido WHERE partido_id = ? LIMIT 1',
      [id]
    )
    const started = Boolean(live[0]?.iniciado_at)
    await require('../torneos/retiros.service').assertAvailable(match, conn)
    await require('./scheduling.service').assertAvailable({ ...match, estado: started ? 'en_vivo' : 'programado' }, conn)
    await conn.query(
      `UPDATE estado_en_vivo_partido SET finalizado_at = NULL,
    pausado_at = IF(iniciado_at IS NULL, NULL, COALESCE(pausado_at, NOW())) WHERE partido_id = ?`,
      [id]
    )
    await conn.query('UPDATE partidos SET estado = ?, ganador = NULL WHERE id = ?', [
      started ? 'en_vivo' : 'programado',
      id,
    ])
    return { estado: started ? 'en_vivo_pausado' : 'programado' }
  })

exports.correctScore = (id, body, user) =>
  change(id, user, body, 'corregir_marcador', async (conn, match) => {
    if (match.estado === 'cancelado') fail(409, 'Reactiva el partido antes de corregir su marcador')
    const [versions] = await conn.query(
      'SELECT COALESCE(MAX(secuencia), 0) AS sequence, COUNT(CASE WHEN anulado_at IS NULL THEN 1 END) AS active FROM eventos_partido WHERE partido_id = ?',
      [id]
    )
    if (
      body.expected_revision !== revisionOf(versions[0]) ||
      body.expected_configuration !== configurationOf(match)
    )
      fail(
        409,
        'El marcador o los participantes cambiaron. Cierra la corrección y vuelve a abrirla para cargar el estado actual.'
      )
    const [live] = await conn.query(
      'SELECT pausado_at FROM estado_en_vivo_partido WHERE partido_id = ? FOR UPDATE',
      [id]
    )
    if (match.estado === 'en_vivo' && !live[0]?.pausado_at)
      fail(409, 'Pausa el partido desde la mesa de juez antes de corregir el marcador')
    if (!(match.jugador1_id && match.jugador2_id) && !(match.equipo1_id && match.equipo2_id))
      fail(409, 'El partido debe tener ambos participantes registrados')
    const state = buildCorrection(match, body)
    if ((match.ganador || null) !== state.winner) {
      const [dependents] = await conn.query(
        `SELECT p.id, p.estado,
      EXISTS (SELECT 1 FROM eventos_partido e WHERE e.partido_id = p.id) AS has_history
      FROM partidos p WHERE p.origen_partido1_id = ? OR p.origen_partido2_id = ? FOR UPDATE`,
        [id, id]
      )
      if (dependents.some((p) => p.estado !== 'programado' || Number(p.has_history)))
        fail(
          409,
          'No se puede cambiar el ganador: otro partido que depende de este resultado ya comenzó o tiene historial'
        )
    }
    const [last] = await conn.query(
      'SELECT marcador_despues FROM eventos_partido WHERE partido_id = ? AND anulado_at IS NULL ORDER BY secuencia DESC LIMIT 1',
      [id]
    )
    const before = last[0]
      ? parse(last[0].marcador_despues)
      : serializeState(createInitialState(match))
    await conn.query(
      `INSERT INTO eventos_partido
    (partido_id, secuencia, tipo, motivo, servidor, numero_servicio, marcador_antes, marcador_despues, created_by)
    VALUES (?, ?, 'correccion', 'correccion_director', ?, 1, ?, ?, ?)`,
      [
        id,
        Number(versions[0]?.sequence || 0) + 1,
        state.server,
        JSON.stringify(before),
        JSON.stringify(state),
        user.id,
      ]
    )
    await conn.query('DELETE FROM sets_partido WHERE partido_id = ?', [id])
    for (const set of projectSets(state)) {
      await conn.query(
        `INSERT INTO sets_partido (partido_id, numero_set, games_j1, games_j2, tiebreak_j1, tiebreak_j2, completado) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          set.numero_set,
          set.games_j1,
          set.games_j2,
          set.tiebreak_j1,
          set.tiebreak_j2,
          Number(set.completado),
        ]
      )
    }
    await require('./scheduling.service').assertAvailable({ ...match, estado: body.estado }, conn)
    await conn.query('UPDATE partidos SET estado = ?, ganador = ? WHERE id = ?', [
      body.estado,
      state.winner,
      id,
    ])
    await conn.query(
      `INSERT INTO estado_en_vivo_partido (partido_id, iniciado_at, pausado_at, finalizado_at)
    VALUES (?, NOW(), NOW(), IF(? = 'finalizado', NOW(), NULL))
    ON DUPLICATE KEY UPDATE finalizado_at = IF(? = 'finalizado', COALESCE(finalizado_at, NOW()), NULL),
    pausado_at = COALESCE(pausado_at, NOW())`,
      [id, body.estado, body.estado]
    )
    if ((match.ganador || null) !== state.winner) {
      const type = match.equipo1_id ? 'equipo' : 'jugador'
      let participant = state.winner
        ? match[`${type}${state.winner === 'jugador1' ? 1 : 2}_id`]
        : null
      participant = await require('../torneos/retiros.service').eligibleWinner(match, type, participant, conn)
      for (const side of [1, 2])
        await conn.query(
          `UPDATE partidos SET ${type}${side}_id = ?, control_version = control_version + 1 WHERE origen_partido${side}_id = ?`,
          [participant, id]
        )
    }
    return {
      motivo: body.motivo.trim(),
      estado_anterior: match.estado,
      marcador_antes: before,
      marcador_despues: state,
    }
  })

exports.substitute = (id, body, user) =>
  change(id, user, body, 'sustituir', async (conn, match) => {
    if (match.estado !== 'programado')
      fail(
        409,
        'Solo puedes sustituir participantes antes de iniciar el partido; se protege la atribución de puntos y estadísticas'
      )
    const [history] = await conn.query(
      `SELECT
    (SELECT COUNT(*) FROM eventos_partido WHERE partido_id = ?) AS eventos,
    (SELECT COUNT(*) FROM estado_en_vivo_partido WHERE partido_id = ? AND iniciado_at IS NOT NULL) AS iniciado,
    (SELECT COUNT(*) FROM sets_partido WHERE partido_id = ? AND (games_j1 > 0 OR games_j2 > 0)) AS sets`,
      [id, id, id]
    )
    if (Number(history[0]?.eventos) || Number(history[0]?.iniciado) || Number(history[0]?.sets))
      fail(
        409,
        'El partido ya tiene historial; no se puede atribuir ese juego a un participante distinto'
      )
    let doubles = Boolean(match.equipo1_id || match.equipo2_id || match.deporte === 'padel')
    if (match.torneo_id) {
      const [tournaments] = await conn.query('SELECT modalidad FROM torneos WHERE id = ?', [
        match.torneo_id,
      ])
      doubles = tournaments[0]?.modalidad === 'dobles'
    }
    const side = body.lado
    const newId = body.participante_id
    if (![1, 2].includes(side) || !Number.isSafeInteger(newId) || newId <= 0)
      fail(400, 'Selecciona un lado y un participante registrado')
    const type = doubles ? 'equipo' : 'jugador'
    const field = `${type}${side}_id`
    await require('../torneos/retiros.service').assertAvailable({ ...match, [field]: newId }, conn, match)
    const other = match[`${type}${side === 1 ? 2 : 1}_id`]
    if (Number(other) === newId || Number(match[field]) === newId)
      fail(400, 'Elige un participante distinto a los dos actuales')
    if (match[`origen_partido${side}_id`] && body.desvincular_origen !== true)
      fail(
        409,
        'Este lado depende del ganador de otro partido. Confirma expresamente que deseas desvincularlo.'
      )
    const grouped =
      doubles &&
      (await require('../torneos/grupos.service').validateMatch(
        { ...match, [field]: newId, [`origen_partido${side}_id`]: null },
        conn
      ))
    const [players] = doubles
      ? await conn.query(
          `SELECT e.id, e.jugador1_id, e.jugador2_id FROM equipos_padel e
        JOIN jugadores j1 ON j1.id = e.jugador1_id JOIN jugadores j2 ON j2.id = e.jugador2_id
        WHERE e.id = ? AND e.activo = TRUE AND e.deporte = ? ${grouped ? '' : 'AND e.categoria_id = ?'}
        AND j1.activo = TRUE AND j2.activo = TRUE AND e.jugador1_id <> e.jugador2_id
        AND j1.deporte IN (?, 'ambos') AND j2.deporte IN (?, 'ambos')`,
          [
            newId,
            match.deporte,
            ...(grouped ? [] : [match.categoria_id]),
            match.deporte,
            match.deporte,
          ]
        )
      : await conn.query(
          "SELECT id FROM jugadores WHERE id = ? AND activo = TRUE AND deporte IN (?, 'ambos') AND categoria_id = ?",
          [newId, match.deporte, match.categoria_id]
        )
    if (!players.length)
      fail(400, 'El participante debe estar activo y pertenecer al deporte y categoría del partido')
    if (doubles && other) {
      const [opponents] = await conn.query(
        'SELECT jugador1_id, jugador2_id FROM equipos_padel WHERE id = ?',
        [other]
      )
      if (
        opponents.some((p) =>
          [p.jugador1_id, p.jugador2_id].some((playerId) =>
            [players[0].jugador1_id, players[0].jugador2_id].map(Number).includes(Number(playerId))
          )
        )
      )
        fail(400, 'Un jugador no puede participar en ambos lados del partido')
    }
    await require('./scheduling.service').assertAvailable({ ...match, [field]: newId }, conn)
    await conn.query(
      `UPDATE partidos SET ${field} = ?, nombre_override_j${side} = NULL, nombre_override = NULL, origen_partido${side}_id = NULL WHERE id = ?`,
      [newId, id]
    )
    return {
      lado: side,
      anterior: match[field],
      nuevo: newId,
      origen_anterior: match[`origen_partido${side}_id`],
    }
  })
