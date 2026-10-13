const { randomUUID } = require('node:crypto')

const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10)
exports.changes = (before, after) => {
  if (!before || !after) return []
  const changes = []
  if (day(before.fecha_inicio) !== day(after.fecha_inicio) || String(before.hora_inicio || '') !== String(after.hora_inicio || ''))
    changes.push(`Nuevo horario: ${day(after.fecha_inicio) || 'fecha por definir'} · ${String(after.hora_inicio || 'hora por definir').slice(0, 8)}.`)
  if (Number(before.cancha_id || 0) !== Number(after.cancha_id || 0)) changes.push('Cambió la cancha asignada. Consulta el encuentro para ver la ubicación actual.')
  if (before.estado !== after.estado) {
    if (after.estado === 'cancelado') changes.push('El encuentro fue cancelado.')
    else if (before.estado === 'cancelado') changes.push('El encuentro fue reactivado. Revisa su programación.')
  }
  return changes
}
// Called within the mutation transaction; a retry with unchanged values creates no notice.
exports.notify = async (conn, match, messages) => {
  if (!messages.length || !match?.id) return
  const key = `schedule:${match.id}:${randomUUID()}`
  await conn.query(`INSERT INTO notificaciones (user_id,clave,titulo,mensaje,link)
    SELECT DISTINCT u.id,?,?,?,? FROM jugadores j JOIN users u ON u.id=j.user_id
    LEFT JOIN preferencias_avisos pref ON pref.user_id=u.id
    WHERE u.activo=TRUE AND COALESCE(pref.cambios_partidos,1)=1 AND
    (j.id IN (?,?) OR j.id IN (SELECT jugador1_id FROM equipos_padel WHERE id IN (?,?)
      UNION SELECT jugador2_id FROM equipos_padel WHERE id IN (?,?)))`,
  [key, `Actualización del partido #${match.id}`, messages.join(' '), `/match/${match.id}`,
    match.jugador1_id || null, match.jugador2_id || null,
    match.equipo1_id || null, match.equipo2_id || null, match.equipo1_id || null, match.equipo2_id || null])
}
exports.afterChange = async (conn, before) => {
  if (!before?.id) return
  const [[after]] = await conn.query('SELECT * FROM partidos WHERE id = ?', [before.id])
  await exports.notify(conn, after, exports.changes(before, after))
}
