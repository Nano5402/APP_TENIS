const test = require('node:test')
const assert = require('node:assert/strict')
const { assertNeutral } = require('../src/modules/matches/neutral-official')
test('rechaza marcar el propio partido individual o como integrante de pareja', async () => {
  const conn = { query: async (sql, params) => {
    assert.match(sql, /a.jugador1_id,a.jugador2_id,b.jugador1_id,b.jugador2_id/)
    assert.deepEqual(params, [10, 3])
    return [[{id: 8}]]
  } }
  await assert.rejects(assertNeutral(conn, 10, 3), e => e.status === 403)
})
test('permite continuar la autorización normal cuando el oficial no participa', async () => {
  await assertNeutral({query: async () => [[]]}, 10, 3)
})
test('un fallo de consulta no concede acceso a la marcación', async () => {
  await assert.rejects(assertNeutral({query: async () => {throw Error('offline')}}, 10, 3), /offline/)
})
