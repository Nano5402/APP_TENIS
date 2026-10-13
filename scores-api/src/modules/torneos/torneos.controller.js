const torneosService = require('./torneos.service')
const { success, error } = require('../../utils/response')

// ── Listar todos ────────────────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const { deporte, estado, modalidad, archivo } = req.query
    const data = await torneosService.getAll({ deporte, estado, modalidad, archivo })
    return success(res, data)
  } catch (err) {
    return error(res, err.message || 'Error al obtener torneos', err.status || 500)
  }
}

// ── Obtener por ID ──────────────────────────────────────────────────────────────
exports.getById = async (req, res) => {
  try {
    const data = await torneosService.getById(req.params.id)
    return success(res, data)
  } catch (err) {
    return error(res, err.message || 'Error al obtener torneo', err.status || 500)
  }
}

// ── Crear ────────────────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const data = await torneosService.create(req.body)
    return success(res, data, 201)
  } catch (err) {
    return error(res, err.message || 'Error al crear torneo', err.status || 500)
  }
}

// ── Actualizar ──────────────────────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const data = await torneosService.update(req.params.id, req.body, req.user.id)
    return success(res, data)
  } catch (err) {
    return error(res, err.status ? err.message : 'No se pudo guardar el torneo. No se guardaron cambios; intenta nuevamente.', err.status || 500)
  }
}

// ── Eliminar ────────────────────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const data = await torneosService.remove(req.params.id, req.user.id)
    return success(res, data)
  } catch (err) {
    return error(res, err.status ? err.message : 'No se pudo eliminar el torneo. No se guardaron cambios; intenta nuevamente.', err.status || 500)
  }
}
