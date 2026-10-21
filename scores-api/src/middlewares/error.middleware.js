/**
 * Middleware centralizado de manejo de errores para Express.
 * Procesa tanto instancias de AppError / Error como objetos arrojados con { status, message }.
 */
const errorHandler = (err, req, res, _next) => {
  const status = err.status || err.statusCode || 500
  const message = err.message || (typeof err === 'string' ? err : 'Error interno del servidor')

  // Loguear errores 500 o no operacionales con stack trace
  if (status >= 500 || !err.isOperational) {
    console.error(`[ERROR 5xx] ${req.method} ${req.originalUrl}:`, err.stack || err)
  }

  const payload = {
    ok: false,
    message,
  }

  if (err.code) payload.code = err.code
  if (err.details) payload.details = err.details

  return res.status(status).json(payload)
}

module.exports = errorHandler
