const router = require('express').Router()
const controller = require('./matches.controller')
const { requireAuth, requireAdmin, requireOfficial, requireDirector, requireScorer } = require('../../middlewares/auth.middleware')

// GET  /api/partidos?estado=en_vivo&deporte=tenis&categoria_id=1
router.get('/', controller.getAll)
router.get('/stream', controller.stream)
router.get('/live-version', controller.liveVersion)
router.get('/mios', requireAuth, controller.getMyMatches)
router.get('/gestion/mis-partidos', requireAuth, requireOfficial, controller.getManaged)
router.get('/gestion/pendientes', requireAuth, requireAdmin, async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  try { res.json({ ok: true, data: await require('../torneos/attention.service').get() }) }
  catch { res.status(500).json({ ok: false, message: 'No se pudieron consultar los pendientes. Reintenta; no se han modificado datos.' }) }
})
router.post('/gestion/programacion', requireAuth, requireOfficial, async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store')
  try { res.json({ ok: true, data: await require('./matches.service').checkSchedule(req.body, req.user) }) }
  catch (e) { res.status(e.status || 500).json({ ok: false, message: e.status ? e.message : 'No se pudo revisar la programación. Reintenta.' }) }
})
router.use('/:id/foto', require('./match-photo.routes'))
// Read-only public results remain available; scoring your own match is not allowed.
router.use('/:matchId/:operation', (req, res, next) => {
  const guarded = ['control', 'iniciar', 'pausa', 'saque', 'orden-saque-dobles', 'eventos', 'deshacer', 'marcador', 'correccion', 'walkover', 'cancelar-partido']
  if (!guarded.includes(req.params.operation)) return next()
  const authorize = req.params.operation === 'correccion' ? requireDirector : req.params.operation === 'marcador' ? requireScorer : requireOfficial
  requireAuth(req, res, () => authorize(req, res, () => require('./neutral-official').guard(req, res, next)))
})
// GET  /api/partidos/:id
router.get('/:id/auditoria', requireAuth, requireDirector, async (req, res) => {
  const { success, error } = require('../../utils/response')
  try { return success(res, await require('./matchAudit.service').getAudit(req.params.id, req.query.after || 0)) }
  catch (err) { return error(res, err.status ? err.message : 'No se pudo consultar la auditoría', err.status || 500) }
})
router.get('/:id/estadisticas', controller.getStats)
router.get('/:id', controller.getById)
router.get('/:id/control', requireAuth, requireOfficial, controller.getControl)
router.post('/:id/iniciar', requireAuth, requireOfficial, controller.startMatch)
router.put('/:id/pausa', requireAuth, requireOfficial, controller.setPaused)
router.put('/:id/saque', requireAuth, requireOfficial, controller.changeServer)
router.put('/:id/orden-saque-dobles', requireAuth, requireOfficial, controller.setDoublesOrder)
router.post('/:id/eventos', requireAuth, requireOfficial, controller.addEvent)
router.post('/:id/deshacer', requireAuth, requireOfficial, controller.undoEvent)
// POST /api/partidos
router.post('/', requireAuth, requireOfficial, controller.create)
// PUT  /api/partidos/:id
router.put('/:id', requireAuth, requireScorer, controller.update)
// PUT  /api/partidos/:id/participantes  — renombrar o reasignar participantes
router.put('/:id/participantes', requireAuth, requireOfficial, controller.updateParticipants)
// PUT  /api/partidos/:id/reasignar-cancha — reasignar cancha
router.put('/:id/reasignar-cancha', requireAuth, requireOfficial, controller.reassignCourt)
// PUT  /api/partidos/:id/reasignar-juez — reasignar juez
router.put('/:id/reasignar-juez', requireAuth, requireDirector, controller.reassignJudge)
// PUT  /api/partidos/:id/walkover — declarar walkover (W)
router.put('/:id/walkover', requireAuth, requireOfficial, controller.walkover)
// PUT  /api/partidos/:id/cancelar — bajar o cancelar partido (supervisión director)
router.put('/:id/cancelar', requireAuth, requireDirector, controller.cancelMatch)
// PUT  /api/partidos/:id/cancelar-partido — cancelar partido por juez oficial asignado o director
router.put('/:id/cancelar-partido', requireAuth, requireOfficial, controller.judgeCancelMatch)
// PUT  /api/partidos/:id/reactivar — reactivar partido cancelado
router.put('/:id/reactivar', requireAuth, requireDirector, controller.reactivateMatch)
// PUT  /api/partidos/:id/marcador  — actualizar sets en vivo
router.put('/:id/correccion', requireAuth, requireDirector, controller.correctScore)
router.put('/:id/sustitucion', requireAuth, requireDirector, controller.substitute)
router.put('/:id/marcador', requireAuth, requireScorer, controller.updateMarcador)
// DELETE /api/partidos/:id
router.delete('/:id', requireAuth, requireAdmin, controller.remove)

module.exports = router
