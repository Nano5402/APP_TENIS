const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const express = require('express')
const jwt = require('jsonwebtoken')
test('HTTP caddies: sesión real, aislamiento del partido y privacidad de valoraciones', async () => {
  process.env.JWT_SECRET = 'caddies-test-only-not-production'
  const query = async (sql, args) => {
    if (sql.includes('SELECT rol, activo')) return [[{ rol: Number(args[0]) === 3 ? 'juez' : Number(args[0]) === 99 ? 'admin' : 'miembro', activo: 1 }]]
    if (sql.startsWith('SELECT id, juez_id')) return [[{ id: 1, juez_id: 3, estado: 'finalizado' }]]
    if (sql.startsWith('SELECT j.id')) return [Number(args[1]) === 4 ? [{ id: 20 }] : []]
    if (sql.includes('FROM partido_caddies')) return [[{ caddie_id: 8, nombre: 'Prueba', revision: 1 }]]
    if (sql.includes('FROM caddie_valoraciones')) return [[{ user_id: 4, estrellas: 5, comentario: 'Mío', tipo: 'jugador', revision: 1 }, { user_id: 5, estrellas: 3, comentario: 'Ajeno privado', tipo: 'jugador', revision: 1 }]]
    throw new Error(sql)
  }
  const dbPath = require.resolve('../src/config/db')
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query, getConnection: async () => ({ query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} }) } }
  const app = express(); app.use(express.json()); app.use('/caddies', require('../src/modules/caddies/caddies.routes'))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/caddies`
  const headers = id => ({ Authorization: `Bearer ${jwt.sign({ id, rol: 'admin' }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' })
  try {
    assert.equal((await fetch(`${base}/partidos/1`)).status, 401)
    const own = await fetch(`${base}/partidos/1`, { headers: headers(4) })
    assert.equal(own.status, 200); assert.match(own.headers.get('cache-control'), /no-store/)
    const data = await own.json()
    assert.equal(data.data.propia.comentario, 'Mío'); assert.doesNotMatch(JSON.stringify(data), /Ajeno privado|user_id/)
    assert.equal((await fetch(`${base}/partidos/1`, { headers: headers(10) })).status, 403)
    const judge = await fetch(`${base}/partidos/1`, { headers: headers(3) })
    assert.equal((await judge.json()).data.valoraciones.length, 2)
    assert.equal((await fetch(base, { method: 'POST', headers: headers(3), body: '{"nombre":"No autorizado","activo":true}' })).status, 403)
    assert.equal((await fetch(`${base}/valoraciones`, { headers: headers(4) })).status, 403)
    assert.equal((await fetch(`${base}/partidos/1/asignacion`, { method: 'PUT', headers: headers(4), body: '{}' })).status, 403)
    assert.equal((await fetch(`${base}/partidos/1/valoracion`, { method: 'PUT', headers: headers(4), body: '{}' })).status, 400)
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); delete require.cache[dbPath] }
})
