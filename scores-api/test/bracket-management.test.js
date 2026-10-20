const test = require('node:test')
const assert = require('node:assert/strict')
const { AsyncLocalStorage } = require('node:async_hooks')
const dbPath = require.resolve('../src/config/db')
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => { throw new Error('Unexpected database access outside mocked transaction') } } }
const factory = require('../src/modules/matches/bracket-management')
const admin = { id: 1, rol: 'admin' }
const base = { torneo_id: 1, categoria_id: 2, fase: 'eliminacion', estado: 'programado', control_version: 3, ronda: 'Final' }

// In-memory transaction adapter: never imports or connects to the configured database.
function fixture(initial = [], options = {}) {
  let rows = structuredClone(initial), saved, nextId = 100
  const calls = [], updates = [], creates = []
  const transaction = new AsyncLocalStorage()
  const conn = {
    async beginTransaction() { saved = structuredClone(rows) },
    async commit() { calls.push('commit') },
    async rollback() { if (saved) rows = saved; calls.push('rollback') },
    release() { calls.push('release') },
    async query(sql, params = []) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]]
      if (sql.includes('FROM torneos')) return [[{ id: 1, modalidad: 'dobles', sistema: 'grupos_eliminacion', ...options.tournament }]]
      if (sql.includes("fase='eliminacion'")) return [rows.filter(m => m.estado !== 'cancelado')]
      if (sql.includes('WHERE origen_partido1_id=')) return [rows.filter(m => m.origen_partido1_id === params[0] || m.origen_partido2_id === params[0])]
      if (sql.includes('SELECT * FROM partidos')) return [[rows.find(m => m.id === Number(params[0]))].filter(Boolean).map(m => ({ ...m }))]
      if (sql.includes('FROM torneo_retiros')) return [options.retired || []]
      if (sql.includes('FROM equipos_padel')) return [options.teams || []]
      if (sql.includes('DATE_SUB')) return [[]]
      if (sql.includes('FROM sets_partido')) return [options.sets || []]
      if (sql.startsWith('INSERT INTO auditoria_ediciones')) { calls.push('audit'); return [{}] }
      if (sql.startsWith('INSERT INTO notificaciones')) return [{}]
      if (sql.startsWith('UPDATE partidos')) {
        const row = rows.find(m => m.id === Number(params.at(-1)))
        if (sql.includes("estado='finalizado'")) { row.estado = 'finalizado'; row.ganador = params[0] }
        else {
          const field = sql.match(/SET (\w+)=/)[1]
          row[field] = params[0]
        }
        row.control_version++
        return [{}]
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const service = factory({
    pool: { async getConnection() { calls.push('connection'); return conn } },
    transaction, normalizeActor: a => a,
    async create(payload) {
      assert.equal(transaction.getStore(), conn)
      if (options.failCreate) throw { status: 409, message: 'Conflicto de programación' }
      creates.push(payload)
      const row = { ...payload, id: nextId++, control_version: 0 }
      rows.push(row)
      return { ...row }
    },
    async update(id, payload) {
      assert.equal(transaction.getStore(), conn)
      updates.push(payload)
      const row = rows.find(m => m.id === Number(id))
      Object.assign(row, payload, { control_version: row.control_version + 1 })
      return { ...row }
    },
    async getById(id) { return rows.find(m => m.id === Number(id)) },
    async getAll() { return rows },
  })
  return { service, calls, updates, creates, rows: () => rows }
}
const request = { torneo_id: 1, categoria_id: 2, ronda_inicial: 'Semifinales', llaves_iniciales: [] }
test('solo administradores pueden escribir cuadros, antes de abrir conexión', async () => {
  const f = fixture()
  for (const rol of ['jugador', 'juez', 'juez_director']) {
    await assert.rejects(f.service.createKnockoutBracket(request, { id: 2, rol }), e => e.status === 403)
    await assert.rejects(f.service.updateBracketSlot(1, {}, { id: 2, rol }), e => e.status === 403)
  }
  assert.deepEqual(f.calls, [])
})
test('genera semis y final mediante validadores comunes en una sola transacción', async () => {
  const f = fixture()
  const result = await f.service.createKnockoutBracket(request, admin)
  assert.equal(result.length, 3)
  assert.equal(f.creates[0].participante1_tipo, 'por_definir')
  assert.equal(f.creates[2].origen_partido1_id, 100)
  assert.equal(f.creates[2].origen_partido2_id, 101)
  assert.equal(f.calls.filter(c => c === 'commit').length, 1)
  assert.equal(f.calls.filter(c => c === 'audit').length, 3)
})
test('un conflicto revierte todo el cuadro y libera la conexión', async () => {
  const f = fixture([], { failCreate: true })
  await assert.rejects(f.service.createKnockoutBracket(request, admin), e => e.status === 409)
  assert.deepEqual(f.rows(), [])
  assert.ok(f.calls.includes('rollback'))
  assert.equal(f.calls.at(-1), 'release')
  assert.ok(!f.calls.includes('commit'))
})
test('rechaza cambios desactualizados o reinicios de resultados', async () => {
  const original = { ...base, id: 7, estado: 'finalizado', ganador: 'jugador1' }
  const f = fixture([original])
  for (const extra of [{}, { reemplazar_programados: true }, {
    reemplazar_programados: true, expected_matches: [{ id: 7, control_version: 3 }],
  }, { forzar_reinicio: true }]) {
    await assert.rejects(f.service.createKnockoutBracket({ ...request, ...extra }, admin), e => e.status === 409)
  }
  assert.deepEqual(f.rows(), [original])
  assert.equal(f.updates.length, 0)
})
test('edita la llave existente sin duplicar ni cambiar torneo o categoría por petición manipulada', async () => {
  const f = fixture([{ ...base, id: 7, equipo1_id: 11, equipo2_id: 12 }])
  await assert.rejects(f.service.updateBracketSlot(7, {}, admin), e => e.status === 409)
  const result = await f.service.updateBracketSlot(7, { expected_control_version: 3, torneo_id: 99, categoria_id: 99, notas: 'Horario confirmado' }, admin)
  assert.equal(result.id, 7)
  assert.equal(result.torneo_id, 1)
  assert.equal(result.categoria_id, 2)
  assert.equal(result.equipo1_id, 11)
  assert.equal(f.creates.length, 0)
  assert.ok(f.calls.includes('audit'))
})
test('no repite participantes en llaves iniciales, ni inventa un bye con dos rivales', async () => {
  for (const slots of [
    [{ participante1_id: 11, participante2_id: 12 }, { participante1_id: 11 }],
    [{ participante1_id: 11, participante2_id: 12, pase_directo_lado: 1 }],
  ]) {
    const f = fixture()
    await assert.rejects(f.service.createKnockoutBracket({ ...request, llaves_iniciales: slots }, admin), e => e.status === 400)
    assert.deepEqual(f.rows(), [])
  }
})
test('avance manual exige motivo y no reemplaza resultados existentes', async () => {
  for (const scenario of [
    { estado: 'programado', notas: '' },
    { estado: 'finalizado', notas: 'Corrección' },
    { estado: 'programado', notas: 'Revisión', sets: [{ id: 1 }] },
  ]) {
    const f = fixture([{ ...base, id: 7, equipo1_id: 11, equipo2_id: 12, estado: scenario.estado }], { sets: scenario.sets })
    await assert.rejects(f.service.updateBracketSlot(7, {
      expected_control_version: 3, ganador_manual: 'jugador1', finalizar_manual: true, notas: scenario.notas,
    }, admin), e => [400,409].includes(e.status))
    assert.equal(f.rows()[0].ganador, undefined)
  }
})
test('avance manual registra ganador sin crear sets ficticios', async () => {
  const f = fixture([{ ...base, id: 7, equipo1_id: 11, equipo2_id: 12 }])
  const result = await f.service.updateBracketSlot(7, {
    expected_control_version: 3, ganador_manual: 'jugador1', finalizar_manual: true, notas: 'Decisión de la organización',
  }, admin)
  assert.equal(result.estado, 'finalizado')
  assert.equal(result.ganador, 'jugador1')
  assert.ok(f.calls.filter(c => c === 'audit').length >= 2)
})
test('no avanza una pareja retirada aunque su asignación histórica permanezca', async () => {
  const f = fixture([{ ...base, id:7, equipo1_id:11, equipo2_id:12 }], {
    retired:[{ tipo:'pareja', participante_id:11, retirado:1, version:1 }],
  })
  await assert.rejects(f.service.updateBracketSlot(7, {
    expected_control_version:3, ganador_manual:'jugador1', finalizar_manual:true, notas:'Revisión',
  }, admin), e => e.status === 409 && /retirado/.test(e.message))
  assert.equal(f.rows()[0].estado,'programado')
})
test('no permite que el mismo jugador integre dos parejas del cuadro inicial', async () => {
  const f = fixture([], { teams:[
    {id:11,jugador1_id:1,jugador2_id:2}, {id:12,jugador1_id:1,jugador2_id:3},
  ] })
  await assert.rejects(f.service.createKnockoutBracket({
    ...request, llaves_iniciales:[{participante1_id:11,participante2_id:12}],
  },admin), e => e.status === 400 && /dos parejas/.test(e.message))
  assert.equal(f.creates.length,0)
})
