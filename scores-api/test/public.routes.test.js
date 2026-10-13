const test = require('node:test')
const assert = require('node:assert/strict')

const dbPath = require.resolve('../src/config/db')
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    async query() {
      return [[]]
    },
  },
}

const {
  requireAuth,
  requireAdmin,
  requireOfficial,
  requireScorer,
  requireDirector,
} = require('../src/middlewares/auth.middleware')

const routes = {
  torneos: require('../src/modules/torneos/torneos.routes'),
  categorias: require('../src/modules/categorias/categorias.routes'),
  equipos: require('../src/modules/equipos/equipos.routes'),
  jugadores: require('../src/modules/jugadores/jugadores.routes'),
  partidos: require('../src/modules/matches/matches.routes'),
  anuncios: require('../src/modules/news/news.routes'),
  sedes: require('../src/modules/sedes/sedes.routes'),
}

const handlersFor = (router, method, path) => {
  const layer = router.stack.find(
    (candidate) => candidate.route?.path === path && candidate.route.methods[method]
  )
  assert.ok(layer, `No se encontró ${method.toUpperCase()} ${path}`)
  return layer.route.stack.map((handler) => handler.handle)
}

test('las consultas necesarias para ver marcadores no exigen autenticación', () => {
  const publicReads = [
    [routes.torneos, '/'],
    [routes.torneos, '/:id'],
    [routes.torneos, '/:id/inscripciones'],
    [routes.torneos, '/:id/grupos'],
    [routes.torneos, '/:torneo_id/posiciones'],
    [routes.categorias, '/'],
    [routes.equipos, '/'],
    [routes.equipos, '/:id'],
    [routes.jugadores, '/'],
    [routes.jugadores, '/:id'],
    [routes.partidos, '/'],
    [routes.partidos, '/stream'],
    [routes.partidos, '/:id'],
    [routes.partidos, '/:id/estadisticas'],
    [routes.anuncios, '/'],
  ]

  for (const [router, path] of publicReads) {
    assert.equal(handlersFor(router, 'get', path).includes(requireAuth), false)
  }
})

test('las operaciones de administración siguen protegidas', () => {
  const protectedWrites = [
    [routes.partidos, 'get', '/gestion/pendientes', requireAdmin],
    [routes.partidos, 'post', '/gestion/programacion', requireOfficial],
    [routes.torneos, 'post', '/:id/inscripciones', requireAdmin],
    [routes.torneos, 'put', '/:id/grupos', requireAdmin],
    [routes.torneos, 'delete', '/:id/inscripciones/:equipo_id', requireAdmin],
    [routes.categorias, 'post', '/', requireAdmin],
    [routes.equipos, 'post', '/', requireAdmin],
    [routes.jugadores, 'post', '/', requireAdmin],
    [routes.partidos, 'post', '/', requireOfficial],
    [routes.partidos, 'put', '/:id/marcador', requireScorer],
    ...['correccion', 'sustitucion', 'reasignar-juez', 'cancelar', 'reactivar'].map((action) => [
      routes.partidos,
      'put',
      `/:id/${action}`,
      requireDirector,
    ]),
    [routes.partidos, 'post', '/:id/iniciar', requireOfficial],
    [routes.partidos, 'put', '/:id/pausa', requireOfficial],
    [routes.partidos, 'put', '/:id/saque', requireOfficial],
    [routes.anuncios, 'post', '/', requireAdmin],
    [routes.sedes, 'put', '/canchas/:canchaId', requireAdmin],
    [routes.sedes, 'delete', '/canchas/:canchaId', requireAdmin],
  ]

  for (const [router, method, path, roleGuard] of protectedWrites) {
    const handlers = handlersFor(router, method, path)
    assert.ok(handlers.includes(requireAuth))
    assert.ok(handlers.includes(roleGuard))
  }
})

test('las nuevas rutas de perfiles y fotos exigen la autorización adecuada', () => {
  const memberReads = [
    handlersFor(routes.partidos, 'get', '/mios'),
    handlersFor(routes.anuncios, 'get', '/:id'),
  ]
  for (const handlers of memberReads) {
    assert.ok(handlers.includes(requireAuth))
  }

  const adminRoutes = [
    ['get', '/gestion'],
    ['put', '/:id/foto'],
    ['delete', '/:id/foto'],
    ['put', '/:id/usuario'],
    ['delete', '/:id/usuario'],
  ]

  for (const [method, path] of adminRoutes) {
    const handlers = handlersFor(routes.jugadores, method, path)
    assert.ok(handlers.includes(requireAuth))
    assert.ok(handlers.includes(requireAdmin))
  }
})
