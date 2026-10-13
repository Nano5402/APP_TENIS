const test = require('node:test')
const assert = require('node:assert/strict')
const scheduling = require('../src/modules/matches/scheduling.service')
const a = { id: 1, estado: 'programado', fecha_inicio: '2026-10-01', hora_inicio: '10:00', cancha_id: 1, juez_id: 8, jugador1_id: 4 }
const b = { id: 2, estado: 'programado', fecha_inicio: '2026-10-01', hora_inicio: '10:00:00' }
for (const [name, resource] of Object.entries({ cancha: { cancha_id: 1 }, juez: { juez_id: 8 }, jugador: { jugador2_id: 4 }, pareja: { e2_j1: 4 } })) {
  test(`bloquea ${name} a la misma hora incluso entre torneos`, () => {
    assert.equal(scheduling.compare({ ...a, torneo_id: 1 }, [{ ...b, ...resource, torneo_id: 2 }]).conflicts.length, 1)
  })
}
test('no bloquea encuentros finalizados, cancelados, el propio partido ni recursos distintos', () => {
  for (const row of [{ ...a }, { ...b, cancha_id: 2 }, { ...b, cancha_id: 1, estado: 'finalizado' }, { ...b, cancha_id: 1, estado: 'cancelado' }])
    assert.equal(scheduling.compare(a, [row]).conflicts.length, 0)
})
test('partidos en vivo comparten recursos independientemente de la hora publicada', () => {
  assert.equal(scheduling.compare({ ...a, estado: 'en_vivo', hora_inicio: null }, [{ ...b, estado: 'en_vivo', juez_id: 8 }]).conflicts.length, 1)
})
test('cercanía es advertencia orientativa, no bloqueo, incluyendo medianoche', () => {
  const result = scheduling.compare(a, [{ ...b, cancha_id: 1, hora_inicio: '11:30' }])
  assert.equal(result.conflicts.length, 0); assert.equal(result.warnings.length, 1)
  assert.equal(scheduling.compare(a, [{ ...b, cancha_id: 1, hora_inicio: '12:00' }]).warnings.length, 0)
  assert.equal(scheduling.compare({ ...a, hora_inicio: '23:30' }, [{ ...b, jugador1_id: 4, fecha_inicio: '2026-10-02', hora_inicio: '00:30' }]).warnings.length, 1)
})
test('sin fecha no inventa superposición con un encuentro programado', () => {
  assert.deepEqual(scheduling.compare({ ...a, fecha_inicio: null }, [{ ...b, cancha_id: 1 }]), { conflicts: [], warnings: [] })
})
test('consulta integrantes de ambas parejas y bloquea si coinciden con otro encuentro', async () => {
  const conn = { query: async sql => sql.includes('WHERE id IN (?)')
    ? [[{ id: 11, jugador1_id: 4, jugador2_id: 5 }, { id: 12, jugador1_id: 6, jugador2_id: 7 }]]
    : [[{ ...b, e1_j2: 5 }]] }
  await assert.rejects(scheduling.assertAvailable({ ...a, jugador1_id: null, equipo1_id: 11, equipo2_id: 12 }, conn), e => e.status === 409)
})
test('si no se obtiene exclusión de programación responde reintentable', async () => {
  await assert.rejects(scheduling.lock({ query: async () => [[{ acquired: 0 }]] }), e => e.status === 503)
})
