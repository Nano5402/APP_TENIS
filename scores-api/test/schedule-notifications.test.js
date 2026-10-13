const test = require('node:test')
const assert = require('node:assert/strict')
const service = require('../src/modules/matches/schedule-notifications')
const match = { id: 8, fecha_inicio: '2026-10-01', hora_inicio: '10:00:00', cancha_id: 2, estado: 'programado' }
test('guardar sin cambios, cambiar puntos o notas no genera avisos', () => {
  assert.deepEqual(service.changes(match, { ...match, notas: 'privado', ganador: 'jugador1' }), [])
  assert.deepEqual(service.changes(match, { ...match, estado: 'finalizado' }), [])
})
test('normaliza fecha SQL y detecta horario, cancha y cancelación sin revelar motivos', () => {
  assert.deepEqual(service.changes(match, { ...match, fecha_inicio: new Date('2026-10-01T00:00:00Z') }), [])
  const changes = service.changes(match, { ...match, hora_inicio: '11:00:00', cancha_id: null, estado: 'cancelado', notas: 'secreto' })
  assert.equal(changes.length, 3)
  assert.ok(!changes.join(' ').includes('secreto'))
  assert.equal(service.changes({ ...match, estado: 'cancelado' }, match).length, 1)
})
test('avisos solo a usuarios activos vinculados a participantes y con preferencia habilitada', async () => {
  const calls = []
  await service.notify({ query: async (...args) => calls.push(args) }, { ...match, equipo1_id: 10, equipo2_id: 11 }, ['Cambió la cancha.'])
  assert.equal(calls.length, 1)
  const [sql, params] = calls[0]
  assert.match(sql, /SELECT DISTINCT u.id/)
  assert.match(sql, /u.activo=TRUE/)
  assert.match(sql, /COALESCE\(pref.cambios_partidos,1\)=1/)
  assert.match(sql, /j.user_id/)
  assert.deepEqual(params.slice(-4), [10,11,10,11])
  assert.equal(params[3], '/match/8')
})
test('no envía avisos vacíos ni crea notificaciones al reintentar la misma edición', async () => {
  const calls = []
  const conn = { query: async (...args) => { calls.push(args); return [[match]] } }
  await service.notify(conn, match, [])
  assert.equal(calls.length, 0)
  await service.afterChange(conn, match)
  assert.equal(calls.length, 1)
})
test('fallos al guardar aviso se propagan para que la transacción no pierda la notificación', async () => {
  await assert.rejects(service.notify({ query: async () => { throw Error('database') } }, match, ['Cambio']), /database/)
})
