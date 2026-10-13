// Explicit allowlists: never persist credentials, sessions or arbitrary request bodies.
const fields = {
  torneo: ['nombre', 'deporte', 'categoria_id', 'modalidad', 'sistema', 'fecha_inicio', 'fecha_fin', 'estado'],
  partido: ['nombre_override', 'nombre_override_j1', 'nombre_override_j2', 'torneo_id', 'deporte', 'categoria_id', 'jugador1_id', 'jugador2_id', 'equipo1_id', 'equipo2_id', 'estado', 'fecha_inicio', 'hora_inicio', 'fase', 'grupo', 'ronda', 'notas', 'origen_partido1_id', 'origen_partido2_id', 'juez_id', 'cancha_id', 'mejor_de_sets', 'juegos_por_set', 'diferencia_juegos', 'modo_game', 'set_decisivo', 'tiebreak_en', 'tiebreak_puntos', 'match_tiebreak_puntos', 'servidor_inicial'],
  grupos: ['distribucion'],
  resultado: ['estado', 'ganador', 'sets'],
}
function normalize(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value === undefined ? null : value
}
exports.diff = (entity, before, after) => {
  if (!fields[entity]) throw new Error('Entidad de auditoría no soportada')
  const changes = {}
  for (const key of fields[entity]) {
    const oldValue = normalize(before[key]), newValue = normalize(after[key])
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) changes[key] = { antes: oldValue, despues: newValue }
  }
  return changes
}
exports.record = async (conn, entity, id, actor, before, after) => {
  if (!before || !after) throw new Error('No se pudo verificar el cambio para su auditoría')
  const cambios = exports.diff(entity, before, after)
  if (!Object.keys(cambios).length) return
  await conn.query('INSERT INTO auditoria_ediciones (entidad,registro_id,actor_id,accion,detalle) VALUES (?,?,?,?,?)',
    [entity, id, actor?.id ?? actor ?? null, 'Edición administrativa', JSON.stringify({ cambios })])
}
exports.groupsSnapshot = (groups, pairs) => ({ distribucion: groups.map(g => ({
  categoria_id: Number(g.categoria_id), nombre: g.nombre,
  parejas: pairs.filter(p => Number(p.categoria_id) === Number(g.categoria_id) && p.grupo === g.nombre).map(p => Number(p.equipo_id)).sort((a,b) => a-b),
})).sort((a,b) => a.categoria_id-b.categoria_id || a.nombre.localeCompare(b.nombre)) })
exports.scoreSnapshot = (match, sets) => ({ estado: match.estado, ganador: match.ganador ?? null,
  sets: sets.map(s => ({ numero_set: Number(s.numero_set), games_j1: Number(s.games_j1), games_j2: Number(s.games_j2), tiebreak_j1: s.tiebreak_j1 == null ? null : Number(s.tiebreak_j1), tiebreak_j2: s.tiebreak_j2 == null ? null : Number(s.tiebreak_j2), completado: Boolean(s.completado) })).sort((a,b) => a.numero_set-b.numero_set),
})
