exports.assertNeutral = async (conn, matchId, userId) => {
  const [rows] = await conn.query(`SELECT j.id FROM jugadores j JOIN partidos p ON p.id=?
    LEFT JOIN equipos_padel a ON a.id=p.equipo1_id LEFT JOIN equipos_padel b ON b.id=p.equipo2_id
    WHERE j.user_id=? AND j.id IN (p.jugador1_id,p.jugador2_id,a.jugador1_id,a.jugador2_id,b.jugador1_id,b.jugador2_id) LIMIT 1`, [matchId, userId])
  if (rows.length) throw { status: 403, message: 'Participas en este partido. Otro oficial debe encargarse de su marcación; puedes consultarlo desde Mi actividad.' }
}
exports.guard = async (req, res, next) => {
  try {
    await exports.assertNeutral(require('../../config/db'), req.params.matchId, req.user.id)
    next()
  } catch (e) { res.status(e.status || 503).json({ ok: false, message: e.status ? e.message : 'No se pudo verificar la participación. Reintenta.' }) }
}
