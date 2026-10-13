const router = require('express').Router()
const db = require('../../config/db')
const { requireAuth } = require('../../middlewares/auth.middleware')
const { success, error } = require('../../utils/response')
router.use(requireAuth, (_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})
router.get('/preferencias', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT cambios_partidos FROM preferencias_avisos WHERE user_id=?', [req.user.id])
    return success(res, { cambios_partidos: row ? Boolean(row.cambios_partidos) : true })
  } catch { return error(res, 'No se pudieron consultar las preferencias', 503) }
})
router.put('/preferencias', async (req, res) => {
  if (typeof req.body?.cambios_partidos !== 'boolean') return error(res, 'Preferencia inválida', 400)
  try {
    await db.query('INSERT INTO preferencias_avisos (user_id,cambios_partidos) VALUES (?,?) ON DUPLICATE KEY UPDATE cambios_partidos=VALUES(cambios_partidos)', [req.user.id, req.body.cambios_partidos])
    return success(res, { cambios_partidos: req.body.cambios_partidos })
  } catch { return error(res, 'No se pudo guardar la preferencia', 503) }
})
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id,titulo,mensaje,link,leido_at,created_at FROM notificaciones WHERE user_id=? ORDER BY id DESC LIMIT 50',
      [req.user.id]
    )
    const [[count]] = await db.query(
      'SELECT COUNT(*) AS total FROM notificaciones WHERE user_id=? AND leido_at IS NULL',
      [req.user.id]
    )
    return success(res, { items: rows, pendientes: Number(count.total) })
  } catch {
    return error(res, 'No se pudieron cargar los avisos personales', 503)
  }
})
router.put('/leer-todas', async (req, res) => {
  try {
    await db.query('UPDATE notificaciones SET leido_at=COALESCE(leido_at,NOW()) WHERE user_id=?', [
      req.user.id,
    ])
    return success(res, { ok: true })
  } catch {
    return error(res, 'No se pudieron actualizar los avisos', 503)
  }
})
router.put('/:id/leer', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id < 1) return error(res, 'Identificador inválido', 400)
  try {
    const [result] = await db.query(
      'UPDATE notificaciones SET leido_at=COALESCE(leido_at,NOW()) WHERE id=? AND user_id=?',
      [id, req.user.id]
    )
    if (!result.affectedRows) return error(res, 'Aviso no encontrado', 404)
    return success(res, { ok: true })
  } catch {
    return error(res, 'No se pudo actualizar el aviso', 503)
  }
})
module.exports = router
