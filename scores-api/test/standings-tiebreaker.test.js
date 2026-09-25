const test = require('node:test')
const assert = require('node:assert/strict')

function loadPosiciones(mockDb) {
  const dbPath = require.resolve('../src/config/db')
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockDb }
  const svcPath = require.resolve('../src/modules/posiciones/posiciones.service')
  delete require.cache[svcPath]
  return require('../src/modules/posiciones/posiciones.service')
}

test('set largo normal conserva games; supertiebreak configurado a 7 cuenta uno', async () => {
  for (const [mode, number, g1, g2, expected] of [
    ['set_completo', 3, 12, 10, 12],
    ['match_tiebreak', 1, 10, 8, 10],
    ['match_tiebreak', 3, 7, 5, 1],
  ]) {
    const svc = loadPosiciones({ query: async sql => {
      if (sql.includes('FROM torneos')) return [[{ id: 1, modalidad: 'individual' }]]
      if (sql.includes('FROM partidos')) return [[{ id: 1, p1_id: 1, p2_id: 2,
        estado: 'finalizado', ganador: 'jugador1', mejor_de_sets: 3, set_decisivo: mode }]]
      if (sql.includes('FROM sets_partido')) return [[{ partido_id: 1, numero_set: number,
        games_j1: g1, games_j2: g2, completado: 1 }]]
      if (sql.includes('FROM jugadores')) return [[{ id: 1, nombre: 'A', apellido: '' }, { id: 2, nombre: 'B', apellido: '' }]]
      return [[]]
    } })
    const result = await svc.getByTorneo(1)
    assert.equal(result.tabla_general.find(p => p.id === 1).games_favor, expected)
  }
})

test('puntuación oficial: otorga 1 punto al ganador y 0 al perdedor', async () => {
  const matches = [
    {
      id: 1,
      torneo_id: 10,
      categoria_id: 1,
      fase: 'grupos',
      grupo: 'A',
      ronda: null,
      estado: 'finalizado',
      ganador: 'jugador1',
      categoria_nombre: 'Primera',
      p1_id: 101,
      p2_id: 102,
    },
  ]
  const sets = [
    { partido_id: 1, games_j1: 6, games_j2: 2, completado: 1 },
    { partido_id: 1, games_j1: 6, games_j2: 3, completado: 1 },
  ]

  const mockDb = {
    query: async (sql) => {
      if (sql.includes('FROM torneos')) {
        return [[{ id: 10, nombre: 'Torneo Test', deporte: 'tenis', modalidad: 'individual', sistema: 'todos_contra_todos', categoria_id: 1, estado: 'en_curso' }]]
      }
      if (sql.includes('FROM partidos')) return [matches]
      if (sql.includes('FROM sets_partido')) return [sets]
      if (sql.includes('FROM jugadores')) return [[
        { id: 101, nombre: 'Carlos', apellido: 'Alcaraz', foto: null },
        { id: 102, nombre: 'Jannik', apellido: 'Sinner', foto: null },
      ]]
      return [[]]
    },
  }

  const svc = loadPosiciones(mockDb)
  const res = await svc.getByTorneo(10)
  const standings = res.tabla_general

  assert.equal(standings.length, 2)
  const winner = standings.find((p) => p.id === 101)
  const loser = standings.find((p) => p.id === 102)

  assert.equal(winner.puntos, 1, 'Ganador debe tener 1 punto')
  assert.equal(winner.pg, 1)
  assert.equal(winner.pp, 0)
  assert.equal(loser.puntos, 0, 'Perdedor debe tener 0 puntos')
  assert.equal(loser.pg, 0)
  assert.equal(loser.pp, 1)
})

test('supertiebreak: cuenta como 1 game y 1 set (ejemplo 6/0 5/7 10/8 = 19 games jugados)', async () => {
  const matches = [
    {
      id: 2,
      mejor_de_sets: 3,
      set_decisivo: 'match_tiebreak',
      torneo_id: 10,
      categoria_id: 1,
      fase: 'grupos',
      grupo: 'A',
      ronda: null,
      estado: 'finalizado',
      ganador: 'jugador1',
      categoria_nombre: 'Primera',
      p1_id: 201,
      p2_id: 202,
    },
  ]
  const sets = [
    { partido_id: 2, games_j1: 6, games_j2: 0, completado: 1 },
    { partido_id: 2, games_j1: 5, games_j2: 7, completado: 1 },
    { partido_id: 2, numero_set: 3, games_j1: 10, games_j2: 8, completado: 1 }, // Supertiebreak!
  ]

  const mockDb = {
    query: async (sql) => {
      if (sql.includes('FROM torneos')) {
        return [[{ id: 10, nombre: 'Torneo Test', deporte: 'tenis', modalidad: 'individual', sistema: 'todos_contra_todos', categoria_id: 1, estado: 'en_curso' }]]
      }
      if (sql.includes('FROM partidos')) return [matches]
      if (sql.includes('FROM sets_partido')) return [sets]
      if (sql.includes('FROM jugadores')) return [[
        { id: 201, nombre: 'Jose', apellido: 'Perez', foto: null },
        { id: 202, nombre: 'Juan', apellido: 'Gomez', foto: null },
      ]]
      return [[]]
    },
  }

  const svc = loadPosiciones(mockDb)
  const res = await svc.getByTorneo(10)
  const standings = res.tabla_general

  const p1 = standings.find((p) => p.id === 201)
  const p2 = standings.find((p) => p.id === 202)

  // Sets: p1 ganó 2, perdió 1 (total 3 jugados)
  assert.equal(p1.sets_ganados, 2)
  assert.equal(p1.sets_perdidos, 1)
  assert.equal(p1.sets_jugados, 3)
  assert.equal(p2.sets_ganados, 1)
  assert.equal(p2.sets_perdidos, 2)
  assert.equal(p2.sets_jugados, 3)

  // Games: p1: 6 + 5 + 1 = 12 favor, 0 + 7 + 0 = 7 contra. Total 19 games jugados!
  assert.equal(p1.games_favor, 12, 'p1 games a favor debe ser 12')
  assert.equal(p1.games_contra, 7, 'p1 games en contra debe ser 7')
  assert.equal(p1.games_jugados, 19, 'p1 games jugados debe ser 19')

  assert.equal(p2.games_favor, 7, 'p2 games a favor debe ser 7')
  assert.equal(p2.games_contra, 12, 'p2 games en contra debe ser 12')
  assert.equal(p2.games_jugados, 19, 'p2 games jugados debe ser 19')

  // Ratios
  assert.ok(Math.abs(p1.ratio_sets - (2 / 3)) < 1e-4)
  assert.ok(Math.abs(p2.ratio_sets - (1 / 3)) < 1e-4)
  assert.ok(Math.abs(p1.ratio_games - (12 / 19)) < 1e-4)
  assert.ok(Math.abs(p2.ratio_games - (7 / 19)) < 1e-4)
})

test('desempate entre 2 parejas: Criterio 1 por ratio de sets ganados sobre jugados', async () => {
  // Pareja 301 jugó 1 partido y ganó 2-0 (sets 2/2 = 100%)
  // Pareja 302 jugó 1 partido y ganó 2-1 (sets 2/3 = 66.7%)
  // Pareja 303 perdió contra 301 (0-2)
  // Pareja 304 perdió contra 302 (1-2)
  const matches = [
    { id: 11, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador1', categoria_nombre: 'Primera', p1_id: 301, p2_id: 303 },
    { id: 12, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador1', categoria_nombre: 'Primera', p1_id: 302, p2_id: 304 },
  ]
  const sets = [
    { partido_id: 11, games_j1: 6, games_j2: 4, completado: 1 },
    { partido_id: 11, games_j1: 6, games_j2: 4, completado: 1 },
    { partido_id: 12, games_j1: 6, games_j2: 4, completado: 1 },
    { partido_id: 12, games_j1: 4, games_j2: 6, completado: 1 },
    { partido_id: 12, games_j1: 10, games_j2: 8, completado: 1 }, // supertiebreak
  ]

  const mockDb = {
    query: async (sql) => {
      if (sql.includes('FROM torneos')) return [[{ id: 10, nombre: 'Torneo', deporte: 'tenis', modalidad: 'individual', sistema: 'todos_contra_todos', categoria_id: 1, estado: 'en_curso' }]]
      if (sql.includes('FROM partidos')) return [matches]
      if (sql.includes('FROM sets_partido')) return [sets]
      if (sql.includes('FROM jugadores')) return [[
        { id: 301, nombre: 'Pareja A' },
        { id: 302, nombre: 'Pareja B' },
        { id: 303, nombre: 'Pareja C' },
        { id: 304, nombre: 'Pareja D' },
      ]]
      return [[]]
    },
  }

  const svc = loadPosiciones(mockDb)
  const res = await svc.getByTorneo(10)
  const standings = res.tabla_general

  // Ambos tienen 1 punto
  assert.equal(standings[0].puntos, 1)
  assert.equal(standings[1].puntos, 1)
  // Pareja 301 tiene 100% de sets (2/2) vs Pareja 302 que tiene 66.7% (2/3)
  assert.equal(standings[0].id, 301, 'Pareja 301 debe ser #1 por mejor ratio de sets')
  assert.equal(standings[1].id, 302, 'Pareja 302 debe ser #2')
})

test('desempate entre 2 parejas: Criterio 2 por ratio de games cuando empatan en ratio de sets', async () => {
  // Pareja 401 ganó 6-0 6-0 (sets 2/2 = 100%, games 12/12 = 100%)
  // Pareja 402 ganó 6-4 6-4 (sets 2/2 = 100%, games 12/20 = 60%)
  const matches = [
    { id: 21, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador1', categoria_nombre: 'Primera', p1_id: 401, p2_id: 403 },
    { id: 22, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador1', categoria_nombre: 'Primera', p1_id: 402, p2_id: 404 },
  ]
  const sets = [
    { partido_id: 21, games_j1: 6, games_j2: 0, completado: 1 },
    { partido_id: 21, games_j1: 6, games_j2: 0, completado: 1 },
    { partido_id: 22, games_j1: 6, games_j2: 4, completado: 1 },
    { partido_id: 22, games_j1: 6, games_j2: 4, completado: 1 },
  ]

  const mockDb = {
    query: async (sql) => {
      if (sql.includes('FROM torneos')) return [[{ id: 10, nombre: 'Torneo', deporte: 'tenis', modalidad: 'individual', sistema: 'todos_contra_todos', categoria_id: 1, estado: 'en_curso' }]]
      if (sql.includes('FROM partidos')) return [matches]
      if (sql.includes('FROM sets_partido')) return [sets]
      if (sql.includes('FROM jugadores')) return [[
        { id: 401, nombre: 'Pareja A' },
        { id: 402, nombre: 'Pareja B' },
        { id: 403, nombre: 'Pareja C' },
        { id: 404, nombre: 'Pareja D' },
      ]]
      return [[]]
    },
  }

  const svc = loadPosiciones(mockDb)
  const res = await svc.getByTorneo(10)
  const standings = res.tabla_general

  assert.equal(standings[0].id, 401, 'Pareja 401 debe ser #1 por mejor ratio de games')
  assert.equal(standings[1].id, 402, 'Pareja 402 debe ser #2')
})

test('desempate entre 2 parejas: Criterio 3 Enfrentamiento Directo si empatan en puntos, sets y games', async () => {
  // Grupo de 4 parejas: 501 (A), 502 (B), 503 (C), 504 (D).
  // A y B terminan ambos con 2 victorias (2 puntos), idénticos sets (4/6) e idénticos games (32/60).
  // En su enfrentamiento directo, B (502) le ganó a A (501).
  const matchesEmpate = [
    { id: 41, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador2', categoria_nombre: 'Primera', p1_id: 501, p2_id: 502 }, // B vence a A
    { id: 42, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador1', categoria_nombre: 'Primera', p1_id: 501, p2_id: 503 }, // A vence a C
    { id: 43, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador1', categoria_nombre: 'Primera', p1_id: 501, p2_id: 504 }, // A vence a D
    { id: 44, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador1', categoria_nombre: 'Primera', p1_id: 502, p2_id: 503 }, // B vence a C
    { id: 45, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador2', categoria_nombre: 'Primera', p1_id: 502, p2_id: 504 }, // D vence a B
    { id: 46, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador1', categoria_nombre: 'Primera', p1_id: 503, p2_id: 504 }, // C vence a D
  ]
  const setsEmpate = [
    // 501 vs 502: 502 gana 6-4, 6-4
    { partido_id: 41, games_j1: 4, games_j2: 6, completado: 1 },
    { partido_id: 41, games_j1: 4, games_j2: 6, completado: 1 },
    // 501 vs 503: 501 gana 6-4, 6-4
    { partido_id: 42, games_j1: 6, games_j2: 4, completado: 1 },
    { partido_id: 42, games_j1: 6, games_j2: 4, completado: 1 },
    // 501 vs 504: 501 gana 6-4, 6-4
    { partido_id: 43, games_j1: 6, games_j2: 4, completado: 1 },
    { partido_id: 43, games_j1: 6, games_j2: 4, completado: 1 },
    // 502 vs 503: 502 gana 6-4, 6-4
    { partido_id: 44, games_j1: 6, games_j2: 4, completado: 1 },
    { partido_id: 44, games_j1: 6, games_j2: 4, completado: 1 },
    // 502 vs 504: 504 gana 6-4, 6-4
    { partido_id: 45, games_j1: 4, games_j2: 6, completado: 1 },
    { partido_id: 45, games_j1: 4, games_j2: 6, completado: 1 },
    // 503 vs 504: 503 gana 6-4, 6-4
    { partido_id: 46, games_j1: 6, games_j2: 4, completado: 1 },
    { partido_id: 46, games_j1: 6, games_j2: 4, completado: 1 },
  ]

  const mockDb = {
    query: async (sql) => {
      if (sql.includes('FROM torneos')) return [[{ id: 10, nombre: 'Torneo', deporte: 'tenis', modalidad: 'individual', sistema: 'todos_contra_todos', categoria_id: 1, estado: 'en_curso' }]]
      if (sql.includes('FROM partidos')) return [matchesEmpate]
      if (sql.includes('FROM sets_partido')) return [setsEmpate]
      if (sql.includes('FROM jugadores')) return [[
        { id: 501, nombre: 'Pareja 501' },
        { id: 502, nombre: 'Pareja 502' },
        { id: 503, nombre: 'Pareja 503' },
        { id: 504, nombre: 'Pareja 504' },
      ]]
      return [[]]
    },
  }

  const svc = loadPosiciones(mockDb)
  const res = await svc.getByTorneo(10)
  const standings = res.tabla_general

  const p501 = standings.find((p) => p.id === 501)
  const p502 = standings.find((p) => p.id === 502)

  assert.equal(p501.puntos, 2)
  assert.equal(p502.puntos, 2)
  assert.equal(p501.ratio_sets, p502.ratio_sets)
  assert.equal(p501.ratio_games, p502.ratio_games)

  assert.equal(standings[0].id, 502, 'Pareja 502 debe ser #1 porque le ganó el partido directo a Pareja 501')
  assert.equal(standings[1].id, 501, 'Pareja 501 debe ser #2')
})

test('triple empate: el mayor porcentaje de games pasa directo (1°); desempate de los 2 restantes por enfrentamiento directo', async () => {
  // 3 parejas: 601, 602, 603.
  // 601 le gana a 602 (6-1, 6-1) -> 601 suma muchos games
  // 602 le gana a 603 (6-4, 6-4) -> 602 gana en enfrentamiento directo contra 603!
  // 603 le gana a 601 (7-6, 7-6) -> 603 gana pero con score apretado
  // Cada una tiene 1 victoria (1 punto) y 1 derrota.
  // Games de 601: vs 602 (12 favor, 2 contra) + vs 603 (12 favor, 14 contra) = 24 favor / 16 contra = 24/40 = 60%
  // Games de 602: vs 601 (2 favor, 12 contra) + vs 603 (12 favor, 8 contra) = 14 favor / 20 contra = 14/34 = 41.2%
  // Games de 603: vs 602 (8 favor, 12 contra) + vs 601 (14 favor, 12 contra) = 22 favor / 24 contra = 22/46 = 47.8%
  //
  // 601 tiene el mayor % de games (60%) -> pasa DIRECTO en 1.er lugar del triple empate!
  // Entre 602 y 603: 602 le ganó a 603 en su enfrentamiento directo!
  // Por tanto, 602 queda 2.° y 603 queda 3.°, A PESAR de que 603 tenía mejor porcentaje de games que 602,
  // porque la regla estipula: "el que tenga mayor porcentaje de los 3 pasa directo, y los dos restantes por enfrentamiento directo".

  const matches = [
    { id: 51, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador1', categoria_nombre: 'Primera', p1_id: 601, p2_id: 602 },
    { id: 52, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador1', categoria_nombre: 'Primera', p1_id: 602, p2_id: 603 },
    { id: 53, torneo_id: 10, categoria_id: 1, fase: 'grupos', grupo: 'A', estado: 'finalizado', ganador: 'jugador1', categoria_nombre: 'Primera', p1_id: 603, p2_id: 601 },
  ]
  const sets = [
    // 601 vs 602: 601 gana 6-1, 6-1
    { partido_id: 51, games_j1: 6, games_j2: 1, completado: 1 },
    { partido_id: 51, games_j1: 6, games_j2: 1, completado: 1 },
    // 602 vs 603: 602 gana 6-4, 6-4
    { partido_id: 52, games_j1: 6, games_j2: 4, completado: 1 },
    { partido_id: 52, games_j1: 6, games_j2: 4, completado: 1 },
    // 603 vs 601: 603 gana 7-6, 7-6
    { partido_id: 53, games_j1: 7, games_j2: 6, completado: 1 },
    { partido_id: 53, games_j1: 7, games_j2: 6, completado: 1 },
  ]

  const mockDb = {
    query: async (sql) => {
      if (sql.includes('FROM torneos')) return [[{ id: 10, nombre: 'Torneo', deporte: 'tenis', modalidad: 'individual', sistema: 'todos_contra_todos', categoria_id: 1, estado: 'en_curso' }]]
      if (sql.includes('FROM partidos')) return [matches]
      if (sql.includes('FROM sets_partido')) return [sets]
      if (sql.includes('FROM jugadores')) return [[
        { id: 601, nombre: 'Jugador 601' },
        { id: 602, nombre: 'Jugador 602' },
        { id: 603, nombre: 'Jugador 603' },
      ]]
      return [[]]
    },
  }

  const svc = loadPosiciones(mockDb)
  const res = await svc.getByTorneo(10)
  const standings = res.tabla_general

  assert.equal(standings.length, 3)
  assert.equal(standings[0].id, 601, '601 debe ser #1 (pasa directo por mayor ratio de games)')
  assert.equal(standings[1].id, 602, '602 debe ser #2 (venció a 603 en enfrentamiento directo)')
  assert.equal(standings[2].id, 603, '603 debe ser #3 (perdió el enfrentamiento directo ante 602)')
})
