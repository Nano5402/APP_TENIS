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
