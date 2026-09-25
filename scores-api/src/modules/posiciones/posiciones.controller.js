const service = require('./posiciones.service')
const { success, error } = require('../../utils/response')

// ── Get standings by tournament ──────
exports.getByTorneo = async (req, res) => {
  try {
    const data = await service.getByTorneo(req.params.torneo_id)
    const management = req.sessionChecked === true && ['admin', 'juez_director'].includes(req.user?.rol)
    if (!management) {
      const unassigned = new Set((data.sin_grupo || []).map(row => Number(row.id)))
      if (data.grupos_explicitos) {
        data.tabla_general = data.tabla_general.filter(row => !unassigned.has(Number(row.id)))
      }
      delete data.sin_grupo
      delete data.incidencias
    }
    data.puede_ver_gestion = management
    res.setHeader('Cache-Control', 'private, no-store')
    return success(res, data)
  } catch (err) {
    return error(res, err.message || 'Error al obtener posiciones', err.status || 500)
  }
}
