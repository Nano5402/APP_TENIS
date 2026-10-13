const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const jwt = require('jsonwebtoken')
const { once } = require('node:events')
const { randomUUID } = require('node:crypto')
test('analytics HTTP: admin-only reports, origin/robot/official filtering, isolated failures', async () => {
  process.env.JWT_SECRET = 'analytics-http-test-only'; process.env.FRONTEND_URL = 'https://club.example'
  let ready = true, fail = false, writes = 0
  const dbPath = require.resolve('../src/config/db'), runtimePath = require.resolve('../src/modules/analytics/runtime')
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async (_sql, args) => [[{ rol: args[0] === 1 ? 'admin' : args[0] === 2 ? 'juez' : 'miembro', activo: 1 }]] } }
  require.cache[runtimePath] = { id: runtimePath, filename: runtimePath, loaded: true, exports: { ready: () => ready, service: {
    record: async body => { require('../src/modules/analytics/service').validate(body); if (fail) throw new Error('DB private'); writes++ },
    report: async () => { if (fail) throw new Error('DB private'); return { totals: { views: writes } } },
  } } }
  const app = express(); app.use(express.json()); app.use('/analytics', require('../src/modules/analytics/routes'))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/analytics`
  const auth = id => ({ Authorization: `Bearer ${jwt.sign({ id, rol: 'admin' }, process.env.JWT_SECRET)}` })
  const post = (headers = {}, body = {}) => fetch(`${base}/view`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://club.example', ...headers }, body: JSON.stringify({ id: randomUUID(), visitor: randomUUID(), session: randomUUID(), path: '/', device: 'desktop', source: 'direct', consent: true, ...body }) })
  try {
    assert.equal((await fetch(`${base}/report`)).status, 401)
    assert.equal((await fetch(`${base}/report`, { headers: auth(2) })).status, 403)
    assert.equal((await fetch(`${base}/report`, { headers: auth(3) })).status, 403)
    const report = await fetch(`${base}/report`, { headers: auth(1) }); assert.equal(report.status, 200); assert.match(report.headers.get('cache-control'), /no-store/)
    assert.equal((await post({ Origin: 'https://evil.example' })).status, 403)
    await post({ 'User-Agent': 'Googlebot' }); await post({ DNT: '1' }); await post(auth(2)); await post(auth(1))
    assert.equal(writes, 0)
    assert.equal((await post()).status, 204); assert.equal(writes, 1)
    assert.equal((await post({}, { consent: false })).status, 400)
    ready = false; assert.equal((await post()).status, 503)
    ready = true; fail = true
    const failed = await fetch(`${base}/report`, { headers: auth(1) }); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /DB private/)
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
