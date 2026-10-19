export const normalizeSearch = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
export const pairText = (pair) =>
  [
    pair.nombre,
    pair.jugador1?.nombre,
    pair.jugador1?.apellido,
    pair.jugador2?.nombre,
    pair.jugador2?.apellido,
  ]
    .filter(Boolean)
    .join(' ')
export const choiceKey = (pair) => `${pair.equipo_id}:${pair.categoria_id}:${pair.grupo || ''}`
export function searchPair(pair, query) {
  const text = normalizeSearch(
    `${pairText(pair)} ${pair.categoria_nombre || ''} ${pair.grupo || ''}`
  )
  return normalizeSearch(query)
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word))
}
export function incompatibility(pair, first, groupPhase) {
  if (groupPhase && !pair.grupo) return 'Necesita un grupo asignado'
  if (!first) return ''
  if (Number(pair.equipo_id) === Number(first.equipo_id)) return 'Es la pareja seleccionada'
  if (Number(pair.categoria_id) !== Number(first.categoria_id)) return 'Pertenece a otra categoría'
  if (groupPhase && pair.grupo !== first.grupo) return 'Pertenece a otro grupo'
  const members = [first.jugador1?.id, first.jugador2?.id].filter(Boolean).map(Number)
  if ([pair.jugador1?.id, pair.jugador2?.id].some((id) => id && members.includes(Number(id))))
    return 'Comparte un jugador con la primera pareja'
  return ''
}
export function previousMeetings(matches, tournamentId, first, second) {
  if (!first || !second) return []
  const ids = [Number(first.equipo_id), Number(second.equipo_id)]
  return matches.filter(
    (match) =>
      String(match.torneo?.id) === String(tournamentId) &&
      match.estado !== 'cancelado' &&
      ids.includes(Number(match.equipo1?.id)) &&
      ids.includes(Number(match.equipo2?.id)) &&
      Number(match.equipo1?.id) !== Number(match.equipo2?.id)
  )
}
