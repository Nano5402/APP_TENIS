const test = require('node:test')
const assert = require('node:assert/strict')

const dbPath = require.resolve('../src/config/db')
const servicePath = require.resolve('../src/modules/torneos/torneos.service')

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

test('eliminar torneo borra solo hijos, conserva auditoría y usa una transacción', async () => {
  const calls = []
  const conn = {
    beginTransaction: async () => calls.push('BEGIN'),
    commit: async () => calls.push('COMMIT'),
    rollback: async () => calls.push('ROLLBACK'),
    release: () => calls.push('RELEASE'),
    query: async (sql, params) => {
      calls.push(sql)
      if (sql.startsWith('SELECT id,nombre')) return [[{id:7,nombre:'Prueba'}]]
      if (sql.startsWith('SELECT id FROM partidos')) return [[{id:22}]]
      assert.ok(params.includes(7), `Consulta sin alcance al torneo: ${sql}`)
      return [{affectedRows:1}]
    },
  }
  await loadService({getConnection:async()=>conn}).remove(7, 9)
  assert.ok(calls.includes('COMMIT'))
  assert.ok(!calls.includes('ROLLBACK'))
  assert.ok(calls.some(s=>s.startsWith('INSERT INTO auditoria_eliminaciones')))
  assert.ok(!calls.some(s=>/DELETE FROM (jugadores|equipos_padel|users|jugador_stats)/.test(s)))
  assert.ok(calls.indexOf('DELETE FROM partidos WHERE torneo_id=?') < calls.indexOf('DELETE FROM torneos WHERE id=?'))
})

test('eliminar torneo revierte todos los cambios ante un fallo', async () => {
  let rollback = false, commit = false
  const conn = {
    beginTransaction:async()=>{}, release:()=>{},
    commit:async()=>{commit=true}, rollback:async()=>{rollback=true},
    query:async sql=>{
      if(sql.startsWith('SELECT id,nombre')) return [[{id:7,nombre:'Prueba'}]]
      if(sql.startsWith('SELECT id FROM partidos')) return [[]]
      throw Error('Fallo simulado')
    },
  }
  await assert.rejects(loadService({getConnection:async()=>conn}).remove(7), /Fallo simulado/)
  assert.equal(rollback,true)
  assert.equal(commit,false)
})

test('crear torneo guarda modalidad, sistema y categoría', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/SELECT deporte FROM categorias/.test(sql)) return [[{ deporte: 'tenis' }]]
      if (/INSERT INTO torneos/.test(sql)) return [{ insertId: 4 }]
      return [
        [
          {
            id: 4,
            nombre: 'Torneo interno',
            deporte: 'tenis',
            categoria_id: 99,
            categoria_nombre: '4ta',
            modalidad: 'individual',
            sistema: 'todos_contra_todos',
            fecha_inicio: null,
            fecha_fin: null,
            estado: 'proximo',
          },
        ],
      ]
    },
  }

  const result = await loadService(fakeDb).create({
    nombre: 'Torneo interno',
    deporte: 'tenis',
    fecha_inicio: '',
    fecha_fin: '',
    estado: 'proximo',
    categoria_id: 99,
    modalidad: 'individual',
    sistema: 'todos_contra_todos',
    premio: 'No debe guardarse',
  })

  const insert = calls.find((call) => /INSERT INTO torneos/.test(call.sql))
  assert.match(insert.sql, /categoria_id, modalidad, sistema/)
  assert.doesNotMatch(insert.sql, /premio/)
  assert.deepEqual(insert.params, [
    'Torneo interno',
    'tenis',
    99,
    'individual',
    'todos_contra_todos',
    null,
    null,
    'proximo',
  ])
  assert.deepEqual(Object.keys(result), [
    'id',
    'nombre',
    'deporte',
    'modalidad',
    'sistema',
    'categoria',
    'fecha_inicio',
    'fecha_fin',
    'estado',
    'archivado',
    'partidos_count',
    'inscripciones_count',
  ])
})

test('crear torneo usa todas las categorías y sistema por definir por defecto', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/INSERT INTO torneos/.test(sql)) return [{ insertId: 8 }]
      return [
        [
          {
            id: 8,
            nombre: 'Abierto Club Unión',
            deporte: 'tenis',
            categoria_id: null,
            categoria_nombre: null,
            modalidad: 'individual',
            sistema: 'por_definir',
            fecha_inicio: null,
            fecha_fin: null,
            estado: 'proximo',
          },
        ],
      ]
    },
  }

  const result = await loadService(fakeDb).create({
    nombre: 'Abierto Club Unión',
    deporte: 'tenis',
    modalidad: 'individual',
    estado: 'proximo',
  })

  const insert = calls.find((call) => /INSERT INTO torneos/.test(call.sql))
  assert.deepEqual(insert.params, [
    'Abierto Club Unión',
    'tenis',
    null,
    'individual',
    'por_definir',
    null,
    null,
    'proximo',
  ])
  assert.equal(result.categoria, null)
  assert.equal(result.sistema, 'por_definir')
  assert.equal(
    calls.some((call) => /FROM categorias/.test(call.sql)),
    false
  )
})
