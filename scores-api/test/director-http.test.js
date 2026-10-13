const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const express = require('express')
const jwt = require('jsonwebtoken')

test('HTTP: rol real protege supervisión y lista de jueces no expone datos privados', async () => {
  process.env.JWT_SECRET = 'director-http-fixture-only-secret-not-production'
  let role = 'juez'
  const dbPath = require.resolve('../src/config/db')
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    async query(sql) {
      if (sql.includes('SELECT rol, activo')) return role ? [[{ rol: role, activo: 1 }]] : [[]]
      if (sql.includes('FROM users u')) {
        assert.doesNotMatch(sql, /numero_documento|email|telefono|password/)
        return [[{ id: 3, nombre: 'Juez', apellido: 'Prueba', rol: 'juez', usuario: 'juez3' }]]
      }
      throw new Error('Unexpected database call')
    },
    getConnection: async () => { throw new Error('Unauthorized request must not write') },
  } }
  const app = express()
  app.use(express.json())
  app.use('/partidos', require('../src/modules/matches/matches.routes'))
  app.use('/users', require('../src/modules/users/users.routes'))
  app.use('/torneos', require('../src/modules/torneos/torneos.routes'))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const token = jwt.sign({ id: 3, rol: 'admin' }, process.env.JWT_SECRET)
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  try {
    for (const actualRole of ['juez', 'miembro', null]) {
      role = actualRole
      const audit = await fetch(`${base}/partidos/10/auditoria`, { headers })
      assert.equal(audit.status, actualRole ? 403 : 401)
      for (const action of ['reasignar-juez', 'cancelar', 'reactivar', 'sustitucion', 'correccion']) {
        const response = await fetch(`${base}/partidos/10/${action}`, { method: 'PUT', headers, body: JSON.stringify({ expected_control_version: 0 }) })
        assert.equal(response.status, actualRole ? 403 : 401)
      }
    }
    role = 'juez_director'
    for (const path of ['/partidos/10', '/partidos/10/marcador']) {
      const response = await fetch(`${base}${path}`, { method: 'PUT', headers, body: '{}' })
      assert.equal(response.status, 403)
    }
    const noAuth = await fetch(`${base}/partidos/10/cancelar`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(noAuth.status, 401)
    const judges = await fetch(`${base}/users/jueces`, { headers })
    assert.equal(judges.status, 200)
    assert.doesNotMatch(JSON.stringify(await judges.json()), /numero_documento|email|telefono|password/)
    const admin = await fetch(`${base}/users`, { headers })
    assert.equal(admin.status, 403)
    for (const actualRole of ['juez_director', 'juez', 'miembro']) {
      role = actualRole
      for (const [method, path] of [['PUT', '/archivo'], ['GET', '/retiros/auditoria'], ['GET', '/retiros/participantes'], ['PUT', '/retiros']]) {
        const response = await fetch(`${base}/torneos/1${path}`, { method, headers, ...(method === 'PUT' ? { body: '{}' } : {}) })
        assert.equal(response.status, 403)
      }
      for (const [method, path] of [['POST', '/users'], ['PUT', '/users/2'], ['PUT', '/users/2/password'], ['PUT', '/users/2/estado'], ['PUT', '/users/2/avatar'], ['DELETE', '/users/2/avatar'], ['DELETE', '/users/2']]) {
        const response = await fetch(`${base}${path}`, { method, headers, body: '{}' })
        assert.equal(response.status, 403)
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
    server.closeAllConnections()
  }
})
