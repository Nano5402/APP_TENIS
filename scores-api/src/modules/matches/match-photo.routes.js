const router = require('express').Router({ mergeParams: true })
const multer = require('multer')
const { rateLimit } = require('express-rate-limit')
const { requireAuth, requireOfficial, requireAdmin } = require('../../middlewares/auth.middleware')
const { success, error } = require('../../utils/response')
const { createPhotoService, publicError } = require('./match-photo.service')
const service = createPhotoService(require('../../config/db'))
const realtime = require('./match-realtime')
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5, parts: 7 } }).single('foto')
const uploads = rateLimit({ windowMs: 60000, limit: 8, keyGenerator: req => String(req.user.id), message: { ok: false, message: 'Espera un minuto antes de volver a subir una foto' } })
let activeUploads = 0
function report(res, err) {
  const issue = publicError(err)
  res.status(issue.status || 500).json({ ok: false, code: issue.code?.startsWith('PHOTO_') ? issue.code : 'PHOTO_REQUEST_FAILED', message: issue.status ? issue.message : 'El servidor no pudo procesar la foto. La copia pendiente se conserva; reintenta o consulta al administrador.' })
}

router.use((req, res, next) => /^[1-9]\d*$/.test(req.params.id) && Number.isSafeInteger(Number(req.params.id)) ? next() : error(res, 'Partido inválido', 400))
router.get('/estado', requireAuth, requireOfficial, async (req, res) => {
  res.set('Cache-Control', 'no-store')
  try { success(res, await service.status(req.params.id, req.user)) }
  catch (err) { report(res, err) }
})
router.get('/', async (req, res) => {
  try { res.set('Cache-Control', 'no-store'); success(res, await service.get(req.params.id)) }
  catch (err) { report(res, err) }
})
// Match details are public in this application. Only the current, explicitly published photo is served.
router.get('/imagen', async (req, res) => {
  try {
    const photo = await service.get(req.params.id)
    if (!photo || req.query.v !== photo.version) return error(res, 'Fotografía no disponible', 404)
    res.set({ 'Cache-Control': 'public, max-age=60, must-revalidate', 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' })
    res.sendFile(service.file(photo.version, req.query.miniatura === '1'), err => {
      if (err && !res.headersSent) error(res, 'Fotografía no disponible en el almacenamiento', 404)
    })
  } catch (err) { if (!res.headersSent) error(res, err.status ? err.message : 'No se pudo abrir la foto', err.status || 500) }
})
router.put('/', requireAuth, requireOfficial, uploads, async (req, res, next) => {
  try { await service.check(req.params.id, req.user); next() }
  catch (err) { report(res, err) }
}, (req, res) => {
  if (activeUploads >= 2) return error(res, 'Hay otras fotos subiendo. Se reintentará en unos segundos.', 429)
  activeUploads++
  receive(req, res, async uploadError => {
    if (uploadError) { activeUploads--; return error(res, 'Archivo no permitido o demasiado grande (máximo 8 MB)', 400) }
    try {
      const photo = await service.save(req.params.id, req.user, req.body, req.file?.buffer)
      realtime.publishMatchChange({ matchId: Number(req.params.id), action: 'photo' })
      success(res, photo)
    } catch (err) { report(res, err) }
    finally { activeUploads-- }
  })
})
router.delete('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    await service.remove(req.params.id, req.user, req.body?.expected)
    realtime.publishMatchChange({ matchId: Number(req.params.id), action: 'photo' })
    success(res, null)
  } catch (err) {
    error(res, err.status ? err.message : 'No se pudo eliminar la foto. Intenta nuevamente.', err.status || 500)
  }
})
module.exports = router
