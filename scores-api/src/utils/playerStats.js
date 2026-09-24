const PLAYER_STATS_QUERY = `
  SELECT
    p.id AS partido_id,
    p.categoria_id,
    cat.nombre AS categoria_nombre,
    cat.orden AS categoria_orden,
    p.jugador1_id,
    p.jugador2_id,
    e1.jugador1_id AS e1_j1_id,
    e1.jugador2_id AS e1_j2_id,
    e2.jugador1_id AS e2_j1_id,
    e2.jugador2_id AS e2_j2_id,
    p.ganador,
    s.numero_set,
    s.games_j1,
    s.games_j2
  FROM partidos p
  INNER JOIN categorias cat ON cat.id = p.categoria_id
  LEFT JOIN equipos_padel e1 ON e1.id = p.equipo1_id
  LEFT JOIN equipos_padel e2 ON e2.id = p.equipo2_id
  LEFT JOIN sets_partido s ON s.partido_id = p.id
  WHERE p.estado = 'finalizado'
    AND p.deporte = 'tenis'
    AND p.ganador IN ('jugador1', 'jugador2')
    AND (
      (p.jugador1_id IS NOT NULL AND p.jugador2_id IS NOT NULL)
      OR
      (e1.jugador1_id IS NOT NULL AND e2.jugador1_id IS NOT NULL)
    )
`

async function getPlayerStats(db, { categoriaId } = {}) {
  let query = PLAYER_STATS_QUERY
  const params = []

  if (categoriaId) {
    query += ' AND p.categoria_id = ?'
    params.push(categoriaId)
  }

  query += ' ORDER BY p.id, s.numero_set'
  const [rows] = await db.query(query, params)
  return calculatePlayerStats(rows)
}

function calculatePlayerStats(rows) {
  const matches = new Map()

  for (const row of rows) {
    if (!matches.has(row.partido_id)) {
      const p1Ids = []
      if (row.jugador1_id) p1Ids.push(Number(row.jugador1_id))
      if (row.e1_j1_id) p1Ids.push(Number(row.e1_j1_id))
      if (row.e1_j2_id) p1Ids.push(Number(row.e1_j2_id))

      const p2Ids = []
      if (row.jugador2_id) p2Ids.push(Number(row.jugador2_id))
      if (row.e2_j1_id) p2Ids.push(Number(row.e2_j1_id))
      if (row.e2_j2_id) p2Ids.push(Number(row.e2_j2_id))

      matches.set(row.partido_id, {
        categoria_id: Number(row.categoria_id),
        categoria_nombre: row.categoria_nombre,
        categoria_orden: Number(row.categoria_orden) || 0,
        p1Ids: [...new Set(p1Ids)],
        p2Ids: [...new Set(p2Ids)],
        ganador: row.ganador,
        sets: [],
      })
    }

    if (row.numero_set !== null && row.numero_set !== undefined) {
      matches.get(row.partido_id).sets.push({
        games_j1: Number(row.games_j1) || 0,
        games_j2: Number(row.games_j2) || 0,
      })
    }
  }

  const statsByCategory = new Map()

  for (const match of matches.values()) {
    const categoryStats = getOrCreateCategory(statsByCategory, match)
    const p1Players = match.p1Ids.map((id) => getOrCreatePlayer(categoryStats.players, id, match))
    const p2Players = match.p2Ids.map((id) => getOrCreatePlayer(categoryStats.players, id, match))

    let setsWonByPlayer1 = 0
    let setsWonByPlayer2 = 0
    let gamesWonJ1 = 0
    let gamesWonJ2 = 0

    for (const set of match.sets) {
      const g1 = Number(set.games_j1) || 0
      const g2 = Number(set.games_j2) || 0
      const isSTB = g1 >= 10 || g2 >= 10
      const g1Stats = isSTB ? (g1 > g2 ? 1 : 0) : g1
      const g2Stats = isSTB ? (g2 > g1 ? 1 : 0) : g2

      gamesWonJ1 += g1Stats
      gamesWonJ2 += g2Stats

      if (g1 > g2) {
        setsWonByPlayer1 += 1
      } else if (g2 > g1) {
        setsWonByPlayer2 += 1
      }
    }

    for (const p of p1Players) {
      p.partidos_jugados += 1
      p.games_ganados += gamesWonJ1
      p.games_perdidos += gamesWonJ2
      p.sets_ganados += setsWonByPlayer1
      p.sets_perdidos += setsWonByPlayer2
    }

    for (const p of p2Players) {
      p.partidos_jugados += 1
      p.games_ganados += gamesWonJ2
      p.games_perdidos += gamesWonJ1
      p.sets_ganados += setsWonByPlayer2
      p.sets_perdidos += setsWonByPlayer1
    }

    const winnerIs1 = match.ganador === 'jugador1'
    const winnerPlayers = winnerIs1 ? p1Players : p2Players
    const loserPlayers = winnerIs1 ? p2Players : p1Players

    for (const p of winnerPlayers) {
      p.victorias += 1
      p.puntos += 1
    }
    for (const p of loserPlayers) {
      p.derrotas += 1
      p.puntos += 0
    }
  }

  const result = []

  for (const category of statsByCategory.values()) {
    const standings = [...category.players.values()]
      .map(finalizePercentages)
      .sort(compareStats)
      .map((stats, index) => ({
        ...stats,
        ranking: index + 1,
      }))

    result.push(...standings)
  }

  return result.sort(
    (a, b) =>
      a.categoria.orden - b.categoria.orden || a.ranking - b.ranking || a.jugador_id - b.jugador_id
  )
}

function getOrCreateCategory(statsByCategory, match) {
  if (!statsByCategory.has(match.categoria_id)) {
    statsByCategory.set(match.categoria_id, {
      players: new Map(),
    })
  }
  return statsByCategory.get(match.categoria_id)
}

function getOrCreatePlayer(players, playerId, match) {
  if (!players.has(playerId)) {
    players.set(playerId, {
      jugador_id: playerId,
      categoria: {
        id: match.categoria_id,
        nombre: match.categoria_nombre,
        orden: match.categoria_orden,
      },
      partidos_jugados: 0,
      victorias: 0,
      derrotas: 0,
      puntos: 0,
      sets_ganados: 0,
      sets_perdidos: 0,
      games_ganados: 0,
      games_perdidos: 0,
    })
  }
  return players.get(playerId)
}

function finalizePercentages(stats) {
  const totalSets = stats.sets_ganados + stats.sets_perdidos
  const totalGames = stats.games_ganados + stats.games_perdidos

  return {
    ...stats,
    porcentaje_sets: totalSets ? stats.sets_ganados / totalSets : 0,
    porcentaje_games: totalGames ? stats.games_ganados / totalGames : 0,
  }
}

function compareStats(a, b) {
  return (
    b.puntos - a.puntos ||
    b.victorias - a.victorias ||
    b.porcentaje_sets - a.porcentaje_sets ||
    b.porcentaje_games - a.porcentaje_games ||
    a.jugador_id - b.jugador_id
  )
}

module.exports = { getPlayerStats, calculatePlayerStats, compareStats }
