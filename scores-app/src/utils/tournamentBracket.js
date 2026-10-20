const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
export const categoryKey = match => String(match.categoria?.id || 'unassigned')
export const sourceId = (match, side) => Number(match[`origen_partido${side}`]?.id || match[`origen_partido${side}_id`] || 0)
export function roundInfo(value) {
  const text = normalize(value)
  const rounds = [
    [/^(dieciseisavos( de final)?|16avos|1\/16)$/, 'Dieciseisavos', 1],
    [/^(octavos( de final)?|1\/8)$/, 'Octavos de final', 2],
    [/^(cuartos( de final)?|1\/4)$/, 'Cuartos de final', 3],
    [/^(semifinal(es)?|semi final(es)?)$/, 'Semifinales', 4],
    [/^final$/, 'Final', 5],
    [/^(tercer (puesto|lugar)|3[ºo]?( puesto| lugar)?)$/, 'Tercer puesto', 6],
  ]
  for (const [pattern, label, order] of rounds) if (pattern.test(text)) return { key: label, label, order }
  return text ? { key: text, label: String(value).trim(), order: 7 } : { key: 'unassigned', label: 'Sin ronda registrada', order: 8 }
}
export function buildBracket(matches, system, category) {
  const all = new Map(matches.map(m => [Number(m.id), m]))
  const eligible = matches.filter(m => system === 'eliminacion_directa' || normalize(m.fase) === 'eliminacion')
  const selected = eligible.filter(m => categoryKey(m) === category)
  const ids = new Set(selected.map(m => Number(m.id)))
  const issues = [], invalidEdges = new Set()
  const edgeKey = (m, side) => `${m.id}:${side}`
  for (const match of selected) {
    for (const side of [1, 2]) {
      const id = sourceId(match, side)
      if (!id) continue
      const source = all.get(id)
      const sourceRound = roundInfo(source?.ronda), targetRound = roundInfo(match.ronda)
      if (!source || !ids.has(id) || id === Number(match.id) || sourceId(match,3-side)===id || (sourceRound.order<=5 && targetRound.order<=5 && sourceRound.order>=targetRound.order)) {
        invalidEdges.add(edgeKey(match, side))
        issues.push(`Partido #${match.id}: revisar origen #${id} (ausente, categoría/fase, duplicado o secuencia de rondas).`)
      }
    }
  }
  // Detect cycles without recursively following an unbounded malformed graph.
  const indegree = new Map(selected.map(m => [Number(m.id), 0])), outgoing = new Map()
  for (const m of selected) for (const side of [1,2]) {
    const id = sourceId(m, side)
    if (!id || invalidEdges.has(edgeKey(m,side))) continue
    indegree.set(Number(m.id), indegree.get(Number(m.id))+1)
    outgoing.set(id, [...(outgoing.get(id)||[]), Number(m.id)])
  }
  const queue = [...indegree].filter(([,n])=>n===0).map(([id])=>id)
  for (let i=0;i<queue.length;i++) for (const target of outgoing.get(queue[i])||[]) {
    indegree.set(target,indegree.get(target)-1)
    if (indegree.get(target)===0) queue.push(target)
  }
  for (const m of selected) if (indegree.get(Number(m.id))>0) {
    issues.push(`Partido #${m.id}: dependencias cíclicas o dependiente de un ciclo.`)
    for (const side of [1,2]) if (sourceId(m,side)) invalidEdges.add(edgeKey(m,side))
  }
  const grouped = new Map()
  for (const match of selected) {
    const round = roundInfo(match.ronda)
    if (!grouped.has(round.key)) grouped.set(round.key,{ ...round, matches:[] })
    grouped.get(round.key).matches.push(match)
  }
  const rounds = [...grouped.values()].sort((a,b)=>a.order-b.order || a.label.localeCompare(b.label,'es',{numeric:true}))
  for (const round of rounds) round.matches.sort((a,b)=>Number(a.id)-Number(b.id))
  return { rounds, issues, all, invalidEdges }
}

export function bracketSlot(match, side, bracket) {
  const source = sourceId(match,side)
  const participant = match[`equipo${side}`] || match[`jugador${side}`]
  if (!source) return { pending: !participant?.id, source: null, invalid:false }
  const historical = match.estado !== 'programado' && participant?.id
  if (bracket.invalidEdges.has(`${match.id}:${side}`)) return { pending:!historical,source:null,invalid:true }
  const previous = bracket.all.get(source)
  const winnerSide = previous?.ganador === 'jugador1' ? 1 : previous?.ganador === 'jugador2' ? 2 : 0
  const winner = winnerSide && (previous[`equipo${winnerSide}`] || previous[`jugador${winnerSide}`])
  const confirmed = previous?.estado === 'finalizado' && winner?.id && Number(winner.id)===Number(participant?.id)
  return { pending: !confirmed && !historical, source, invalid: Boolean(historical && !confirmed) }
}

export function resolveEffectiveParticipant(match, side, allMatchesMap) {
  if (!match) return { id: null, type: 'por_definir', nombre: 'Por definir' }
  const direct = match[`equipo${side}`] || match[`jugador${side}`]
  const directId = Number(direct?.id || match[`equipo${side}_id`] || match[`jugador${side}_id`] || 0)
  if (directId) {
    const nombre =
      direct?.nombre ||
      [direct?.nombre, direct?.apellido].filter(Boolean).join(' ') ||
      `Participante #${directId}`
    return {
      id: directId,
      type: 'fijo',
      nombre,
      participant: direct,
    }
  }
  const srcId = sourceId(match, side)
  if (srcId && allMatchesMap) {
    const prev = allMatchesMap.get(Number(srcId))
    if (prev) {
      if (prev.estado === 'finalizado' && (prev.ganador === 'jugador1' || prev.ganador === 'jugador2')) {
        const wSide = prev.ganador === 'jugador1' ? 1 : 2
        const resolvedWinner = resolveEffectiveParticipant(prev, wSide, allMatchesMap)
        if (resolvedWinner?.id) {
          return {
            ...resolvedWinner,
            fromMatchId: Number(prev.id),
          }
        }
      }
      const p1 = prev.equipo1?.nombre || prev.jugador1?.nombre || 'Por definir'
      const p2 = prev.equipo2?.nombre || prev.jugador2?.nombre || 'Por definir'
      return {
        id: null,
        type: 'ganador',
        sourceMatchId: Number(prev.id),
        sourceMatch: prev,
        nombre: `Ganador: ${p1} vs ${p2}`,
      }
    }
  }
  return { id: null, type: 'por_definir', nombre: 'Por definir' }
}

export function getCategoryBracketMatches(matches = [], tournamentId, categoryId, system = '') {
  if (!tournamentId || !categoryId) return []
  return matches.filter(
    (m) =>
      m.estado !== 'cancelado' &&
      String(m.torneo?.id ?? m.torneo_id ?? '') === String(tournamentId) &&
      String(m.categoria?.id ?? m.categoria_id ?? '') === String(categoryId) &&
      (system === 'eliminacion_directa' || normalize(m.fase) === 'eliminacion')
  )
}

export function findBracketMatchupForTeam({
  teamId,
  categoryId,
  matches = [],
  tournamentId,
  system = '',
  targetRound = '',
}) {
  const numericTeamId = Number(teamId)
  if (!numericTeamId || !categoryId || !tournamentId) return null

  const elimMatches = getCategoryBracketMatches(matches, tournamentId, categoryId, system)
  if (elimMatches.length === 0) {
    return null
  }

  const allMap = new Map(matches.map((m) => [Number(m.id), m]))
  const candidateMatches = []
  const targetRoundKey = targetRound ? roundInfo(targetRound).key : ''
  const roundExistsInBracket = Boolean(
    targetRoundKey &&
      targetRoundKey !== 'unassigned' &&
      elimMatches.some((m) => roundInfo(m.ronda).key === targetRoundKey)
  )

  for (const m of elimMatches) {
    const slot1 = resolveEffectiveParticipant(m, 1, allMap)
    const slot2 = resolveEffectiveParticipant(m, 2, allMap)
    if (slot1.id === numericTeamId || slot2.id === numericTeamId) {
      const mySide = slot1.id === numericTeamId ? 1 : 2
      const otherSide = mySide === 1 ? 2 : 1
      const otherSlot = mySide === 1 ? slot2 : slot1
      const rInfo = roundInfo(m.ronda)
      candidateMatches.push({
        match: m,
        matchId: Number(m.id),
        ronda: m.ronda || rInfo.label,
        roundKey: rInfo.key,
        roundOrder: rInfo.order,
        orden_llave: m.orden_llave || null,
        estado: m.estado,
        isFinalized: m.estado === 'finalizado',
        mySide,
        otherSide,
        opponentType: otherSlot.type, // 'fijo' | 'ganador' | 'por_definir'
        opponentTeamId: otherSlot.id ? Number(otherSlot.id) : null,
        opponentName: otherSlot.nombre || 'Por definir',
        opponentSourceMatchId: otherSlot.sourceMatchId || null,
        opponentSourceMatch: otherSlot.sourceMatch || null,
      })
    }
  }

  if (candidateMatches.length === 0) {
    return {
      inBracket: false,
      inSelectedRound: false,
      hasCategoryBracket: true,
      reason: 'No forma parte del cuadro eliminatorio de esta categoría',
    }
  }

  // Si hay una ronda seleccionada (y esa ronda existe en el bracket de la categoría),
  // filtramos estrictamente a la llave de esa ronda
  if (roundExistsInBracket) {
    const matchesInRound = candidateMatches.filter((c) => c.roundKey === targetRoundKey)
    if (matchesInRound.length === 0) {
      const roundsPlayed = [...new Set(candidateMatches.map((c) => c.ronda))].join(', ')
      return {
        inBracket: true,
        inSelectedRound: false,
        hasCategoryBracket: true,
        roundsPlayed,
        reason: `No participa en ${targetRound} (está en: ${roundsPlayed})`,
      }
    }
    return {
      inBracket: true,
      inSelectedRound: true,
      hasCategoryBracket: true,
      ...matchesInRound[0],
    }
  }

  // Si la ronda seleccionada no existe en el bracket de esta categoría pero el usuario filtró por ronda
  if (targetRoundKey && targetRoundKey !== 'unassigned' && !roundExistsInBracket) {
    return {
      inBracket: true,
      inSelectedRound: false,
      hasCategoryBracket: true,
      reason: `Esta categoría no tiene llaves en ${targetRound}`,
    }
  }

  // Sin filtro de ronda: priorizar llaves activas (programado / en_juego) sobre finalizadas, y luego la ronda más avanzada
  candidateMatches.sort((a, b) => {
    if (a.isFinalized !== b.isFinalized) return Number(a.isFinalized) - Number(b.isFinalized)
    if (b.roundOrder !== a.roundOrder) return b.roundOrder - a.roundOrder
    return b.matchId - a.matchId
  })

  return {
    inBracket: true,
    inSelectedRound: true,
    hasCategoryBracket: true,
    ...candidateMatches[0],
  }
}


