const router = require('express').Router()
const { requireAuth, requireAdmin } = require('../../middlewares/auth.middleware')
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try { res.json({ ok: true, data: await require('./audit.service').list(req.query) }) }
  catch (error) { res.status(error.status || 500).json({ ok: false, message: error.status === 400 ? error.message : 'No se pudo cargar el historial. Intenta nuevamente.' }) }
})
module.exports = router
