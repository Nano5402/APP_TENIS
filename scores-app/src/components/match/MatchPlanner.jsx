import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Users,
  Check,
  ArrowRight,
  AlertTriangle,
  SlidersHorizontal,
  Trophy,
  GitBranch,
  Clock,
  Wand2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import {
  choiceKey,
  incompatibility,
  pairText,
  previousMeetings,
  searchPair,
} from '../../utils/matchPlanner.mjs'
import {
  buildBracket,
  findBracketMatchupForTeam,
  getCategoryBracketMatches,
  resolveEffectiveParticipant,
  roundInfo,
} from '../../utils/tournamentBracket'
import { getMatchupLabel } from '../../utils/matchParticipants'
import './MatchPlanner.css'

const ROUND_SHORT = {
  Dieciseisavos: '16F',
  'Octavos de final': '8F',
  'Cuartos de final': 'CF',
  Semifinales: 'SF',
  Final: 'FIN',
  'Tercer puesto': '3P',
}

export default function MatchPlanner({
  choices,
  firstId,
  secondId,
  categoryId,
  group,
  phase,
  round = '',
  system = '',
  useGroups,
  tournamentId,
  matches,
  loading,
  error,
  busy,
  onRetry,
  onFirst,
  onSecond,
  onClear,
  onManual,
  onContinue,
  onCategoryChange = null,
  onRoundChange = null,
  firstMode = 'fijo',
  secondMode = 'fijo',
  firstSourceId = '',
  secondSourceId = '',
  sourceMatches = [],
  standings = null,
  linkedBracketMatchId = null,
  onSourceSelect = null,
  onPendingSelect = null,
  onSelectBracketMatch = null,
  onOpenBracketBuilder = null,
}) {
  const isElimination = phase === 'eliminacion' || system === 'eliminacion_directa'
  const first =
    firstMode === 'fijo' &&
    choices.find(
      (p) =>
        String(p.equipo_id) === String(firstId) &&
        (!categoryId || String(p.categoria_id) === String(categoryId)) &&
        (!useGroups || phase !== 'grupos' || !group || p.grupo === group)
    )
  const second =
    secondMode === 'fijo' &&
    choices.find(
      (p) =>
        String(p.equipo_id) === String(secondId) &&
        (!categoryId || String(p.categoria_id) === String(categoryId)) &&
        (!useGroups || phase !== 'grupos' || !group || p.grupo === group)
    )
  const firstSourceMatch =
    firstMode === 'ganador' &&
    (sourceMatches.find((m) => String(m.id) === String(firstSourceId)) ||
      (matches || []).find((m) => String(m.id) === String(firstSourceId)))
  const secondSourceMatch =
    secondMode === 'ganador' &&
    (sourceMatches.find((m) => String(m.id) === String(secondSourceId)) ||
      (matches || []).find((m) => String(m.id) === String(secondSourceId)))

  const [side, setSide] = useState(1)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(() => (categoryId ? String(categoryId) : ''))
  const [groupFilter, setGroupFilter] = useState('')
  const [onlyQualified, setOnlyQualified] = useState(false)
  const [slotInputTab, setSlotInputTab] = useState('pair') // 'pair' | 'source'
  const [showUnavailable, setShowUnavailable] = useState(false)
  const [limit, setLimit] = useState(12)
  const [browsing, setBrowsing] = useState(true)
  const [unlockBracketRival, setUnlockBracketRival] = useState(false)
  const input = useRef(null)

  useEffect(() => {
    setSide(1)
    setQuery('')
    setCategoryFilter('')
    setGroupFilter('')
    setOnlyQualified(false)
    setSlotInputTab('pair')
    setUnlockBracketRival(false)
    setLimit(12)
  }, [tournamentId])

  // Sincronizar siempre cuando cambie la categoría desde arriba (píldoras o selector del formulario)
  useEffect(() => {
    setCategoryFilter(categoryId ? String(categoryId) : '')
  }, [categoryId])

  useEffect(() => {
    setUnlockBracketRival(false)
    if (!firstId && firstMode === 'fijo') {
      setSide(1)
      setQuery('')
    }
  }, [firstId, firstMode])

  useEffect(() => {
    setLimit(12)
  }, [query, side, categoryFilter, groupFilter, round, showUnavailable, onlyQualified])

  const categories = useMemo(
    () => [
      ...new Map(choices.map((p) => [String(p.categoria_id), p.categoria_nombre])).entries(),
    ],
    [choices]
  )

  // Mapa por categoría: ¿tiene bracket activo en partidos?
  const bracketMetaByCategory = useMemo(() => {
    const map = new Map()
    for (const [catId, catName] of categories) {
      const elimMatches = getCategoryBracketMatches(matches, tournamentId, catId, system)
      const roundKeys = [...new Set(elimMatches.map((m) => roundInfo(m.ronda).key))]
      map.set(String(catId), {
        id: String(catId),
        nombre: catName,
        hasBracket: elimMatches.length > 0,
        elimCount: elimMatches.length,
        elimMatches,
        roundKeys,
      })
    }
    return map
  }, [categories, matches, tournamentId, system])

  // Categoría activa para mostrar el visualizador de bracket dentro de Crear Partido
  const activeVisualCategoryId = useMemo(() => {
    if (categoryFilter) return String(categoryFilter)
    if (categoryId) return String(categoryId)
    if (first?.categoria_id) return String(first.categoria_id)
    if (isElimination) {
      for (const [catId, meta] of bracketMetaByCategory.entries()) {
        if (meta.hasBracket) return catId
      }
    }
    return ''
  }, [categoryFilter, categoryId, first?.categoria_id, isElimination, bracketMetaByCategory])

  const activeCategoryBracketMeta = activeVisualCategoryId
    ? bracketMetaByCategory.get(String(activeVisualCategoryId)) || null
    : null

  const activeVisualBracket = useMemo(() => {
    if (!activeVisualCategoryId || !activeCategoryBracketMeta?.hasBracket) return null
    const tournamentMatches = (matches || []).filter(
      (m) =>
        m.estado !== 'cancelado' &&
        String(m.torneo?.id ?? m.torneo_id ?? '') === String(tournamentId)
    )
    return buildBracket(
      tournamentMatches,
      system || 'grupos_eliminacion',
      String(activeVisualCategoryId)
    )
  }, [activeVisualCategoryId, activeCategoryBracketMeta, matches, tournamentId, system])

  const allMatchesMap = useMemo(
    () => new Map((matches || []).map((m) => [Number(m.id), m])),
    [matches]
  )

  const activeRoundKey = useMemo(() => {
    if (!round) return ''
    const rKey = roundInfo(round).key
    return rKey !== 'unassigned' ? rKey : ''
  }, [round])

  // Información del bracket para la primera pareja seleccionada (en la ronda activa si existe)
  const firstBracketMatchup = useMemo(() => {
    if (!first) return null
    return findBracketMatchupForTeam({
      teamId: first.equipo_id,
      categoryId: first.categoria_id,
      matches,
      tournamentId,
      system,
      targetRound: isElimination ? round : '',
    })
  }, [first, matches, tournamentId, system, isElimination, round])

  // Mapa de posiciones en grupos por equipo_id + categoria_id
  const standingBadgeByTeam = useMemo(() => {
    const map = new Map()
    if (!standings?.categorias) return map
    for (const cat of standings.categorias) {
      for (const grp of cat.grupos || []) {
        const rows = standings.grupos?.[grp.clave] || []
        rows.forEach((r) => {
          const teamId = Number(r.participante?.id || r.id)
          if (!teamId) return
          map.set(`${cat.id}-${teamId}`, {
            posicion: Number(r.posicion),
            grupo: grp.nombre,
            puntos: r.puntos,
            pj: r.pj,
            qualified: Number(r.posicion) <= 2,
          })
        })
      }
    }
    return map
  }, [standings])

  // Cruces sugeridos 1° vs 2° para la categoría activa cuando aún no se ha guardado el bracket
  const suggestedCrossings = useMemo(() => {
    if (!isElimination || !standings?.categorias) return []
    const activeCatId = categoryFilter || categoryId
    const catObj = standings.categorias.find((c) => String(c.id) === String(activeCatId))
    if (!catObj || !Array.isArray(catObj.grupos) || catObj.grupos.length === 0) return []
    const groupsWithRows = catObj.grupos.map((g) => ({
      nombre: g.nombre,
      rows: standings.grupos?.[g.clave] || [],
    }))
    const list = []
    if (groupsWithRows.length >= 2) {
      for (let i = 0; i < groupsWithRows.length; i++) {
        const gA = groupsWithRows[i]
        const gB = groupsWithRows[(i + 1) % groupsWithRows.length]
        const firstRow = gA.rows[0]
        const secondRow = gB.rows[1]
        if (firstRow && secondRow) {
          const p1 = choices.find(
            (c) =>
              Number(c.equipo_id) === Number(firstRow.participante?.id || firstRow.id) &&
              String(c.categoria_id) === String(catObj.id)
          )
          const p2 = choices.find(
            (c) =>
              Number(c.equipo_id) === Number(secondRow.participante?.id || secondRow.id) &&
              String(c.categoria_id) === String(catObj.id)
          )
          if (p1 && p2 && Number(p1.equipo_id) !== Number(p2.equipo_id)) {
            list.push({
              key: `${gA.nombre}-1-${gB.nombre}-2`,
              label: `1° ${gA.nombre} vs 2° ${gB.nombre}`,
              p1,
              p2,
            })
          }
        }
      }
    } else if (groupsWithRows.length === 1) {
      const rows = groupsWithRows[0].rows
      if (rows[0] && rows[1]) {
        const p1 = choices.find(
          (c) =>
            Number(c.equipo_id) === Number(rows[0].participante?.id || rows[0].id) &&
            String(c.categoria_id) === String(catObj.id)
        )
        const p2 = choices.find(
          (c) =>
            Number(c.equipo_id) === Number(rows[1].participante?.id || rows[1].id) &&
            String(c.categoria_id) === String(catObj.id)
        )
        if (p1 && p2) {
          list.push({
            key: '1v2-unico',
            label: `1° vs 2° (${groupsWithRows[0].nombre})`,
            p1,
            p2,
          })
        }
      }
    }
    return list
  }, [isElimination, standings, categoryFilter, categoryId, choices])

  const standingCrossingOpponentForFirst = useMemo(() => {
    if (!first || firstBracketMatchup?.hasCategoryBracket || !isElimination) return null
    for (const cr of suggestedCrossings) {
      if (Number(cr.p1?.equipo_id) === Number(first.equipo_id)) {
        return { opponent: cr.p2, label: cr.label }
      }
      if (Number(cr.p2?.equipo_id) === Number(first.equipo_id)) {
        return { opponent: cr.p1, label: cr.label }
      }
    }
    return null
  }, [first, firstBracketMatchup, isElimination, suggestedCrossings])

  const groupPhase = useGroups && phase === 'grupos'

  const handleCategoryPick = (nextCatId) => {
    const normalizedCat = nextCatId ? String(nextCatId) : ''
    setCategoryFilter(normalizedCat)
    setGroupFilter('')
    setBrowsing(true)
    if (onCategoryChange) {
      onCategoryChange(normalizedCat)
    }
  }

  const candidates = choices
    .filter((p) => side === 1 || Number(p.equipo_id) !== Number(first?.equipo_id))
    .map((pair) => {
      const st = standingBadgeByTeam.get(`${pair.categoria_id}-${pair.equipo_id}`) || null
      const pairCatMeta = bracketMetaByCategory.get(String(pair.categoria_id))
      const pairCatHasBracket = Boolean(pairCatMeta?.hasBracket)
      const effectiveTargetRound = isElimination && pairCatHasBracket ? round : ''

      const pairBracket = findBracketMatchupForTeam({
        teamId: pair.equipo_id,
        categoryId: pair.categoria_id,
        matches,
        tournamentId,
        system,
        targetRound: effectiveTargetRound,
      })

      let reason = ''
      if (side === 1) {
        if (isElimination) {
          if (pairCatHasBracket) {
            // Categoría con bracket eliminatorio activo:
            // Solo mostrar las parejas que están en el bracket (y en la ronda seleccionada si hay ronda)
            if (!pairBracket?.inBracket) {
              reason = 'No clasificó al cuadro eliminatorio de esta categoría'
            } else if (effectiveTargetRound && !pairBracket?.inSelectedRound) {
              reason =
                pairBracket?.reason || `No participa en la ronda seleccionada (${effectiveTargetRound})`
            } else if (pairBracket?.estado && pairBracket.estado !== 'programado') {
              reason = 'Esta llave ya inició o finalizó; consulta su resultado desde el cuadro'
            }
          } else {
            // Si estamos en fase eliminatoria y seleccionó una categoría que aún no está en eliminación / bracket:
            if (standingBadgeByTeam.size > 0 && st && !st.qualified) {
              reason = `No clasificó a fase eliminatoria (${st.posicion}° en ${st.grupo})`
            } else if (
              !categoryFilter &&
              Array.from(bracketMetaByCategory.values()).some((m) => m.hasBracket)
            ) {
              reason = 'Esta categoría aún continúa en fase de grupos'
            }
          }
        } else if (useGroups && phase === 'grupos' && !pair.grupo) {
          reason = 'Necesita un grupo asignado'
        }
      } else if (side === 2 && first) {
        if (
          isElimination &&
          !unlockBracketRival &&
          firstBracketMatchup?.hasCategoryBracket &&
          firstBracketMatchup?.inBracket
        ) {
          // La categoría de la primera pareja está en Fase Eliminatoria con Bracket:
          // Por defecto muestra su único rival contemplado en la llave del bracket (salvo que pulse Corregir rival)
          if (Number(pair.categoria_id) !== Number(first.categoria_id)) {
            reason = 'Pertenece a otra categoría'
          } else if (
            firstBracketMatchup.opponentType === 'fijo' &&
            firstBracketMatchup.opponentTeamId
          ) {
            if (Number(pair.equipo_id) !== Number(firstBracketMatchup.opponentTeamId)) {
              reason = `Según el bracket (${firstBracketMatchup.ronda}), su único rival contemplado es ${firstBracketMatchup.opponentName}`
            }
          } else if (firstBracketMatchup.opponentType === 'ganador') {
            reason = `Según el bracket (${firstBracketMatchup.ronda}), espera a ${firstBracketMatchup.opponentName}`
          }
        } else if (
          isElimination &&
          !unlockBracketRival &&
          standingCrossingOpponentForFirst?.opponent
        ) {
          if (Number(pair.categoria_id) !== Number(first.categoria_id)) {
            reason = 'Pertenece a otra categoría'
          } else if (
            Number(pair.equipo_id) !== Number(standingCrossingOpponentForFirst.opponent.equipo_id)
          ) {
            reason = `Según el cruce eliminatorio (${standingCrossingOpponentForFirst.label}), su rival es ${standingCrossingOpponentForFirst.opponent.nombre}`
          }
        } else {
          reason = incompatibility(pair, first, groupPhase)
        }
      }

      return {
        pair,
        standing: st,
        bracketInfo: pairBracket,
        reason,
        meetings: side === 2 ? previousMeetings(matches, tournamentId, first, pair) : [],
      }
    })
    .filter(
      ({ pair, standing }) =>
        searchPair(pair, query) &&
        (!categoryFilter || String(pair.categoria_id) === String(categoryFilter)) &&
        (!groupFilter || pair.grupo === groupFilter) &&
        (!onlyQualified || Boolean(standing?.qualified))
    )
    .sort(
      (a, b) =>
        Number(Boolean(a.reason)) - Number(Boolean(b.reason)) ||
        Number(Boolean(b.bracketInfo?.inSelectedRound)) -
          Number(Boolean(a.bracketInfo?.inSelectedRound)) ||
        Number(Boolean(b.bracketInfo?.inBracket)) - Number(Boolean(a.bracketInfo?.inBracket)) ||
        (isElimination
          ? (a.standing?.posicion || 99) - (b.standing?.posicion || 99)
          : Number(Boolean(a.meetings.length)) - Number(Boolean(b.meetings.length))) ||
        a.pair.nombre.localeCompare(b.pair.nombre, 'es')
    )
  const visible = candidates.filter((c) => showUnavailable || !c.reason)
  const meetings = previousMeetings(matches, tournamentId, first, second)

  const side1Ready =
    (firstMode === 'fijo' && Boolean(first)) ||
    (firstMode === 'ganador' && Boolean(firstSourceId)) ||
    (isElimination && firstMode === 'por_definir')
  const side2Ready =
    (secondMode === 'fijo' &&
      Boolean(second) &&
      (!first || !incompatibility(second, first, groupPhase))) ||
    (secondMode === 'ganador' && Boolean(secondSourceId)) ||
    (isElimination && secondMode === 'por_definir')

  const ready = side1Ready && side2Ready

  useEffect(() => {
    setBrowsing(!ready)
  }, [Boolean(ready)])

  const groups = [
    ...new Set(
      choices
        .filter((p) => !categoryFilter || String(p.categoria_id) === String(categoryFilter))
        .map((p) => p.grupo)
        .filter(Boolean)
    ),
  ]

  const select = (pair, pairBracket = null) => {
    if (side === 1) {
      const resolvedBracket =
        pairBracket ||
        findBracketMatchupForTeam({
          teamId: pair.equipo_id,
          categoryId: pair.categoria_id,
          matches,
          tournamentId,
          system,
          targetRound: isElimination ? round : '',
        })
      onFirst(pair, resolvedBracket)
      if (resolvedBracket?.hasCategoryBracket && resolvedBracket?.inBracket) {
        setCategoryFilter(String(pair.categoria_id))
        setBrowsing(false)
      } else {
        setSide(2)
        setCategoryFilter(String(pair.categoria_id))
      }
    } else {
      onSecond(pair)
      setBrowsing(false)
    }
    setQuery('')
    setGroupFilter('')
    setShowUnavailable(false)
    if (side === 1) requestAnimationFrame(() => input.current?.focus({ preventScroll: true }))
  }

  const renderSlotContent = (n) => {
    const mode = n === 1 ? firstMode : secondMode
    const pair = n === 1 ? first : second
    const srcMatch = n === 1 ? firstSourceMatch : secondSourceMatch
    const srcId = n === 1 ? firstSourceId : secondSourceId
    const st = pair ? standingBadgeByTeam.get(`${pair.categoria_id}-${pair.equipo_id}`) : null

    if (mode === 'ganador' && srcId) {
      return (
        <>
          <span className='match-planner__eyebrow'>
            {n === 1 ? 'PRIMERA LLAVE' : 'RIVAL DEL BRACKET'}
          </span>
          <span className='match-planner__pair-avatars' aria-hidden='true'>
            <span>🔗</span>
          </span>
          <strong>
            {srcMatch ? `Ganador: ${getMatchupLabel(srcMatch)}` : `Ganador partido #${srcId}`}
          </strong>
          <small>
            {srcMatch?.ronda ? `${srcMatch.ronda} · Partido #${srcMatch.id}` : `Partido #${srcId}`}
          </small>
          <span className='match-planner__change'>Cambiar</span>
        </>
      )
    }

    if (isElimination && mode === 'por_definir') {
      return (
        <>
          <span className='match-planner__eyebrow'>
            {n === 1 ? 'PRIMERA PAREJA' : 'RIVAL DEL BRACKET'}
          </span>
          <span className='match-planner__pair-avatars' aria-hidden='true'>
            <span>⏳</span>
          </span>
          <strong>Por definir (Cupo abierto)</strong>
          <small>Se completará más adelante en el cuadro eliminatorio</small>
          <span className='match-planner__change'>Cambiar</span>
        </>
      )
    }

    const isAutoLockedOpponent =
      n === 2 &&
      Boolean(pair) &&
      Boolean(        isElimination &&
        firstBracketMatchup?.hasCategoryBracket &&
          firstBracketMatchup?.inBracket &&
          Number(pair.equipo_id) === Number(firstBracketMatchup.opponentTeamId)
      )

    return (
      <>
        <span className='match-planner__eyebrow'>
          {n === 1
            ? 'PRIMERA PAREJA'
            : isAutoLockedOpponent
              ? `RIVAL EN BRACKET (${firstBracketMatchup.ronda})`
              : 'RIVAL'}
        </span>
        <span className='match-planner__pair-avatars' aria-hidden='true'>
          {[pair?.jugador1, pair?.jugador2].map((player, i) => (
            <span key={i}>
              {player
                ? `${(player.nombre || '').slice(0, 1)}${(player.apellido || '').slice(0, 1)}`
                : pair?.nombre?.split('/')[i]?.trim().slice(0, 1) || '+'}
            </span>
          ))}
        </span>
        <strong>
          {pair?.nombre || (n === 1 ? 'Seleccionar pareja' : 'Seleccionar rival')}
        </strong>
        <small>
          {pair
            ? `${pair.categoria_nombre} · ${
                isAutoLockedOpponent
                  ? 'Rival único contemplado en el bracket'
                  : st
                    ? `${st.posicion}° ${st.grupo} (${st.puntos} pts)`
                    : pair.grupo || 'Sin grupo'
              }`
            : n === 1
              ? 'Elige cualquier pareja (de Grupos o de Bracket)'
              : groupPhase
                ? 'De la misma categoría y grupo'
                : 'Según su llave del bracket o misma categoría'}
        </small>
        {pair && <span className='match-planner__change'>Cambiar</span>}
      </>
    )
  }

  return (
    <section className='match-planner sm:col-span-2' aria-label='Asistente de encuentros'>
      <header className='match-planner__header'>
        <div>
          <span className='match-planner__eyebrow'>
            {isElimination || activeCategoryBracketMeta?.hasBracket
              ? 'CREAR ENCUENTRO · FASE ELIMINATORIA (BRACKETS)'
              : 'CREAR ENCUENTRO'}
          </span>
          <h3>¿Quiénes van a jugar?</h3>
          <p>
            {isElimination || activeCategoryBracketMeta?.hasBracket
              ? 'Al filtrar por categoría o ronda se muestran únicamente las parejas clasificadas en esa ronda del bracket, y al elegir una se asigna automáticamente su único rival del cuadro.'
              : 'Si eliges una pareja en Fase de Grupos (ej. 4ta) podrás escoger su rival de grupo. Si eliges una de Bracket (ej. 5ta), se asignará su único rival contemplado en el cuadro.'}
          </p>
        </div>
        <div className='flex flex-col items-end gap-2'>
          {onOpenBracketBuilder ? (
            <button
              type='button'
              onClick={() => onOpenBracketBuilder(activeVisualCategoryId || categoryId || '')}
              className='btn-primary px-3 py-1.5 text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0'
              title='Configurar o generar las llaves eliminatorias de una categoría (16vos, Octavos, Cuartos, Semis o Final)'
            >
              <Trophy size={14} /> Armar / Editar Brackets
            </button>
          ) : (
            <Users size={24} aria-hidden='true' />
          )}
        </div>
      </header>

      {/* Barra rápida de Categorías con indicador de Grupos vs Bracket */}
      {categories.length > 0 && (
        <div className='px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] space-y-2'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]'>
              {isElimination
                ? 'Categoría en eliminación (filtra solo clasificados en esa categoría):'
                : 'Categorías del torneo (toca una para filtrar sus parejas o ver su bracket):'}
            </span>
          </div>
          <div className='flex flex-wrap gap-1.5'>
            <button
              type='button'
              onClick={() => handleCategoryPick('')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                !categoryFilter
                  ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--color-brand)]'
              }`}
            >
              Todas
            </button>
            {categories.map(([catId, catName]) => {
              const meta = bracketMetaByCategory.get(String(catId))
              const isSelectedCat = String(categoryFilter) === String(catId)
              return (
                <button
                  key={catId}
                  type='button'
                  onClick={() => handleCategoryPick(String(catId))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors inline-flex items-center gap-1.5 ${
                    isSelectedCat
                      ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                      : 'bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-[var(--color-brand)]'
                  }`}
                >
                  <span>{catName}</span>
                  {meta?.hasBracket ? (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                        isSelectedCat
                          ? 'bg-white/20 text-white'
                          : 'bg-emerald-500/15 text-[var(--color-brand)]'
                      }`}
                    >
                      En Eliminatoria ({meta.elimCount} llaves)
                    </span>
                  ) : (
                    <span className='text-[10px] opacity-75'>En Grupos</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Visualizador interactivo del Bracket directamente dentro de Crear Partido */}
      {isElimination && activeVisualBracket && activeVisualBracket.rounds.length > 0 && (
        <div className='p-3 rounded-2xl border border-emerald-500/35 bg-[var(--bg-input)] space-y-2.5'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              <Trophy size={15} className='text-[var(--color-brand)] shrink-0' />
              <div>
                <h4 className='text-xs font-extrabold text-[var(--text-primary)] m-0'>
                  Cuadro Eliminatorio (Bracket) · {activeCategoryBracketMeta?.nombre}
                </h4>
                <p className='text-[11px] text-[var(--text-secondary)] m-0'>
                  Filtra por ronda abajo o toca cualquier llave del árbol para cargarla en 1 clic.
                </p>
              </div>
            </div>
            {onOpenBracketBuilder && (
              <button
                type='button'
                onClick={() => onOpenBracketBuilder(activeVisualCategoryId)}
                className='btn-secondary px-2.5 py-1 text-[11px] font-bold inline-flex items-center gap-1'
              >
                <Sparkles size={12} /> Modificar cuadro
              </button>
            )}
          </div>

          {/* Píldoras de Rondas activas de este bracket */}
          {onRoundChange && (
            <div className='flex flex-wrap items-center gap-1.5 pt-1 border-t border-[var(--border-color)]'>
              <span className='text-[11px] font-bold text-[var(--text-secondary)] mr-1'>
                Filtrar por ronda del bracket:
              </span>
              <button
                type='button'
                onClick={() => {
                  onRoundChange('')
                  setBrowsing(true)
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                  !activeRoundKey
                    ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                    : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--color-brand)]'
                }`}
              >
                Todas las rondas
              </button>
              {activeVisualBracket.rounds.map((r) => {
                const isRoundSelected = activeRoundKey === r.key
                // Contar cuántas parejas definidas hay en esta ronda
                const teamsInRound = new Set()
                r.matches.forEach((m) => {
                  const s1 = resolveEffectiveParticipant(m, 1, allMatchesMap)
                  const s2 = resolveEffectiveParticipant(m, 2, allMatchesMap)
                  if (s1.id) teamsInRound.add(s1.id)
                  if (s2.id) teamsInRound.add(s2.id)
                })
                return (
                  <button
                    key={r.key}
                    type='button'
                    onClick={() => {
                      onRoundChange(r.label)
                      setBrowsing(true)
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors inline-flex items-center gap-1 ${
                      isRoundSelected
                        ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                        : 'bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-[var(--color-brand)]'
                    }`}
                  >
                    <span>{r.label}</span>
                    <span className='text-[10px] opacity-80'>
                      ({teamsInRound.size} {teamsInRound.size === 1 ? 'pareja' : 'parejas'})
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className='flex items-stretch gap-3 overflow-x-auto pb-1'>
            {activeVisualBracket.rounds
              .filter((r) => !activeRoundKey || r.key === activeRoundKey)
              .map((roundCol) => (
                <div
                  key={roundCol.key}
                  className='min-w-[215px] max-w-[260px] flex-1 flex flex-col gap-2'
                >
                  <div className='px-2.5 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between text-[11px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider'>
                    <span>{roundCol.label}</span>
                    <span className='text-[10px] text-[var(--color-brand)]'>
                      {roundCol.matches.length}{' '}
                      {roundCol.matches.length === 1 ? 'llave' : 'llaves'}
                    </span>
                  </div>
                  <div className='flex-1 flex flex-col justify-around gap-2'>
                    {roundCol.matches.map((m, idx) => {
                      const s1 = resolveEffectiveParticipant(m, 1, allMatchesMap)
                      const s2 = resolveEffectiveParticipant(m, 2, allMatchesMap)
                      const isSelectedMatch =
                        (linkedBracketMatchId && Number(linkedBracketMatchId) === Number(m.id)) ||
                        (firstBracketMatchup?.matchId &&
                          Number(firstBracketMatchup.matchId) === Number(m.id))
                      const wSide =
                        m.estado === 'finalizado'
                          ? m.ganador === 'jugador1'
                            ? 1
                            : m.ganador === 'jugador2'
                              ? 2
                              : 0
                          : 0
                      return (
                        <button
                          key={m.id}
                          type='button'
disabled={busy}
                          onClick={() => {
                            if (onSelectBracketMatch) {
                              onSelectBracketMatch(m, s1, s2)
                              setBrowsing(false)
                            }
                          }}
                          className={`w-full text-left p-2 rounded-xl border transition-all ${
                            isSelectedMatch
                              ? 'border-[var(--color-brand)] bg-emerald-500/12 shadow-sm ring-1 ring-[var(--color-brand)]'
                              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--color-brand)]'
                          }`}
                        >
                          <div className='flex items-center justify-between gap-1 text-[10px] font-extrabold mb-1'>
                            <span className='text-[var(--color-brand)]'>
                              {ROUND_SHORT[roundCol.key] || roundCol.label} #{idx + 1}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded ${
                                m.estado === 'finalizado'
                                  ? 'bg-emerald-500/15 text-[var(--color-brand)]'
                                  : m.fecha_inicio
                                    ? 'bg-sky-500/15 text-sky-400'
                                    : 'bg-amber-500/15 text-amber-400'
                              }`}
                            >
                              {m.estado === 'finalizado'
                                ? 'Finalizado'
                                : m.fecha_inicio
                                  ? `${m.fecha_inicio.slice(5)}${m.hora_inicio ? ` · ${m.hora_inicio.slice(0, 5)}` : ''}`
                                  : 'Por programar'}
                            </span>
                          </div>
                          <div className='space-y-1 text-xs'>
                            <div
                              className={`flex items-center justify-between gap-1 truncate ${
                                wSide === 1
                                  ? 'font-extrabold text-[var(--color-brand)]'
                                  : s1.type !== 'fijo'
                                    ? 'italic text-[var(--text-muted)]'
                                    : 'font-semibold text-[var(--text-primary)]'
                              }`}
                            >
                              <span className='truncate'>{s1.nombre}</span>
                              {wSide === 1 && <CheckCircle2 size={12} className='shrink-0' />}
                            </div>
                            <div
                              className={`flex items-center justify-between gap-1 truncate ${
                                wSide === 2
                                  ? 'font-extrabold text-[var(--color-brand)]'
                                  : s2.type !== 'fijo'
                                    ? 'italic text-[var(--text-muted)]'
                                    : 'font-semibold text-[var(--text-primary)]'
                              }`}
                            >
                              <span className='truncate'>{s2.nombre}</span>
                              {wSide === 2 && <CheckCircle2 size={12} className='shrink-0' />}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className='match-planner__steps' aria-label='Progreso del encuentro'>
        <span className={side1Ready ? 'is-done' : ''}>
          {side1Ready ? <Check size={14} /> : '1'} Primera pareja
        </span>
        <span className={side2Ready ? 'is-done' : ''}>
          {side2Ready ? <Check size={14} /> : '2'} Rival
        </span>
        <span>3 Programación</span>
      </div>
      <div className='match-planner__versus'>
        {[1, 2].map((n) => (
          <button
            key={n}
            type='button'
            disabled={busy || (n === 2 && !side1Ready)}
            className={`match-planner__slot ${side === n ? 'is-active' : ''}`}
            aria-pressed={side === n}
            onClick={() => {
              setSide(n)
              setQuery('')
              setGroupFilter('')
              setBrowsing(true)
            }}
          >
            {renderSlotContent(n)}
          </button>
        ))}
        <span className='match-planner__vs' aria-hidden='true'>
          VS
        </span>
      </div>

      {/* Banner informativo cuando la pareja elegida pertenece a un Bracket Eliminatorio */}
      {isElimination && first && firstBracketMatchup?.hasCategoryBracket && firstBracketMatchup?.inBracket && (
        <div className='p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 flex flex-wrap items-center justify-between gap-2 text-xs'>
          <div className='space-y-0.5'>
            <div className='font-extrabold text-[var(--color-brand)] flex items-center gap-1.5'>
              <Trophy size={14} />
              <span>
                Llave contemplada en el Bracket de {first.categoria_nombre} ({firstBracketMatchup.ronda}
                {firstBracketMatchup.orden_llave ? ` · Llave #${firstBracketMatchup.orden_llave}` : ''})
              </span>
            </div>
            <p className='text-[var(--text-secondary)] m-0'>
              En esta ronda del cuadro eliminatorio, <strong>{first.nombre}</strong> tiene como
              único cruce asignado a <strong>{firstBracketMatchup.opponentName}</strong>.
              {firstBracketMatchup.isFinalized
                ? ' (Esta llave ya figura finalizada; al continuar editarás su programación).'
                : ''}
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-1.5'>
            <button
              type='button'
              onClick={() => {
                setUnlockBracketRival(true)
                setSide(2)
                setBrowsing(true)
              }}
              className='btn-secondary px-2.5 py-1 text-[11px] font-bold'
            >
              {unlockBracketRival ? '✓ Rival desbloqueado' : 'Corregir / cambiar rival'}
            </button>
            <button
              type='button'
              onClick={() => setBrowsing((v) => !v)}
              className='btn-secondary px-2.5 py-1 text-[11px] font-bold'
            >
              {browsing ? 'Ocultar buscador' : 'Cambiar pareja'}
            </button>
          </div>
        </div>
      )}

      {ready && (
        <div role='status' className='match-planner__ready'>
          <Check size={18} />
          <span>
            <strong>
              {isElimination && firstBracketMatchup?.inBracket
                ? `Llave de ${firstBracketMatchup.ronda} lista para programar`
                : isElimination
                  ? 'Llave lista para programar'
                  : 'Encuentro seleccionado'}
            </strong>
            <small>
              {first?.categoria_nombre ||
                second?.categoria_nombre ||
                categories.find(([id]) => String(id) === String(categoryId))?.[1] ||
                'Categoría lista'}{' '}
              ·{' '}
              {isElimination && firstBracketMatchup?.inBracket
                ? `Bracket eliminatorio · ${firstBracketMatchup.ronda}`
                : groupPhase
                  ? group
                  : 'Cruce entre grupos permitido en esta fase'}
            </small>
          </span>
          <button
            type='button'
            className='btn-secondary'
            onClick={() =>
              onContinue ? onContinue() : document.querySelector('[name="fecha_inicio"]')?.focus()
            }
          >
            Programar <ArrowRight size={14} />
          </button>
        </div>
      )}
      {meetings.length > 0 && !(isElimination && firstBracketMatchup?.inBracket) && (
        <p role='status' className='match-planner__warning'>
          <AlertTriangle size={17} /> Estas parejas ya tienen {meetings.length} encuentro(s) en este
          torneo. Revisa si necesitas crear otro.
        </p>
      )}
      {(!ready || browsing) && (
        <div className='match-planner__body space-y-3'>
          {/* Cruces sugeridos 1° vs 2° en Fase Eliminatoria cuando aún no hay bracket creado */}
          {isElimination &&
            !activeCategoryBracketMeta?.hasBracket &&
            suggestedCrossings.length > 0 && (
              <div className='p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8 space-y-1.5'>
                <div className='flex items-center gap-1.5 text-[11px] font-extrabold text-[var(--color-brand)]'>
                  <Wand2 size={13} />
                  <span>
                    Cruces sugeridos de Grupos (1° vs 2°) — Toca uno para llenar ambos lados:
                  </span>
                </div>
                <div className='flex flex-wrap gap-1.5'>
                  {suggestedCrossings.map((cr) => (
                    <button
                      key={cr.key}
                      type='button'
                      onClick={() => {
                        onFirst(cr.p1)
                        onSecond(cr.p2)
                        setBrowsing(false)
                      }}
                      className='px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--color-brand)] text-left transition-all'
                    >
                      <span className='text-[var(--color-brand)] font-extrabold'>{cr.label}:</span>{' '}
                      <span>{cr.p1.nombre}</span> <span className='opacity-60'>vs</span>{' '}
                      <span>{cr.p2.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

          {/* En Fase Eliminatoria: Pestañas rápidas para elegir Pareja, Ganador de llave previa o Por definir */}
          {isElimination && (onSourceSelect || onPendingSelect) && (
            <div className='flex flex-wrap items-center justify-between gap-2 pb-1'>
              <span className='text-xs font-extrabold text-[var(--text-secondary)]'>
                Configurando {side === 1 ? 'Lado 1 (Primera pareja)' : 'Lado 2 (Rival)'}:
              </span>
              <div className='flex flex-wrap gap-1.5'>
                <button
                  type='button'
                  onClick={() => setSlotInputTab('pair')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1 ${
                    slotInputTab === 'pair'
                      ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                      : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-color)]'
                  }`}
                >
                  <Users size={12} /> Pareja inscrita
                </button>
                {onSourceSelect && (
                  <button
                    type='button'
                    onClick={() => setSlotInputTab('source')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1 ${
                      slotInputTab === 'source'
                        ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                        : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-color)]'
                    }`}
                  >
                    <GitBranch size={12} /> Ganador de llave previa ({sourceMatches.length})
                  </button>
                )}
                {onPendingSelect && (
                  <button
                    type='button'
                    onClick={() => {
                      onPendingSelect(side)
                      if (side === 1) setSide(2)
                      else setBrowsing(false)
                    }}
                    className='px-2.5 py-1 rounded-lg text-xs font-bold border bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--color-brand)] inline-flex items-center gap-1'
                  >
                    <Clock size={12} /> Dejar «Por definir»
                  </button>
                )}
              </div>
            </div>
          )}

          {isElimination && slotInputTab === 'source' && onSourceSelect ? (
            <div className='space-y-2'>
              <p className='text-xs text-[var(--text-secondary)]'>
                Selecciona de qué llave previa saldrá el clasificado para el{' '}
                <strong>{side === 1 ? 'Lado 1' : 'Lado 2'}</strong>:
              </p>
              {sourceMatches.length === 0 ? (
                <div className='match-planner__empty'>
                  <GitBranch size={22} />
                  <strong>No hay llaves previas en esta categoría todavía</strong>
                  <p>
                    Primero selecciona la categoría arriba o crea las llaves de la ronda anterior
                    (o usa «Armar / Editar Brackets»).
                  </p>
                </div>
              ) : (
                <div className='match-planner__results'>
                  {sourceMatches.map((m) => (
                    <button
                      key={m.id}
                      type='button'
                      onClick={() => {
                        onSourceSelect(side, m)
                        setSlotInputTab('pair')
                        if (side === 1) setSide(2)
                        else setBrowsing(false)
                      }}
                      className='match-planner__result'
                    >
                      <span className='match-planner__avatar' aria-hidden='true'>
                        #{m.id}
                      </span>
                      <span className='match-planner__person'>
                        <strong>Ganador: {getMatchupLabel(m)}</strong>
                        <small>
                          {m.ronda || 'Eliminatoria'} · {m.categoria?.nombre || 'Categoría'} · Estado:{' '}
                          {m.estado}
                        </small>
                      </span>
                      <ArrowRight size={16} aria-hidden='true' />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <label className='form-label' htmlFor='quick-pair-search'>
                {side === 1
                  ? round && (isElimination || activeCategoryBracketMeta?.hasBracket)
                    ? `Parejas en ${round}${activeCategoryBracketMeta?.nombre ? ` · ${activeCategoryBracketMeta.nombre}` : ''}`
                    : activeCategoryBracketMeta?.hasBracket
                      ? `Parejas en fase de eliminación · ${activeCategoryBracketMeta.nombre}`
                      : 'Encuentra la primera pareja'
                  : isElimination && firstBracketMatchup?.inBracket
                    ? `Rival contemplado en el bracket de ${first?.categoria_nombre} (${firstBracketMatchup.ronda})`
                    : 'Busca un rival compatible'}
              </label>
              <div className='match-planner__search'>
                <Search size={18} />
                <input
                  ref={input}
                  id='quick-pair-search'
                  value={query}
                  disabled={busy || loading}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='Nombre, apellido o pareja…'
                />
              </div>
              <div className='match-planner__filters'>
                <select
                  aria-label='Filtrar parejas por categoría'
                  className='form-input'
                  value={categoryFilter}
                  disabled={busy}
                  onChange={(e) => handleCategoryPick(e.target.value)}
                >
                  <option value=''>Todas las categorías</option>
                  {categories.map(([id, name]) => {
                    const meta = bracketMetaByCategory.get(String(id))
                    return (
                      <option key={id} value={id}>
                        {name} {meta?.hasBracket ? '· En Eliminatoria' : '· En Grupos'}
                      </option>
                    )
                  })}
                </select>
                {useGroups && !isElimination && (
                  <select
                    aria-label='Filtrar parejas por grupo'
                    className='form-input'
                    value={groupFilter}
                    disabled={busy}
                    onChange={(e) => setGroupFilter(e.target.value)}
                  >
                    <option value=''>Todos los grupos</option>
                    {groups.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className='match-planner__results-title'>
                <span>
                  {side === 2
                    ? 'Rivales compatibles'
                    : round && isElimination
                      ? `Parejas en ${round}`
                      : isElimination
                        ? 'Parejas en eliminación'
                        : 'Parejas'}{' '}
                  · {visible.length}
                </span>
                <div className='flex flex-wrap items-center gap-3'>
                  {isElimination &&
                    !activeCategoryBracketMeta?.hasBracket &&
                    standingBadgeByTeam.size > 0 && (
                      <label className='cursor-pointer font-bold text-[var(--color-brand)]'>
                        <input
                          type='checkbox'
                          checked={onlyQualified}
                          onChange={(e) => setOnlyQualified(e.target.checked)}
                        />{' '}
🏅 Solo clasificados (1° y 2°)
                      </label>
                    )}
                  <label className='cursor-pointer'>
                    <input
                      type='checkbox'
                      checked={showUnavailable}
                      onChange={(e) => setShowUnavailable(e.target.checked)}
                    />{' '}
                    Ver no disponibles
                  </label>
                </div>
              </div>
              {error ? (
                <p role='alert' className='form-error'>
                  {error}{' '}
                  <button type='button' onClick={onRetry} className='underline'>
                    Reintentar
                  </button>
                </p>
              ) : loading ? (
                <p role='status'>Consultando inscripciones y grupos…</p>
              ) : (
                <div className='match-planner__results' aria-label='Parejas encontradas'>
                  {visible
                    .slice(0, limit)
                    .map(({ pair, standing, bracketInfo, reason, meetings: history }) => (
                      <button
                        type='button'
                        key={choiceKey(pair)}
                        disabled={busy || Boolean(reason)}
                        onClick={() => select(pair, bracketInfo)}
                        className='match-planner__result'
                      >
                        <span className='match-planner__avatar' aria-hidden='true'>
                          {(pair.jugador1?.apellido || pair.nombre || '?').slice(0, 1)}
                          {(pair.jugador2?.apellido || '').slice(0, 1)}
                        </span>
                        <span className='match-planner__person'>
                          <strong>{pair.nombre}</strong>
                          <small>{pairText({ ...pair, nombre: '' })}</small>
                          <span className='match-planner__tags'>
                            <span>{pair.categoria_nombre}</span>
                            {bracketInfo?.hasCategoryBracket ? (
                              bracketInfo.inBracket && bracketInfo.inSelectedRound ? (
                                <span
                                  style={{
                                    background: 'var(--color-brand-dim)',
                                    color: 'var(--color-brand)',
                                    fontWeight: 800,
                                  }}
                                >
                                  {bracketInfo.ronda}: vs {bracketInfo.opponentName}
                                </span>
                              ) : bracketInfo.inBracket ? (
                                <span className='opacity-75'>
                                  En bracket ({bracketInfo.roundsPlayed || 'otra ronda'})
                                </span>
                              ) : (
                                <span className='opacity-60'>Fuera del bracket</span>
                              )
                            ) : standing ? (
                              <span
                                style={{
                                  background: standing.qualified
                                    ? 'var(--color-brand-dim)'
                                    : undefined,
                                  color: standing.qualified ? 'var(--color-brand)' : undefined,
                                  fontWeight: standing.qualified ? 800 : 600,
                                }}
                              >
                                {standing.posicion === 1
                                  ? '🥇 '
                                  : standing.posicion === 2
                                    ? '🥈 '
                                    : ''}
                                {standing.posicion}° {standing.grupo} ({standing.puntos} pts)
                              </span>
                            ) : (
                              <span>{pair.grupo || 'Sin grupo asignado'}</span>
                            )}
                          </span>
                          {reason && <small>{reason}</small>}
                          {history.length > 0 && !bracketInfo?.hasCategoryBracket && (
                            <small className='match-planner__history'>
                              {history.length} cruce(s) existente(s) ·{' '}
                              {history.some((m) => m.estado === 'finalizado')
                                ? 'Incluye finalizados'
                                : 'Pendiente / en curso'}
                            </small>
                          )}
                        </span>
                        {!reason && <ArrowRight size={16} aria-hidden='true' />}
                      </button>
                    ))}
                  {!visible.length && (
                    <div className='match-planner__empty'>
                      <Users size={24} />
                      <strong>
                        {query
                          ? 'Sin coincidencias'
                          : side === 2
                            ? 'No hay otros rivales compatibles en este cruce'
                            : round
                              ? `No hay parejas clasificadas en ${round} para esta selección`
                              : 'No hay parejas disponibles en esta selección'}
                      </strong>
                      <p>
                        {side === 2 && isElimination && firstBracketMatchup?.inBracket
                          ? `En el bracket de ${first?.categoria_nombre} (${firstBracketMatchup.ronda}), ${first?.nombre} solo puede enfrentarse a ${firstBracketMatchup.opponentName}.`
                          : round && activeVisualBracket?.rounds?.length
                            ? `Las rondas activas en el bracket de ${activeCategoryBracketMeta?.nombre || 'esta categoría'} son: ${activeVisualBracket.rounds.map((r) => r.label).join(', ')}. Selecciona una de esas rondas arriba.`
                            : 'Selecciona otra categoría o ronda, o marca «Ver no disponibles» para revisar el motivo.'}
                      </p>
                    </div>
                  )}
                  {visible.length > limit && (
                    <button
                      type='button'
                      className='btn-secondary w-full'
                      onClick={() => setLimit((n) => n + 12)}
                    >
                      Mostrar más ({visible.length - limit})
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
      <footer className='match-planner__footer'>
        <button type='button' disabled={busy} onClick={onManual}>
          <SlidersHorizontal size={15} /> Selección manual / ganador de otro partido
        </button>
        {(firstId ||
          secondId ||
          firstSourceId ||
          secondSourceId ||
          firstMode === 'por_definir' ||
          secondMode === 'por_definir') && (
          <button type='button' disabled={busy} onClick={onClear}>
            Limpiar selección
          </button>
        )}
      </footer>
    </section>
  )
}
