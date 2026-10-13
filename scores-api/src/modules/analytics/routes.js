const router = require('express').Router()
const { rateLimit } = require('express-rate-limit')
const { optionalAuth, requireAuth, requireAdmin } = require('../../middlewares/auth.middleware')
const runtime = require('./runtime')
router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next() })
router.post('/view', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false }), (req, res, next) => {
  const origins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim())
  const origin = req.get('origin')
  if (!origin || (!origins.includes(origin) && origin !== `${req.protocol}://${req.get('host')}`)) return res.sendStatus(403)
  if (/bot|crawler|spider|headless/i.test(req.get('user-agent') || '') || req.get('dnt') === '1' || req.get('sec-gpc') === '1') return res.sendStatus(204)
  next()
}, optionalAuth, async (req, res) => {
  if (['admin', 'juez', 'juez_director'].includes(req.user?.rol)) return res.sendStatus(204)
  if (!runtime.ready()) return res.sendStatus(503)
  try { await runtime.service.record(req.body); res.sendStatus(204) }
  catch (e) { res.status(e.status || 503).json({ ok: false, message: e.status ? e.message : 'Medición no disponible' }) }
})
router.get('/report', requireAuth, requireAdmin, async (req, res) => {
  if (!runtime.ready()) return res.status(503).json({ ok: false, message: 'Las estadísticas se están preparando. Reintenta en un minuto.' })
  try {
    const data = await runtime.service.report(req.query)
    if (req.query.format === 'csv') return res.type('text/csv').attachment(`visitas-${data.from}-${data.to}.csv`).send(require('./service').csv(data))
    res.json({ ok: true, data })
  } catch (e) { res.status(e.status || 503).json({ ok: false, message: e.status ? e.message : 'No se pudieron cargar las estadísticas. Reintenta.' }) }
})
module.exports = router
