const router = require('express').Router()
const controller = require('./torneos.controller')
const { requireAuth, requireAdmin } = require('../../middlewares/auth.middleware')
const { body } = require('express-validator')
const validate = require('../../middlewares/validate.middleware')

// ── Validaciones ────────────────────────────────────────────────────────────────
const torneoRules = [
  body('nombre').notEmpty().withMessage('El nombre es obligatorio'),
  body('deporte').isIn(['tenis', 'padel']).withMessage('El deporte debe ser tenis o padel'),
  body('categoria_id')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('La categoría debe ser válida'),
  body('modalidad')
    .isIn(['individual', 'dobles'])
    .withMessage('La modalidad debe ser individual o dobles'),
  body('sistema')
    .isIn(['por_definir', 'eliminacion_directa', 'todos_contra_todos', 'grupos_eliminacion'])
    .withMessage('Selecciona un sistema de competencia válido'),
  body('fecha_inicio')
    .optional({ values: 'falsy' })
    .isDate()
    .withMessage('fecha_inicio debe ser una fecha válida'),
  body('fecha_fin')
    .optional({ values: 'falsy' })
    .isDate()
    .withMessage('fecha_fin debe ser una fecha válida'),
  body('estado')
    .optional()
    .isIn(['proximo', 'en_curso', 'finalizado', 'cancelado'])
    .withMessage('Estado inválido. Valores: proximo, en_curso, finalizado, cancelado'),
]

// ── Rutas públicas (auth) ───────────────────────────────────────────────────────
router.get('/', controller.getAll)
router.get('/:id', controller.getById)
const groups = require('./grupos.service')
const groupAction = (action) => async (req, res) => {
  try {
    if (!/^[1-9]\d*$/.test(req.params.id))
      return res.status(400).json({ ok: false, message: 'Torneo inválido' })
    res.json({ ok: true, data: await action(req) })
  } catch (e) {
    res
      .status(e.status || 500)
      .json({ ok: false, message: e.status ? e.message : 'No se pudieron procesar los grupos' })
  }
}
router.get(
  '/:id/grupos',
  (req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store')
    const hasSession = req.headers.authorization || /(?:^|;\s*)cu_session=/.test(req.headers.cookie || '')
    return hasSession ? requireAuth(req, res, next) : next()
  },
  groupAction(async (req) => {
    const data = await groups.get(Number(req.params.id))
    if (!req.sessionChecked || !['admin', 'juez_director'].includes(req.user?.rol)) {
      data.incidencias = []
      delete data.version
    }
    return data
  })
)
router.put(
  '/:id/grupos',
  requireAuth,
  requireAdmin,
  groupAction((req) => groups.save(Number(req.params.id), req.body.grupos, req.body.version))
)
router.get('/:torneo_id/posiciones', require('../posiciones/posiciones.controller').getByTorneo)
router.get('/:torneo_id/posiciones/gestion', requireAuth,
  require('../../middlewares/auth.middleware').requireDirector,
  require('../posiciones/posiciones.controller').getByTorneo)
router.get('/:id/inscripciones', require('./inscripciones.controller').getByTorneo)
router.post(
  '/:id/inscripciones',
  requireAuth,
  requireAdmin,
  require('./inscripciones.controller').inscribirBulk
)
router.delete(
  '/:id/inscripciones/:equipo_id',
  requireAuth,
  requireAdmin,
  require('./inscripciones.controller').removeInscripcion
)

// ── Rutas admin ─────────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireAdmin, torneoRules, validate, controller.create)
router.put('/:id', requireAuth, requireAdmin, torneoRules, validate, controller.update)
router.delete('/:id', requireAuth, requireAdmin, controller.remove)

module.exports = router
