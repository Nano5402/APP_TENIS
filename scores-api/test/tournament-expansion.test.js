const test = require('node:test'),
  assert = require('node:assert/strict')
const dbPath = require.resolve('../src/config/db')
function load(name, db) {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db }
  const p = require.resolve(name)
  delete require.cache[p]
  return require(p)
}
test('inscripción valida todo el lote y bloquea retirar parejas con partidos', async () => {
  let rollback = 0,
    writes = 0
  const conn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => rollback++,
    release: () => {},
    query: async (sql) => {
      if (sql.startsWith('SELECT id,deporte'))
        return [[{ id: 1, deporte: 'tenis', modalidad: 'dobles', estado: 'proximo' }]]
      if (sql.includes('FROM equipos_padel')) return [[{ id: 2, deporte: 'padel', activo: 1 }]]
      if (sql.includes('FROM torneos')) return [[{ id: 1 }]]
      if (sql.includes('FROM partidos')) return [[{ id: 5 }]]
      writes++
      return [{}]
    },
  }
  const svc = load('../src/modules/torneos/inscripciones.service', {
    getConnection: async () => conn,
  })
  await assert.rejects(svc.inscribirBulk(1, [2, 3]), (e) => e.status === 400)
  await assert.rejects(svc.inscribirBulk(1, [2, 'bad']), (e) => e.status === 400)
  await assert.rejects(
    svc.removeInscripcion(1, 2),
    (e) => e.status === 409 && /partidos/.test(e.message)
  )
  assert.equal(writes, 0)
  assert.equal(rollback, 2)
})
test('inscripción repetida se confirma sin duplicar filas', async () => {
  let inserts = 0,
    updates = 0
  const svc = load('../src/modules/torneos/inscripciones.service', {
    getConnection: async () => ({
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      query: async (sql) => {
        if (sql.includes('FROM torneos'))
          return [[{ id: 1, modalidad: 'dobles', deporte: 'tenis', estado: 'proximo' }]]
        if (sql.includes('FROM equipos_padel'))
          return [[{ id: 2, activo: 1, deporte: 'tenis', jugador1_id: 3, jugador2_id: 4 }]]
        if (sql.includes('FROM jugadores')) return [[{ id: 3 }, { id: 4 }]]
        if (sql.includes('SELECT id FROM inscripciones')) return [[{ id: 9 }]]
        if (sql.startsWith('INSERT')) inserts++
        if (sql.startsWith('UPDATE')) updates++
        return [{}]
      },
    }),
  })
  await svc.inscribirBulk(1, [2, 2])
  assert.equal(inserts, 0)
  assert.equal(updates, 1)
})
test('posiciones separa categorías del mismo grupo, no suma finalizados sin ganador', async () => {
  const svc = load('../src/modules/posiciones/posiciones.service', {
    query: async (sql) => {
      if (sql.includes('FROM torneos')) return [[{ id: 1, modalidad: 'dobles', deporte: 'tenis' }]]
      if (sql.includes('FROM partidos p')) {
        assert.match(sql, /estado <> 'cancelado'/)
        return [
          [
            {
              id: 1,
              p1_id: 1,
              p2_id: 2,
              fase: 'grupos',
              grupo: 'A',
              categoria_nombre: 'Damas',
              estado: 'finalizado',
              ganador: 'jugador1',
            },
            {
              id: 2,
              p1_id: 3,
              p2_id: 4,
              fase: 'grupos',
              grupo: 'A',
              categoria_nombre: 'Quinta',
              estado: 'finalizado',
              ganador: null,
            },
          ],
        ]
      }
      if (sql.includes('FROM inscripciones')) return [[]]
      if (sql.includes('FROM equipos_padel'))
        return [[1, 2, 3, 4].map((id) => ({ id, nombre: 'Pareja ' + id }))]
      if (sql.includes('FROM sets_partido')) return [[]]
      throw Error(sql)
    },
  })
  const r = await svc.getByTorneo(1)
  assert.equal(r.nombres_grupos.length, 2)
  assert.equal(r.grupos['Damas · A'][0].puntos, 1)
  assert.equal(r.grupos['Quinta · A'][0].pj, 0)
})
test('compatibilidad conserva INT UNSIGNED y lecturas por destinatario', async () => {
  const calls = []
  const db = {
    query: async (sql) => {
      calls.push(sql)
      if (sql.includes("TABLE_NAME='notificaciones'") && sql.includes('COLUMNS'))
        return [[{ COLUMN_NAME: 'id', COLUMN_TYPE: 'int unsigned' }, { COLUMN_NAME: 'user_id' }]]
      if (sql.includes("TABLE_NAME='notificaciones_leidas'"))
        return [
          [
            { COLUMN_NAME: 'user_id' },
            { COLUMN_NAME: 'notificacion_id' },
            { COLUMN_NAME: 'leido_at' },
          ],
        ]
      return [[]]
    },
  }
  const result = await require('../src/modules/support/legacy-notifications').prepareNotifications(
    db
  )
  assert.equal(result, 'INT UNSIGNED')
  assert.ok(calls.some((s) => s.includes('r.user_id=n.user_id')))
  assert.equal(
    calls.some((s) => /DROP|DELETE FROM/.test(s)),
    false
  )
})
