const test = require('node:test')
const assert = require('node:assert/strict')
const { configurationOf } = require('../src/modules/matches/eventDelivery')
const { createInitialState } = require('../src/modules/matches/score.engine')
const director = { id: 99, rol: 'juez_director' }
const dbPath = require.resolve('../src/config/db')
const servicePath = require.resolve('../src/modules/matches/director.service')
function load(options = {}) {
  const match = {
    id: 10,
    estado: 'en_vivo',
    juez_id: 3,
    control_version: 0,
    deporte: 'tenis',
    categoria_id: 1,
    jugador1_id: 1,
    jugador2_id: 2,
    ...options.match,
  }
  const calls = []
  let committed = false,
    rolledBack = false
  const conn = {
    async beginTransaction() {},
    async commit() {
      committed = true
    },
    async rollback() {
      rolledBack = true
    },
    release() {},
    async query(sql, params) {
      calls.push({ sql, params })
      if (sql.includes('GET_LOCK(')) return [[{ acquired: 1 }]]
      if (sql.includes('RELEASE_LOCK(')) return [[{ released: 1 }]]
      if (sql.includes('DATE_SUB(?, INTERVAL 1 DAY)')) return [[]]
      if (sql === 'SELECT id,jugador1_id,jugador2_id FROM equipos_padel WHERE id IN (?)') return [[]]
      if (sql.includes('FROM torneo_retiros')) return [[]]
      if (sql.startsWith('SELECT torneo_id FROM partidos'))
        return [[{ torneo_id: match.torneo_id }]]
      if (sql.startsWith('SELECT id FROM torneos')) return [[{ id: match.torneo_id }]]
      if (sql.startsWith('SELECT * FROM partidos')) return [[match]]
      if (sql.includes('FROM users')) return [options.judges ?? [{ id: 8 }]]
      if (sql.includes('FROM canchas')) return [options.courts ?? [{ id: 4, deporte: 'tenis' }]]
      if (sql.includes('WHERE cancha_id = ?')) return [options.occupied ?? []]
      if (sql.includes('AS sequence')) return [[{ sequence: 5, active: 5 }]]
      if (sql.includes('SELECT pausado_at'))
        return [[{ pausado_at: options.paused === false ? null : new Date() }]]
      if (sql.includes('SELECT iniciado_at'))
        return [[{ iniciado_at: options.started === false ? null : new Date() }]]
      if (sql.includes('SELECT marcador_despues'))
        return [[{ marcador_despues: createInitialState() }]]
      if (sql.includes('SELECT p.id, p.estado')) return [options.dependents || []]
      if (sql.includes('AS eventos'))
        return [[{ eventos: options.events || 0, iniciado: 0, sets: 0 }]]
      if (sql.includes('FROM jugadores')) return [options.players ?? [{ id: 5 }]]
      if (sql.includes('JOIN jugadores'))
        return [options.teams ?? [{ id: 5, jugador1_id: 20, jugador2_id: 21 }]]
      if (sql.includes('SELECT jugador1_id')) return [[{ jugador1_id: 22, jugador2_id: 23 }]]
      if (/^(INSERT|UPDATE|DELETE)/.test(sql)) return [{ affectedRows: 1 }]
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { getConnection: async () => conn },
  }
  const matchesPath = require.resolve('../src/modules/matches/matches.service')
  require.cache[matchesPath] = {
    id: matchesPath,
    filename: matchesPath,
    loaded: true,
    exports: { getById: async () => match },
  }
  delete require.cache[servicePath]
  return {
    service: require(servicePath),
    match,
    calls,
    get committed() {
      return committed
    },
    get rolledBack() {
      return rolledBack
    },
  }
}
const writes = (ctx) => ctx.calls.filter(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql))

test('juez confirma su cancha; no modifica canchas ajenas ni permisos de dirección', async () => {
  const body = { cancha_id: 4, expected_control_version: 0 }
  const own = load()
  await own.service.reassignCourt(10, body, { id: 3, rol: 'juez' })
  assert.equal(own.committed, true)
  const other = load()
  await assert.rejects(other.service.reassignCourt(10, body, { id: 4, rol: 'juez' }), e => e.status === 403)
  assert.equal(writes(other).length, 0)
  await assert.rejects(load().service.reassignCourt(10, body, { id: 3, rol: 'miembro' }), e => e.status === 403)
})
test('cancha exige deporte compatible, disponibilidad y versión actual', async () => {
  const body = { cancha_id: 4, expected_control_version: 0 }
  const wrongSport = load({ courts: [{ id: 4, deporte: 'padel' }] })
  await assert.rejects(wrongSport.service.reassignCourt(10, body, director), e => e.status === 400)
  assert.equal(writes(wrongSport).length, 0)
  const occupied = load({ occupied: [{ id: 20 }] })
  await assert.rejects(occupied.service.reassignCourt(10, body, director), e => e.status === 409)
  const good = load()
  await good.service.reassignCourt(10, body, director)
  assert.equal(good.committed, true)
  assert.ok(good.calls.some(c => c.sql.includes('FROM canchas') && c.sql.includes('FOR UPDATE')))
})
test('reasignar registra auditoría, incrementa versión y usa bloqueo transaccional', async () => {
  const ctx = load()
  await ctx.service.reassignJudge(10, { juez_id: 8, expected_control_version: 0 }, director)
  assert.match(ctx.calls.find((c) => c.sql.startsWith('SELECT * FROM partidos')).sql, /FOR UPDATE/)
  assert.ok(ctx.calls.some(({ sql }) => sql.includes('auditoria_control_partido')))
  assert.ok(ctx.calls.some(({ sql }) => sql.includes('control_version = control_version + 1')))
  assert.equal(ctx.committed, true)
})
test('juez ordinario y miembro no pueden ejecutar supervisión aunque conozcan la URL', async () => {
  for (const rol of ['juez', 'miembro']) {
    const ctx = load()
    for (const action of [
      'reassignJudge',
      'cancelMatch',
      'reactivateMatch',
      'correctScore',
      'substitute',
    ])
      await assert.rejects(
        ctx.service[action](10, { expected_control_version: 0 }, { id: 3, rol }),
        (e) => e.status === 403
      )
    assert.equal(ctx.calls.length, 0)
  }
})
test('rechaza versiones antiguas y jueces inactivos sin escribir', async () => {
  for (const options of [{ match: { control_version: 1 } }, { judges: [] }]) {
    const ctx = load(options)
    await assert.rejects(
      ctx.service.reassignJudge(10, { juez_id: 8, expected_control_version: 0 }, director),
      (e) => [400, 409].includes(e.status)
    )
    assert.equal(writes(ctx).length, 0)
    assert.equal(ctx.rolledBack, true)
  }
})
test('no cancela finalizados ni reactiva partidos activos', async () => {
  for (const [action, estado] of [
    ['cancelMatch', 'finalizado'],
    ['reactivateMatch', 'en_vivo'],
  ]) {
    const ctx = load({ match: { estado } })
    await assert.rejects(
      ctx.service[action](10, { expected_control_version: 0 }, director),
      (e) => e.status === 409
    )
    assert.equal(writes(ctx).length, 0)
  }
})
test('cancelar conserva historial y reactivar un encuentro iniciado lo deja pausado', async () => {
  const cancel = load()
  await cancel.service.cancelMatch(10, { expected_control_version: 0 }, director)
  assert.equal(
    cancel.calls.some(({ sql }) => /DELETE/.test(sql)),
    false
  )
  const ctx = load({ match: { estado: 'cancelado' } })
  await ctx.service.reactivateMatch(10, { expected_control_version: 0 }, director)
  assert.ok(
    ctx.calls.some(
      ({ sql, params }) => sql.startsWith('UPDATE partidos SET estado') && params[0] === 'en_vivo'
    )
  )
  assert.ok(ctx.calls.some(({ sql }) => sql.includes('COALESCE(pausado_at, NOW())')))
})
const correction = (match) => ({
  expected_control_version: 0,
  expected_revision: '5:5',
  expected_configuration: configurationOf(match),
  estado: 'en_vivo',
  servidor: 'jugador1',
  motivo: 'Error en los games',
  confirmar_reinicio_game: true,
  sets: [{ numero_set: 1, games_j1: 3, games_j2: 2, completado: false }],
})
test('corrección guarda checkpoint y proyección sin borrar eventos ni inventar puntos', async () => {
  const ctx = load()
  await ctx.service.correctScore(10, correction(ctx.match), director)
  const insert = ctx.calls.find(({ sql }) => sql.includes('INSERT INTO eventos_partido'))
  assert.match(insert.sql, /'correccion'/)
  assert.deepEqual(JSON.parse(insert.params[4]).sets[0].games, [3, 2])
  assert.equal(
    ctx.calls.some(({ sql }) => /DELETE FROM eventos_partido/.test(sql)),
    false
  )
  assert.equal(ctx.committed, true)
})
test('corrección exige pausa y revisión actual del marcador', async () => {
  for (const options of [{ paused: false }, { stale: true }]) {
    const ctx = load(options)
    const body = correction(ctx.match)
    if (options.stale) body.expected_revision = '4:4'
    await assert.rejects(ctx.service.correctScore(10, body, director), (e) => e.status === 409)
    assert.equal(writes(ctx).length, 0)
  }
})
test('no cambia un ganador utilizado por partidos que ya comenzaron', async () => {
  const ctx = load({
    match: { estado: 'finalizado', ganador: 'jugador2' },
    dependents: [{ id: 20 }],
  })
  const body = {
    ...correction(ctx.match),
    estado: 'finalizado',
    ganador: 'jugador1',
    sets: [1, 2].map((numero_set) => ({ numero_set, games_j1: 6, games_j2: 0, completado: true })),
  }
  await assert.rejects(ctx.service.correctScore(10, body, director), (e) => e.status === 409)
  assert.equal(writes(ctx).length, 0)
})
test('sustitución solo antes de iniciar, con participante activo y categoría válida', async () => {
  for (const options of [
    {},
    { match: { estado: 'programado' }, events: 1 },
    { match: { estado: 'programado' }, players: [] },
  ]) {
    const ctx = load(options)
    await assert.rejects(
      ctx.service.substitute(
        10,
        { expected_control_version: 0, lado: 1, participante_id: 5 },
        director
      ),
      (e) => [400, 409].includes(e.status)
    )
    assert.equal(writes(ctx).length, 0)
  }
  const ctx = load({ match: { estado: 'programado' } })
  await ctx.service.substitute(
    10,
    { expected_control_version: 0, lado: 1, participante_id: 5 },
    director
  )
  assert.ok(ctx.calls.some(({ sql }) => sql.includes('nombre_override_j1 = NULL')))
  assert.equal(ctx.committed, true)
})
test('sustituir una pareja impide usar jugadores del equipo rival', async () => {
  const ctx = load({
    match: { estado: 'programado', equipo1_id: 10, equipo2_id: 11 },
    teams: [{ id: 5, jugador1_id: 22, jugador2_id: 30 }],
  })
  await assert.rejects(
    ctx.service.substitute(
      10,
      { expected_control_version: 0, lado: 1, participante_id: 5 },
      director
    ),
    (e) => e.status === 400
  )
})
test('versiones de control invalidan puntos offline previos sin afectar partidos no intervenidos', () => {
  assert.equal(configurationOf({}), configurationOf({ control_version: 0 }))
  assert.notEqual(configurationOf({}), configurationOf({ control_version: 1 }))
})
