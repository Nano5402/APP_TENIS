/**
 * Envuelve una función controladora asíncrona de Express para capturar
 * automáticamente cualquier excepción y redirigirla a next(err), eliminando
 * la necesidad de bloques try/catch repetitivos en controladores.
 * 
 * @param {Function} fn - Función del controlador (req, res, next)
 * @returns {Function} Middleware de Express
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

module.exports = asyncHandler
