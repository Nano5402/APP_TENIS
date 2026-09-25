const test = require('node:test')
const assert = require('node:assert/strict')
const servicePath = require.resolve('../src/modules/posiciones/posiciones.service')
require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: {
  getByTorneo: async () => ({ grupos_explicitos: true, grupos: { A: [{ id: 1 }] },
    tabla_general: [{ id: 1 }, { id: 2 }], sin_grupo: [{ id: 2 }], incidencias: [{ message: 'Internal' }] }),
} }
const controller = require('../src/modules/posiciones/posiciones.controller')
for (const rol of [null, 'miembro', 'juez', 'admin', 'juez_director']) {
  test(`posiciones limita información interna: ${rol || 'visitante'}`, async () => {
    let body
    const headers = {}
    const res = { setHeader: (k, v) => { headers[k] = v }, status() { return this }, json(value) { body = value; return this } }
    await controller.getByTorneo({ params: { torneo_id: 1 }, user: rol ? { rol } : undefined, sessionChecked: !!rol }, res)
    const allowed = ['admin', 'juez_director'].includes(rol)
    assert.equal(body.data.puede_ver_gestion, allowed)
    assert.equal('sin_grupo' in body.data, allowed)
    assert.equal('incidencias' in body.data, allowed)
    assert.equal(body.data.tabla_general.length, allowed ? 2 : 1)
    assert.equal(headers['Cache-Control'], 'private, no-store')
  })
}
test('rol sin sesión verificada no obtiene avisos internos', async () => {
  let body
  const res = { setHeader() {}, status() { return this }, json(value) { body = value } }
  await controller.getByTorneo({ params: { torneo_id: 1 }, user: { rol: 'admin' } }, res)
  assert.equal(body.data.puede_ver_gestion, false)
})
