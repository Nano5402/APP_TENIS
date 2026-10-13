const router = require('express').Router()
const { requireAuth, requireAdmin, requireOfficial } = require('../../middlewares/auth.middleware')
const service = require('./caddies.service').createCaddieService(require('../../config/db'))
router.use(requireAuth, (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next() })
const handle = work => async (req, res) => {
  try { res.json({ ok: true, data: await work(req) }) }
  catch (e) { res.status(e.status || 500).json({ ok: false, message: e.status ? e.message : 'No se pudo completar la operación. Actualiza y vuelve a intentarlo.' }) }
}
router.get('/', requireOfficial, handle(req => service.list(req.user)))
router.get('/valoraciones', requireOfficial, handle(req => service.report(req.query, req.user)))
router.post('/', requireAdmin, handle(req => service.save(null, req.body || {}, req.user)))
router.put('/:id', requireAdmin, handle(req => service.save(req.params.id, req.body || {}, req.user)))
router.get('/partidos/:id', handle(req => service.status(req.params.id, req.user)))
router.put('/partidos/:id/asignacion', requireOfficial, handle(req => service.assign(req.params.id, req.body || {}, req.user)))
router.put('/partidos/:id/valoracion', handle(req => service.rate(req.params.id, req.body || {}, req.user)))
module.exports = router
