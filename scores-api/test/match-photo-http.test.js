// Isolated HTTP integration. Database is replaced before imports; no real DB or .env.
const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { randomUUID } = require('node:crypto')
const express = require('express')
const jwt = require('jsonwebtoken')
const sharp = require('sharp')

test('HTTP photo authorization, multipart, public image, replacement and forged file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tenis-photo-http-'))
  const originalDirectory = process.env.MATCH_PHOTOS_DIR, originalSecret = process.env.JWT_SECRET
  process.env.MATCH_PHOTOS_DIR = directory
  process.env.JWT_SECRET = 'local-test-only-photo-secret-not-production'
  let row, writes = 0, role = 'juez', audits = 0
  const db = {
    async query(sql, args) {
      if (sql.includes('FROM users')) return [[{ rol: role, activo: true }]]
      if (sql.startsWith('DELETE FROM fotos_partido')) { row = null; return [{}] }
      if (sql.startsWith('INSERT INTO auditoria_control_partido')) { audits++; return [{}] }
      if (sql.includes('FROM partidos')) return [Number(args[0]) === 30 ? [{ id: 30, juez_id: 12 }] : []]
      if (sql.includes('FROM fotos_partido')) return [row ? [{ ...row }] : []]
      if (sql.startsWith('INSERT')) { writes++; row = { partido_id: args[0], version: args[1], momento: args[2], created_by: args[3], encuadre: args[5], updated_at: 'now' }; return [{}] }
      throw new Error(sql)
    },
    async getConnection() { return { query: db.query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} } },
  }
  const dbPath = require.resolve('../src/config/db')
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db }
  const app = express()
  app.use(express.json())
  app.use('/api/partidos/:id/foto', require('../src/modules/matches/match-photo.routes'))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api/partidos/30/foto`
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'green' } }).jpeg().toBuffer()
  const token = id => jwt.sign({ id, rol: 'juez' }, process.env.JWT_SECRET)
  async function upload(id, version, expected = '', image = bytes) {
    const form = new FormData()
    for (const [key, value] of Object.entries({ version, expected, momento: 'inicio', consentimiento: 'true' })) form.append(key, value)
    form.append('foto', new Blob([image], { type: 'image/jpeg' }), 'photo.jpg')
    return fetch(base, { method: 'PUT', headers: id ? { Authorization: `Bearer ${token(id)}` } : {}, body: form })
  }
  try {
    assert.equal((await upload(null, randomUUID())).status, 401)
    assert.equal((await upload(99, randomUUID())).status, 403)
    assert.equal((await fetch(`${base}/estado`)).status, 401)
    const diagnostic = await fetch(`${base}/estado`, { headers: { Authorization: `Bearer ${token(12)}` } })
    assert.deepEqual((await diagnostic.json()).data, { configured: true, writable: true })
    assert.equal(writes, 0)
    assert.deepEqual((await (await fetch(base)).json()).data, null)
    const version = randomUUID()
    const saved = await upload(12, version)
    assert.equal(saved.status, 200, await saved.text())
    assert.equal((await upload(12, version)).status, 200)
    assert.equal(writes, 1)
    assert.equal((await upload(12, randomUUID())).status, 409)
    const metadata = (await (await fetch(base)).json()).data
    assert.deepEqual(Object.keys(metadata).sort(), ['encuadre', 'momento', 'updated_at', 'version'])
    assert.deepEqual(metadata.encuadre, { zoom: 1, x: 50, y: 50 })
    const image = await fetch(`${base}/imagen?v=${version}`)
    assert.equal(image.status, 200); assert.match(image.headers.get('content-type'), /image\/webp/)
    assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format, 'webp')
    assert.equal((await fetch(`${base}/imagen?v=../../secret`)).status, 404)
    assert.equal((await upload(12, randomUUID(), version, Buffer.from('<html>not an image</html>'))).status, 400)
    const replacement = randomUUID()
    assert.equal((await upload(12, replacement, version)).status, 200)
    assert.equal((await fetch(`${base}/imagen?v=${version}`)).status, 404)
    assert.equal((await fetch(`${base}/imagen?v=${replacement}&miniatura=1`)).status, 200)
    assert.equal(writes, 2)
    const remove = (expected = replacement, authenticated = true) => fetch(base, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token(12)}` } : {}) },
      body: JSON.stringify({ expected }),
    })
    assert.equal((await remove(replacement, false)).status, 401)
    for (const denied of ['juez', 'juez_director', 'jugador']) {
      role = denied
      assert.equal((await remove()).status, 403)
      assert.equal(row.version, replacement)
    }
    role = 'admin'
    assert.equal((await remove('../unsafe')).status, 400)
    assert.equal((await remove(version)).status, 409)
    assert.equal(row.version, replacement)
    assert.equal((await remove()).status, 200)
    assert.equal(audits, 1)
    assert.equal((await (await fetch(base)).json()).data, null)
    assert.equal((await fetch(`${base}/imagen?v=${replacement}`)).status, 404)
    assert.deepEqual(await fs.readdir(directory), [])
    assert.equal((await remove()).status, 200)
    assert.equal(audits, 1)
    assert.equal((await upload(12, randomUUID())).status, 200)
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    delete require.cache[dbPath]
    if (originalDirectory === undefined) delete process.env.MATCH_PHOTOS_DIR; else process.env.MATCH_PHOTOS_DIR = originalDirectory
    if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret
    await fs.rm(directory, { recursive: true, force: true })
  }
})
