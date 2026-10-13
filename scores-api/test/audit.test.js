const test = require('node:test')
const assert = require('node:assert/strict')
const calls = []
let keys = [], rows = []
const dbPath = require.resolve('../src/config/db')
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async (sql, params) => { calls.push({ sql, params }); return [sql.startsWith('SELECT *') ? keys : rows] } } }
const service = require('../src/modules/audit/audit.service')
test('auditoría valida filtros antes de consultar', async () => {
  calls.length = 0
  for (const input of [{ tipo: 'users' }, { pagina: '-1' }, { pagina: '101' }, { pagina: '0;DELETE' }, { actor: '1 OR 1=1' }, { tipo: ['retiros'] }]) await assert.rejects(service.list(input), e => e.status === 400)
  assert.equal(calls.length, 0)
})
test('consulta es de solo lectura y no mezcla collations de texto', async () => {
  calls.length = 0; keys = []
  assert.deepEqual(await service.list(), { items: [], siguiente: null })
  assert.equal(calls.length, 1)
  assert.match(calls[0].sql, /UNION ALL/)
  assert.match(calls[0].sql, /LIMIT 51 OFFSET 0/)
  assert.doesNotMatch(calls[0].sql, /detalle|autor|accion|INSERT|DELETE|UPDATE/)
})
test('retiros conservan motivo y autor sin exponer campos de cuenta', async () => {
  calls.length = 0; keys = [{ id: 7, source: 0 }]
  rows = [{ id: 7, torneo_id: 8, actor_id: 9, autor: 'Ana', retirado: 1, motivo: 'Lesión', participante_id: 20, tipo: 'pareja', email: 'private' }]
  const result = await service.list({ tipo: 'retiros', actor: '9' })
  assert.equal(result.items[0].accion, 'Retiro')
  assert.equal(result.items[0].detalle.motivo, 'Lesión')
  assert.equal(result.items[0].email, undefined)
  assert.deepEqual(calls[0].params, ['9'])
  assert.doesNotMatch(calls[0].sql, /UNION/)
})
test('paginación limita hidratación a 50 registros', async () => {
  keys = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, source: 2 }))
  rows = keys.map(k => ({ id: k.id, entidad: 'torneo', registro_id: 5, detalle: '{"nombre":"Prueba"}' }))
  const result = await service.list({ pagina: '1' })
  assert.equal(result.items.length, 50); assert.equal(result.siguiente, 2)
  assert.equal(result.items[0].detalle.nombre, 'Prueba')
})
test('endpoint exige autenticación y rol admin, no revela errores SQL', async () => {
  const auth = require('../src/middlewares/auth.middleware')
  const router = require('../src/modules/audit/audit.routes')
  const handlers = router.stack[0].route.stack.map(s => s.handle)
  assert.equal(handlers[0], auth.requireAuth); assert.equal(handlers[1], auth.requireAdmin)
  const original = service.list
  service.list = async () => { throw Error('SQL secret') }
  const res = { setHeader(k,v) { assert.equal(v,'no-store') }, status(s) { this.code=s; return this }, json(body) { this.body=body } }
  try { await handlers[2]({query:{}},res); assert.equal(res.code,500); assert.doesNotMatch(res.body.message,/SQL/) } finally { service.list=original }
})
