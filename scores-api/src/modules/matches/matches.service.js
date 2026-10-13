const pool = require('../../config/db')
const { AsyncLocalStorage } = require('node:async_hooks')
const transaction = new AsyncLocalStorage()
const db = {
  query: (...args) => (transaction.getStore() || pool).query(...args),
  getConnection: (...args) => pool.getConnection(...args),
}
const { rethrowDeleteConflict } = require('../../utils/deleteConflict')
const { computeBreakpoint } = require('./score.engine')

const groupsService = require('../torneos/grupos.service')
const retirosService = require('../torneos/retiros.service')
const MAX_SETS = 127

const MATCH_SELECT = `
  SELECT
    p.id,
    p.control_version,
    p.torneo_id,
    EXISTS (SELECT 1 FROM torneo_retiros r WHERE r.torneo_id=p.torneo_id AND r.retirado=1 AND
      ((r.tipo='pareja' AND r.participante_id=p.equipo1_id) OR
       (r.tipo='jugador' AND r.participante_id IN (p.jugador1_id,e1.jugador1_id,e1.jugador2_id)))) AS retiro1,
    EXISTS (SELECT 1 FROM torneo_retiros r WHERE r.torneo_id=p.torneo_id AND r.retirado=1 AND
      ((r.tipo='pareja' AND r.participante_id=p.equipo2_id) OR
       (r.tipo='jugador' AND r.participante_id IN (p.jugador2_id,e2.jugador1_id,e2.jugador2_id)))) AS retiro2,
    p.deporte,
    p.estado,
    p.ganador,
    p.fecha_inicio,
    p.hora_inicio,
    p.fase,
    p.grupo,
    p.ronda,
    p.notas,
    p.nombre_override,
    p.nombre_override_j1,
    p.nombre_override_j2,
    p.origen_partido1_id,
    p.origen_partido2_id,
    p.juez_id,
    p.cancha_id,
    p.mejor_de_sets,
    p.juegos_por_set,
    p.diferencia_juegos,
    p.modo_game,
    p.set_decisivo,
    p.tiebreak_en,
    p.tiebreak_puntos,
    p.match_tiebreak_puntos,
    p.servidor_inicial,
    (
      SELECT ep.marcador_despues
      FROM eventos_partido ep
      WHERE ep.partido_id = p.id AND ep.anulado_at IS NULL
      ORDER BY ep.secuencia DESC
      LIMIT 1
    ) AS marcador_actual,
    uj.nombre AS juez_nombre,
    uj.apellido AS juez_apellido,
    ch.nombre AS cancha_nombre,
    ch.superficie AS cancha_superficie,
    s.id AS sede_id,
    s.nombre AS sede_nombre,
    ev.iniciado_at,
    ev.pausado_at,
    ev.segundos_pausa,
    ev.finalizado_at,
    cat.id     AS categoria_id,
    cat.nombre AS categoria_nombre,
    t.nombre AS torneo_nombre,
    t.modalidad AS torneo_modalidad,
    t.sistema AS torneo_sistema,
    j1.id       AS j1_id,
    j1.nombre   AS j1_nombre,
    j1.apellido AS j1_apellido,
    j1.foto     AS j1_foto,
    j2.id       AS j2_id,
    j2.nombre   AS j2_nombre,
    j2.apellido AS j2_apellido,
    j2.foto     AS j2_foto,
    tp11.id AS tp11_id,
    tp11.nombre AS tp11_nombre,
    tp11.apellido AS tp11_apellido,
    tp11.foto AS tp11_foto,
    tp12.id AS tp12_id,
    tp12.nombre AS tp12_nombre,
    tp12.apellido AS tp12_apellido,
    tp12.foto AS tp12_foto,
    tp21.id AS tp21_id,
    tp21.nombre AS tp21_nombre,
    tp21.apellido AS tp21_apellido,
    tp21.foto AS tp21_foto,
    tp22.id AS tp22_id,
    tp22.nombre AS tp22_nombre,
    tp22.apellido AS tp22_apellido,
    tp22.foto AS tp22_foto,
    e1.id     AS e1_id,
    e1.jugador1_id AS e1_jugador1_id,
    e1.jugador2_id AS e1_jugador2_id,
    e1.nombre AS e1_nombre,
    e2.id     AS e2_id,
    e2.nombre AS e2_nombre,
    op1j1.nombre   AS op1_j1_nombre,
    op1j1.apellido AS op1_j1_apellido,
    op1j2.nombre   AS op1_j2_nombre,
    op1j2.apellido AS op1_j2_apellido,
    op1e1.nombre   AS op1_e1_nombre,
    op1e2.nombre   AS op1_e2_nombre,
    op2j1.nombre   AS op2_j1_nombre,
    op2j1.apellido AS op2_j1_apellido,
    op2j2.nombre   AS op2_j2_nombre,
    op2j2.apellido AS op2_j2_apellido,
    op2e1.nombre   AS op2_e1_nombre,
    op2e2.nombre   AS op2_e2_nombre
  FROM partidos p
  LEFT JOIN torneos t ON t.id = p.torneo_id
  LEFT JOIN categorias cat ON cat.id = p.categoria_id
  LEFT JOIN jugadores j1 ON j1.id = p.jugador1_id
  LEFT JOIN jugadores j2 ON j2.id = p.jugador2_id
  LEFT JOIN equipos_padel e1 ON e1.id = p.equipo1_id
  LEFT JOIN equipos_padel e2 ON e2.id = p.equipo2_id
  LEFT JOIN jugadores tp11 ON tp11.id = e1.jugador1_id
  LEFT JOIN jugadores tp12 ON tp12.id = e1.jugador2_id
  LEFT JOIN jugadores tp21 ON tp21.id = e2.jugador1_id
  LEFT JOIN jugadores tp22 ON tp22.id = e2.jugador2_id
  LEFT JOIN users uj ON uj.id = p.juez_id
  LEFT JOIN canchas ch ON ch.id = p.cancha_id
  LEFT JOIN sedes s ON s.id = ch.sede_id
  LEFT JOIN estado_en_vivo_partido ev ON ev.partido_id = p.id
  LEFT JOIN partidos op1 ON op1.id = p.origen_partido1_id
  LEFT JOIN jugadores op1j1 ON op1j1.id = op1.jugador1_id
  LEFT JOIN jugadores op1j2 ON op1j2.id = op1.jugador2_id
  LEFT JOIN equipos_padel op1e1 ON op1e1.id = op1.equipo1_id
  LEFT JOIN equipos_padel op1e2 ON op1e2.id = op1.equipo2_id
  LEFT JOIN partidos op2 ON op2.id = p.origen_partido2_id
  LEFT JOIN jugadores op2j1 ON op2j1.id = op2.jugador1_id
  LEFT JOIN jugadores op2j2 ON op2j2.id = op2.jugador2_id
  LEFT JOIN equipos_padel op2e1 ON op2e1.id = op2.equipo1_id
  LEFT JOIN equipos_padel op2e2 ON op2e2.id = op2.equipo2_id
`

exports.getAll = async ({
  estado,
  deporte,
  categoria_id,
  fecha,
  jugador,
  desde,
  hasta,
  orden,
  juez_id,
  cancha_id,
  torneo_id,
  jugador_id,
  equipo_id,
}) => {
  let query = `${MATCH_SELECT} WHERE 1 = 1`
  const params = []

  if (jugador_id) {
    query += ` AND (
      p.jugador1_id = ? OR p.jugador2_id = ?
      OR e1.jugador1_id = ? OR e1.jugador2_id = ?
      OR e2.jugador1_id = ? OR e2.jugador2_id = ?
    )`
    params.push(jugador_id, jugador_id, jugador_id, jugador_id, jugador_id, jugador_id)
  }
  if (equipo_id) {
    query += ' AND (p.equipo1_id = ? OR p.equipo2_id = ?)'
    params.push(equipo_id, equipo_id)
  }
  if (estado) {
    query += ' AND p.estado = ?'
    params.push(estado)
  }
  if (deporte) {
    query += ' AND p.deporte = ?'
    params.push(deporte)
  }
  if (categoria_id) {
    query += ' AND p.categoria_id = ?'
    params.push(categoria_id)
  }
  if (fecha) {
    query += ' AND p.fecha_inicio = ?'
    params.push(fecha)
  }
  if (desde) {
    query += ' AND p.fecha_inicio >= ?'
    params.push(desde)
  }
  if (hasta) {
    query += ' AND p.fecha_inicio <= ?'
    params.push(hasta)
  }
  if (jugador) {
    query += ` AND (
      CONCAT_WS(' ', j1.nombre, j1.apellido) LIKE ?
      OR CONCAT_WS(' ', j2.nombre, j2.apellido) LIKE ?
      OR e1.nombre LIKE ?
      OR e2.nombre LIKE ?
    )`
    const term = `%${jugador.trim()}%`
    params.push(term, term, term, term)
  }
  if (juez_id) {
    query += ' AND p.juez_id = ?'
    params.push(juez_id)
  }
  if (cancha_id) {
    query += ' AND p.cancha_id = ?'
    params.push(cancha_id)
  }
  if (torneo_id) {
    query += ' AND p.torneo_id = ?'
    params.push(torneo_id)
  }

  const direction = orden === 'asc' ? 'ASC' : 'DESC'
  query += ` ORDER BY p.fecha_inicio IS NULL, p.fecha_inicio ${direction},
             p.hora_inicio IS NULL, p.hora_inicio ${direction}, p.id ${direction}`

  const [rows] = await db.query(query, params)
  if (!rows.length) return []

  const ids = rows.map((row) => row.id)
  const placeholders = ids.map(() => '?').join(',')
  const [sets] = await db.query(
    `SELECT partido_id, numero_set, games_j1, games_j2, tiebreak_j1, tiebreak_j2, completado
     FROM sets_partido
     WHERE partido_id IN (${placeholders})
     ORDER BY partido_id, numero_set`,
    ids
  )
  const setsByMatch = new Map()
  for (const set of sets) {
    if (!setsByMatch.has(set.partido_id)) setsByMatch.set(set.partido_id, [])
    setsByMatch.get(set.partido_id).push(formatSet(set))
  }

  return rows.map((row) => ({
    ...formatSummary(row, setsByMatch.get(row.id) || []),
    sets: setsByMatch.get(row.id) || [],
  }))
}

exports.getMyMatches = async (userId) => {
  const [playerRows] = await db.query(
    `SELECT id, nombre, apellido, foto
     FROM jugadores
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  )
  if (!playerRows.length) {
    throw { status: 404, message: 'Tu cuenta todavía no está vinculada a un jugador' }
  }

  const player = playerRows[0]
  const [rows] = await db.query(
    `${MATCH_SELECT}
     WHERE p.jugador1_id = ? OR p.jugador2_id = ?
        OR e1.jugador1_id = ? OR e1.jugador2_id = ?
        OR e2.jugador1_id = ? OR e2.jugador2_id = ?
     ORDER BY p.fecha_inicio IS NULL, p.fecha_inicio DESC,
              p.hora_inicio IS NULL, p.hora_inicio DESC, p.id DESC`,
    Array(6).fill(player.id)
  )

  if (!rows.length) {
    return {
      jugador: {
        id: player.id,
        nombre: player.nombre,
        apellido: player.apellido,
        foto: player.foto || null,
      },
      en_vivo: [],
      proximos: [],
      historial: [],
    }
  }

  const ids = rows.map((row) => row.id)
  const placeholders = ids.map(() => '?').join(',')
  const [sets] = await db.query(
    `SELECT partido_id, numero_set, games_j1, games_j2, tiebreak_j1, tiebreak_j2, completado
     FROM sets_partido
     WHERE partido_id IN (${placeholders})
     ORDER BY partido_id, numero_set`,
    ids
  )
  const setsByMatch = new Map()
  for (const set of sets) {
    if (!setsByMatch.has(set.partido_id)) setsByMatch.set(set.partido_id, [])
    setsByMatch.get(set.partido_id).push(formatSet(set))
  }

  const matches = rows.map((row) => {
    const match = { ...formatSummary(row, setsByMatch.get(row.id) || []), sets: setsByMatch.get(row.id) || [] }
    const mySide = [row.j1_id, row.e1_jugador1_id, row.e1_jugador2_id].some(
      (id) => Number(id) === Number(player.id)
    )
      ? 'jugador1'
      : 'jugador2'
    return {
      ...match,
      mi_lado: mySide,
      resultado:
        match.estado === 'finalizado'
          ? match.ganador === mySide
            ? 'victoria'
            : match.ganador
              ? 'derrota'
              : 'sin_resultado'
          : null,
    }
  })

  const upcoming = matches
    .filter((match) => match.estado === 'programado')
    .sort(compareScheduleAscending)

  return {
    jugador: {
      id: player.id,
      nombre: player.nombre,
      apellido: player.apellido,
      foto: player.foto || null,
    },
    en_vivo: matches.filter((match) => match.estado === 'en_vivo'),
    proximos: upcoming,
    historial: matches.filter((match) => match.estado === 'finalizado'),
  }
}

exports.getById = async (id) => {
  const [rows] = await db.query(`${MATCH_SELECT} WHERE p.id = ? LIMIT 1`, [id])

  if (!rows.length) throw { status: 404, message: 'Partido no encontrado' }

  const [sets] = await db.query(
    `SELECT numero_set, games_j1, games_j2, tiebreak_j1, tiebreak_j2, completado
     FROM sets_partido
     WHERE partido_id = ?
     ORDER BY numero_set ASC`,
    [id]
  )

  return {
    ...formatSummary(rows[0], sets.map(formatSet)),
    sets: sets.map(formatSet),
  }
}

exports.create = async (body, actor) => {
  const requester = normalizeActor(actor)
  const match = await validateBasicMatch(body)
  const scoring = normalizeScoringConfig(body)
  const judgeId = requester.rol === 'juez' ? requester.id : positiveId(body.juez_id)
  await validateJudge(judgeId)
  await require('./scheduling.service').assertAvailable({ ...match, juez_id: judgeId }, db)
  const [result] = await db.query(
    `INSERT INTO partidos
       (torneo_id, deporte, categoria_id, jugador1_id, jugador2_id, equipo1_id, equipo2_id,
        estado, fecha_inicio, hora_inicio, fase, grupo, ronda, notas,
        origen_partido1_id, origen_partido2_id,
        created_by, juez_id, cancha_id, mejor_de_sets, juegos_por_set, diferencia_juegos,
        modo_game, set_decisivo, tiebreak_en, tiebreak_puntos, match_tiebreak_puntos,
        servidor_inicial)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      match.torneo_id,
      match.deporte,
      match.categoria_id,
      match.jugador1_id,
      match.jugador2_id,
      match.equipo1_id,
      match.equipo2_id,
      match.estado,
      match.fecha_inicio,
      match.hora_inicio,
      match.fase,
      match.grupo,
      match.ronda,
      match.notas,
      match.origen_partido1_id,
      match.origen_partido2_id,
      requester.id,
      judgeId,
      match.cancha_id,
      scoring.mejor_de_sets,
      scoring.juegos_por_set,
      scoring.diferencia_juegos,
      scoring.modo_game,
      scoring.set_decisivo,
      scoring.tiebreak_en,
      scoring.tiebreak_puntos,
      scoring.match_tiebreak_puntos,
      scoring.servidor_inicial,
    ]
  )

  return exports.getById(result.insertId)
}

exports.checkSchedule = async (body, actor) => {
  const requester = normalizeActor(actor)
  const id = positiveId(body.id)
  if (id) {
    const [[existing]] = await db.query('SELECT id,juez_id,created_by FROM partidos WHERE id=?', [id])
    if (!existing) throw { status: 404, message: 'Partido no encontrado' }
    assertCanManage(existing, requester)
  }
  const match = await validateBasicMatch(body, id)
  return require('./scheduling.service').check({ ...match, id,
    juez_id: requester.rol === 'juez' ? requester.id : positiveId(body.juez_id) }, db)
}

exports.update = async (id, body, actor) => {
  const requester = normalizeActor(actor)
  const [existing] = await db.query('SELECT * FROM partidos WHERE id = ?', [
    id,
  ])
  if (!existing.length) throw { status: 404, message: 'Partido no encontrado' }
  assertCanManage(existing[0], requester)

  const match = await validateBasicMatch(body, Number(id))
  require('./edit-guards').assertIdentity(existing[0], match)
  const scoring = normalizeScoringConfig(body)
  const judgeId = requester.rol === 'juez' ? requester.id : positiveId(body.juez_id)
  await validateJudge(judgeId)
  await require('./scheduling.service').assertAvailable({ ...match, id: Number(id), juez_id: judgeId }, db)
  await db.query(
    `UPDATE partidos
     SET torneo_id = ?, deporte = ?, categoria_id = ?, jugador1_id = ?, jugador2_id = ?,
         equipo1_id = ?, equipo2_id = ?, estado = ?, fecha_inicio = ?, hora_inicio = ?,
         fase = ?, grupo = ?, ronda = ?, notas = ?,
         origen_partido1_id = ?, origen_partido2_id = ?, juez_id = ?, cancha_id = ?,
         mejor_de_sets = ?, juegos_por_set = ?, diferencia_juegos = ?,
         modo_game = ?, set_decisivo = ?, tiebreak_en = ?, tiebreak_puntos = ?,
         match_tiebreak_puntos = ?, servidor_inicial = ?, control_version = control_version + 1
     WHERE id = ?`,
    [
      match.torneo_id,
      match.deporte,
      match.categoria_id,
      match.jugador1_id,
      match.jugador2_id,
      match.equipo1_id,
      match.equipo2_id,
      match.estado,
      match.fecha_inicio,
      match.hora_inicio,
      match.fase,
      match.grupo,
      match.ronda,
      match.notas,
      match.origen_partido1_id,
      match.origen_partido2_id,
      judgeId,
      match.cancha_id,
      scoring.mejor_de_sets,
      scoring.juegos_por_set,
      scoring.diferencia_juegos,
      scoring.modo_game,
      scoring.set_decisivo,
      scoring.tiebreak_en,
      scoring.tiebreak_puntos,
      scoring.match_tiebreak_puntos,
      scoring.servidor_inicial,
      id,
    ]
  )

  return exports.getById(id)
}

exports.updateMarcador = async (id, { sets, estado, ganador }, actor) => {
  const requester = normalizeActor(actor)
  const [existing] = await db.query(
    `SELECT p.id, p.deporte, p.jugador1_id, p.jugador2_id, p.equipo1_id, p.equipo2_id,
            p.juez_id, p.created_by, p.torneo_id, p.estado, t.modalidad
     FROM partidos p
     LEFT JOIN torneos t ON t.id = p.torneo_id
     WHERE p.id = ?`,
    [id]
  )
  if (!existing.length) throw { status: 404, message: 'Partido no encontrado' }
  assertCanManage(existing[0], requester)

  if (!Array.isArray(sets) || sets.length < 1 || sets.length > MAX_SETS) {
    throw { status: 400, message: `El marcador debe contener entre uno y ${MAX_SETS} sets` }
  }
  if (!['programado', 'en_vivo', 'finalizado', 'cancelado'].includes(estado)) {
    throw { status: 400, message: 'Estado de partido inválido' }
  }
  if (estado === 'en_vivo' && existing[0].estado !== 'en_vivo')
    await retirosService.assertAvailable(existing[0], db)
  if (ganador && !['jugador1', 'jugador2'].includes(ganador)) {
    throw { status: 400, message: 'Ganador inválido' }
  }
  if (estado === 'finalizado' && (!ganador || !getWinnerParticipantId(existing[0], ganador))) {
    throw {
      status: 400,
      message: 'No se puede finalizar el partido hasta conocer ambos participantes y el ganador',
    }
  }

  const seen = new Set()
  for (const set of sets) {
    const validSet =
      Number.isInteger(set.numero_set) && set.numero_set >= 1 && set.numero_set <= MAX_SETS
    const validScores = [set.games_j1, set.games_j2].every(
      (score) => Number.isInteger(score) && score >= 0 && score <= 99
    )
    if (!validSet || !validScores || seen.has(set.numero_set)) {
      throw { status: 400, message: 'Los datos de los sets no son válidos' }
    }
    seen.add(set.numero_set)
  }

  const connection = await db.getConnection()
  let scheduleLocked = false
  try {
    if (['programado', 'en_vivo'].includes(estado)) {
      await require('./scheduling.service').lock(connection)
      scheduleLocked = true
    }
    await connection.beginTransaction()
    const [[scoreBefore]] = await connection.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [id])
    if (!scoreBefore) throw { status: 404, message: 'Partido no encontrado' }
    assertCanManage(scoreBefore, requester)
    const [setsBefore] = await connection.query('SELECT * FROM sets_partido WHERE partido_id = ? ORDER BY numero_set', [id])
    if (scheduleLocked) {
      const [current] = await connection.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [id])
      if (!current.length) throw { status: 404, message: 'Partido no encontrado' }
      assertCanManage(current[0], requester)
      await require('./scheduling.service').assertAvailable({ ...current[0], estado }, connection)
    }
    await connection.query('UPDATE partidos SET estado = ?, ganador = ? WHERE id = ?', [
      estado,
      ganador || null,
      id,
    ])

    if (estado === 'en_vivo') {
      await connection.query(
        `INSERT INTO estado_en_vivo_partido (partido_id, iniciado_at)
         VALUES (?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE finalizado_at = NULL`,
        [id]
      )
    } else if (estado === 'finalizado' || estado === 'cancelado') {
      await connection.query(
        `UPDATE estado_en_vivo_partido
         SET finalizado_at = COALESCE(finalizado_at, CURRENT_TIMESTAMP), pausado_at = NULL
         WHERE partido_id = ?`,
        [id]
      )
    }

    const setPlaceholders = sets.map(() => '?').join(',')
    await connection.query(
      `DELETE FROM sets_partido
       WHERE partido_id = ? AND numero_set NOT IN (${setPlaceholders})`,
      [id, ...sets.map((set) => set.numero_set)]
    )

    for (const set of sets) {
      await connection.query(
        `INSERT INTO sets_partido
           (partido_id, numero_set, games_j1, games_j2, tiebreak_j1, tiebreak_j2, completado)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           games_j1    = VALUES(games_j1),
           games_j2    = VALUES(games_j2),
           tiebreak_j1 = VALUES(tiebreak_j1),
           tiebreak_j2 = VALUES(tiebreak_j2),
           completado  = VALUES(completado)`,
        [
          id,
          set.numero_set,
          set.games_j1,
          set.games_j2,
          set.tiebreak_j1 ?? null,
          set.tiebreak_j2 ?? null,
          set.completado ? 1 : 0,
        ]
      )
    }

    await propagateWinner(connection, existing[0], estado, ganador)
    if (estado === 'cancelado' && existing[0].estado !== 'cancelado')
      await require('./schedule-notifications').notify(connection, existing[0], ['El encuentro fue cancelado.'])
    const audit = require('../audit/edit-audit')
    await audit.record(connection, 'resultado', id, requester, audit.scoreSnapshot(scoreBefore, setsBefore), audit.scoreSnapshot({ estado, ganador }, sets))
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    if (scheduleLocked) await require('./scheduling.service').unlock(connection)
    connection.release()
  }

  return exports.getById(id)
}

exports.remove = async (id) => {
  const [existing] = await db.query('SELECT id FROM partidos WHERE id = ?', [id])
  if (!existing.length) throw { status: 404, message: 'Partido no encontrado' }

  const [dependents] = await db.query(
    `SELECT id
     FROM partidos
     WHERE origen_partido1_id = ? OR origen_partido2_id = ?
     ORDER BY id ASC`,
    [id, id]
  )
  if (dependents.length) {
    const ids = dependents
      .slice(0, 3)
      .map((match) => `#${match.id}`)
      .join(', ')
    const suffix = dependents.length > 3 ? ` y ${dependents.length - 3} más` : ''
    throw {
      status: 409,
      message: `No puedes eliminar el partido #${id} porque su ganador se usa como participante en ${dependents.length === 1 ? 'el partido' : 'los partidos'} ${ids}${suffix}. Elimina o modifica primero ${dependents.length === 1 ? 'ese encuentro' : 'esos encuentros'}.`,
    }
  }

  try {
    await db.query("DELETE FROM favoritos WHERE tipo = 'partido' AND referencia_id = ?", [id])
    await db.query('DELETE FROM sets_partido WHERE partido_id = ?', [id])
    await db.query('DELETE FROM partidos WHERE id = ?', [id])
  } catch (error) {
    rethrowDeleteConflict(error, `el partido #${id}`)
  }

  return { message: 'Partido eliminado correctamente' }
}

exports.updateParticipants = async (id, data, user) => {
  const [existing] = await db.query('SELECT * FROM partidos WHERE id = ?', [id])
  if (!existing.length) throw { status: 404, message: 'Partido no encontrado' }

  const match = existing[0]
  if (
    user.rol !== 'admin' &&
    user.rol !== 'juez_director' &&
    Number(match.juez_id) !== Number(user.id)
  ) {
    throw { status: 403, message: 'No tienes permiso para modificar este partido' }
  }

  const updates = []
  const params = []

  const participantFields = ['jugador1_id', 'jugador2_id', 'equipo1_id', 'equipo2_id']
  const changedFields = participantFields.filter((key) => data[key] !== undefined)
  if (changedFields.length) {
    if (user.rol === 'juez_director') {
      throw {
        status: 403,
        message: 'Utiliza la sustitución supervisada desde el panel del director',
      }
    }
    const doubles = Boolean(match.equipo1_id || match.equipo2_id)
    const allowed = doubles ? ['equipo1_id', 'equipo2_id'] : ['jugador1_id', 'jugador2_id']
    for (const key of changedFields) {
      if (
        !allowed.includes(key) ||
        !/^[1-9]\d*$/.test(String(data[key])) ||
        !Number.isSafeInteger(Number(data[key]))
      ) {
        throw {
          status: 400,
          message: 'Selecciona un participante registrado válido para la modalidad del partido',
        }
      }
      const side = key.includes('1') ? 1 : 2
      if (match[`origen_partido${side}_id`]) {
        throw {
          status: 400,
          message:
            'Este participante depende del ganador de otro partido. Modifica el origen desde la edición del encuentro.',
        }
      }
    }
    const ids = allowed.map((key) => Number(data[key] ?? match[key])).filter(Boolean)
    await retirosService.assertAvailable({ ...match, ...data }, db, match)
    if (new Set(ids).size !== ids.length) {
      throw { status: 400, message: 'Los participantes del partido deben ser diferentes' }
    }
    if (doubles) {
      const grouped = await groupsService.validateMatch({ ...match, ...data, id: Number(id) }, db)
      await validateTeams(ids, match.deporte, grouped ? null : match.categoria_id)
    } else await validatePlayers(ids, match.deporte)
  }

  const cleanName = (value) => {
    const text = String(value ?? '').trim()
    return text ? text.slice(0, 100) : null
  }

  if (data.nombre_override !== undefined) {
    updates.push('nombre_override = ?')
    params.push(cleanName(data.nombre_override))
  }
  if (data.nombre_override_j1 !== undefined) {
    updates.push('nombre_override_j1 = ?')
    params.push(cleanName(data.nombre_override_j1))
  }
  if (data.nombre_override_j2 !== undefined) {
    updates.push('nombre_override_j2 = ?')
    params.push(cleanName(data.nombre_override_j2))
  }
  if (data.jugador1_id !== undefined) {
    updates.push('jugador1_id = ?')
    params.push(positiveId(data.jugador1_id))
  }
  if (data.jugador2_id !== undefined) {
    updates.push('jugador2_id = ?')
    params.push(positiveId(data.jugador2_id))
  }
  if (data.equipo1_id !== undefined) {
    updates.push('equipo1_id = ?')
    params.push(positiveId(data.equipo1_id))
  }
  if (data.equipo2_id !== undefined) {
    updates.push('equipo2_id = ?')
    params.push(positiveId(data.equipo2_id))
  }

  if (updates.length === 0) {
    throw { status: 400, message: 'No hay cambios para guardar' }
  }

  params.push(id)
  if (changedFields.length) await require('./scheduling.service').assertAvailable({ ...match,
    ...Object.fromEntries(changedFields.map(k => [k, positiveId(data[k])])), id: Number(id) }, db)
  await db.query(`UPDATE partidos SET ${updates.join(', ')}, control_version = control_version + 1 WHERE id = ?`, params)

  return exports.getById(id)
}

async function validateBasicMatch(body, currentMatchId = null) {
  const torneoId = positiveId(body.torneo_id)
  if (
    body.torneo_id !== undefined &&
    body.torneo_id !== null &&
    body.torneo_id !== '' &&
    !torneoId
  ) {
    throw { status: 400, message: 'Selecciona un torneo válido o Partido libre' }
  }
  const fechaInicio = normalizeOptionalDate(body.fecha_inicio)
  const horaInicio = normalizeOptionalTime(body.hora_inicio)
  const estado = body.estado || 'programado'

  if (!['programado', 'en_vivo', 'finalizado', 'cancelado'].includes(estado)) {
    throw { status: 400, message: 'Selecciona un estado válido' }
  }

  let deporte, categoriaId, modalidad, fase, grupo, ronda

  if (torneoId) {
    const [tournaments] = await db.query(
      `SELECT id, deporte, categoria_id, modalidad, sistema, estado
       FROM torneos
       WHERE id = ?
       LIMIT 1`,
      [torneoId]
    )
    if (!tournaments.length) throw { status: 400, message: 'El torneo seleccionado no existe' }

    const tournament = tournaments[0]
    deporte = tournament.deporte
    categoriaId = tournament.categoria_id
      ? Number(tournament.categoria_id)
      : positiveId(body.categoria_id)
    modalidad = tournament.modalidad || (deporte === 'padel' ? 'dobles' : 'individual')
    fase = normalizePhase(tournament.sistema, body.fase)
    grupo = fase === 'grupos' ? normalizeOptionalLabel(body.grupo, 20) : null
    ronda = normalizeOptionalLabel(body.ronda, 50)
    if (!Number.isInteger(categoriaId) || categoriaId < 1) {
      throw { status: 400, message: 'Selecciona la categoría del partido' }
    }
    if (!tournament.categoria_id) {
      const [categories] = await db.query(
        "SELECT id FROM categorias WHERE id = ? AND deporte IN (?, 'ambos') LIMIT 1",
        [categoriaId, deporte]
      )
      if (!categories.length) {
        throw { status: 400, message: 'La categoría no corresponde al deporte del torneo' }
      }
    }
  } else {
    deporte = body.deporte || 'tenis'
    if (!['tenis', 'padel'].includes(deporte)) {
      throw { status: 400, message: 'Selecciona un deporte válido' }
    }
    categoriaId = positiveId(body.categoria_id)
    if (!Number.isInteger(categoriaId) || categoriaId < 1) {
      throw { status: 400, message: 'Selecciona la categoría del partido' }
    }
    const [categories] = await db.query(
      "SELECT id FROM categorias WHERE id = ? AND deporte IN (?, 'ambos') LIMIT 1",
      [categoriaId, deporte]
    )
    if (!categories.length) {
      throw { status: 400, message: 'La categoría no corresponde al deporte seleccionado' }
    }
    modalidad = body.modalidad || (deporte === 'padel' ? 'dobles' : 'individual')
    if (!['individual', 'dobles'].includes(modalidad)) {
      throw { status: 400, message: 'Selecciona una modalidad válida' }
    }
    fase = null
    grupo = null
    ronda = normalizeOptionalLabel(body.ronda, 50)
  }

  const jugador1Id = positiveId(body.jugador1_id)
  const jugador2Id = positiveId(body.jugador2_id)
  const equipo1Id = positiveId(body.equipo1_id)
  const equipo2Id = positiveId(body.equipo2_id)
  const source1Id = positiveId(body.origen_partido1_id)
  const source2Id = positiveId(body.origen_partido2_id)
  if (!torneoId && (source1Id || source2Id)) {
    throw {
      status: 400,
      message:
        'Para usar ganadores de otros partidos, selecciona un torneo. En partidos libres selecciona los participantes directamente.',
    }
  }
  const canchaId = positiveId(body.cancha_id)

  if (canchaId) {
    const [courts] = await db.query(
      `SELECT id
       FROM canchas
       WHERE id = ? AND activa = TRUE AND deporte IN (?, 'ambos')
       LIMIT 1`,
      [canchaId, deporte]
    )
    if (!courts.length) {
      throw { status: 400, message: 'La cancha seleccionada no está disponible para este deporte' }
    }
  }

  if (source1Id && source2Id && source1Id === source2Id) {
    throw { status: 400, message: 'Cada participante debe provenir de un partido diferente' }
  }

  const source1 = source1Id
    ? await resolveMatchSource(source1Id, torneoId, modalidad, categoriaId, currentMatchId)
    : null
  const source2 = source2Id
    ? await resolveMatchSource(source2Id, torneoId, modalidad, categoriaId, currentMatchId)
    : null

  const resolvedPlayer1 =
    modalidad === 'individual' ? (source1Id ? source1.participantId : jugador1Id) : null
  const resolvedPlayer2 =
    modalidad === 'individual' ? (source2Id ? source2.participantId : jugador2Id) : null
  const resolvedTeam1 =
    modalidad === 'dobles' ? (source1Id ? source1.participantId : equipo1Id) : null
  const resolvedTeam2 =
    modalidad === 'dobles' ? (source2Id ? source2.participantId : equipo2Id) : null

  if (
    modalidad === 'individual' &&
    ((!resolvedPlayer1 && !source1Id) || (!resolvedPlayer2 && !source2Id))
  ) {
    throw { status: 400, message: 'Selecciona un jugador o un partido de origen para cada lado' }
  }
  if (
    modalidad === 'dobles' &&
    ((!resolvedTeam1 && !source1Id) || (!resolvedTeam2 && !source2Id))
  ) {
    throw { status: 400, message: 'Selecciona una pareja o un partido de origen para cada lado' }
  }
  if (resolvedPlayer1 && resolvedPlayer2 && resolvedPlayer1 === resolvedPlayer2) {
    throw { status: 400, message: 'Los jugadores del partido deben ser diferentes' }
  }
  if (resolvedTeam1 && resolvedTeam2 && resolvedTeam1 === resolvedTeam2) {
    throw { status: 400, message: 'Las parejas del partido deben ser diferentes' }
  }

  if (modalidad === 'individual') {
    await validatePlayers([resolvedPlayer1, resolvedPlayer2].filter(Boolean), deporte)
  } else {
    const grouped = await groupsService.validateMatch(
      {
        id: currentMatchId,
        torneo_id: torneoId,
        categoria_id: categoriaId,
        fase,
        grupo,
        equipo1_id: resolvedTeam1,
        equipo2_id: resolvedTeam2,
        origen_partido1_id: source1Id,
        origen_partido2_id: source2Id,
      },
      db
    )
    await validateTeams(
      [resolvedTeam1, resolvedTeam2].filter(Boolean),
      deporte,
      grouped ? null : categoriaId
    )
  }

  const [[previous] = []] = currentMatchId
    ? await db.query('SELECT * FROM partidos WHERE id = ?', [currentMatchId]) : [[]]
  await retirosService.assertAvailable({ torneo_id: torneoId, jugador1_id: resolvedPlayer1,
    jugador2_id: resolvedPlayer2, equipo1_id: resolvedTeam1, equipo2_id: resolvedTeam2 }, db,
    estado === 'en_vivo' && previous?.estado !== 'en_vivo' ? null : previous)
  return {
    torneo_id: torneoId,
    deporte,
    categoria_id: categoriaId,
    jugador1_id: resolvedPlayer1,
    jugador2_id: resolvedPlayer2,
    equipo1_id: resolvedTeam1,
    equipo2_id: resolvedTeam2,
    origen_partido1_id: source1Id,
    origen_partido2_id: source2Id,
    cancha_id: canchaId,
    estado,
    fecha_inicio: fechaInicio,
    hora_inicio: horaInicio,
    fase,
    grupo,
    ronda,
    notas: String(body.notas || '').trim() || null,
  }
}

function normalizePhase(system, value) {
  if (system === 'todos_contra_todos') return 'liga'
  if (system === 'eliminacion_directa') return 'eliminacion'
  if (system === 'grupos_eliminacion') {
    return value === 'eliminacion' ? 'eliminacion' : 'grupos'
  }
  return null
}

function normalizeOptionalLabel(value, maxLength) {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  if (normalized.length > maxLength) {
    throw { status: 400, message: `El texto no puede superar ${maxLength} caracteres` }
  }
  return normalized
}

async function validatePlayers(ids, deporte) {
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(',')
  const [rows] = await db.query(
    `SELECT id
     FROM jugadores
     WHERE id IN (${placeholders})
       AND activo = TRUE
       AND deporte IN (?, 'ambos')`,
    [...ids, deporte]
  )
  if (rows.length !== new Set(ids).size) {
    throw { status: 400, message: 'Los jugadores deben estar activos en el deporte del torneo' }
  }
}

async function validateTeams(ids, deporte, categoriaId) {
  if (!ids.length) return
  const placeholders = ids.map(() => '?').join(',')
  const [rows] = await db.query(
    `SELECT id
     FROM equipos_padel
     WHERE id IN (${placeholders})
       AND activo = TRUE
       AND deporte = ?
       ${categoriaId ? 'AND categoria_id = ?' : ''}`,
    [...ids, deporte, ...(categoriaId ? [categoriaId] : [])]
  )
  if (rows.length !== new Set(ids).size) {
    throw { status: 400, message: 'Las parejas deben estar activas en la categoría del torneo' }
  }
}

function normalizeOptionalDate(value) {
  const date = String(value || '').trim()
  if (!date) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
    throw { status: 400, message: 'La fecha del partido no es válida' }
  }
  return date
}

function normalizeOptionalTime(value) {
  const time = String(value || '').trim()
  if (!time) return null
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) {
    throw { status: 400, message: 'La hora del partido no es válida' }
  }
  return time
}

function normalizeScoringConfig(body) {
  const bestOfSets = Number(body.mejor_de_sets || 3)
  const gamesPerSet = Number(body.juegos_por_set || 6)
  const gamesDifference = Number(body.diferencia_juegos || 2)
  const tieBreakAt = Number(body.tiebreak_en ?? 6)
  const tieBreakPoints = Number(body.tiebreak_puntos || 7)
  const matchTieBreakPoints = Number(body.match_tiebreak_puntos || 10)

  if (![1, 3, 5].includes(bestOfSets)) {
    throw { status: 400, message: 'El formato debe ser al mejor de 1, 3 o 5 sets' }
  }
  if (!Number.isInteger(gamesPerSet) || gamesPerSet < 1 || gamesPerSet > 12) {
    throw { status: 400, message: 'Los juegos por set deben estar entre 1 y 12' }
  }
  if (!Number.isInteger(gamesDifference) || gamesDifference < 1 || gamesDifference > 6) {
    throw { status: 400, message: 'La diferencia de juegos debe estar entre 1 y 6' }
  }
  if (!['ventaja', 'sin_ventaja'].includes(body.modo_game || 'ventaja')) {
    throw { status: 400, message: 'Selecciona un modo de game válido' }
  }
  if (!['set_completo', 'match_tiebreak'].includes(body.set_decisivo || 'set_completo')) {
    throw { status: 400, message: 'Selecciona un formato válido para el set decisivo' }
  }
  if (!Number.isInteger(tieBreakAt) || tieBreakAt < 0 || tieBreakAt > 12) {
    throw { status: 400, message: 'El inicio del tiebreak no es válido' }
  }
  if (!Number.isInteger(tieBreakPoints) || tieBreakPoints < 5 || tieBreakPoints > 99) {
    throw { status: 400, message: 'Los puntos del tiebreak no son válidos' }
  }
  if (
    !Number.isInteger(matchTieBreakPoints) ||
    matchTieBreakPoints < 5 ||
    matchTieBreakPoints > 99
  ) {
    throw { status: 400, message: 'Los puntos del match tiebreak no son válidos' }
  }

  return {
    mejor_de_sets: bestOfSets,
    juegos_por_set: gamesPerSet,
    diferencia_juegos: gamesDifference,
    modo_game: body.modo_game || 'ventaja',
    set_decisivo: body.set_decisivo || 'set_completo',
    tiebreak_en: tieBreakAt,
    tiebreak_puntos: tieBreakPoints,
    match_tiebreak_puntos: matchTieBreakPoints,
    servidor_inicial: body.servidor_inicial === 'jugador2' ? 'jugador2' : 'jugador1',
  }
}

function positiveId(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizeActor(actor) {
  if (actor && typeof actor === 'object') {
    return { id: Number(actor.id), rol: actor.rol || 'miembro' }
  }
  return { id: Number(actor) || null, rol: 'admin' }
}

function assertCanManage(match, actor) {
  if (actor.rol === 'admin' || actor.rol === 'juez_director') return
  if (
    actor.rol === 'juez' &&
    (Number(match.juez_id) === actor.id ||
      (!match.juez_id && Number(match.created_by) === actor.id))
  ) {
    return
  }
  throw { status: 403, message: 'Este partido no está asignado a tu cuenta de juez' }
}

async function validateJudge(judgeId) {
  if (!judgeId) return
  const [rows] = await db.query(
    "SELECT id FROM users WHERE id = ? AND rol IN ('juez','juez_director','admin') AND activo = TRUE LIMIT 1",
    [judgeId]
  )
  if (!rows.length) throw { status: 400, message: 'El juez seleccionado no está disponible' }
}

async function resolveMatchSource(sourceId, torneoId, modalidad, categoriaId, currentMatchId) {
  if (currentMatchId && sourceId >= currentMatchId) {
    throw { status: 400, message: 'El partido de origen debe ser anterior al partido actual' }
  }

  const [rows] = await db.query(
    `SELECT id, torneo_id, categoria_id, estado, ganador,
            jugador1_id, jugador2_id, equipo1_id, equipo2_id
     FROM partidos
     WHERE id = ?
     LIMIT 1`,
    [sourceId]
  )
  if (!rows.length) {
    throw { status: 400, message: `El partido de origen #${sourceId} no existe` }
  }

  const source = rows[0]
  if (Number(source.torneo_id) !== torneoId) {
    throw {
      status: 400,
      message: 'El partido de origen debe pertenecer al mismo torneo',
    }
  }
  if (Number(source.categoria_id) !== categoriaId) {
    throw {
      status: 400,
      message: 'El partido de origen debe pertenecer a la misma categoría',
    }
  }

  return {
    participantId:
      source.estado === 'finalizado' && source.ganador
        ? getWinnerParticipantId({ ...source, modalidad }, source.ganador)
        : null,
  }
}

function getWinnerParticipantId(match, winner) {
  const position = winner === 'jugador1' ? 1 : winner === 'jugador2' ? 2 : null
  if (!position) return null
  return match.modalidad === 'dobles' || match.equipo1_id || match.equipo2_id
    ? match[`equipo${position}_id`] || null
    : match[`jugador${position}_id`] || null
}

async function propagateWinner(connection, match, estado, ganador) {
  let participantId =
    estado === 'finalizado' && ganador ? getWinnerParticipantId(match, ganador) : null
  const participantColumn =
    match.modalidad === 'dobles' || match.equipo1_id || match.equipo2_id ? 'equipo' : 'jugador'
  participantId = await retirosService.eligibleWinner(match, participantColumn, participantId, connection)

  await connection.query(
    `UPDATE partidos
     SET ${participantColumn}1_id = ?
     WHERE origen_partido1_id = ?`,
    [participantId, match.id]
  )
  await connection.query(
    `UPDATE partidos
     SET ${participantColumn}2_id = ?
     WHERE origen_partido2_id = ?`,
    [participantId, match.id]
  )
}

function formatSummary(row, sets = []) {
  let snapshot = parseScoreSnapshot(row.marcador_actual)
  if (!snapshot || row.notas?.includes('[Victoria por W.O. (6/0 6/0)]')) snapshot = require('../../utils/matchClosure').snapshotFromSets(row, sets) || snapshot
  if (snapshot && row.estado === 'finalizado') snapshot = { ...snapshot, winner: row.ganador || null }
  const matchConfig = {
    mejor_de_sets: Number(row.mejor_de_sets || 3),
    juegos_por_set: Number(row.juegos_por_set || 6),
    diferencia_juegos: Number(row.diferencia_juegos || 2),
    modo_game: row.modo_game || 'ventaja',
    set_decisivo: row.set_decisivo || 'set_completo',
    tiebreak_en: Number(row.tiebreak_en ?? 6),
    tiebreak_puntos: Number(row.tiebreak_puntos || 7),
    match_tiebreak_puntos: Number(row.match_tiebreak_puntos || 10),
    servidor_inicial: row.servidor_inicial || 'jugador1',
  }
  const isLiveMatch = row.estado !== 'finalizado' && row.estado !== 'cancelado'
  const breakpoint = snapshot && isLiveMatch ? computeBreakpoint(snapshot, matchConfig) : null
  const match = {
    id: row.id,
    control_version: Number(row.control_version || 0),
    retiros: { jugador1: Boolean(row.retiro1), jugador2: Boolean(row.retiro2) },
    deporte: row.deporte,
    modalidad: row.torneo_modalidad || (row.e1_id || row.e2_id ? 'dobles' : 'individual'),
    torneo: row.torneo_id
      ? {
          id: row.torneo_id,
          nombre: row.torneo_nombre,
          modalidad: row.torneo_modalidad,
          sistema: row.torneo_sistema,
        }
      : null,
    estado: row.estado,
    ganador: row.ganador,
    fecha_inicio: row.fecha_inicio || null,
    hora_inicio: row.hora_inicio || null,
    fase: row.fase || null,
    grupo: row.grupo || null,
    ronda: row.ronda || null,
    notas: row.notas || null,
    walkover: require('../../utils/matchClosure').closureInfo(row, sets),
    nombre_override: row.nombre_override || null,
    nombre_override_j1: row.nombre_override_j1 || null,
    nombre_override_j2: row.nombre_override_j2 || null,
    marcador_actual: snapshot ? { ...snapshot, breakpoint } : null,
    cancha: row.cancha_id
      ? {
          id: row.cancha_id,
          nombre: row.cancha_nombre,
          superficie: row.cancha_superficie || null,
          sede: row.sede_id ? { id: row.sede_id, nombre: row.sede_nombre } : null,
        }
      : null,
    en_vivo: row.iniciado_at
      ? {
          iniciado_at: row.iniciado_at,
          pausado_at: row.pausado_at || null,
          segundos_pausa: Number(row.segundos_pausa || 0),
          finalizado_at: row.finalizado_at || null,
        }
      : null,
    juez: row.juez_id
      ? { id: row.juez_id, nombre: row.juez_nombre, apellido: row.juez_apellido }
      : null,
    formato: matchConfig,
    origen_partido1: formatMatchSource(row, 1),
    origen_partido2: formatMatchSource(row, 2),
    categoria: row.categoria_id
      ? {
          id: row.categoria_id,
          nombre: row.categoria_nombre,
        }
      : null,
  }

  if (match.modalidad === 'dobles') {
    for (const side of [1, 2]) {
      const player = (pos) => {
        const k = 'tp' + side + pos
        return row[k + '_id']
          ? {
              id: row[k + '_id'],
              nombre: row[k + '_nombre'],
              apellido: row[k + '_apellido'],
              foto: row[k + '_foto'] || null,
            }
          : null
      }
      match['equipo' + side] = {
        id: row['e' + side + '_id'],
        nombre: row['e' + side + '_nombre'],
        jugador1: player(1),
        jugador2: player(2),
      }
    }
  } else {
    match.jugador1 = {
      id: row.j1_id,
      nombre: row.j1_nombre,
      apellido: row.j1_apellido,
      foto: row.j1_foto || null,
    }
    match.jugador2 = {
      id: row.j2_id,
      nombre: row.j2_nombre,
      apellido: row.j2_apellido,
      foto: row.j2_foto || null,
    }
  }

  return match
}

function compareScheduleAscending(left, right) {
  const leftValue = `${left.fecha_inicio || '9999-12-31'}T${left.hora_inicio || '23:59:59'}`
  const rightValue = `${right.fecha_inicio || '9999-12-31'}T${right.hora_inicio || '23:59:59'}`
  return leftValue.localeCompare(rightValue) || Number(left.id) - Number(right.id)
}

function formatSet(set) {
  return {
    numero_set: set.numero_set,
    games_j1: set.games_j1,
    games_j2: set.games_j2,
    tiebreak_j1: set.tiebreak_j1 ?? null,
    tiebreak_j2: set.tiebreak_j2 ?? null,
    completado: Boolean(set.completado),
  }
}

function parseScoreSnapshot(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function formatMatchSource(row, position) {
  const sourceId = row[`origen_partido${position}_id`]
  if (!sourceId) return null

  const prefix = `op${position}`
  const participant1 =
    row.torneo_modalidad === 'dobles' || row.e1_id || row.e2_id
      ? row[`${prefix}_e1_nombre`]
      : [row[`${prefix}_j1_nombre`], row[`${prefix}_j1_apellido`]].filter(Boolean).join(' ')
  const participant2 =
    row.torneo_modalidad === 'dobles' || row.e1_id || row.e2_id
      ? row[`${prefix}_e2_nombre`]
      : [row[`${prefix}_j2_nombre`], row[`${prefix}_j2_apellido`]].filter(Boolean).join(' ')

  return {
    id: sourceId,
    participante1: participant1 || null,
    participante2: participant2 || null,
  }
}
// Serialize scheduling with group edits on the same tournament. The write and
// validation use the SAME connection, including FK checks and duplicate checks.
for (const method of ['create', 'update', 'updateParticipants']) {
  const original = exports[method]
  exports[method] = async (...args) => {
    const body = method === 'create' ? args[0] : args[1]
    let tournamentId = positiveId(body?.torneo_id)
    if (
      method === 'updateParticipants' &&
      ['equipo1_id', 'equipo2_id', 'jugador1_id', 'jugador2_id'].some((k) => body?.[k] !== undefined)
    ) {
      const [[m]] = await pool.query('SELECT * FROM partidos WHERE id = ?', [args[0]])
      tournamentId = m?.torneo_id
    }
    const conn = await pool.getConnection()
    let locked = false
    try {
      await require('./scheduling.service').lock(conn); locked = true
      await conn.beginTransaction()
      if (tournamentId) await conn.query('SELECT id FROM torneos WHERE id=? FOR UPDATE', [tournamentId])
      const before = method !== 'create' ? (await conn.query('SELECT * FROM partidos WHERE id = ? FOR UPDATE', [args[0]]))[0][0] : null
      if (method !== 'create') {
        if (!before) throw { status: 404, message: 'Partido no encontrado' }
        assertCanManage(before, normalizeActor(args[2]))
        require('./edit-guards').assertVersion(before, body?.expected_control_version)
        // Full edits resolve source winners first; compare their normalized IDs below.
        if (method === 'updateParticipants') require('./edit-guards').assertIdentity(before, body || {})
      }
      const result = await transaction.run(conn, () => original(...args))
      await require('./schedule-notifications').afterChange(conn, before)
      if (before) {
        const [[after]] = await conn.query('SELECT * FROM partidos WHERE id = ?', [args[0]])
        await require('../audit/edit-audit').record(conn, 'partido', args[0], args[2], before, after)
      }
      await conn.commit()
      return result
    } catch (e) {
      await conn.rollback()
      throw e
    } finally {
      if (locked) await require('./scheduling.service').unlock(conn)
      conn.release()
    }
  }
}
