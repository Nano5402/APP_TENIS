const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const dbPath = require.resolve('../src/config/db')
const servicePath = require.resolve('../src/modules/matches/matches.service')

const loadService = (fakeDb) => {
  const originalQuery = fakeDb.query.bind(fakeDb)
  fakeDb.query = async (sql, params) => {
    if (sql.includes('GET_LOCK(')) return [[{ acquired: 1 }]]
    if (sql.includes('RELEASE_LOCK(')) return [[{ released: 1 }]]
    if (sql.includes('DATE_SUB(?, INTERVAL 1 DAY)')) return [[]]
    if (sql === 'SELECT id,jugador1_id,jugador2_id FROM equipos_padel WHERE id IN (?)') return [[]]
    if (sql.startsWith('SELECT tipo, participante_id, retirado, version FROM torneo_retiros')) return [[]]
    if (sql === 'SELECT id FROM torneos WHERE id=? FOR UPDATE') return [[{ id: params[0] }]]
    return originalQuery(sql, params)
  }
  fakeDb.getConnection ||= async () => ({ query: fakeDb.query, beginTransaction: async () => {},
    commit: async () => {}, rollback: async () => {}, release: () => {} })
  delete require.cache[servicePath]
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: fakeDb,
  }
  return require(servicePath)
}

for (const scenario of [
  { name: 'jugador inexistente o inactivo', data: { jugador1_id: 99 }, found: [] },
  { name: 'jugador duplicado', data: { jugador1_id: 11 }, found: [{ id: 11 }] },
  { name: 'identificador inválido', data: { jugador1_id: 'abc' }, found: [] },
  { name: 'pareja en partido individual', data: { equipo1_id: 9 }, found: [] },
]) {
  test(`edición de participantes rechaza ${scenario.name} sin escribir`, async () => {
    const service = loadService({ async query(sql) {
      if (sql.includes('SELECT * FROM partidos')) return [[{ id: 1, juez_id: 5, estado: 'programado', control_version: 0, deporte: 'tenis', jugador1_id: 10, jugador2_id: 11 }]]
      if (sql.includes('FROM jugadores')) return [scenario.found]
      throw new Error('No debe escribir ni consultar el resultado')
    } })
    await assert.rejects(service.updateParticipants(1, { ...scenario.data, expected_control_version: 0 }, { id: 5, rol: 'juez' }), (err) => err.status === 400)
  })
}

test('edición de participantes guarda un jugador registrado y activo', async () => {
  let saved = false
  const service = loadService({ async query(sql, params) {
    if (sql.includes('SELECT * FROM partidos')) return [[{ id: 1, juez_id: 5, estado: 'programado', control_version: 0, deporte: 'tenis', jugador1_id: 10, jugador2_id: 11 }]]
    if (sql.includes('FROM jugadores')) {
      assert.match(sql, /activo = TRUE/)
      assert.deepEqual(params, [12, 11, 'tenis'])
      return [[{ id: 12 }, { id: 11 }]]
    }
    if (sql.startsWith('UPDATE partidos')) { saved = true; return [{}] }
    throw new Error(sql)
  } })
  service.getById = async () => ({ id: 1 })
  await service.updateParticipants(1, { jugador1_id: 12, expected_control_version: 0 }, { id: 5, rol: 'juez' })
  assert.equal(saved, true)
})

for (const modality of ['individual', 'dobles']) {
  test(`permite crear y editar un partido libre ${modality}`, async () => {
    const calls = []
    const fakeDb = {
      async query(sql, params) {
        calls.push({ sql, params })
        if (/SELECT \* FROM partidos/.test(sql)) return [[{ id: 77, estado: 'programado', control_version: 0 }]]
        if (/FROM categorias/.test(sql)) return [[{ id: 3 }]]
        if (/FROM jugadores/.test(sql) || /SELECT id\s+FROM equipos_padel/.test(sql)) {
          return [[{ id: 10 }, { id: 11 }]]
        }
        if (/INSERT INTO partidos/.test(sql)) return [{ insertId: 77 }]
        if (/WHERE p\.id = \? LIMIT 1/.test(sql)) {
          return [[{
            id: 77, torneo_id: null, deporte: 'tenis', categoria_id: 3,
            estado: 'programado',
            ...(modality === 'dobles' ? { e1_id: 10, e2_id: 11 } : { j1_id: 10, j2_id: 11 }),
          }]]
        }
        return [[]]
      },
    }
    const service = loadService(fakeDb)
    const body = {
      torneo_id: null, deporte: 'tenis', modalidad: modality, categoria_id: 3,
      ...(modality === 'dobles' ? { equipo1_id: 10, equipo2_id: 11 } : { jugador1_id: 10, jugador2_id: 11 }),
    }
    const created = await service.create(body, { id: 1, rol: 'admin' })
    const updated = await service.update(77, { ...body, expected_control_version: 0 }, { id: 1, rol: 'admin' })
    assert.equal(created.torneo, null)
    assert.equal(updated.modalidad, modality)
    const insert = calls.find((call) => /INSERT INTO partidos/.test(call.sql))
    assert.equal(insert.params[0], null)
    assert.deepEqual(insert.params.slice(3, 7), modality === 'dobles' ? [null, null, 10, 11] : [10, 11, null, null])
    assert.equal(calls.some((call) => /FROM torneos\s+WHERE/.test(call.sql)), false)
  })
}

test('un torneo inválido no se convierte silenciosamente en partido libre', async () => {
  const service = loadService({ async query() { throw new Error('No debe consultar') } })
  await assert.rejects(service.create({ torneo_id: 'incorrecto' }, 1),
    (error) => error.status === 400 && /torneo válido/.test(error.message))
})

test('partido libre rechaza categorías de otro deporte antes de guardar', async () => {
  const service = loadService({ async query() { return [[]] } })
  await assert.rejects(service.create({ deporte: 'tenis', categoria_id: 3 }, 1),
    (error) => error.status === 400 && /categoría no corresponde/.test(error.message))
})

test('getAll devuelve sets, categoría y aplica los filtros del historial', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (calls.length === 1) {
        return [
          [
            {
              id: 7,
              deporte: 'tenis',
              estado: 'finalizado',
              ganador: 'jugador1',
              notas: 'Partido finalizado por retiro',
              fecha_inicio: '2026-07-20',
              hora_inicio: '13:00:00',
              categoria_id: 3,
              categoria_nombre: '4ta',
              j1_id: 10,
              j1_nombre: 'Ana',
              j1_apellido: 'Rojas',
              j2_id: 11,
              j2_nombre: 'Laura',
              j2_apellido: 'Díaz',
            },
          ],
        ]
      }
      return [
        [
          {
            partido_id: 7,
            numero_set: 1,
            games_j1: 6,
            games_j2: 3,
            completado: 1,
          },
          {
            partido_id: 7,
            numero_set: 2,
            games_j1: 6,
            games_j2: 4,
            completado: 1,
          },
        ],
      ]
    },
  }
  const service = loadService(fakeDb)

  const result = await service.getAll({
    estado: 'finalizado',
    deporte: 'tenis',
    categoria_id: '3',
    fecha: '2026-07-20',
    jugador: 'Ana',
  })

  assert.equal(result.length, 1)
  assert.equal(result[0].categoria.nombre, '4ta')
  assert.equal(result[0].notas, 'Partido finalizado por retiro')
  assert.deepEqual(
    result[0].sets.map((set) => [set.numero_set, set.games_j1, set.games_j2]),
    [
      [1, 6, 3],
      [2, 6, 4],
    ]
  )
  assert.match(calls[0].sql, /LEFT JOIN categorias cat ON cat\.id = p\.categoria_id/)
  assert.match(calls[0].sql, /p\.categoria_id = \?/)
  assert.match(calls[0].sql, /p\.fecha_inicio = \?/)
  assert.match(calls[0].sql, /CONCAT_WS/)
  assert.deepEqual(calls[0].params, [
    'finalizado',
    'tenis',
    '3',
    '2026-07-20',
    '%Ana%',
    '%Ana%',
    '%Ana%',
    '%Ana%',
  ])
})

test('getAll permite ordenar los próximos partidos desde la fecha más cercana', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      return [[]]
    },
  }

  await loadService(fakeDb).getAll({
    estado: 'programado',
    deporte: 'tenis',
    orden: 'asc',
  })

  assert.match(calls[0].sql, /p\.fecha_inicio ASC/)
  assert.match(calls[0].sql, /p\.hora_inicio ASC/)
  assert.deepEqual(calls[0].params, ['programado', 'tenis'])
})

test('getMyMatches separa agenda e historial y calcula victoria o derrota', async () => {
  let call = 0
  const fakeDb = {
    async query() {
      call += 1
      if (call === 1) {
        return [[{ id: 8, nombre: 'Laura', apellido: 'Díaz', foto: '/uploads/players/laura.jpg' }]]
      }
      if (call === 2) {
        return [
          [
            {
              id: 30,
              deporte: 'tenis',
              estado: 'finalizado',
              ganador: 'jugador2',
              fecha_inicio: '2026-08-20',
              j1_id: 8,
              j1_nombre: 'Laura',
              j1_apellido: 'Díaz',
              j1_foto: '/uploads/players/laura.jpg',
              j2_id: 9,
              j2_nombre: 'Ana',
              j2_apellido: 'Rojas',
            },
            {
              id: 31,
              deporte: 'tenis',
              estado: 'programado',
              ganador: null,
              fecha_inicio: '2026-09-10',
              hora_inicio: '10:00:00',
              j1_id: 9,
              j1_nombre: 'Ana',
              j1_apellido: 'Rojas',
              j2_id: 8,
              j2_nombre: 'Laura',
              j2_apellido: 'Díaz',
              j2_foto: '/uploads/players/laura.jpg',
            },
            {
              id: 32,
              deporte: 'tenis',
              estado: 'en_vivo',
              ganador: null,
              fecha_inicio: '2026-09-04',
              j1_id: 8,
              j1_nombre: 'Laura',
              j1_apellido: 'Díaz',
              j2_id: 10,
              j2_nombre: 'Sara',
              j2_apellido: 'León',
            },
          ],
        ]
      }
      return [
        [
          { partido_id: 30, numero_set: 1, games_j1: 3, games_j2: 6, completado: 1 },
          { partido_id: 30, numero_set: 2, games_j1: 4, games_j2: 6, completado: 1 },
        ],
      ]
    },
  }

  const result = await loadService(fakeDb).getMyMatches(4)

  assert.equal(result.jugador.id, 8)
  assert.deepEqual(
    result.en_vivo.map((match) => match.id),
    [32]
  )
  assert.deepEqual(
    result.proximos.map((match) => match.id),
    [31]
  )
  assert.deepEqual(
    result.historial.map((match) => match.id),
    [30]
  )
  assert.equal(result.historial[0].resultado, 'derrota')
  assert.equal(result.historial[0].jugador1.foto, '/uploads/players/laura.jpg')
})

test('updateMarcador rechaza sets duplicados antes de escribir', async () => {
  const fakeDb = {
    async query() {
      return [[{ id: 7 }]]
    },
    getConnection() {
      throw new Error('No debe abrir una transacción para datos inválidos')
    },
  }
  const service = loadService(fakeDb)

  await assert.rejects(
    service.updateMarcador(7, {
      estado: 'en_vivo',
      ganador: null,
      sets: [
        { numero_set: 1, games_j1: 6, games_j2: 4 },
        { numero_set: 1, games_j1: 1, games_j2: 0 },
      ],
    }),
    (error) => error.status === 400
  )
})

test('updateMarcador permite guardar más de tres sets', async () => {
  const writtenSets = []
  const connectionCalls = []
  let queryCount = 0
  const fakeDb = {
    async query() {
      queryCount += 1
      if (queryCount === 1) {
        return [
          [
            {
              id: 7,
              deporte: 'tenis',
              jugador1_id: 10,
              jugador2_id: 11,
            },
          ],
        ]
      }
      if (queryCount === 2) return [[{ id: 7, deporte: 'tenis', estado: 'finalizado' }]]
      return [[]]
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async query(sql, params) {
          connectionCalls.push({ sql, params })
          if (/INSERT INTO sets_partido/.test(sql)) writtenSets.push(params[1])
          if (/SELECT \* FROM partidos/.test(sql)) return [[{ id: 7, estado: 'programado', jugador1_id: 10, jugador2_id: 11 }]]
          if (/SELECT \* FROM sets_partido/.test(sql)) return [[]]
        },
        async commit() {},
        async rollback() {},
        release() {},
      }
    },
  }

  await loadService(fakeDb).updateMarcador(7, {
    estado: 'finalizado',
    ganador: 'jugador1',
    sets: [
      { numero_set: 1, games_j1: 6, games_j2: 4 },
      { numero_set: 2, games_j1: 4, games_j2: 6 },
      { numero_set: 3, games_j1: 7, games_j2: 5 },
      { numero_set: 4, games_j1: 6, games_j2: 2 },
    ],
  })

  assert.deepEqual(writtenSets, [1, 2, 3, 4])
  const audited = connectionCalls.find(call => /INSERT INTO auditoria_ediciones/.test(call.sql))
  assert.equal(JSON.parse(audited.params[4]).cambios.sets.despues.length, 4)
  const deleteCall = connectionCalls.find((call) => /DELETE FROM sets_partido/.test(call.sql))
  assert.ok(deleteCall)
  assert.deepEqual(deleteCall.params, [7, 1, 2, 3, 4])
  const propagationCalls = connectionCalls.filter((call) => /origen_partido[12]_id/.test(call.sql))
  assert.equal(propagationCalls.length, 2)
  assert.deepEqual(propagationCalls[0].params, [10, 7])
  assert.deepEqual(propagationCalls[1].params, [10, 7])
})

test('create hereda deporte y categoría del torneo seleccionado', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/FROM torneos/.test(sql) && !/LEFT JOIN/.test(sql)) {
        return [
          [
            {
              id: 7,
              deporte: 'tenis',
              categoria_id: 3,
              modalidad: 'individual',
              estado: 'proximo',
            },
          ],
        ]
      }
      if (/FROM jugadores/.test(sql)) return [[{ id: 10 }, { id: 11 }]]
      if (/INSERT INTO partidos/.test(sql)) return [{ insertId: 15 }]
      if (/WHERE p\.id = \? LIMIT 1/.test(sql)) {
        return [
          [
            {
              id: 15,
              torneo_id: 7,
              torneo_nombre: 'Copa interna',
              torneo_modalidad: 'individual',
              torneo_sistema: 'eliminacion_directa',
              deporte: 'tenis',
              estado: 'programado',
              ganador: null,
              fecha_inicio: '2026-08-01',
              hora_inicio: '09:00:00',
              categoria_id: 3,
              categoria_nombre: '4ta',
              j1_id: 10,
              j1_nombre: 'Ana',
              j1_apellido: 'Rojas',
              j2_id: 11,
              j2_nombre: 'Laura',
              j2_apellido: 'Díaz',
            },
          ],
        ]
      }
      return [[]]
    },
  }
  const service = loadService(fakeDb)

  const result = await service.create(
    {
      jugador1_id: '10',
      jugador2_id: '11',
      estado: 'programado',
      fecha_inicio: '2026-08-01',
      hora_inicio: '09:00',
      notas: 'Cancha húmeda',
      torneo_id: '7',
      ronda: 'Final',
    },
    2
  )

  const insert = calls.find((call) => /INSERT INTO partidos/.test(call.sql))
  assert.match(insert.sql, /torneo_id, deporte, categoria_id, jugador1_id, jugador2_id/)
  assert.match(insert.sql, /fecha_inicio, hora_inicio, fase, grupo, ronda, notas/)
  assert.match(insert.sql, /ronda/)
  assert.match(insert.sql, /cancha_id/)
  assert.equal(insert.params[0], 7)
  assert.equal(insert.params[2], 3)
  assert.equal(insert.params[8], '2026-08-01')
  assert.equal(insert.params[9], '09:00')
  assert.equal(insert.params[13], 'Cancha húmeda')
  assert.equal(insert.params[12], 'Final')
  assert.equal(result.torneo.nombre, 'Copa interna')
  assert.equal(result.categoria.nombre, '4ta')
})

test('create exige y guarda la categoría del partido cuando el torneo incluye todas', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/FROM torneos/.test(sql) && !/LEFT JOIN/.test(sql)) {
        return [
          [
            {
              id: 12,
              deporte: 'tenis',
              categoria_id: null,
              modalidad: 'individual',
              sistema: 'por_definir',
            },
          ],
        ]
      }
      if (/FROM categorias/.test(sql)) return [[{ id: 3 }]]
      if (/FROM jugadores/.test(sql)) return [[{ id: 10 }, { id: 11 }]]
      if (/INSERT INTO partidos/.test(sql)) return [{ insertId: 25 }]
      if (/WHERE p\.id = \? LIMIT 1/.test(sql)) {
        return [
          [
            {
              id: 25,
              torneo_id: 12,
              torneo_nombre: 'Abierto Club Unión',
              torneo_modalidad: 'individual',
              torneo_sistema: 'por_definir',
              deporte: 'tenis',
              estado: 'programado',
              categoria_id: 3,
              categoria_nombre: '4ta',
              j1_id: 10,
              j1_nombre: 'Ana',
              j1_apellido: 'Rojas',
              j2_id: 11,
              j2_nombre: 'Laura',
              j2_apellido: 'Díaz',
            },
          ],
        ]
      }
      return [[]]
    },
  }

  const result = await loadService(fakeDb).create(
    {
      torneo_id: '12',
      categoria_id: '3',
      jugador1_id: '10',
      jugador2_id: '11',
    },
    2
  )

  const insert = calls.find((call) => /INSERT INTO partidos/.test(call.sql))
  assert.equal(insert.params[2], 3)
  assert.equal(insert.params[10], null)
  assert.equal(result.categoria.nombre, '4ta')
  assert.ok(calls.some((call) => /FROM categorias/.test(call.sql)))
})

test('create permite registrar una hora sin fecha', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/FROM torneos/.test(sql) && !/LEFT JOIN/.test(sql)) {
        return [[{ id: 7, deporte: 'tenis', categoria_id: 3, modalidad: 'individual' }]]
      }
      if (/FROM jugadores/.test(sql)) return [[{ id: 10 }, { id: 11 }]]
      if (/INSERT INTO partidos/.test(sql)) return [{ insertId: 16 }]
      if (/WHERE p\.id = \? LIMIT 1/.test(sql)) {
        return [
          [
            {
              id: 16,
              deporte: 'tenis',
              estado: 'programado',
              fecha_inicio: null,
              hora_inicio: '10:30:00',
              categoria_id: 3,
              categoria_nombre: '4ta',
              j1_id: 10,
              j1_nombre: 'Ana',
              j1_apellido: 'Rojas',
              j2_id: 11,
              j2_nombre: 'Laura',
              j2_apellido: 'Díaz',
            },
          ],
        ]
      }
      return [[]]
    },
  }

  const result = await loadService(fakeDb).create(
    {
      deporte: 'tenis',
      categoria_id: '3',
      jugador1_id: '10',
      jugador2_id: '11',
      torneo_id: '7',
      fecha_inicio: '',
      hora_inicio: '10:30',
    },
    2
  )

  const insert = calls.find((call) => /INSERT INTO partidos/.test(call.sql))
  assert.equal(insert.params[8], null)
  assert.equal(insert.params[9], '10:30')
  assert.equal(result.fecha_inicio, null)
  assert.equal(result.hora_inicio, '10:30:00')
})

test('create usa parejas en un torneo de dobles de tenis', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/FROM torneos/.test(sql) && !/LEFT JOIN/.test(sql)) {
        return [[{ id: 9, deporte: 'tenis', categoria_id: 3, modalidad: 'dobles' }]]
      }
      if (/SELECT id\s+FROM equipos_padel/.test(sql)) return [[{ id: 30 }, { id: 31 }]]
      if (/INSERT INTO partidos/.test(sql)) return [{ insertId: 22 }]
      if (/WHERE p\.id = \? LIMIT 1/.test(sql)) {
        return [
          [
            {
              id: 22,
              torneo_id: 9,
              torneo_nombre: 'Dobles Club Unión',
              torneo_modalidad: 'dobles',
              torneo_sistema: 'eliminacion_directa',
              deporte: 'tenis',
              estado: 'programado',
              categoria_id: 3,
              categoria_nombre: '4ta',
              e1_id: 30,
              e1_nombre: 'Ana / Laura',
              e2_id: 31,
              e2_nombre: 'Marta / Sofía',
            },
          ],
        ]
      }
      return [[]]
    },
  }

  const result = await loadService(fakeDb).create(
    { torneo_id: '9', equipo1_id: '30', equipo2_id: '31', estado: 'programado' },
    2
  )

  const insert = calls.find((call) => /INSERT INTO partidos/.test(call.sql))
  assert.equal(insert.params[3], null)
  assert.equal(insert.params[4], null)
  assert.equal(insert.params[5], 30)
  assert.equal(insert.params[6], 31)
  assert.equal(result.modalidad, 'dobles')
  assert.equal(result.equipo1.nombre, 'Ana / Laura')
})

test('create permite usar el ganador pendiente de otro partido como participante', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/FROM torneos/.test(sql) && !/LEFT JOIN/.test(sql)) {
        return [[{ id: 7, deporte: 'tenis', categoria_id: 3, modalidad: 'individual' }]]
      }
      if (/SELECT id, torneo_id, categoria_id, estado, ganador/.test(sql)) {
        return [
          [
            {
              id: 20,
              torneo_id: 7,
              categoria_id: 3,
              estado: 'programado',
              ganador: null,
              jugador1_id: 8,
              jugador2_id: 9,
            },
          ],
        ]
      }
      if (/FROM jugadores/.test(sql)) return [[{ id: 11 }]]
      if (/INSERT INTO partidos/.test(sql)) return [{ insertId: 21 }]
      if (/WHERE p\.id = \? LIMIT 1/.test(sql)) {
        return [
          [
            {
              id: 21,
              torneo_id: 7,
              torneo_nombre: 'Copa interna',
              torneo_modalidad: 'individual',
              deporte: 'tenis',
              estado: 'programado',
              categoria_id: 3,
              categoria_nombre: '4ta',
              jugador1_id: null,
              j2_id: 11,
              j2_nombre: 'Laura',
              j2_apellido: 'Díaz',
              origen_partido1_id: 20,
              op1_j1_nombre: 'Ana',
              op1_j1_apellido: 'Rojas',
              op1_j2_nombre: 'Marta',
              op1_j2_apellido: 'León',
            },
          ],
        ]
      }
      return [[]]
    },
  }

  const result = await loadService(fakeDb).create(
    {
      torneo_id: '7',
      origen_partido1_id: '20',
      jugador2_id: '11',
      estado: 'programado',
    },
    2
  )

  const insert = calls.find((call) => /INSERT INTO partidos/.test(call.sql))
  assert.equal(insert.params[3], null)
  assert.equal(insert.params[4], 11)
  assert.equal(insert.params[14], 20)
  assert.equal(result.origen_partido1.id, 20)
  assert.equal(result.origen_partido1.participante1, 'Ana Rojas')
  assert.equal(result.origen_partido1.participante2, 'Marta León')
})

test('remove explica cuáles partidos dependen del ganador', async () => {
  let call = 0
  const fakeDb = {
    async query() {
      call += 1
      if (call === 1) return [[{ id: 20 }]]
      if (call === 2) return [[{ id: 21 }, { id: 22 }]]
      throw new Error('No debe borrar un partido con encuentros dependientes')
    },
  }

  await assert.rejects(
    loadService(fakeDb).remove(20),
    (error) =>
      error.status === 409 && /#20/.test(error.message) && /#21, #22/.test(error.message)
  )
})

test('un juez crea sus partidos asignándoselos automáticamente', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/FROM torneos/.test(sql) && !/LEFT JOIN/.test(sql)) {
        return [[{ id: 7, deporte: 'tenis', categoria_id: 3, modalidad: 'individual' }]]
      }
      if (/FROM jugadores/.test(sql)) return [[{ id: 10 }, { id: 11 }]]
      if (/FROM users/.test(sql)) return [[{ id: 9 }]]
      if (/INSERT INTO partidos/.test(sql)) return [{ insertId: 40 }]
      if (/WHERE p\.id = \? LIMIT 1/.test(sql)) {
        return [[{
          id: 40,
          torneo_id: 7,
          torneo_nombre: 'Copa interna',
          torneo_modalidad: 'individual',
          deporte: 'tenis',
          estado: 'programado',
          categoria_id: 3,
          categoria_nombre: '4ta',
          juez_id: 9,
          j1_id: 10,
          j1_nombre: 'Ana',
          j1_apellido: 'Rojas',
          j2_id: 11,
          j2_nombre: 'Laura',
          j2_apellido: 'Díaz',
        }]]
      }
      return [[]]
    },
  }

  await loadService(fakeDb).create(
    { torneo_id: 7, jugador1_id: 10, jugador2_id: 11, juez_id: 3 },
    { id: 9, rol: 'juez' }
  )

  const insert = calls.find((call) => /INSERT INTO partidos/.test(call.sql))
  assert.equal(insert.params[16], 9)
  assert.equal(insert.params[17], 9)
})
