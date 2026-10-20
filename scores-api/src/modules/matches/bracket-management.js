// Bracket operations reuse the same validation and scheduling rules as single matches.
const scheduling = require('./scheduling.service')
const guards = require('./edit-guards')
const audit = require('../audit/edit-audit')
const notifications = require('./schedule-notifications')
const retirements = require('../torneos/retiros.service')
const rounds = ['Dieciseisavos', 'Octavos de final', 'Cuartos de final', 'Semifinales', 'Final']
const DEFAULT_SUPERGAME = {
  mejor_de_sets: 3,
  juegos_por_set: 6,
  diferencia_juegos: 2,
  modo_game: 'ventaja',
  set_decisivo: 'set_completo',
  tiebreak_en: 6,
  tiebreak_puntos: 7,
  match_tiebreak_puntos: 10,
  servidor_inicial: 'jugador1',
}
const fail = (status, message) => { throw { status, message } }
const id = value => {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < 1) fail(400, 'Identificador inválido')
  return n
}
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : value
const snapshot = rows => rows.map(m => `${m.id}:${Number(m.control_version || 0)}`).sort().join('|')
const winnerId = m => m.ganador === 'jugador1' ? m.equipo1_id || m.jugador1_id : m.ganador === 'jugador2' ? m.equipo2_id || m.jugador2_id : null

module.exports = ({ pool, transaction, create, update, getById, getAll, normalizeActor }) => {
  const authorize = actor => {
    const user = normalizeActor(actor)
    if (user.rol !== 'admin') fail(403, 'Solo los administradores pueden modificar cuadros eliminatorios')
    return user
  }
  const atomic = async work => {
    const conn = await pool.getConnection()
    let locked = false
    try {
      await scheduling.lock(conn); locked = true
      await conn.beginTransaction()
      const result = await transaction.run(conn, () => work(conn))
      await conn.commit()
      return result
    } catch (e) { await conn.rollback(); throw e }
    finally { if (locked) await scheduling.unlock(conn); conn.release() }
  }
  const tournament = async (conn, tournamentId) => {
    const [[t]] = await conn.query('SELECT * FROM torneos WHERE id=? FOR UPDATE', [tournamentId])
    if (!t) fail(404, 'Torneo no encontrado')
    if (t.archivado_at || t.estado === 'cancelado' || t.estado === 'finalizado') fail(409, 'El torneo no admite cambios en su cuadro')
    if (!['grupos_eliminacion', 'eliminacion_directa'].includes(t.sistema)) fail(400, 'Este torneo no tiene fase eliminatoria')
    return t
  }
  const record = async (conn, before, matchId, actor) => {
    const [[after]] = await conn.query('SELECT * FROM partidos WHERE id = ?', [matchId])
    await audit.record(conn, 'partido', matchId, actor, before || {}, after)
    await notifications.afterChange(conn, before)
  }
  const distinctPlayers = async (conn, teamIds) => {
    const ids = teamIds.filter(Boolean)
    if (ids.length < 2) return
    const [teams] = await conn.query('SELECT id,jugador1_id,jugador2_id FROM equipos_padel WHERE id IN (?)', [ids])
    const seen = new Set()
    for (const team of teams) for (const player of [team.jugador1_id, team.jugador2_id].filter(Boolean)) {
      if (seen.has(Number(player))) fail(400, 'Un jugador no puede participar con dos parejas en las mismas llaves')
      seen.add(Number(player))
    }
  }
  const advance = async (conn, match, participant, prefix, actor) => {
    const [children] = await conn.query('SELECT * FROM partidos WHERE origen_partido1_id=? OR origen_partido2_id=? FOR UPDATE', [match.id, match.id])
    for (const child of children) {
      if (Number(child.torneo_id) !== Number(match.torneo_id) || Number(child.categoria_id) !== Number(match.categoria_id)) fail(409, 'El destino pertenece a otro torneo o categoría')
      for (const side of [1,2]) {
        if (Number(child[`origen_partido${side}_id`]) !== Number(match.id)) continue
        const field = `${prefix}${side}_id`
        if (Number(child[field] || 0) === Number(participant || 0)) continue
        if (child.estado !== 'programado') fail(409, 'Una llave dependiente ya inició; utiliza la corrección supervisada')
        const other = `${prefix}${side === 1 ? 2 : 1}_id`
        if (participant && Number(child[other]) === Number(participant)) fail(409, 'El clasificado ya ocupa el otro lado de la llave')
        await retirements.assertAvailable({ ...child, [field]: participant }, conn)
        if (prefix === 'equipo') await distinctPlayers(conn, [participant, child[other]])
        await scheduling.assertAvailable({ ...child, fecha_inicio:day(child.fecha_inicio), [field]: participant }, conn)
        await conn.query(`UPDATE partidos SET ${field}=?, control_version=control_version+1 WHERE id=?`, [participant, child.id])
        await record(conn, child, child.id, actor)
      }
    }
  }
  return {
    createKnockoutBracket: async (body = {}, actor) => {
      authorize(actor)
      const tournamentId = id(body.torneo_id), category = id(body.categoria_id)
      const start = rounds.indexOf(body.ronda_inicial)
      if (!tournamentId || !category || start < 0) fail(400, 'Selecciona torneo, categoría y ronda inicial válidos')
      if (body.forzar_reinicio) fail(409, 'No se permite reiniciar resultados desde el generador de cuadros')
      await atomic(async conn => {
        const t = await tournament(conn, tournamentId)
        if (t.categoria_id && Number(t.categoria_id) !== category) fail(400, 'La categoría no pertenece al torneo')
        const prefix = t.modalidad === 'dobles' || t.deporte === 'padel' ? 'equipo' : 'jugador'
        const [existing] = await conn.query("SELECT * FROM partidos WHERE torneo_id=? AND categoria_id=? AND fase='eliminacion' AND estado<>'cancelado' ORDER BY id FOR UPDATE", [tournamentId, category])
        if (existing.length && !body.reemplazar_programados) fail(409, 'Ya existe un cuadro. Actualízalo en lugar de crear uno duplicado')
        if (existing.length && (!Array.isArray(body.expected_matches) || snapshot(existing) !== snapshot(body.expected_matches))) fail(409, 'El cuadro cambió. Actualiza antes de guardarlo')
        if (existing.some(m => m.estado !== 'programado')) fail(409, 'El cuadro ya tiene partidos iniciados o cerrados. Edita sus llaves pendientes individualmente para conservar los resultados')
        // Never delete existing matches or rewrite started matches to accommodate a new layout.
        const roundNames = rounds.slice(start).concat(body.incluir_tercer_puesto ? ['Tercer puesto'] : [])
        if (existing.some(m => !roundNames.includes(m.ronda))) fail(409, 'La nueva estructura omitiría llaves existentes. Conserva esas rondas')
        const slots = body.llaves_iniciales || body.cruces_iniciales || []
        if (!Array.isArray(slots) || slots.length > 2 ** (4-start)) fail(400, 'Cantidad de llaves iniciales inválida')
        if (slots.some(slot => !slot || typeof slot !== 'object' || Array.isArray(slot))) fail(400, 'Las llaves iniciales no tienen un formato válido')
        if (prefix === 'equipo') await distinctPlayers(conn, slots.flatMap(slot => [1,2].map(side => id(slot[`equipo${side}_id`] ?? slot[`participante${side}_id`]))))
        const used = new Set()
        let previous = []
        for (let r=start; r<rounds.length; r++) {
          const current = [], count = 2 ** (4-r)
          const sameRound = existing.filter(m => m.ronda === rounds[r])
          if (sameRound.length > count) fail(409, 'La ronda contiene más encuentros que la estructura solicitada')
          for (let i=0; i<count; i++) {
            const old = sameRound[i], slot = r === start ? slots[i] || {} : {}
            const payload = { ...old, ...DEFAULT_SUPERGAME, ...(body.formato || {}), torneo_id:tournamentId, categoria_id:category,
              fase:'eliminacion', grupo:null, ronda:rounds[r], estado:'programado', fecha_inicio:day(old?.fecha_inicio) || null }
            for (const side of [1,2]) {
              const source = r > start ? previous[2*i+side-1] : null
              const participant = r === start ? id(slot[`${prefix}${side}_id`] ?? slot[`participante${side}_id`]) : null
              if (participant) {
                if (used.has(participant)) fail(400, 'Una pareja o jugador aparece en más de una llave inicial')
                used.add(participant)
              }
              payload[`${prefix}${side}_id`] = participant
              payload[`origen_partido${side}_id`] = source?.id || null
              payload[`participante${side}_tipo`] = source ? 'ganador' : participant ? 'fijo' : 'por_definir'
            }
            if (r === start) for (const key of ['fecha_inicio','hora_inicio','cancha_id','juez_id','notas']) if (slot[key] !== undefined) payload[key] = slot[key]
            const bye = Number(slot.pase_directo_lado || 0)
            if (bye && (![1,2].includes(bye) || !payload[`${prefix}${bye}_id`] || payload[`${prefix}${bye === 1 ? 2 : 1}_id`])) fail(400, 'Un pase directo requiere exactamente un participante')
            if (old && old.estado !== 'programado') {
              if (r === start && [1,2].some(side => Number(payload[`${prefix}${side}_id`] || 0) !== Number(old[`${prefix}${side}_id`] || 0))) fail(409, 'No se pueden cambiar los participantes de una llave iniciada')
              current.push(old); continue
            }
            const result = old ? await update(old.id, payload, actor) : await create(payload, actor)
            if (bye) {
              await conn.query("UPDATE partidos SET estado='finalizado', ganador=?, notas=CONCAT(COALESCE(notas,''), ' [Pase directo / Bye]'), control_version=control_version+1 WHERE id=?", [`jugador${bye}`,result.id])
            }
            await record(conn, old, result.id, actor)
            current.push({ id:result.id })
          }
          previous = current
        }
        if (body.incluir_tercer_puesto && !existing.some(m=>m.ronda === 'Tercer puesto')) {
          const result = await create({ ...body.formato, torneo_id:tournamentId, categoria_id:category, fase:'eliminacion', ronda:'Tercer puesto',
            participante1_tipo:'por_definir', participante2_tipo:'por_definir', estado:'programado' }, actor)
          await record(conn, null, result.id, actor)
        }
      })
      return getAll({ torneo_id:tournamentId, categoria_id:category })
    },
    updateBracketSlot: async (matchId, body = {}, actor) => {
      authorize(actor); matchId = id(matchId)
      await atomic(async conn => {
        const [[old]] = await conn.query('SELECT * FROM partidos WHERE id=? FOR UPDATE', [matchId])
        if (!old || old.fase !== 'eliminacion') fail(404, 'Llave eliminatoria no encontrada')
        const t = await tournament(conn, old.torneo_id)
        guards.assertVersion(old, body.expected_control_version)
        const prefix = t.modalidad === 'dobles' || t.deporte === 'padel' ? 'equipo' : 'jugador'
        const payload = { ...old, ...body, ...body.formato, torneo_id:old.torneo_id, categoria_id:old.categoria_id, estado:old.estado, fase:'eliminacion', fecha_inicio:day(body.fecha_inicio === undefined ? old.fecha_inicio : body.fecha_inicio) }
        for (const side of [1,2]) {
          const mode = body[`modo_lado${side}`] || (old[`origen_partido${side}_id`] ? 'ganador' : old[`${prefix}${side}_id`] ? 'fijo' : 'por_definir')
          if (!['fijo','ganador','por_definir'].includes(mode)) fail(400, 'Modo de participante inválido')
          payload[`participante${side}_tipo`] = mode
          payload[`${prefix}${side}_id`] = mode === 'fijo' ? id(body[`participante${side}_id`] ?? old[`${prefix}${side}_id`]) : null
          payload[`origen_partido${side}_id`] = mode === 'ganador' ? id(body[`origen_partido${side}_id`] ?? old[`origen_partido${side}_id`]) : body[`conservar_origen${side}`] ? old[`origen_partido${side}_id`] : null
          if (mode === 'ganador' && !payload[`origen_partido${side}_id`]) fail(400, 'Selecciona el partido de origen')
        }
        const changedWinner = body.ganador_manual !== undefined && (body.ganador_manual || null) !== (old.ganador || null)
        if (body.reabrir_partido || (changedWinner && old.estado !== 'programado')) fail(409, 'Corrige resultados o reabre el partido desde las acciones supervisadas')
        if (changedWinner && (!['jugador1','jugador2'].includes(body.ganador_manual) || !body.finalizar_manual || !String(body.notas || '').trim())) fail(400, 'Para clasificar manualmente, confirma el cierre y registra el motivo en Observaciones')
        // Core update validates identity, category, source order, retirements, court and scheduling.
        await update(matchId, payload, actor)
        let [[next]] = await conn.query('SELECT * FROM partidos WHERE id = ?', [matchId])
        if (prefix === 'equipo') await distinctPlayers(conn, [next.equipo1_id, next.equipo2_id])
        if (changedWinner) {
          await retirements.assertAvailable(next, conn)
          const side = body.ganador_manual === 'jugador1' ? 1 : 2
          if (!next[`${prefix}${side}_id`]) fail(400, 'El clasificado no está asignado')
          const [sets] = await conn.query('SELECT id FROM sets_partido WHERE partido_id=? LIMIT 1', [matchId])
          if (sets.length) fail(409, 'Este partido tiene resultados. Utiliza las acciones supervisadas')
          await conn.query("UPDATE partidos SET ganador=?, estado='finalizado', marcador_actual=NULL, control_version=control_version+1 WHERE id=?", [body.ganador_manual,matchId])
          next = { ...next, ganador:body.ganador_manual, estado:'finalizado' }
          await audit.record(conn, 'resultado', matchId, actor, {estado:old.estado,ganador:old.ganador,sets:[]}, {estado:next.estado,ganador:next.ganador,sets:[]})
        }
        if (body.partido_siguiente_id) {
          const [[target]] = await conn.query('SELECT * FROM partidos WHERE id=? FOR UPDATE', [id(body.partido_siguiente_id)])
          if (!target || ![1,2].some(side => Number(target[`origen_partido${side}_id`]) === matchId)) fail(409, 'Configura el origen desde la llave destino antes de avanzar un participante')
        }
        if (changedWinner) await advance(conn, next, winnerId(next), prefix, actor)
        await record(conn, old, matchId, actor)
      })
      return getById(matchId)
    },
  }
}
