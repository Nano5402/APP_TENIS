const db = require('../../config/db')
const service = require('./service').createService(db, process.env.ANALYTICS_SECRET || process.env.JWT_SECRET)
let ready = false, started = false
exports.service = service
exports.ready = () => ready
exports.start = () => {
  if (started) return
  started = true
  async function maintain() {
    let retry = false
    try {
      if (!ready) { await require('./schema').ensure(db); ready = true }
      retry = await service.cleanup()
    } catch { retry = true; console.warn('Estadísticas de visitas temporalmente no disponibles; se reintentará.') }
    setTimeout(maintain, ready && !retry ? 6 * 3600000 : 60000).unref()
  }
  void maintain()
}
