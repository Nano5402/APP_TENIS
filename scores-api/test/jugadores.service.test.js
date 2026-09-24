const test = require('node:test')
const assert = require('node:assert/strict')

const dbPath = require.resolve('../src/config/db')
const servicePath = require.resolve('../src/modules/jugadores/jugadores.service')

const playerRow = {
  id: 8,
  nombre: 'Laura',
  apellido: 'Díaz',
  deporte: 'tenis',
  activo: 1,
  foto: '/uploads/players/laura.jpg',
}

const matchStatsRows = [
  {
    partido_id: 1,
    categoria_id: 3,
    categoria_nombre: '4ta',
    categoria_orden: 3,
    jugador1_id: 8,
    jugador2_id: 9,
    ganador: 'jugador1',
    numero_set: 1,
    games_j1: 6,
    games_j2: 2,
  },
  {
    partido_id: 1,
    categoria_id: 3,
    categoria_nombre: '4ta',
    categoria_orden: 3,
    jugador1_id: 8,
    jugador2_id: 9,
    ganador: 'jugador1',
    numero_set: 2,
    games_j1: 6,
    games_j2: 3,
  },
]

const loadService = (fakeDb) => {
  delete require.cache[servicePath]
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: fakeDb,
  }
  return require(servicePath)
}

test('rechaza una categoría incompatible sin guardar el jugador', async () => {
  const service = loadService({ async query(sql) {
    assert.match(sql, /SELECT deporte FROM categorias/)
    return [[{ deporte: 'padel' }]]
  } })
  await assert.rejects(service.create({ nombre: 'Ana', apellido: 'Pérez', deporte: 'tenis', categoria_id: 4 }),
    (error) => error.status === 400 && /categoría no corresponde/.test(error.message))
})

test('editar jugador permite cambiar y retirar la categoría', async () => {
  const writes = []
  const service = loadService({ async query(sql, params) {
    if (/SELECT id FROM jugadores/.test(sql)) return [[{ id: 8 }]]
    if (/SELECT deporte FROM categorias/.test(sql)) return [[{ deporte: 'tenis' }]]
    if (/UPDATE jugadores/.test(sql)) { writes.push(params); return [{}] }
    if (/WHERE j.id = \?/.test(sql)) return [[playerRow]]
    return [[]]
  } })
  const body = { nombre: 'Laura', apellido: 'Díaz', deporte: 'tenis' }
  await service.update(8, { ...body, categoria_id: 3 })
  await service.update(8, { ...body, categoria_id: null })
  assert.deepEqual(writes.map((params) => params[3]), [3, null])
})

test('updateFoto actualiza la foto del jugador y sincroniza el avatar del usuario vinculado', async () => {
  const calls = []
  const service = loadService({ async query(sql, params) {
    calls.push({ sql, params })
    if (/SELECT id, user_id FROM jugadores/.test(sql)) return [[{ id: 8, user_id: 4 }]]
    if (/UPDATE jugadores SET foto/.test(sql)) return [{ affectedRows: 1 }]
    if (/UPDATE users SET avatar/.test(sql)) return [{ affectedRows: 1 }]
    if (/WHERE j.id = \?/.test(sql)) return [[{ ...playerRow, foto: params[0] }]]
    return [[]]
  } })

  await service.updateFoto(8, '/uploads/players/new_photo.jpg')

  const playerUpdate = calls.find((c) => /UPDATE jugadores j LEFT JOIN users/.test(c.sql))
  assert.deepEqual(playerUpdate.params, ['/uploads/players/new_photo.jpg', '/uploads/players/new_photo.jpg', 8])
})

test('el detalle público contiene solo datos básicos y estadísticas por categoría', async () => {
  let call = 0
  const fakeDb = {
    async query() {
      call += 1
      return call === 1 ? [[playerRow]] : [matchStatsRows]
    },
  }

  const player = await loadService(fakeDb).getById(8)

  assert.equal(player.nombre, 'Laura')
  assert.equal(Object.hasOwn(player, 'telefono'), false)
  assert.equal(Object.hasOwn(player, 'fecha_nac'), false)
  assert.equal(Object.hasOwn(player, 'country'), false)
  assert.equal(player.estadisticas.length, 1)
  assert.equal(player.estadisticas[0].categoria.nombre, '4ta')
  assert.equal(player.estadisticas[0].puntos, 1)
})

test('getAll filtra estadísticas por la categoría de los partidos', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      return calls.length === 1 ? [[playerRow]] : [matchStatsRows]
    },
  }

  const players = await loadService(fakeDb).getAll({
    deporte: 'tenis',
    categoria_id: '3',
    activo: 'true',
  })

  assert.equal(players.length, 1)
  assert.equal(players[0].stats.ranking, 1)
  assert.equal(players[0].stats.categoria.id, 3)
  assert.deepEqual(calls[1].params, [3])
  assert.match(calls[1].sql, /p\.categoria_id = \?/)
})

test('crear jugador guarda datos básicos y categoría opcional validada', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (calls.length === 1) return [[{ deporte: 'tenis' }]]
      if (calls.length === 2) return [{ insertId: 9 }]
      if (calls.length === 3) return [[{ ...playerRow, id: 9, categoria_id: 3, categoria_nombre: '4ta' }]]
      return [[]]
    },
  }

  await loadService(fakeDb).create({
    nombre: ' Laura ',
    apellido: ' Díaz ',
    deporte: 'tenis',
    telefono: 'No debe guardarse',
    categoria_id: 3,
  })

  assert.match(calls[1].sql, /\(nombre, apellido, country_id, deporte, categoria_id\)/)
  assert.doesNotMatch(calls[1].sql, /telefono|apodo|fecha_nac/)
  assert.deepEqual(calls[1].params, ['Laura', 'Díaz', 'tenis', 3])
  assert.equal(
    calls.some((call) => /INSERT INTO jugador_stats/.test(call.sql)),
    false
  )
})

test('la lista pública expone la foto pero no la cuenta vinculada', async () => {
  let call = 0
  const fakeDb = {
    async query() {
      call += 1
      return call === 1
        ? [[{ ...playerRow, user_id: 4, usuario_email: 'laura@example.com' }]]
        : [[]]
    },
  }

  const [player] = await loadService(fakeDb).getAll({})

  assert.equal(player.foto, '/uploads/players/laura.jpg')
  assert.equal(Object.hasOwn(player, 'usuario'), false)
})

test('la gestión administrativa incluye la cuenta vinculada', async () => {
  let call = 0
  const fakeDb = {
    async query() {
      call += 1
      return call === 1
        ? [[{
            ...playerRow,
            user_id: 4,
            usuario_nombre: 'Laura',
            usuario_apellido: 'Díaz',
            usuario_email: 'laura@example.com',
          }]]
        : [[]]
    },
  }

  const [player] = await loadService(fakeDb).getAll({ includeAccount: true })

  assert.deepEqual(player.usuario, {
    id: 4,
    nombre: 'Laura',
    apellido: 'Díaz',
    email: 'laura@example.com',
  })
})

test('una cuenta no puede vincularse a dos jugadores', async () => {
  let call = 0
  const fakeDb = {
    async query() {
      call += 1
      if (call <= 2) return [[{ id: call }]]
      const error = new Error('duplicate')
      error.code = 'ER_DUP_ENTRY'
      throw error
    },
  }

  await assert.rejects(
    loadService(fakeDb).linkUser(8, 4),
    (error) => error.status === 409 && /ya está vinculada/.test(error.message)
  )
})

test('explica todas las relaciones que impiden eliminar un jugador', async () => {
  const calls = []
  const fakeDb = {
    async getConnection() { return { query: this.query, beginTransaction: async()=>{}, rollback:async()=>{}, release:()=>{} } },
    async query(sql) {
      calls.push(sql)
      if (/SELECT id, nombre, apellido FROM jugadores/.test(sql)) return [[playerRow]]
      if (/SELECT\s+\(SELECT COUNT\(\*\) FROM equipos_padel/.test(sql)) {
        return [[{ parejas: 2, partidos: 3, inscripciones: 0 }]]
      }
      throw new Error('No debe intentar borrar un jugador relacionado')
    },
  }

  await assert.rejects(
    loadService(fakeDb).remove(8),
    (error) =>
      error.status === 409 &&
      /2 parejas/.test(error.message) &&
      /3 partidos/.test(error.message)
  )
  assert.equal(calls.some((sql) => /^DELETE/.test(sql.trim())), false)
})

test('eliminación explícita del jugador conserva auditoría y confirma atómicamente', async () => {
  const calls = []
  const conn = {
    beginTransaction:async()=>{}, release:()=>{}, rollback:async()=>{},
    commit:async()=>calls.push('COMMIT'),
    query:async(sql,args)=>{
      calls.push(sql)
      if(sql.startsWith('SELECT id, nombre')) return [[playerRow]]
      if(sql.includes('AS parejas')) return [[{parejas:0,partidos:0,inscripciones:0}]]
      if(sql.startsWith('INSERT INTO auditoria_eliminaciones')) {
        assert.equal(args[0],8)
        assert.equal(args[1],3)
        assert.deepEqual(JSON.parse(args[2]),{nombre:'Laura',apellido:'Díaz'})
      }
      return [{affectedRows:1}]
    },
  }
  await loadService({getConnection:async()=>conn}).remove(8,3)
  assert.ok(calls.findIndex(s=>s.startsWith('INSERT INTO auditoria')) < calls.indexOf('DELETE FROM jugadores WHERE id = ?'))
  assert.equal(calls.at(-1),'COMMIT')
})
