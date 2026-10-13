require('dotenv').config()
require('./src/config/env')

const fs = require('fs')
const path = require('path')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const { setAssetCacheHeaders } = require('./src/utils/assetCache')
const { rateLimit } = require('express-rate-limit')
const { ensureSchema } = require('./src/config/schema')
const { UPLOAD_ROOT } = require('./src/middlewares/upload.middleware')

const authRoutes = require('./src/modules/auth/auth.routes')
const jugadoresRoutes = require('./src/modules/jugadores/jugadores.routes')
const equiposRoutes = require('./src/modules/equipos/equipos.routes')
const torneosRoutes = require('./src/modules/torneos/torneos.routes')
const partidosRoutes = require('./src/modules/matches/matches.routes')
const anunciosRoutes = require('./src/modules/news/news.routes')
const favoritosRoutes = require('./src/modules/favorites/favorites.routes')
const categoriasRoutes = require('./src/modules/categorias/categorias.routes')
const sedesRoutes = require('./src/modules/sedes/sedes.routes')
const usersRoutes = require('./src/modules/users/users.routes')
const countriesRoutes = require('./src/modules/countries/countries.routes')

const app = express()
app.set('trust proxy', 1)
const readiness = require('./src/config/readiness')(ensureSchema)
// También protege el arranque gestionado: ninguna ruta usa un esquema incompleto.
app.use(readiness.middleware)

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(helmet(require('./src/config/securityHeaders')))
// SSE must flush each event immediately; never buffer the live stream.
app.use(compression({ filter: (req, res) => req.originalUrl.split('?')[0] !== '/api/partidos/stream' && compression.filter(req, res) }))
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
      const error = new Error('Origen no permitido por CORS')
      error.status = 403
      return callback(error)
    },
    credentials: true,
  })
)
app.use(express.json({ limit: '100kb' }))
app.use(express.urlencoded({ extended: true, limit: '100kb' }))

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos. Intenta nuevamente en 15 minutos.' },
})
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)
app.use('/api/auth/forgot-password', authLimiter)
app.use('/api/auth/verify-otp', authLimiter)
app.use('/api/auth/reset-password', authLimiter)

app.use('/api/auth', authRoutes)
app.use('/api/jugadores', jugadoresRoutes)
app.use('/api/equipos', equiposRoutes)
app.use('/api/torneos', torneosRoutes)
app.use('/api/auditoria', require('./src/modules/audit/audit.routes'))
app.use('/api/partidos', partidosRoutes)
app.use('/api/caddies', require('./src/modules/caddies/caddies.routes'))
app.use('/api/analytics', require('./src/modules/analytics/routes'))
app.use('/api/anuncios', anunciosRoutes)
app.use('/api/favoritos', favoritosRoutes)
app.use('/api/categorias', categoriasRoutes)
app.use('/api/sedes', sedesRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/countries', countriesRoutes)
app.use('/api/tickets', require('./src/modules/support/support.routes'))
app.use('/api/notificaciones', require('./src/modules/support/notifications.routes'))
app.use('/api/push', require('./src/modules/support/push.routes'))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    message: 'API disponible',
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || 'local',
    timestamp: new Date(),
  })
})

const frontendDist = path.resolve(__dirname, '..', 'scores-app', 'dist')
app.use(
  '/uploads',
  express.static(UPLOAD_ROOT, {
    maxAge: '1d',
    immutable: false,
    setHeaders(res) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    },
  })
)
app.use('/uploads', require('./src/modules/media/mediaFallback'))
const setNoStoreHeaders = (res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('Surrogate-Control', 'no-store')
}

const setHtmlHeaders = (res) => {
  setNoStoreHeaders(res)
  // Revalidate the HTML without clearing the browser's useful asset cache.
}

if (fs.existsSync(frontendDist)) {
  app.use(
    express.static(frontendDist, {
      etag: true,
      lastModified: true,
      setHeaders(res, filePath) {
        setAssetCacheHeaders(res, filePath)
        if (filePath.endsWith('.html')) {
          setHtmlHeaders(res)
        }
      },
    })
  )
}

app.use((req, res) => {
  if (req.path.startsWith('/api/') || !fs.existsSync(frontendDist)) {
    return res.status(404).json({ ok: false, message: 'Ruta no encontrada' })
  }
  setHtmlHeaders(res)
  return res.sendFile(path.join(frontendDist, 'index.html'))
})

app.use((error, _req, res, _next) => {
  console.error('[ERROR]', error)
  res
    .status(error.status || error.statusCode || 500)
    .json({ ok: false, message: error.message || 'Error interno del servidor' })
})

const port = process.env.PORT || 3001

// ensureSchema() debe ejecutarse una sola vez por proceso, sin importar cómo se
// arranque la app: `node server.js` (Render) llama a app.start(); Passenger
// (Hostinger) carga el módulo con require() y sirve `module.exports` sin llamar
// a app.start(), por lo que la migración de esquema se dispara aquí igualmente.
let schemaPromise = null
app.ensureSchemaOnce = () => {
  if (!schemaPromise) {
    schemaPromise = readiness.start().then(() => {
      require('./src/modules/support/push.service').start()
      require('./src/modules/analytics/runtime').start()
    }).catch((error) => {
      console.error('❌  No fue posible actualizar el esquema:', error.message)
      throw error
    })
  }
  return schemaPromise
}

app.start = () => {
  return app
    .ensureSchemaOnce()
    .then(() => {
      app.listen(port, '0.0.0.0', () => {
        console.log(`Tenis Club Unión API disponible en el puerto ${port}`)
      })
    })
    .catch(() => {
      process.exitCode = 1
    })
}

if (require.main === module) {
  app.start()
} else {
  // El middleware devuelve 503 hasta terminar; si falla, mantiene el bloqueo.
  app.ensureSchemaOnce().catch(() => {})
}

module.exports = app
