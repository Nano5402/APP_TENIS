const conflict = message => { throw { status: 409, message } }
exports.assertVersion = (match, expected) => {
  if (!Number.isSafeInteger(expected) || expected < 0 || expected !== Number(match.control_version || 0))
    conflict('El partido cambió o falta su versión. Cierra la edición, actualiza el listado y vuelve a abrirlo antes de guardar.')
}
exports.assertIdentity = (match, next) => {
  const changed = ['jugador1_id', 'jugador2_id', 'equipo1_id', 'equipo2_id', 'origen_partido1_id', 'origen_partido2_id']
    .some(key => next[key] !== undefined && Number(next[key] || 0) !== Number(match[key] || 0))
  if (changed && match.estado !== 'programado')
    conflict('No puedes cambiar participantes ni sus orígenes en un partido iniciado o cerrado. Usa la sustitución supervisada cuando corresponda; los resultados históricos deben conservar sus participantes.')
  if (match.estado !== 'programado' && next.estado !== undefined && next.estado !== match.estado)
    conflict('Cambia el estado desde la mesa de juez o las acciones supervisadas, no desde la edición general.')
}
