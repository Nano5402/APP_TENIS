const router = require('express').Router()
const { body } = require('express-validator')
const controller = require('./torneos.controller')
const torneosService = require('./torneos.service')
const groups = require('./grupos.service')
const retiros = require('./retiros.service')
const inscripcionesController = require('./inscripciones.controller')
const posicionesController = require('../posiciones/posiciones.controller')
const matchRealtime = require('../matches/match-realtime')
const { requireAuth, requireAdmin, requireDirector } = require('../../middlewares/auth.middleware')
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
router.put('/:id/archivo', requireAuth, requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const data = await torneosService.setArchived(req.params.id, req.body?.archivado, req.body?.esperado, req.user.id)
    res.json({ ok: true, data })
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.status ? e.message : 'No se pudo guardar el archivo. Actualiza y reintenta.' })
  }
})

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
  groupAction((req) => groups.save(Number(req.params.id), req.body.grupos, req.body.version, req.user.id))
)

router.get('/:torneo_id/posiciones', posicionesController.getByTorneo)
router.get('/:torneo_id/posiciones/gestion', requireAuth, requireDirector, posicionesController.getByTorneo)
router.get('/:id/inscripciones', inscripcionesController.getByTorneo)

router.use('/:id/retiros', (req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next() })
router.get('/:id/retiros/participantes', requireAuth, requireAdmin, groupAction(req => retiros.participants(req.params.id)))
router.get('/:id/retiros', groupAction(req => retiros.get(req.params.id)))
router.put('/:id/retiros', requireAuth, requireAdmin, groupAction(async req => {
  const result = await retiros.set(req.params.id, req.body, req.user)
  matchRealtime.publishMatchChange({ action: 'participation_updated' })
  return result
}))
router.get('/:id/retiros/auditoria', requireAuth, requireAdmin, groupAction(req => retiros.audit(req.params.id)))

router.post(
  '/:id/inscripciones',
  requireAuth,
  requireAdmin,
  inscripcionesController.inscribirBulk
)
router.delete(
  '/:id/inscripciones/:equipo_id',
  requireAuth,
  requireAdmin,
  inscripcionesController.removeInscripcion
)

// ── Rutas admin ─────────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireAdmin, torneoRules, validate, controller.create)
router.put('/:id', requireAuth, requireAdmin, torneoRules, validate, controller.update)
router.delete('/:id', requireAuth, requireAdmin, controller.remove)

module.exports = router
