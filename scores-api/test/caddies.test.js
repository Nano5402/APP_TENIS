const test = require('node:test')
const assert = require('node:assert/strict')
const { createCaddieService } = require('../src/modules/caddies/caddies.service')
function fixture(options = {}) {
  const match = { id: 1, juez_id: 3, estado: 'finalizado', ...options.match }
  let assignment = options.unassigned ? null : { caddie_id: 8, revision: 1, nombre: 'Caddie prueba' }
  const ratings = options.ratings || []
  const calls = [], players = options.players || [4, 5, 6, 7]
  const query = async (sql, args = []) => {
    calls.push({ sql, args })
    if (sql.startsWith('SELECT id, juez_id, estado')) return [[match]]
    if (sql.startsWith('SELECT j.id')) return [players.includes(Number(args[1])) ? [{ id: 10 }] : []]
    if (sql.includes('FROM partido_caddies')) return [assignment ? [assignment] : []]
    if (sql.startsWith('SELECT id FROM caddies')) return [options.inactive ? [] : [{ id: args[0] }]]
    if (sql.startsWith('SELECT revision FROM caddie_valoraciones')) return [ratings.filter(r => r.user_id === args[1])]
    if (sql.includes('FROM caddie_valoraciones WHERE')) return [ratings]
    if (sql.startsWith('INSERT INTO partido_caddies')) { assignment = { caddie_id: args[1], revision: (assignment?.revision || 0) + 1, nombre: 'Caddie prueba' }; return [{}] }
    if (sql.startsWith('INSERT INTO auditoria_control_partido')) return [{}]
    if (sql.startsWith('INSERT INTO caddie_valoraciones')) {
      const old = ratings.find(r => r.user_id === args[1])
      const row = { user_id: args[1], estrellas: args[3], comentario: args[4], tipo: args[5], revision: (old?.revision || 0) + 1 }
      if (old) Object.assign(old, row); else ratings.push(row)
      return [{}]
    }
    if (sql.startsWith('SELECT id,nombre')) return [[{ id: 8, nombre: 'Caddie prueba', activo: 1, revision: 1 }]]
    if (sql.startsWith('SELECT v.partido_id')) return [[]]
    if (sql.startsWith('INSERT INTO caddies')) { if (options.duplicate) throw { code: 'ER_DUP_ENTRY' }; return [{}] }
    if (sql.startsWith('UPDATE caddies')) return [{ affectedRows: options.stale ? 0 : 1 }]
    throw new Error(`Unexpected query: ${sql}`)
  }
  const db = { query, getConnection: async () => ({ query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} }) }
  return { service: createCaddieService(db), calls, ratings }
}
const judge = { id: 3, rol: 'juez' }, player = { id: 4, rol: 'miembro' }, admin = { id: 99, rol: 'admin' }
const rate = { caddie_id: 8, estrellas: 5, comentario: 'Muy atento', expected_revision: 0 }
test('caddie: cada jugador de dobles y el juez pueden valorar; un administrador ajeno no', async () => {
  const f = fixture()
  for (const actor of [judge, ...[4, 5, 6, 7].map(id => ({ id, rol: 'miembro' }))]) {
    const result = await f.service.rate(1, rate, actor)
    assert.equal(result.propia.estrellas, 5)
  }
  assert.equal(f.ratings.length, 5)
  for (const actor of [admin, { id: 9, rol: 'juez' }, { id: 10, rol: 'miembro' }]) {
    await assert.rejects(f.service.rate(1, rate, actor), e => e.status === 403)
  }
})
test('caddie: privacidad por partido, comentarios ajenos nunca llegan a un jugador', async () => {
  const f = fixture({ ratings: [{ user_id: 4, estrellas: 5, comentario: 'Propio', revision: 1 }, { user_id: 5, estrellas: 1, comentario: 'Privado', revision: 1 }] })
  const own = await f.service.status(1, player)
  assert.equal(own.propia.comentario, 'Propio'); assert.deepEqual(own.valoraciones, [])
  assert.doesNotMatch(JSON.stringify(own), /Privado|user_id/)
  for (const actor of [judge, admin, { id: 55, rol: 'juez_director' }]) {
    const result = await f.service.status(1, actor)
    assert.equal(result.valoraciones.length, 2)
    assert.doesNotMatch(JSON.stringify(result), /user_id/)
  }
  await assert.rejects(f.service.status(1, { id: 9, rol: 'juez' }), e => e.status === 403)
  await assert.rejects(f.service.status(1, { id: 9, rol: 'miembro' }), e => e.status === 403)
})
test('caddie: una sola valoración por cuenta, edición versionada sin duplicados', async () => {
  const f = fixture()
  await f.service.rate(1, rate, player)
  await assert.rejects(f.service.rate(1, rate, player), e => e.status === 409)
  await f.service.rate(1, { ...rate, estrellas: 4, expected_revision: 1 }, player)
  assert.equal(f.ratings.length, 1); assert.equal(f.ratings[0].estrellas, 4)
})
test('caddie: solo al finalizar; valida estrellas, longitud, versión y caddie real', async () => {
  for (const estado of ['programado', 'en_vivo', 'cancelado']) {
    await assert.rejects(fixture({ match: { estado } }).service.rate(1, rate, player), e => e.status === 409)
  }
  for (const override of [{ estrellas: 0 }, { estrellas: 6 }, { estrellas: 2.5 }, { estrellas: '5' }, { comentario: 'x'.repeat(1001) }, { expected_revision: -1 }]) {
    await assert.rejects(fixture().service.rate(1, { ...rate, ...override }, player), e => e.status === 400)
  }
  await assert.rejects(fixture().service.rate(1, { ...rate, caddie_id: 9 }, player), e => e.status === 409)
  await assert.rejects(fixture({ unassigned: true }).service.rate(1, rate, player), e => e.status === 409)
})
test('caddie: asignación auditada sin tocar el marcador, rechaza cambios con valoraciones', async () => {
  const f = fixture({ unassigned: true })
  const result = await f.service.assign(1, { caddie_id: 8, expected_revision: 0 }, judge)
  assert.equal(result.revision, 1)
  assert.ok(f.calls.some(c => c.sql.includes('INSERT INTO auditoria_control_partido')))
  assert.ok(!f.calls.some(c => /UPDATE partidos|eventos_partido|sets_partido/.test(c.sql)))
  await assert.rejects(f.service.assign(1, { caddie_id: 9, expected_revision: 0 }, judge), e => e.status === 409)
  await f.service.rate(1, rate, player)
  await assert.rejects(f.service.assign(1, { caddie_id: 9, expected_revision: 1 }, judge), e => e.status === 409)
  assert.equal((await f.service.assign(1, { caddie_id: 8, expected_revision: 1 }, judge)).revision, 1)
})
test('caddie: no asignar desde otra mesa, ni inactivos; directorio solo administradores', async () => {
  const body = { caddie_id: 9, expected_revision: 1 }
  for (const actor of [player, { id: 9, rol: 'juez' }]) await assert.rejects(fixture().service.assign(1, body, actor), e => e.status === 403)
  await assert.rejects(fixture({ inactive: true }).service.assign(1, body, judge), e => e.status === 400)
  await assert.rejects(fixture({ match: { estado: 'cancelado' } }).service.assign(1, body, judge), e => e.status === 409)
  const entry = { nombre: 'Ana', activo: true, expected_revision: 1 }
  for (const actor of [judge, player, { id: 55, rol: 'juez_director' }]) await assert.rejects(fixture().service.save(null, entry, actor), e => e.status === 403)
  await fixture().service.save(null, entry, admin)
  await assert.rejects(fixture({ duplicate: true }).service.save(null, entry, admin), e => e.status === 409)
  await assert.rejects(fixture({ stale: true }).service.save(8, entry, admin), e => e.status === 409)
  await assert.rejects(fixture().service.list(player), e => e.status === 403)
})
test('caddie: reporte de juez está filtrado por su asignación, paginado y sin identidades', async () => {
  const f = fixture()
  await f.service.report({ caddie_id: '8', page: '2' }, judge)
  const call = f.calls.at(-1)
  assert.match(call.sql, /WHERE p.juez_id=\? AND v.caddie_id=\?/)
  assert.deepEqual(call.args, [3, 8, 50])
  assert.doesNotMatch(call.sql.split('FROM')[0], /user_id/)
  await assert.rejects(f.service.report({}, player), e => e.status === 403)
})
