const test = require('node:test')
const assert = require('node:assert/strict')
const dbPath = require.resolve('../src/config/db')
const servicePath = require.resolve('../src/modules/torneos/attention.service')
function load(fail = false) {
  require.cache[dbPath] = { id: dbPath, loaded: true, exports: { query: async sql => {
    if (fail) throw Error('Database unavailable')
    if (sql.startsWith('SELECT p.id,p.torneo_id')) return [[{ id: 5, torneo_id: 1, retired: 1, juez_id: null, cancha_id: null }]]
    if (sql.includes('COUNT(DISTINCT i.equipo_id)')) {
      assert.match(sql, /gp.equipo_id IS NULL/); assert.match(sql, /NOT EXISTS/)
      return [[{ torneo_id: 1, total: 21 }]]
    }
    if (sql.includes('tickets_soporte')) { assert.ok(sql.includes("'en_revision'")); return [[{ total: 2 }]] }
    if (sql.includes("estado='finalizado'")) return [[{ total: 0 }]]
    return [[]]
  } } }
  delete require.cache[servicePath]
  return require(servicePath)
}
test('pendientes distingue parejas activas, retiros y campos faltantes, sin modificar registros', async () => {
  const result = await load().get()
  assert.equal(result.total, 4)
  assert.ok(result.items.some(i => i.title === '21 parejas activas sin grupo'))
  assert.ok(result.items.find(i => i.type === 'retiros').to.includes('partido=5'))
  assert.ok(result.items.find(i => i.type === 'programacion').detail.includes('horario'))
})
test('un fallo de consulta no se convierte en lista vacía de pendientes', async () => {
  await assert.rejects(load(true).get(), /Database unavailable/)
})
