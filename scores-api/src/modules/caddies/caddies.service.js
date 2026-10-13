const fail = (status, message) => { throw { status, message } }
const director = user => ['admin', 'juez_director'].includes(user?.rol)
const official = user => director(user) || user?.rol === 'juez'
const assigned = (match, user) => official(user) && Number(match.juez_id) === Number(user.id)
const manage = (match, user) => director(user) || assigned(match, user)
function id(value) {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < 1) fail(400, 'Identificador inválido')
  return n
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail(400, 'Actualiza la información antes de continuar')
  return value
}
function ratingInput(body) {
  if (!Number.isInteger(body.estrellas) || body.estrellas < 1 || body.estrellas > 5) fail(400, 'Selecciona entre 1 y 5 estrellas')
  if (body.comentario != null && typeof body.comentario !== 'string') fail(400, 'Comentario inválido')
  const comentario = (body.comentario || '').trim()
  if (comentario.length > 1000) fail(400, 'El comentario admite hasta 1000 caracteres')
  return { estrellas: body.estrellas, comentario }
}
exports.createCaddieService = db => {
  async function transaction(work) {
    const conn = await db.getConnection()
    try { await conn.beginTransaction(); const value = await work(conn); await conn.commit(); return value }
    catch (e) { await conn.rollback().catch(() => {}); throw e }
    finally { conn.release() }
  }
  async function matchFor(conn, matchId, lock = false) {
    const [[match]] = await conn.query(`SELECT id, juez_id, estado FROM partidos WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [id(matchId)])
    if (!match) fail(404, 'Partido no encontrado')
    return match
  }
  async function participant(conn, matchId, user) {
    const [rows] = await conn.query(`SELECT j.id FROM jugadores j JOIN partidos p ON p.id=?
      LEFT JOIN equipos_padel a ON a.id=p.equipo1_id LEFT JOIN equipos_padel b ON b.id=p.equipo2_id
      WHERE j.user_id=? AND j.id IN (p.jugador1_id,p.jugador2_id,a.jugador1_id,a.jugador2_id,b.jugador1_id,b.jugador2_id) LIMIT 1`, [matchId, user.id])
    return rows.length > 0
  }
  async function status(matchId, user) {
    return transaction(async conn => {
      // One match lock serializes assignment, ratings and permission checks with match edits.
      const match = await matchFor(conn, matchId, true)
      const player = await participant(conn, match.id, user)
      const [[assignment]] = await conn.query(`SELECT pc.caddie_id, pc.revision, c.nombre FROM partido_caddies pc JOIN caddies c ON c.id=pc.caddie_id WHERE pc.partido_id=?`, [match.id])
      const [rows] = await conn.query(`SELECT user_id, estrellas, comentario, tipo, revision, updated_at FROM caddie_valoraciones WHERE partido_id=?`, [match.id])
      const own = rows.find(r => Number(r.user_id) === Number(user.id))
      if (!manage(match, user) && !player && !own) fail(403, 'Solo los participantes y oficiales de este partido pueden consultar esta información')
      const publicRating = ({ user_id, ...rest }) => ({ ...rest, propia: Number(user_id) === Number(user.id) })
      return {
        caddie: assignment || null, revision: Number(assignment?.revision || 0),
        can_assign: manage(match, user) && match.estado !== 'cancelado',
        can_rate: match.estado === 'finalizado' && Boolean(assignment) && (player || assigned(match, user)),
        can_view_ratings: manage(match, user),
        propia: own ? publicRating(own) : null,
        valoraciones: manage(match, user) ? rows.map(publicRating) : [],
      }
    })
  }
  async function assign(matchId, body, user) {
    const caddieId = id(body.caddie_id), expected = version(body.expected_revision)
    await transaction(async conn => {
      const match = await matchFor(conn, matchId, true)
      if (!manage(match, user)) fail(403, 'Solo el juez asignado o la dirección puede asignar el caddie')
      if (match.estado === 'cancelado') fail(409, 'No puedes asignar caddie a un partido cancelado')
      const [[previous]] = await conn.query('SELECT caddie_id, revision FROM partido_caddies WHERE partido_id=? FOR UPDATE', [match.id])
      if (Number(previous?.revision || 0) !== expected) fail(409, 'La asignación cambió. Actualiza antes de continuar')
      if (Number(previous?.caddie_id) === caddieId) return
      const [[caddie]] = await conn.query('SELECT id FROM caddies WHERE id=? AND activo=TRUE FOR UPDATE', [caddieId])
      if (!caddie) fail(400, 'Este caddie ya no está disponible. Actualiza la lista')
      const [ratings] = await conn.query('SELECT user_id FROM caddie_valoraciones WHERE partido_id=? LIMIT 1', [match.id])
      if (ratings.length) fail(409, 'El caddie ya tiene valoraciones en este partido. No se pueden trasladar a otra persona')
      await conn.query(`INSERT INTO partido_caddies (partido_id,caddie_id,assigned_by) VALUES (?,?,?)
        ON DUPLICATE KEY UPDATE caddie_id=VALUES(caddie_id),assigned_by=VALUES(assigned_by),revision=revision+1`, [match.id, caddieId, user.id])
      await conn.query('INSERT INTO auditoria_control_partido (partido_id,created_by,accion,detalle) VALUES (?,?,?,?)', [match.id, user.id, 'asignar_caddie', JSON.stringify({ anterior: previous?.caddie_id || null, nuevo: caddieId })])
    })
    return status(matchId, user)
  }
  async function rate(matchId, body, user) {
    const input = ratingInput(body), caddieId = id(body.caddie_id), expected = version(body.expected_revision)
    await transaction(async conn => {
      const match = await matchFor(conn, matchId, true)
      if (!assigned(match, user) && !await participant(conn, match.id, user)) fail(403, 'Solo el juez asignado y los jugadores de este partido pueden valorar')
      if (match.estado !== 'finalizado') fail(409, 'Podrás valorar cuando el partido haya finalizado')
      const [[assignment]] = await conn.query('SELECT caddie_id, revision FROM partido_caddies WHERE partido_id=? FOR UPDATE', [match.id])
      if (!assignment || Number(assignment.caddie_id) !== caddieId) fail(409, 'El caddie asignado cambió. Actualiza antes de valorar')
      const [[previous]] = await conn.query('SELECT revision FROM caddie_valoraciones WHERE partido_id=? AND user_id=? FOR UPDATE', [match.id, user.id])
      if (Number(previous?.revision || 0) !== expected) fail(409, 'Tu valoración cambió. Actualiza para verla antes de editarla')
      await conn.query(`INSERT INTO caddie_valoraciones (partido_id,user_id,caddie_id,estrellas,comentario,tipo) VALUES (?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE estrellas=VALUES(estrellas),comentario=VALUES(comentario),revision=revision+1`, [match.id, user.id, caddieId, input.estrellas, input.comentario, assigned(match, user) ? 'juez' : 'jugador'])
    })
    return status(matchId, user)
  }
  async function list(user) {
    if (!official(user)) fail(403, 'No tienes acceso al directorio')
    const [rows] = await db.query('SELECT id,nombre,activo,revision FROM caddies ORDER BY nombre')
    return rows
  }
  async function save(caddieId, body, user) {
    if (user?.rol !== 'admin') fail(403, 'Solo administración puede editar el directorio')
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim().replace(/\s+/g, ' ') : ''
    if (!nombre || nombre.length > 120) fail(400, 'Escribe un nombre de hasta 120 caracteres')
    if (typeof body.activo !== 'boolean') fail(400, 'Estado inválido')
    try {
      if (caddieId) {
        const [result] = await db.query('UPDATE caddies SET nombre=?,activo=?,revision=revision+1 WHERE id=? AND revision=?', [nombre, body.activo, id(caddieId), version(body.expected_revision)])
        if (!result.affectedRows) fail(409, 'El registro cambió. Actualiza antes de editar')
      } else await db.query('INSERT INTO caddies (nombre,activo) VALUES (?,?)', [nombre, body.activo])
    } catch (e) { if (e.code === 'ER_DUP_ENTRY') fail(409, 'Ya existe un caddie con ese nombre'); throw e }
    return list(user)
  }
  async function report(query, user) {
    if (!official(user)) fail(403, 'No tienes permiso para consultar valoraciones')
    const where = [], args = []
    if (!director(user)) { where.push('p.juez_id=?'); args.push(user.id) }
    if (query.caddie_id) { where.push('v.caddie_id=?'); args.push(id(query.caddie_id)) }
    const page = query.page ? id(query.page) : 1
    if (page > 10000) fail(400, 'Página fuera de rango')
    const [rows] = await db.query(`SELECT v.partido_id,v.estrellas,v.comentario,v.tipo,v.updated_at,c.nombre AS caddie_nombre,
      p.fecha_inicio,t.nombre AS torneo_nombre FROM caddie_valoraciones v
      JOIN caddies c ON c.id=v.caddie_id JOIN partidos p ON p.id=v.partido_id LEFT JOIN torneos t ON t.id=p.torneo_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY v.updated_at DESC,v.partido_id DESC,v.user_id DESC LIMIT 51 OFFSET ?`, [...args, (page - 1) * 50])
    return { items: rows.slice(0, 50), more: rows.length > 50, page }
  }
  return { status, assign, rate, list, save, report }
}
exports.ratingInput = ratingInput
