const db = require('../../config/db')

exports.get = async () => {
  const items = []
  const [matches] = await db.query(`SELECT p.id,p.torneo_id,p.fecha_inicio,p.hora_inicio,p.cancha_id,p.juez_id,
    EXISTS (SELECT 1 FROM torneo_retiros r
      LEFT JOIN equipos_padel e ON e.id IN (p.equipo1_id,p.equipo2_id)
      WHERE r.torneo_id=p.torneo_id AND r.retirado=1 AND
      ((r.tipo='pareja' AND r.participante_id IN (p.equipo1_id,p.equipo2_id)) OR
       (r.tipo='jugador' AND r.participante_id IN (p.jugador1_id,p.jugador2_id,e.jugador1_id,e.jugador2_id)))) AS retired
    FROM partidos p WHERE p.estado IN ('programado','en_vivo') ORDER BY p.fecha_inicio,p.hora_inicio,p.id`)
  for (const m of matches) {
    const missing = [!m.juez_id && 'juez', !m.cancha_id && 'cancha', (!m.fecha_inicio || !m.hora_inicio) && 'horario'].filter(Boolean)
    const to = `/admin/partidos?partido=${m.id}${m.torneo_id ? `&torneo=${m.torneo_id}` : ''}`
    if (m.retired) items.push({ key: `retired:${m.id}`, type: 'retiros', title: `Partido #${m.id}: participante retirado`, detail: 'Revisa el encuentro pendiente; no se ha cancelado ni asignado ganador automáticamente.', to })
    if (missing.length) items.push({ key: `missing:${m.id}`, type: 'programacion', title: `Completar partido #${m.id}`, detail: `Falta ${missing.join(', ')}.`, to })
  }
  const [teams] = await db.query(`SELECT i.torneo_id,COUNT(DISTINCT i.equipo_id) AS total
    FROM inscripciones i JOIN torneos t ON t.id=i.torneo_id
    JOIN equipos_padel e ON e.id=i.equipo_id
    LEFT JOIN torneo_grupo_parejas gp ON gp.torneo_id=i.torneo_id AND gp.equipo_id=i.equipo_id
    WHERE t.estado IN ('proximo','en_curso') AND t.sistema='grupos_eliminacion'
    AND i.estado<>'eliminado' AND gp.equipo_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM torneo_retiros r WHERE r.torneo_id=i.torneo_id AND r.retirado=1
      AND ((r.tipo='pareja' AND r.participante_id=i.equipo_id) OR
           (r.tipo='jugador' AND r.participante_id IN (e.jugador1_id,e.jugador2_id))))
    GROUP BY i.torneo_id`)
  for (const t of teams) items.push({ key: `teams:${t.torneo_id}`, type: 'grupos', title: `${t.total} parejas activas sin grupo`, detail: `Torneo #${t.torneo_id}: revisar distribución.`, to: `/torneo/${t.torneo_id}?tab=teams` })
  const [tournaments] = await db.query("SELECT id FROM torneos WHERE estado IN ('proximo','en_curso') AND sistema='grupos_eliminacion'")
  for (const t of tournaments) {
    const result = await require('./grupos.service').get(t.id)
    for (const issue of result.incidencias) items.push({ key: `group:${issue.partido_id}`, type: 'revision', title: `Revisar cruce #${issue.partido_id}`, detail: issue.message, to: `/admin/partidos?torneo=${t.id}&partido=${issue.partido_id}` })
  }
  const [[support]] = await db.query("SELECT COUNT(*) AS total FROM tickets_soporte WHERE estado IN ('abierto','en_revision')")
  if (Number(support.total)) items.push({ key: 'support', type: 'soporte', title: `${support.total} solicitudes pendientes`, detail: 'Consulta y responde las solicitudes de soporte.', to: '/admin/tickets' })
  const [[results]] = await db.query("SELECT COUNT(*) AS total FROM partidos WHERE estado='finalizado' AND ganador IS NULL AND (notas IS NULL OR notas NOT LIKE '%[Doble W.O. - Sin ganador]%')")
  if (Number(results.total)) items.push({ key: 'results', type: 'revision', title: `${results.total} resultados sin ganador`, detail: 'Verifica si corresponden a un cierre sin ganador válido o requieren corrección. No se alteró ningún resultado.', to: '/admin/partidos' })
  return { items, checkedAt: new Date().toISOString(), total: items.length }
}
