const service = require('./matches.service')
const director = require('./director.service')
const realtime = require('./match-realtime')
const { success, error } = require('../../utils/response')

const changed = (res, data, matchId, status = 200, action = 'updated') => {
  realtime.publishMatchChange({ matchId, action })
  return success(res, data, status)
}

const directorError = (res, err) => error(res,
  err.status ? err.message : 'No se pudo completar la operación. Actualiza el partido y vuelve a intentarlo.',
  err.status || 500)

exports.stream = (req, res) => realtime.subscribe(req, res)

exports.liveVersion = (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  return success(res, realtime.getVersion())
}

exports.getAll = async (req, res) => {
  try {
    return success(res, await service.getAll(req.query))
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

exports.getMyMatches = async (req, res) => {
  try {
    return success(res, await service.getMyMatches(req.user.id))
  } catch (err) {
    return error(res, err.message || 'Error al obtener tus partidos', err.status || 500)
  }
}

exports.getById = async (req, res) => {
  try {
    return success(res, await service.getById(req.params.id))
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

exports.create = async (req, res) => {
  try {
    const data = await service.create(req.body, req.user)
    return changed(res, data, data.id, 201, 'created')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

exports.update = async (req, res) => {
  try {
    return changed(res, await service.update(req.params.id, req.body, req.user), req.params.id)
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

// PUT /api/partidos/:id/participantes — renombrar o reasignar participantes
exports.updateParticipants = async (req, res) => {
  try {
    return changed(res, await service.updateParticipants(req.params.id, req.body, req.user), req.params.id)
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

// POST /api/partidos/cuadro-eliminatorio — generar/actualizar árbol eliminatorio de una categoría
exports.createKnockoutBracket = async (req, res) => {
  try {
    const data = await service.createKnockoutBracket(req.body, req.user)
    realtime.publishMatchChange({ matchId: data?.[0]?.id || data?.partidos?.[0]?.id || 0, action: 'bracket_created' })
    return success(res, data, 201)
  } catch (err) {
return error(res, err.status ? err.message : 'No se pudo guardar el cuadro eliminatorio. Reintenta.', err.status || 500)
  }
}

// PUT /api/partidos/:id/llave-eliminatoria — ajuste manual de llave / avance manual en cuadro eliminatorio
exports.updateBracketSlot = async (req, res) => {
  try {
    return changed(res, await service.updateBracketSlot(req.params.id, req.body, req.user), req.params.id, 200, 'bracket_updated')
  } catch (err) {
return error(res, err.status ? err.message : 'No se pudo guardar la llave eliminatoria. Reintenta.', err.status || 500)
  }
}

// PUT /api/partidos/:id/reasignar-cancha — reasignar cancha por juez_director o admin
exports.reassignCourt = async (req, res) => {
  try {
    return changed(res, await director.reassignCourt(req.params.id, req.body, req.user), req.params.id)
  } catch (err) {
    return directorError(res, err)
  }
}

// PUT /api/partidos/:id/reasignar-juez — reasignar juez por juez_director o admin
exports.reassignJudge = async (req, res) => {
  try {
    return changed(res, await director.reassignJudge(req.params.id, req.body, req.user), req.params.id)
  } catch (err) {
    return directorError(res, err)
  }
}

// PUT /api/partidos/:id/walkover — declarar walkover por juez de mesa o director
exports.walkover = async (req, res) => {
  try {
    const eventService = require('./match-events.service')
    return changed(res, await eventService.walkover(req.params.id, req.body, req.user), req.params.id, 200, 'finalized')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

// PUT /api/partidos/:id/cancelar — bajar / cancelar partido (supervisión director)
exports.cancelMatch = async (req, res) => {
  try {
    return changed(res, await director.cancelMatch(req.params.id, req.body, req.user), req.params.id)
  } catch (err) {
    return directorError(res, err)
  }
}

// PUT /api/partidos/:id/cancelar-partido — cancelar partido por juez oficial asignado o director
exports.judgeCancelMatch = async (req, res) => {
  try {
    const eventService = require('./match-events.service')
    return changed(res, await eventService.cancelMatch(req.params.id, req.body, req.user), req.params.id, 200, 'cancelled')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

// PUT /api/partidos/:id/reactivar — reactivar partido cancelado
exports.reactivateMatch = async (req, res) => {
  try {
    return changed(res, await director.reactivateMatch(req.params.id, req.body, req.user), req.params.id)
  } catch (err) {
    return directorError(res, err)
  }
}

// PUT /api/partidos/:id/marcador — actualizar sets en tiempo real
exports.correctScore = async (req, res) => {
  try {
    return changed(res, await director.correctScore(req.params.id, req.body, req.user), req.params.id)
  } catch (err) {
    return directorError(res, err)
  }
}

exports.substitute = async (req, res) => {
  try {
    return changed(res, await director.substitute(req.params.id, req.body, req.user), req.params.id)
  } catch (err) {
    return directorError(res, err)
  }
}

exports.updateMarcador = async (req, res) => {
  try {
    return changed(res, await service.updateMarcador(req.params.id, req.body, req.user), req.params.id)
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

const eventService = require('./match-events.service')

exports.getManaged = async (req, res) => {
  try {
    return success(res, await eventService.getManagedMatches(req.user))
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

exports.getControl = async (req, res) => {
  try {
    return success(res, await eventService.getControl(req.params.id, req.user))
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

exports.getStats = async (req, res) => {
  try {
    return success(res, await eventService.getStats(req.params.id, req.query.set))
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

exports.startMatch = async (req, res) => {
  try {
    return changed(res, await eventService.startMatch(req.params.id, req.user), req.params.id, 200, 'started')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

exports.setPaused = async (req, res) => {
  try {
    return changed(
      res,
      await eventService.setPaused(req.params.id, req.body.pausado, req.user, req.body.motivo),
      req.params.id,
      200,
      req.body.pausado ? 'paused' : 'resumed'
    )
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

exports.setDoublesOrder = async (req, res) => {
  try { return changed(res, await eventService.setDoublesOrder(req.params.id, req.body, req.user), req.params.id) }
  catch (err) { return error(res, err.message, err.status || 500) }
}

exports.changeServer = async (req, res) => {
  try {
    return changed(res, await eventService.changeServer(req.params.id, req.body.servidor, req.user), req.params.id)
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

exports.addEvent = async (req, res) => {
  try {
    return changed(res, await eventService.addEvent(req.params.id, req.body, req.user), req.params.id, 201, 'score')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

exports.undoEvent = async (req, res) => {
  try {
    return changed(res, await eventService.undoLastEvent(req.params.id, req.user), req.params.id, 200, 'undo')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

exports.remove = async (req, res) => {
  try {
    return changed(res, await service.remove(req.params.id), req.params.id, 200, 'deleted')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}
