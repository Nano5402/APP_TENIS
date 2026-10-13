// One shared rule set for scheduling, reassignment and starting a match.
const active = m => ['programado', 'en_vivo'].includes(m.estado)
const ids = values => new Set(values.map(Number).filter(n => n > 0))
const players = m => ids([m.jugador1_id, m.jugador2_id, m.e1_j1, m.e1_j2, m.e2_j1, m.e2_j2])
const instant = m => {
  if (!m.fecha_inicio || !m.hora_inicio) return null
  const day = String(m.fecha_inicio).slice(0, 10)
  const time = String(m.hora_inicio).slice(0, 8)
  const n = Date.parse(`${day}T${time.length === 5 ? time + ':00' : time}Z`)
  return Number.isFinite(n) ? n : null
}

exports.compare = (candidate, rows) => {
  const conflicts = [], warnings = []
  if (!active(candidate)) return { conflicts, warnings }
  const ownPlayers = players(candidate), start = instant(candidate)
  for (const row of rows) {
    if (!active(row) || Number(row.id) === Number(candidate.id)) continue
    const resources = []
    if (candidate.cancha_id && Number(candidate.cancha_id) === Number(row.cancha_id)) resources.push('cancha')
    if (candidate.juez_id && Number(candidate.juez_id) === Number(row.juez_id)) resources.push('juez')
    if ([...players(row)].some(id => ownPlayers.has(id))) resources.push('jugador (individual o integrante de pareja)')
    if (!resources.length) continue
    const otherStart = instant(row)
    const minutes = start !== null && otherStart !== null ? Math.abs(start - otherStart) / 60000 : null
    const concurrent = candidate.estado === 'en_vivo' && row.estado === 'en_vivo'
    const message = `Partido #${row.id}: comparte ${resources.join(', ')}.`
    if (concurrent || minutes === 0) conflicts.push({ matchId: Number(row.id), message: `${message} ${concurrent ? 'Ambos estarían en vivo.' : 'Tienen la misma hora de inicio.'}` })
    else if (minutes !== null && minutes < 120) warnings.push({ matchId: Number(row.id), message: `${message} Solo hay ${Math.round(minutes)} minutos entre inicios; revisa duración y descanso.` })
  }
  return { conflicts, warnings }
}

exports.check = async (candidate, conn) => {
  if (!active(candidate)) return { conflicts: [], warnings: [] }
  const teamIds = [...ids([candidate.equipo1_id, candidate.equipo2_id])]
  if (teamIds.length) {
    const [teams] = await conn.query('SELECT id,jugador1_id,jugador2_id FROM equipos_padel WHERE id IN (?)', [teamIds])
    const a = teams.find(t => Number(t.id) === Number(candidate.equipo1_id))
    const b = teams.find(t => Number(t.id) === Number(candidate.equipo2_id))
    candidate = { ...candidate, e1_j1: a?.jugador1_id, e1_j2: a?.jugador2_id, e2_j1: b?.jugador1_id, e2_j2: b?.jugador2_id }
  }
  const [rows] = await conn.query(`SELECT p.id,p.estado,p.fecha_inicio,p.hora_inicio,p.cancha_id,p.juez_id,
    p.jugador1_id,p.jugador2_id,e1.jugador1_id AS e1_j1,e1.jugador2_id AS e1_j2,
    e2.jugador1_id AS e2_j1,e2.jugador2_id AS e2_j2
    FROM partidos p LEFT JOIN equipos_padel e1 ON e1.id=p.equipo1_id
    LEFT JOIN equipos_padel e2 ON e2.id=p.equipo2_id
    WHERE p.estado IN ('programado','en_vivo') AND p.id<>?
      AND (p.estado='en_vivo' OR p.fecha_inicio BETWEEN DATE_SUB(?, INTERVAL 1 DAY) AND DATE_ADD(?, INTERVAL 1 DAY))`,
    [candidate.id || 0, candidate.fecha_inicio || null, candidate.fecha_inicio || null])
  return exports.compare(candidate, rows)
}

exports.assertAvailable = async (candidate, conn) => {
  const result = await exports.check(candidate, conn)
  if (result.conflicts.length) throw { status: 409, message: `Conflicto de programación. ${result.conflicts.map(c => c.message).join(' ')}` }
  return result
}

// Acquired BEFORE transaction/row locks, and released on the same connection.
exports.lock = async conn => {
  const [[row]] = await conn.query("SELECT GET_LOCK(CONCAT('schedule:', LEFT(SHA2(DATABASE(),256),40)),5) AS acquired")
  if (Number(row?.acquired) !== 1) throw { status: 503, message: 'Otra programación está en curso. Reintenta en unos segundos.' }
}
exports.unlock = async conn => {
  try { await conn.query("SELECT RELEASE_LOCK(CONCAT('schedule:', LEFT(SHA2(DATABASE(),256),40)))") }
  catch { conn.destroy?.() }
}
