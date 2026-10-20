import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Trophy,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Edit3,
  PlusCircle,
  CheckCircle2,
  GitBranch,
  LayoutList,
  X,
  Calendar,
  Clock,
  MapPin,
  ShieldCheck,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { buildBracket, bracketSlot, categoryKey, sourceId } from '../../utils/tournamentBracket'
import { getParticipantName } from '../../utils/matchParticipants'
import { formatDate, formatClockTime } from '../../utils/formatDate'
import { downloadBracketPng, shareOrDownloadBracketPng } from '../../utils/bracketImageExporter'
import { matchService } from '../../services/matchService'
import { tournamentService } from '../../services/tournamentService'
import { categoriaService } from '../../services/categoriaService'
import { teamService } from '../../services/teamService'
import { playerService } from '../../services/playerService'
import { sedeService } from '../../services/sedeService'
import useUIStore from '../../store/useUIStore'
import useAuthStore from '../../store/useAuthStore'
import ParticipantAvatar from '../ui/ParticipantAvatar'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import './TournamentBracket.css'

const STARTING_ROUNDS = [
  { key: 'Dieciseisavos', label: 'Dieciseisavos de final', short: '16vos', matches: 16, slots: 32 },
  { key: 'Octavos de final', label: 'Octavos de final', short: 'Octavos', matches: 8, slots: 16 },
  { key: 'Cuartos de final', label: 'Cuartos de final', short: 'Cuartos', matches: 4, slots: 8 },
  { key: 'Semifinales', label: 'Semifinales', short: 'Semis', matches: 2, slots: 4 },
  { key: 'Final', label: 'Final directa', short: 'Final', matches: 1, slots: 2 },
]

const ROUND_OPTIONS = [
  'Dieciseisavos',
  'Octavos de final',
  'Cuartos de final',
  'Semifinales',
  'Final',
  'Tercer puesto',
]

const ROUND_SHORT_CODE = {
  Dieciseisavos: '16F',
  'Octavos de final': '8F',
  'Cuartos de final': 'CF',
  Semifinales: 'SF',
  Final: 'FIN',
  'Tercer puesto': '3P',
}

const DEFAULT_SUPERGAME_FORMAT = {
  mejor_de_sets: '3',
  juegos_por_set: '6',
  diferencia_juegos: '2',
  modo_game: 'ventaja',
  set_decisivo: 'set_completo',
  tiebreak_en: '6',
  tiebreak_puntos: '7',
  match_tiebreak_puntos: '10',
  servidor_inicial: 'jugador1',
}

function getDefaultSlotsForRound(roundKey) {
  const found = STARTING_ROUNDS.find((r) => r.key === roundKey) || STARTING_ROUNDS[2]
  return Array.from({ length: found.matches }, (_, idx) => ({
    index: idx,
    participante1_id: '',
    participante2_id: '',
    pase_directo_lado: 0,
    fecha_inicio: '',
    hora_inicio: '',
    cancha_id: '',
  }))
}

function ScoringConfigPanel({ value, onChange }) {
  const cfg = { ...DEFAULT_SUPERGAME_FORMAT, ...(value || {}) }
  const update = (patch) => onChange({ ...cfg, ...patch })
  const isSuperGame = cfg.set_decisivo === 'set_completo'

  return (
    <div
      className='rounded-2xl p-4 space-y-3 border border-[var(--border-color)]'
      style={{ backgroundColor: 'var(--bg-input)' }}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <SlidersHorizontal className='w-4 h-4' style={{ color: 'var(--color-brand)' }} />
          <div>
            <p className='text-xs sm:text-sm font-extrabold text-[var(--text-primary)] m-0'>
              Formato de puntuación
            </p>
            <p className='text-[11px] mt-0.5 m-0' style={{ color: 'var(--text-muted)' }}>
              Configurable por partido. El control del juez aplicará estas reglas (por defecto Super Game).
            </p>
          </div>
        </div>
        <span className='badge-brand text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1'>
          {isSuperGame ? 'Super Game (3er set completo)' : 'Normal (Supertiebreak)'}
        </span>
      </div>

      <div className='flex flex-col sm:flex-row gap-2'>
        <button
          type='button'
          onClick={() =>
            update({
              mejor_de_sets: '3',
              juegos_por_set: '6',
              diferencia_juegos: '2',
              modo_game: 'ventaja',
              set_decisivo: 'match_tiebreak',
              tiebreak_en: '6',
              tiebreak_puntos: '7',
              match_tiebreak_puntos: '10',
            })
          }
          className='flex-1 rounded-xl px-3 py-2.5 text-xs font-extrabold transition-all'
          style={{
            backgroundColor:
              cfg.set_decisivo === 'match_tiebreak'
                ? 'var(--color-brand-dim)'
                : 'var(--bg-card)',
            color:
              cfg.set_decisivo === 'match_tiebreak'
                ? 'var(--color-brand)'
                : 'var(--text-muted)',
            border:
              cfg.set_decisivo === 'match_tiebreak'
                ? '1.5px solid var(--color-brand)'
                : '1px solid var(--border-color)',
          }}
        >
          Normal (3er set = Supertiebreak)
        </button>
        <button
          type='button'
          onClick={() =>
            update({
              mejor_de_sets: '3',
              juegos_por_set: '6',
              diferencia_juegos: '2',
              modo_game: 'ventaja',
              set_decisivo: 'set_completo',
              tiebreak_en: '6',
              tiebreak_puntos: '7',
              match_tiebreak_puntos: '10',
            })
          }
          className='flex-1 rounded-xl px-3 py-2.5 text-xs font-extrabold transition-all'
          style={{
            backgroundColor:
              cfg.set_decisivo === 'set_completo'
                ? 'var(--color-brand-dim)'
                : 'var(--bg-card)',
            color:
              cfg.set_decisivo === 'set_completo'
                ? 'var(--color-brand)'
                : 'var(--text-muted)',
            border:
              cfg.set_decisivo === 'set_completo'
                ? '1.5px solid var(--color-brand)'
                : '1px solid var(--border-color)',
          }}
        >
          Super Game (3er set completo)
        </button>
      </div>

      <div className='grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1'>
        <label className='block space-y-1'>
          <span className='text-[11px] font-bold text-[var(--text-secondary)]'>Mejor de</span>
          <select
            className='ucl-builder-control'
            value={String(cfg.mejor_de_sets)}
            onChange={(e) => update({ mejor_de_sets: e.target.value })}
          >
            <option value='1'>1 set</option>
            <option value='3'>3 sets</option>
            <option value='5'>5 sets</option>
          </select>
        </label>
        <label className='block space-y-1'>
          <span className='text-[11px] font-bold text-[var(--text-secondary)]'>Juegos por set</span>
          <input
            type='number'
            min='1'
            max='12'
            className='ucl-builder-control'
            value={cfg.juegos_por_set}
            onChange={(e) => update({ juegos_por_set: e.target.value })}
          />
        </label>
        <label className='block space-y-1'>
          <span className='text-[11px] font-bold text-[var(--text-secondary)]'>
            Diferencia de juegos
          </span>
          <input
            type='number'
            min='1'
            max='6'
            className='ucl-builder-control'
            value={cfg.diferencia_juegos}
            onChange={(e) => update({ diferencia_juegos: e.target.value })}
          />
        </label>
        <label className='block space-y-1'>
          <span className='text-[11px] font-bold text-[var(--text-secondary)]'>Games</span>
          <select
            className='ucl-builder-control'
            value={cfg.modo_game}
            onChange={(e) => update({ modo_game: e.target.value })}
          >
            <option value='ventaja'>Con ventaja</option>
            <option value='sin_ventaja'>Punto decisivo</option>
          </select>
        </label>
        <label className='block space-y-1'>
          <span className='text-[11px] font-bold text-[var(--text-secondary)]'>Set decisivo</span>
          <select
            className='ucl-builder-control'
            value={cfg.set_decisivo}
            onChange={(e) => update({ set_decisivo: e.target.value })}
          >
            <option value='set_completo'>Set completo</option>
            <option value='match_tiebreak'>Match tiebreak</option>
          </select>
        </label>
        <label className='block space-y-1'>
          <span className='text-[11px] font-bold text-[var(--text-secondary)]'>Tiebreak en</span>
          <input
            type='number'
            min='0'
            max='12'
            className='ucl-builder-control'
            value={cfg.tiebreak_en}
            onChange={(e) => update({ tiebreak_en: e.target.value })}
          />
          <span className='block text-[10px]' style={{ color: 'var(--text-muted)' }}>
            Usa 0 para jugar sin tiebreak.
          </span>
        </label>
        <label className='block space-y-1'>
          <span className='text-[11px] font-bold text-[var(--text-secondary)]'>Tiebreak a</span>
          <input
            type='number'
            min='5'
            max='99'
            className='ucl-builder-control'
            value={cfg.tiebreak_puntos}
            onChange={(e) => update({ tiebreak_puntos: e.target.value })}
          />
        </label>
        <label className='block space-y-1'>
          <span className='text-[11px] font-bold text-[var(--text-secondary)]'>
            Match tiebreak a
          </span>
          <input
            type='number'
            min='5'
            max='99'
            className='ucl-builder-control'
            value={cfg.match_tiebreak_puntos}
            onChange={(e) => update({ match_tiebreak_puntos: e.target.value })}
          />
        </label>
        <label className='block space-y-1'>
          <span className='text-[11px] font-bold text-[var(--text-secondary)]'>
            Primer servidor
          </span>
          <select
            className='ucl-builder-control'
            value={cfg.servidor_inicial}
            onChange={(e) => update({ servidor_inicial: e.target.value })}
          >
            <option value='jugador1'>Participante 1</option>
            <option value='jugador2'>Participante 2</option>
          </select>
        </label>
      </div>
    </div>
  )
}

export default function TournamentBracket({
  matches = [],
  system,
  management: managementProp = false,
  tournament = null,
  onRefresh = null,
  initialOpenBuilder = false,
}) {
  const [searchParams] = useSearchParams()
  const darkMode = useUIStore((s) => s.darkMode)
  const isAdmin = useAuthStore((s) => Boolean(s.isAuthenticated && s.user?.rol === 'admin'))
  const management = Boolean(managementProp && isAdmin)
  const initialCatParam = searchParams.get('categoria') || ''
  const autoOpenParam = searchParams.get('armar') === '1' || initialOpenBuilder
  const didAutoOpenRef = useRef(false)
  const treeScrollRef = useRef(null)
  const treeBoardRef = useRef(null)
  const [connectorPaths, setConnectorPaths] = useState([])
  const roundColRefs = useRef({})

  const [category, setCategory] = useState(initialCatParam)
  const [roundKey, setRoundKey] = useState('')
  // Por defecto mostramos el árbol de brackets compacto ("tree") tanto en móvil como en PC
  const [mobileViewMode, setMobileViewMode] = useState('tree') // 'tree' | 'rounds'
  const [zoomOut, setZoomOut] = useState(false)
  const [selectedMatchDetail, setSelectedMatchDetail] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [feedback, setFeedback] = useState(null)

  // Datos auxiliares para armar el cuadro y editar llaves
  const [standingsData, setStandingsData] = useState(null)
  const [inscripcionesData, setInscripcionesData] = useState(null)
  const [catalogCategories, setCatalogCategories] = useState([])
  const [participantsPool, setParticipantsPool] = useState([])
  const [courts, setCourts] = useState([])

  // Modal: Generador / Configurador de Cuadro por Categoría
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderStartRound, setBuilderStartRound] = useState('Cuartos de final')
  const [builderThirdPlace, setBuilderThirdPlace] = useState(false)
  const [builderReplaceScheduled, setBuilderReplaceScheduled] = useState(true)
  const [builderExpectedMatches, setBuilderExpectedMatches] = useState([])
  const [builderSlots, setBuilderSlots] = useState(() => getDefaultSlotsForRound('Cuartos de final'))
  const [builderScoring, setBuilderScoring] = useState(() => ({ ...DEFAULT_SUPERGAME_FORMAT }))
  const [builderBusy, setBuilderBusy] = useState(false)
  const [builderError, setBuilderError] = useState('')

  // Modal: Editor Manual de Llave Individual / Clasificado Manual
  const [editingMatch, setEditingMatch] = useState(null)
  const [slotForm, setSlotForm] = useState({
    modo_lado1: 'fijo',
    participante1_id: '',
    origen_partido1_id: '',
    modo_lado2: 'fijo',
    participante2_id: '',
    origen_partido2_id: '',
    ganador_manual: '',
    finalizar_manual: false,
    reabrir_partido: false,
    partido_siguiente_id: '',
    lado_siguiente: 1,
    ronda: 'Cuartos de final',
    fecha_inicio: '',
    hora_inicio: '',
    cancha_id: '',
    notas: '',
    ...DEFAULT_SUPERGAME_FORMAT,
  })
  const [slotSaving, setSlotSaving] = useState(false)
  const [slotError, setSlotError] = useState('')
  const [contextReady, setContextReady] = useState(false)
  const builderDialogRef = useDialogFocus(builderOpen, () => setBuilderOpen(false), builderBusy)
  const slotDialogRef = useDialogFocus(Boolean(editingMatch), () => setEditingMatch(null), slotSaving)
  const detailDialogRef = useDialogFocus(Boolean(selectedMatchDetail), () => setSelectedMatchDetail(null), false)
  const dialogOpen = Boolean(builderOpen || editingMatch || selectedMatchDetail)
  useEffect(() => {
    if (!dialogOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [dialogOpen])

  const isDoubles =
    tournament?.modalidad === 'dobles' ||
    matches.some((m) => m.modalidad === 'dobles' || m.equipo1?.id || m.equipo2?.id)
  const sport = tournament?.deporte || matches[0]?.deporte || 'tenis'

  useEffect(() => {
    let active = true
    const loadContext = async () => {
      try {
        const promises = [
          tournament?.id
            ? tournamentService.getStandings(tournament.id, management).catch(() => null)
            : Promise.resolve(null),
          categoriaService.getAll({ deporte: sport }).catch(() => ({ data: [] })),
          tournament?.id && isDoubles
            ? tournamentService.getInscripciones(tournament.id).catch(() => null)
            : Promise.resolve(null),
        ]
        if (management) {
          promises.push(
            isDoubles
              ? teamService.getAll({ deporte: sport }).catch(() => ({ data: [] }))
              : playerService.getAll({ activo: true }).catch(() => ({ data: [] })),
            sedeService.getAll().catch(() => ({ data: [] }))
          )
        }
        const [stRes, catRes, inscRes, poolRes, sedesRes] = await Promise.all(promises)
        if (!active) return
        if (stRes?.data) setStandingsData(stRes.data)
        if (Array.isArray(catRes?.data)) setCatalogCategories(catRes.data)
        if (inscRes?.data) setInscripcionesData(inscRes.data)
        if (Array.isArray(poolRes?.data)) setParticipantsPool(poolRes.data)
        if (Array.isArray(sedesRes?.data)) {
          const allCourts = sedesRes.data.flatMap((s) =>
            (s.canchas || [])
              .filter(
                (c) =>
                  c.activa !== false &&
                  (!sport || c.deporte === sport || c.deporte === 'ambos')
              )
              .map((c) => ({ ...c, sede_nombre: s.nombre }))
          )
          setCourts(allCourts)
        }
      } catch {
        // ignore background catalog errors
      }
    }
    loadContext()
    return () => {
      active = false
    }
  }, [tournament?.id, management, isDoubles, sport])

  const knockoutCountByCat = useMemo(() => {
    const counts = new Map()
    for (const m of matches) {
      const isElim =
        system === 'eliminacion_directa' ||
        String(m.fase || '').toLowerCase() === 'eliminacion'
      if (!isElim) continue
      const k = categoryKey(m)
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    return counts
  }, [matches, system])

  const categories = useMemo(() => {
    const map = new Map()
    for (const m of matches) {
      const k = categoryKey(m)
      if (k && k !== 'unassigned') {
        map.set(k, m.categoria?.nombre || 'Sin categoría asignada')
      }
    }
    for (const c of standingsData?.categorias || []) {
      if (c?.id) map.set(String(c.id), c.nombre)
    }
    for (const c of inscripcionesData?.categorias || []) {
      if (c?.id) map.set(String(c.id), c.nombre)
    }
    if (tournament?.categoria?.id) {
      map.set(String(tournament.categoria.id), tournament.categoria.nombre)
    }
    if (map.size === 0 && catalogCategories.length > 0) {
      for (const c of catalogCategories) {
        map.set(String(c.id), c.nombre)
      }
    }
    if (map.size === 0 && matches.length > 0) {
      for (const m of matches) {
        map.set(categoryKey(m), m.categoria?.nombre || 'Sin categoría asignada')
      }
    }
    return [...map.entries()].sort((a, b) => {
      const aHas = (knockoutCountByCat.get(a[0]) || 0) > 0 ? 1 : 0
      const bHas = (knockoutCountByCat.get(b[0]) || 0) > 0 ? 1 : 0
      if (aHas !== bHas) return bHas - aHas
      return a[1].localeCompare(b[1], 'es', { numeric: true })
    })
  }, [matches, standingsData, inscripcionesData, tournament, catalogCategories, knockoutCountByCat])

  const categoriesWithBrackets = useMemo(
    () => categories.filter(([id]) => (knockoutCountByCat.get(id) || 0) > 0),
    [categories, knockoutCountByCat]
  )

  const selected = useMemo(() => {
    if (categories.some(([id]) => id === category)) return category
    const withBracket = categories.find(([id]) => (knockoutCountByCat.get(id) || 0) > 0)
    return withBracket?.[0] || categories[0]?.[0] || ''
  }, [categories, category, knockoutCountByCat])

  const selectedCategoryName = useMemo(
    () => categories.find(([id]) => id === selected)?.[1] || 'Categoría',
    [categories, selected]
  )

  const bracket = useMemo(
    () => buildBracket(matches, system, selected),
    [matches, system, selected]
  )
  const { rounds } = bracket

  const mainTreeRounds = useMemo(
    () => rounds.filter((r) => r.order <= 5),
    [rounds]
  )
  const thirdPlaceRounds = useMemo(
    () => rounds.filter((r) => r.order > 5),
    [rounds]
  )

  // Mapa rápido de código corto de cada llave (ej. CF-1, SF-1, FIN)
  const matchTagMap = useMemo(() => {
    const map = new Map()
    rounds.forEach((r) => {
      const code = ROUND_SHORT_CODE[r.label] || 'L'
      r.matches.forEach((m, idx) => {
        map.set(
          Number(m.id),
          r.label === 'Final'
            ? 'FINAL'
            : r.label === 'Tercer puesto'
              ? '3° PUESTO'
              : `${code}-${idx + 1}`
        )
      })
    })
    return map
  }, [rounds])

  const current = Math.max(
    0,
    rounds.findIndex((r) => r.key === roundKey)
  )

  const championInfo = useMemo(() => {
    const finalRound = rounds.find((r) => r.key === 'Final' || r.label === 'Final')
    const finalMatch = finalRound?.matches?.[0]
    if (!finalMatch || finalMatch.estado !== 'finalizado' || !finalMatch.ganador) return null
    const winSide =
      finalMatch.ganador === 'jugador1'
        ? 1
        : finalMatch.ganador === 'jugador2'
          ? 2
          : Number(finalMatch.ganador)
    if (winSide !== 1 && winSide !== 2) return null
    return {
      name: getParticipantName(finalMatch, winSide),
      match: finalMatch,
      side: winSide,
    }
  }, [rounds])

  const categoryGroupsSummary = useMemo(() => {
    if (!standingsData || !selected) return []
    const catObj = (standingsData.categorias || []).find(
      (c) => String(c.id) === String(selected)
    )
    if (!catObj || !Array.isArray(catObj.grupos)) return []
    return catObj.grupos.map((g) => ({
      clave: g.clave,
      nombre: g.nombre,
      rows: standingsData.grupos?.[g.clave] || [],
    }))
  }, [standingsData, selected])

  const categoryParticipants = useMemo(() => {
    const map = new Map()
    categoryGroupsSummary.forEach((grp) => {
      grp.rows.forEach((r) => {
        const pid = Number(r.participante?.id || r.id)
        if (!pid) return
        map.set(pid, {
          id: pid,
          nombre: r.participante?.nombre || `Participante #${pid}`,
          badge: `${r.posicion}° ${grp.nombre}`,
          posicion: r.posicion,
          grupo: grp.nombre,
          puntos: r.puntos,
        })
      })
    })

    // Parejas inscritas en el torneo para esta categoría
    const inscCat = (inscripcionesData?.categorias || []).find(
      (c) => String(c.id) === String(selected)
    )
    for (const p of inscCat?.parejas || []) {
      const pid = Number(p.equipo_id || p.id)
      if (!pid || map.has(pid)) continue
      map.set(pid, {
        id: pid,
        nombre: p.nombre || `Pareja #${pid}`,
        badge: p.grupo ? `Grupo ${p.grupo}` : 'Inscrita',
      })
    }

    matches
      .filter((m) => categoryKey(m) === String(selected))
      .forEach((m) => {
        ;[1, 2].forEach((side) => {
          const ent = isDoubles ? m[`equipo${side}`] : m[`jugador${side}`]
          if (ent?.id && !map.has(Number(ent.id))) {
            map.set(Number(ent.id), {
              id: Number(ent.id),
              nombre: getParticipantName(m, side),
              badge: 'En categoría',
            })
          }
        })
      })
    participantsPool.forEach((p) => {
      const pid = Number(p.id)
      if (!pid || map.has(pid)) return
      const catId = p.categoria_id || p.categoria?.id
      if (catId && String(catId) !== String(selected)) return
      const fullName = p.nombre
        ? p.apellido
          ? `${p.nombre} ${p.apellido}`
          : p.nombre
        : `Participante #${pid}`
      map.set(pid, {
        id: pid,
        nombre: fullName,
        badge: catId ? 'Del club' : '',
      })
    })
    return [...map.values()]
  }, [categoryGroupsSummary, inscripcionesData, matches, selected, isDoubles, participantsPool])

  const scrollToRoundColumn = (rKey) => {
    setRoundKey(rKey)
    const colEl = roundColRefs.current[rKey]
    const scrollEl = treeScrollRef.current
    if (colEl && scrollEl) {
      const left = Math.max(0, colEl.offsetLeft - 12)
      scrollEl.scrollTo({ left, behavior: 'smooth' })
    }
  }

  const buildRecommendedSlotsFromGroups = (groupsList, roundKey) => {
    const firsts = []
    const seconds = []
    groupsList.forEach((g) => {
      if (g.rows?.[0]) firsts.push(g.rows[0].participante?.id || g.rows[0].id)
      if (g.rows?.[1]) seconds.push(g.rows[1].participante?.id || g.rows[1].id)
    })
    const reversedSeconds = [...seconds].reverse()
    const nextSlots = getDefaultSlotsForRound(roundKey)
    for (let i = 0; i < nextSlots.length; i++) {
      const p1 = firsts[i] || ''
      const p2 =
        reversedSeconds[i] ||
        (i >= firsts.length ? firsts[i] : '') ||
        ''
      nextSlots[i] = {
        ...nextSlots[i],
        participante1_id: p1 ? String(p1) : '',
        participante2_id: p2 && String(p2) !== String(p1) ? String(p2) : '',
        pase_directo_lado: p1 && !p2 ? 1 : 0,
      }
    }
    return nextSlots
  }

  const getRecommendedRoundForGroups = (groupCount) => {
    if (groupCount === 1) return 'Final'
    if (groupCount === 2) return 'Semifinales'
    if (groupCount >= 3 && groupCount <= 4) return 'Cuartos de final'
    if (groupCount >= 5 && groupCount <= 8) return 'Octavos de final'
    if (groupCount > 8) return 'Dieciseisavos'
    return 'Cuartos de final'
  }

  const populateBuilderForCategory = (targetCatId) => {
    const catIdToUse =
      (typeof targetCatId === 'string' || typeof targetCatId === 'number') &&
      String(targetCatId).trim() !== '' &&
      !String(targetCatId).includes('object')
        ? String(targetCatId)
        : String(selected || '')
    const catBracket = buildBracket(matches, system, catIdToUse)
    const catMainRounds = catBracket.rounds.filter((r) => r.order <= 5)
    const catThirdRounds = catBracket.rounds.filter((r) => r.order > 5)
    const existingFirstRound = catMainRounds[0]?.key

    const catObj = (standingsData?.categorias || []).find(
      (c) => String(c.id) === String(catIdToUse)
    )
    const catGroups =
      catObj && Array.isArray(catObj.grupos)
        ? catObj.grupos.map((g) => ({
            clave: g.clave,
            nombre: g.nombre,
            rows: standingsData?.grupos?.[g.clave] || [],
          }))
        : []

    const defaultRound = STARTING_ROUNDS.some((r) => r.key === existingFirstRound)
      ? existingFirstRound
      : catGroups.length > 0
        ? getRecommendedRoundForGroups(catGroups.length)
        : 'Cuartos de final'
    setBuilderStartRound(defaultRound)

    const existingMatches = catMainRounds[0]?.matches || []
    if (existingMatches.length > 0 && existingFirstRound === defaultRound) {
      const nextSlots = getDefaultSlotsForRound(defaultRound)
      existingMatches.forEach((m, idx) => {
        if (!nextSlots[idx]) return
        const p1 = (isDoubles ? m.equipo1?.id : m.jugador1?.id) || ''
        const p2 = (isDoubles ? m.equipo2?.id : m.jugador2?.id) || ''
        nextSlots[idx] = {
          ...nextSlots[idx],
          participante1_id: p1 ? String(p1) : '',
          participante2_id: p2 ? String(p2) : '',
          pase_directo_lado: p1 && !p2 && String(m.notas || '').includes('Bye') ? 1 : 0,
          fecha_inicio: m.fecha_inicio ? String(m.fecha_inicio).slice(0, 10) : '',
          hora_inicio: m.hora_inicio ? String(m.hora_inicio).slice(0, 5) : '',
          cancha_id: m.cancha?.id ? String(m.cancha.id) : '',
        }
      })
      setBuilderSlots(nextSlots)
      const fmt = existingMatches[0]?.formato || {}
      setBuilderScoring({
        mejor_de_sets: String(fmt.mejor_de_sets || 3),
        juegos_por_set: String(fmt.juegos_por_set || 6),
        diferencia_juegos: String(fmt.diferencia_juegos || 2),
        modo_game: fmt.modo_game || 'ventaja',
        set_decisivo: fmt.set_decisivo || 'set_completo',
        tiebreak_en: String(fmt.tiebreak_en ?? 6),
        tiebreak_puntos: String(fmt.tiebreak_puntos || 7),
        match_tiebreak_puntos: String(fmt.match_tiebreak_puntos || 10),
        servidor_inicial: fmt.servidor_inicial || 'jugador1',
      })
    } else if (catGroups.length > 0) {
      setBuilderSlots(buildRecommendedSlotsFromGroups(catGroups, defaultRound))
      setBuilderScoring({ ...DEFAULT_SUPERGAME_FORMAT })
    } else {
      setBuilderSlots(getDefaultSlotsForRound(defaultRound))
      setBuilderScoring({ ...DEFAULT_SUPERGAME_FORMAT })
    }

    setBuilderThirdPlace(catThirdRounds.some((r) => r.key === 'Tercer puesto'))
  }

  const openBracketBuilder = (targetCatId) => {
    setBuilderError('')
    const validCatId =
      (typeof targetCatId === 'string' || typeof targetCatId === 'number') &&
      String(targetCatId).trim() !== '' &&
      !String(targetCatId).includes('object')
        ? String(targetCatId)
        : String(selected || '')
    if (validCatId && validCatId !== String(selected)) {
      setCategory(validCatId)
    }
    populateBuilderForCategory(validCatId)
    setBuilderOpen(true)
  }

  useEffect(() => {
    if (autoOpenParam && management && tournament?.id && selected && !didAutoOpenRef.current) {
      didAutoOpenRef.current = true
      openBracketBuilder(selected)
    }
  }, [autoOpenParam, management, tournament?.id, selected])

  const handleBuilderRoundChange = (newRoundKey) => {
    setBuilderStartRound(newRoundKey)
    const nextSlots = getDefaultSlotsForRound(newRoundKey)
    nextSlots.forEach((slot, idx) => {
      if (builderSlots[idx]) {
        nextSlots[idx] = {
          ...slot,
          participante1_id: builderSlots[idx].participante1_id,
          participante2_id: builderSlots[idx].participante2_id,
          pase_directo_lado: builderSlots[idx].pase_directo_lado,
          fecha_inicio: builderSlots[idx].fecha_inicio,
          hora_inicio: builderSlots[idx].hora_inicio,
          cancha_id: builderSlots[idx].cancha_id,
        }
      }
    })
    setBuilderSlots(nextSlots)
  }

  const autofillFromGroups = () => {
    if (!categoryGroupsSummary.length) return
    const recRound = getRecommendedRoundForGroups(categoryGroupsSummary.length)
    const targetRound = builderStartRound || recRound
    setBuilderSlots(buildRecommendedSlotsFromGroups(categoryGroupsSummary, targetRound))
    setBuilderScoring((prev) => ({
      ...DEFAULT_SUPERGAME_FORMAT,
      ...prev,
      set_decisivo: 'set_completo',
    }))
  }

  const handleCreateBracketSubmit = async (e) => {
    e.preventDefault()
    if (!tournament?.id || !selected) return
    setBuilderBusy(true)
    setBuilderError('')
    try {
      const normalizedFormat = {
        mejor_de_sets: Number(builderScoring.mejor_de_sets || 3),
        juegos_por_set: Number(builderScoring.juegos_por_set || 6),
        diferencia_juegos: Number(builderScoring.diferencia_juegos || 2),
        modo_game: builderScoring.modo_game || 'ventaja',
        set_decisivo: builderScoring.set_decisivo || 'set_completo',
        tiebreak_en: Number(builderScoring.tiebreak_en ?? 6),
        tiebreak_puntos: Number(builderScoring.tiebreak_puntos || 7),
        match_tiebreak_puntos: Number(builderScoring.match_tiebreak_puntos || 10),
        servidor_inicial: builderScoring.servidor_inicial || 'jugador1',
      }
      await matchService.createKnockoutBracket({
        torneo_id: Number(tournament.id),
        categoria_id: Number(selected),
        ronda_inicial: builderStartRound,
        incluir_tercer_puesto: builderThirdPlace,
        reemplazar_programados: builderReplaceScheduled,
        formato: normalizedFormat,
        ...normalizedFormat,
        llaves_iniciales: builderSlots.map((s) => ({
          participante1_id: s.participante1_id ? Number(s.participante1_id) : null,
          participante2_id:
            s.pase_directo_lado === 1
              ? null
              : s.participante2_id
                ? Number(s.participante2_id)
                : null,
          pase_directo_lado: Number(s.pase_directo_lado) || 0,
          fecha_inicio: s.fecha_inicio || null,
          hora_inicio: s.hora_inicio || null,
          cancha_id: s.cancha_id ? Number(s.cancha_id) : null,
        })),
      })
      setBuilderOpen(false)
      setRoundKey('')
      setFeedback({
        type: 'success',
        text: `Cuadro eliminatorio de ${selectedCategoryName} guardado desde ${builderStartRound} (${normalizedFormat.set_decisivo === 'set_completo' ? 'Super Game · 3er set completo' : 'Normal · Supertiebreak'}).`,
      })
      if (onRefresh) onRefresh()
    } catch (err) {
      setBuilderError(
        err?.response?.data?.message || err.message || 'No se pudo generar el cuadro eliminatorio.'
      )
    } finally {
      setBuilderBusy(false)
    }
  }

  const openEditSlotModal = (match, e) => {
    if (e) e.stopPropagation()
    setSelectedMatchDetail(null)
    setSlotError('')
    const p1 = (isDoubles ? match.equipo1?.id : match.jugador1?.id) || ''
    const p2 = (isDoubles ? match.equipo2?.id : match.jugador2?.id) || ''
    const src1 = sourceId(match, 1) || ''
    const src2 = sourceId(match, 2) || ''

    const nextTarget = matches.find(
      (m) =>
        categoryKey(m) === selected &&
        (sourceId(m, 1) === Number(match.id) || sourceId(m, 2) === Number(match.id))
    )
    const nextSide =
      nextTarget && sourceId(nextTarget, 2) === Number(match.id) ? 2 : 1
    const fmt = match.formato || {}

    setEditingMatch(match)
    setSlotForm({
      modo_lado1: p1 ? 'fijo' : src1 ? 'ganador' : 'por_definir',
      participante1_id: p1 ? String(p1) : '',
      origen_partido1_id: src1 ? String(src1) : '',
      modo_lado2: p2 ? 'fijo' : src2 ? 'ganador' : 'por_definir',
      participante2_id: p2 ? String(p2) : '',
      origen_partido2_id: src2 ? String(src2) : '',
      ganador_manual: match.ganador || '',
      finalizar_manual: match.estado === 'finalizado',
      reabrir_partido: false,
      partido_siguiente_id: nextTarget ? String(nextTarget.id) : '',
      lado_siguiente: nextSide,
      ronda: match.ronda || 'Cuartos de final',
      fecha_inicio: match.fecha_inicio ? String(match.fecha_inicio).slice(0, 10) : '',
      hora_inicio: match.hora_inicio ? String(match.hora_inicio).slice(0, 5) : '',
      cancha_id: match.cancha?.id ? String(match.cancha.id) : '',
      notas: match.notas || '',
      mejor_de_sets: String(fmt.mejor_de_sets || 3),
      juegos_por_set: String(fmt.juegos_por_set || 6),
      diferencia_juegos: String(fmt.diferencia_juegos || 2),
      modo_game: fmt.modo_game || 'ventaja',
      set_decisivo: fmt.set_decisivo || 'set_completo',
      tiebreak_en: String(fmt.tiebreak_en ?? 6),
      tiebreak_puntos: String(fmt.tiebreak_puntos || 7),
      match_tiebreak_puntos: String(fmt.match_tiebreak_puntos || 10),
      servidor_inicial: fmt.servidor_inicial || 'jugador1',
    })
  }

  const handleSaveSlotSubmit = async (e) => {
    e.preventDefault()
    if (!editingMatch) return
    setSlotSaving(true)
    setSlotError('')
    try {
      const normalizedFormat = {
        mejor_de_sets: Number(slotForm.mejor_de_sets || 3),
        juegos_por_set: Number(slotForm.juegos_por_set || 6),
        diferencia_juegos: Number(slotForm.diferencia_juegos || 2),
        modo_game: slotForm.modo_game || 'ventaja',
        set_decisivo: slotForm.set_decisivo || 'set_completo',
        tiebreak_en: Number(slotForm.tiebreak_en ?? 6),
        tiebreak_puntos: Number(slotForm.tiebreak_puntos || 7),
        match_tiebreak_puntos: Number(slotForm.match_tiebreak_puntos || 10),
        servidor_inicial: slotForm.servidor_inicial || 'jugador1',
      }
      await matchService.updateBracketSlot(editingMatch.id, {
        modo_lado1: slotForm.modo_lado1,
        participante1_id:
          slotForm.modo_lado1 === 'fijo' && slotForm.participante1_id
            ? Number(slotForm.participante1_id)
            : null,
        origen_partido1_id:
          slotForm.modo_lado1 === 'ganador' && slotForm.origen_partido1_id
            ? Number(slotForm.origen_partido1_id)
            : null,
        conservar_origen1: slotForm.modo_lado1 === 'fijo' && Boolean(slotForm.origen_partido1_id),
        modo_lado2: slotForm.modo_lado2,
        participante2_id:
          slotForm.modo_lado2 === 'fijo' && slotForm.participante2_id
            ? Number(slotForm.participante2_id)
            : null,
        origen_partido2_id:
          slotForm.modo_lado2 === 'ganador' && slotForm.origen_partido2_id
            ? Number(slotForm.origen_partido2_id)
            : null,
        conservar_origen2: slotForm.modo_lado2 === 'fijo' && Boolean(slotForm.origen_partido2_id),
        ganador_manual: slotForm.ganador_manual || null,
        finalizar_manual: Boolean(slotForm.finalizar_manual),
        reabrir_partido: Boolean(slotForm.reabrir_partido),
        partido_siguiente_id: slotForm.partido_siguiente_id
          ? Number(slotForm.partido_siguiente_id)
          : null,
        lado_siguiente: Number(slotForm.lado_siguiente) || 1,
        ronda: slotForm.ronda,
        fecha_inicio: slotForm.fecha_inicio || null,
        hora_inicio: slotForm.hora_inicio || null,
        cancha_id: slotForm.cancha_id ? Number(slotForm.cancha_id) : null,
        notas: slotForm.notas || null,
        formato: normalizedFormat,
        ...normalizedFormat,
      })
      setEditingMatch(null)
      setFeedback({
        type: 'success',
        text: `Llave #${editingMatch.id} actualizada correctamente (${normalizedFormat.set_decisivo === 'set_completo' ? 'Super Game' : 'Normal'}).`,
      })
      if (onRefresh) onRefresh()
    } catch (err) {
      setSlotError(
        err?.response?.data?.message || err.message || 'No se pudo actualizar la llave.'
      )
    } finally {
      setSlotSaving(false)
    }
  }

  const handleExportImage = async (share = false) => {
    if (!rounds.length) return
    setExporting(true)
    setFeedback(null)
    try {
      const isCurrentlyDark =
        typeof darkMode === 'boolean'
          ? darkMode
          : typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      const payload = {
        tournamentName: tournament?.nombre || 'Torneo Club Unión',
        categoryName: selectedCategoryName,
        rounds: mainTreeRounds.length ? mainTreeRounds : rounds,
        thirdPlaceMatches: thirdPlaceRounds.flatMap((r) => r.matches),
        championName: championInfo?.name || null,
        theme: isCurrentlyDark ? 'dark' : 'light',
      }
      if (share) {
        const res = await shareOrDownloadBracketPng(payload)
        if (!res.cancelled) {
          setFeedback({
            type: 'success',
            text: res.shared
              ? 'Cuadro listo para compartir.'
              : `Imagen descargada (${res.fileName}).`,
          })
        }
      } else {
        const res = await downloadBracketPng(payload)
        setFeedback({
          type: 'success',
          text: `Cuadro descargado como imagen (${res.fileName}).`,
        })
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || 'No se pudo generar la imagen del cuadro.',
      })
    } finally {
      setExporting(false)
    }
  }

  // Nodo ultra-compacto para el árbol conectado (se ve nítido en celular y PC)
  function compactNodeCard(match, isFinalRound = false) {
    const final = match.estado === 'finalizado'
    const canceled = match.estado === 'cancelado'
    const isLive = match.estado === 'en_vivo'
    const tagCode = matchTagMap.get(Number(match.id)) || `#${match.id}`

    const shortTimeInfo = isLive
      ? '● VIVO'
      : final
        ? match.motivo_finalizacion === 'walkover'
          ? 'W.O.'
          : 'FINAL'
        : canceled
          ? 'CANC.'
          : match.hora_inicio
            ? String(match.hora_inicio).slice(0, 5)
            : 'PROG.'

    return (
      <article
        key={match.id}
        onClick={() => setSelectedMatchDetail(match)}
        className={`ucl-node-card ${isLive ? 'is-live' : ''} ${
          isFinalRound ? 'is-final-round' : ''
        }`}
        title='Toca para ver detalles de la llave'
      >
        <div className='ucl-node-topbar'>
          <span className='font-extrabold text-[var(--text-secondary)] flex items-center gap-1 truncate'>
            {isFinalRound && <Trophy size={10} className='text-amber-400 shrink-0' />}
            {tagCode}
            {match.cancha?.nombre && (
              <span className='hidden sm:inline text-[var(--text-muted)] font-medium'>
                · {match.cancha.nombre.replace('Cancha de ', '')}
              </span>
            )}
          </span>
          <div className='flex items-center gap-1 shrink-0'>
            <span
              className={`font-extrabold uppercase ${
                isLive
                  ? 'text-red-500 animate-pulse'
                  : final
                    ? 'text-[var(--color-brand)]'
                    : 'text-[var(--text-muted)]'
              }`}
            >
              {shortTimeInfo}
            </span>
            {management && (
              <button
                type='button'
                onClick={(e) => openEditSlotModal(match, e)}
                className='p-0.5 rounded hover:bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--color-brand)]'
                title='Ajustar llave manualmente'
                aria-label={`Ajustar llave ${match.id}`}
              >
                <Edit3 size={11} />
              </button>
            )}
          </div>
        </div>

        {[1, 2].map((side) => {
          const slot = bracketSlot(match, side, bracket)
          const entity = match[`equipo${side}`] || match[`jugador${side}`]
          const hasDirectParticipant = Boolean(entity?.id)
          const won = final && match.ganador === `jugador${side}`
          const isPending = slot.pending && !hasDirectParticipant
          const sourceTag = slot.source ? matchTagMap.get(Number(slot.source)) || `#${slot.source}` : null
          const displayLabel = isPending
            ? sourceTag
              ? `Gdor ${sourceTag}`
              : 'Por definir'
            : getParticipantName(match, side)

          return (
            <div key={side} className={`ucl-node-side ${won ? 'is-winner' : ''}`}>
              <span className={`ucl-node-name ${isPending ? 'is-pending' : ''}`}>
                {won ? '✓ ' : ''}
                {displayLabel}
              </span>

              <div className='ucl-node-scores'>
                {(match.sets || []).map((s) => {
                  const myVal = s[`games_j${side}`]
                  const oppVal = s[`games_j${3 - side}`]
                  const setWon = Number(myVal) > Number(oppVal)
                  return (
                    <span
                      key={s.numero_set}
                      className={`ucl-node-set ${setWon ? 'is-set-won' : ''}`}
                    >
                      {myVal}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </article>
    )
  }

  // Tarjeta detallada (cuando el usuario cambia a modo "Lista" o abre el modal de detalle)
  function detailedMatchCard(match) {
    const targets = matches.filter(
      (m) =>
        categoryKey(m) === selected &&
        [1, 2].some((side) => bracketSlot(m, side, bracket).source === Number(match.id))
    )
    const final = match.estado === 'finalizado'
    const canceled = match.estado === 'cancelado'
    const isLive = match.estado === 'en_vivo'
    const tagCode = matchTagMap.get(Number(match.id)) || `Partido #${match.id}`

    return (
      <article
        key={match.id}
        className='rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] shadow-sm overflow-hidden min-w-0'
      >
        <div className='px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs bg-[var(--bg-hover)] border-b border-[var(--border-color)]'>
          <span className='font-bold text-[var(--text-primary)]'>
            {tagCode} · Partido #{match.id}
          </span>
          <div className='flex items-center gap-2'>
            <span
              className={`font-bold ${
                isLive
                  ? 'text-red-500'
                  : final
                    ? 'text-[var(--color-brand)]'
                    : 'text-[var(--text-secondary)]'
              }`}
            >
              {final
                ? 'Finalizado'
                : canceled
                  ? 'Cancelado'
                  : isLive
                    ? 'En vivo'
                    : 'Programado'}
            </span>
            {management && (
              <button
                type='button'
                onClick={(e) => openEditSlotModal(match, e)}
                className='btn-secondary px-2 py-0.5 text-[11px] font-bold inline-flex items-center gap-1'
              >
                <Edit3 size={11} /> Ajustar
              </button>
            )}
          </div>
        </div>

        <div className='p-3 space-y-2'>
          {[1, 2].map((side) => {
            const slot = bracketSlot(match, side, bracket)
            const entity = match[`equipo${side}`] || match[`jugador${side}`]
            const hasDirectParticipant = Boolean(entity?.id)
            const won = final && match.ganador === `jugador${side}`
            const displayLabel =
              slot.pending && !hasDirectParticipant
                ? slot.source
                  ? `Ganador del partido #${slot.source}`
                  : 'Participante por confirmar'
                : getParticipantName(match, side)

            return (
              <div
                key={side}
                className={`rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 ${
                  won ? 'bg-emerald-500/12 border border-emerald-500/30' : 'bg-[var(--bg-card)]'
                }`}
              >
                <div className='flex items-center gap-2 min-w-0 flex-1'>
                  <ParticipantAvatar
                    team={isDoubles ? match[`equipo${side}`] : null}
                    player={match[`jugador${side}`]}
                    name={displayLabel}
                    size='sm'
                  />
                  <div className='min-w-0 flex-1'>
                    <p
                      className={`text-xs sm:text-sm break-words ${
                        won ? 'text-[var(--color-brand)] font-extrabold' : 'font-semibold'
                      }`}
                    >
                      {displayLabel}
                    </p>
                    {slot.source && (
                      <Link
                        to={`/match/${slot.source}`}
                        className='text-[10px] underline text-[var(--text-muted)]'
                      >
                        Origen #{slot.source}
                      </Link>
                    )}
                  </div>
                </div>

                <div className='flex items-center gap-1 shrink-0'>
                  {(match.sets || []).map((s) => (
                    <span
                      key={s.numero_set}
                      className={`ucl-node-set ${
                        Number(s[`games_j${side}`]) > Number(s[`games_j${3 - side}`])
                          ? 'is-set-won'
                          : ''
                      }`}
                    >
                      {s[`games_j${side}`]}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className='px-3 pb-2.5 text-[11px] text-[var(--text-secondary)] flex flex-wrap items-center justify-between gap-2'>
          <span>
            {match.fecha_inicio ? formatDate(match.fecha_inicio) : 'Fecha por definir'} ·{' '}
            {match.hora_inicio ? formatClockTime(match.hora_inicio) : 'Hora por definir'} ·{' '}
            {match.cancha?.nombre || 'Cancha por asignar'}
          </span>
          <Link
            to={`/match/${match.id}`}
            className='inline-flex items-center gap-1 text-[var(--color-brand)] font-bold'
          >
            Ver partido <ArrowRight size={13} />
          </Link>
        </div>

        {targets.length > 0 && (
          <div className='px-3 py-1.5 text-[10px] text-[var(--text-muted)] border-t border-[var(--border-color)]'>
            Avanza a:{' '}
            {targets.map((m, i) => (
              <span key={m.id}>
                {i > 0 ? ' · ' : ''}#{m.id} ({m.ronda})
              </span>
            ))}
          </div>
        )}
      </article>
    )
  }

  return (
    <section className='space-y-3 min-w-0' aria-label='Cuadro de eliminatorias'>
      <div className='ucl-bracket-shell'>
        {/* Cabecera compacta pensada para móvil */}
        <header className='ucl-hero-header space-y-2.5'>
          <div className='flex items-center justify-between gap-2'>
            <div className='min-w-0'>
              <span className='inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[var(--color-brand)]'>
                <Sparkles size={12} /> Fase Eliminatoria
              </span>
              <h2 className='text-base sm:text-xl font-extrabold flex items-center gap-1.5 text-[var(--text-primary)] truncate'>
                <Trophy size={18} className='text-[var(--color-brand)] shrink-0' />
                Camino a la final · {selectedCategoryName}
              </h2>
            </div>

            <div className='flex items-center gap-1.5 shrink-0'>
              {rounds.length > 0 && (
                <>
                  <button
                    type='button'
                    disabled={exporting}
                    onClick={() => handleExportImage(false)}
                    className='btn-secondary px-2.5 py-1.5 text-[11px] font-bold inline-flex items-center gap-1'
                    title='Descargar cuadro en imagen PNG'
                  >
                    <Download size={14} />
                    <span className='hidden sm:inline'>
                      {exporting ? 'Generando…' : 'Descargar PNG'}
                    </span>
                    <span className='sm:hidden'>{exporting ? '…' : 'PNG'}</span>
                  </button>
                  <button
                    type='button'
                    disabled={exporting}
                    onClick={() => handleExportImage(true)}
                    className='btn-secondary p-1.5 text-[11px] font-bold inline-flex items-center sm:hidden'
                    title='Compartir imagen del cuadro'
                    aria-label='Compartir imagen del cuadro'
                  >
                    <Share2 size={14} />
                  </button>
                </>
              )}

              {management && tournament?.id && (
                <button
                  type='button'
                  onClick={() => openBracketBuilder(selected)}
                  className='btn-primary px-3 py-1.5 text-[11px] font-bold inline-flex items-center gap-1.5 shadow-sm'
                >
                  <PlusCircle size={14} />
                  <span className='hidden sm:inline'>
                    {rounds.length > 0 ? 'Armar / Configurar Brackets' : 'Crear Brackets'}
                  </span>
                  <span className='sm:hidden'>
                    {rounds.length > 0 ? 'Armar Brackets' : 'Crear'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Píldoras de categorías */}
          {categories.length > 1 && (
            <div className='ucl-cat-pills' role='tablist' aria-label='Categorías disponibles'>
              {categories.map(([id, name]) => {
                const count = knockoutCountByCat.get(id) || 0
                const active = id === selected
                return (
                  <button
                    key={id}
                    type='button'
                    role='tab'
                    aria-selected={active}
                    onClick={() => {
                      setCategory(id)
                      setRoundKey('')
                    }}
                    className={`ucl-cat-pill ${active ? 'is-active' : ''}`}
                  >
                    <span>{name}</span>
                    <span className='ucl-cat-pill-badge'>
                      {count > 0 ? <span className='inline-flex items-center gap-1 font-semibold text-[var(--color-brand)]'><Trophy className='w-3.5 h-3.5' /> {count}</span> : management ? 'En grupos · Armar' : 'En grupos'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Select accesible oculto en móvil cuando ya hay píldoras, o visible si se requiere */}
          <label className='sr-only'>
            Categoría
            <select
              aria-label='Categoría del cuadro'
              value={selected || ''}
              onChange={(e) => {
                setCategory(e.target.value)
                setRoundKey('')
              }}
            >
              {categories.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          {/* Banner compacto de Campeón */}
          {championInfo && (
            <div className='ucl-champion-banner'>
              <div className='flex items-center gap-2 min-w-0'>
                <Trophy size={16} className='text-amber-400 shrink-0' />
                <div className='min-w-0 truncate'>
                  <span className='text-[10px] font-extrabold uppercase tracking-wider text-amber-500 mr-1.5'>
                    Campeón:
                  </span>
                  <strong className='text-xs sm:text-sm font-extrabold text-[var(--text-primary)]'>
                    {championInfo.name}
                  </strong>
                </div>
              </div>
              <Link
                to={`/match/${championInfo.match.id}`}
                className='text-[11px] font-bold text-[var(--color-brand)] underline shrink-0'
              >
                Final →
              </Link>
            </div>
          )}

          {/* Barra de navegación de rondas + Controles de Zoom/Vista en móvil */}
          {rounds.length > 0 && (
            <div className='flex items-center justify-between gap-2 pt-0.5'>
              <div className='ucl-round-jumpbar'>
                {(mainTreeRounds.length > 0 ? mainTreeRounds : rounds).map((r, idx) => {
                  const active = (roundKey ? r.key === roundKey : idx === 0)
                  return (
                    <button
                      key={r.key}
                      type='button'
                      onClick={() => scrollToRoundColumn(r.key)}
                      className={`ucl-round-jump-btn ${active ? 'is-active' : ''}`}
                    >
                      <span>{r.label}</span>
                      <span className='opacity-70'>({r.matches.length})</span>
                    </button>
                  )
                })}
              </div>

              <div className='flex items-center gap-1 shrink-0'>
                {mobileViewMode === 'tree' && (
                  <button
                    type='button'
                    onClick={() => setZoomOut((z) => !z)}
                    className='lg:hidden px-2 py-1 rounded-lg text-[11px] font-bold border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] inline-flex items-center gap-1'
                    title='Ajustar tamaño de las llaves en pantalla'
                  >
                    {zoomOut ? <ZoomIn size={13} /> : <ZoomOut size={13} />}
                    <span>{zoomOut ? 'Normal' : 'Compactar'}</span>
                  </button>
                )}

                <button
                  type='button'
                  onClick={() =>
                    setMobileViewMode((m) => (m === 'tree' ? 'rounds' : 'tree'))
                  }
                  className='lg:hidden px-2 py-1 rounded-lg text-[11px] font-bold border border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-secondary)] inline-flex items-center gap-1'
                >
                  {mobileViewMode === 'tree' ? (
                    <>
                      <LayoutList size={13} /> Lista
                    </>
                  ) : (
                    <>
                      <GitBranch size={13} /> Cuadro
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </header>

        {feedback && (
          <div
            role='status'
            className={`mx-3 mt-3 p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 ${
              feedback.type === 'error'
                ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                : 'bg-emerald-500/15 text-[var(--color-brand)] border border-emerald-500/30'
            }`}
          >
            <span>{feedback.text}</span>
            <button
              type='button'
              onClick={() => setFeedback(null)}
              className='p-1 hover:opacity-75'
              aria-label='Cerrar aviso'
            >
              <X size={14} />
            </button>
          </div>
        )}

        {management && bracket.issues.length > 0 && (
          <details className='mx-3 mt-3 card p-3 text-xs'>
            <summary className='font-semibold cursor-pointer'>
              Revisar {bracket.issues.length} referencias del cuadro
            </summary>
            <ul className='mt-2 space-y-1'>
              {bracket.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </details>
        )}

        {!rounds.length ? (
          <div className='p-5 sm:p-8 text-center space-y-4'>
            <p className='text-sm text-[var(--text-secondary)]'>
              Todavía no hay partidos de eliminatoria registrados para <strong>{selectedCategoryName}</strong> (actualmente en fase de grupos).
            </p>

            {categoriesWithBrackets.length > 0 && (
              <div className='max-w-xl mx-auto rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-3.5 space-y-2'>
                <p className='text-xs font-extrabold uppercase tracking-wider text-[var(--color-brand)]'>
                  <span className='inline-flex items-center gap-1.5'><Trophy className='w-4 h-4 text-[var(--color-brand)]' /> Cuadros eliminatorios ya creados en este torneo:</span>
                </p>
                <div className='flex flex-wrap items-center justify-center gap-2'>
                  {categoriesWithBrackets.map(([catId, catName]) => (
                    <button
                      key={catId}
                      type='button'
                      onClick={() => {
                        setCategory(catId)
                        setRoundKey('')
                      }}
                      className='btn-primary px-3.5 py-1.5 text-xs font-bold inline-flex items-center gap-1.5'
                    >
                      <Trophy size={13} />
                      <span>Ver cuadro de {catName}</span>
                      <span className='opacity-80'>({knockoutCountByCat.get(catId)} llaves)</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {management && categoryGroupsSummary.length > 0 && (
              <div className='max-w-2xl mx-auto text-left rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3.5 space-y-2.5'>
                <div className='flex items-center justify-between gap-2'>
                  <h3 className='text-xs font-extrabold uppercase tracking-wider text-[var(--color-brand)]'>
                    Clasificados en grupos ({selectedCategoryName})
                  </h3>
                  <span className='text-[11px] text-[var(--text-muted)]'>
                    {categoryGroupsSummary.length} grupos
                  </span>
                </div>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                  {categoryGroupsSummary.map((g) => (
                    <div
                      key={g.clave}
                      className='rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-2.5 text-xs space-y-1'
                    >
                      <p className='font-bold text-[var(--text-primary)]'>{g.nombre}</p>
                      {g.rows.slice(0, 3).map((r) => (
                        <p key={r.id} className='text-[var(--text-secondary)] truncate'>
                          <strong className='text-[var(--color-brand)]'>{r.posicion}°</strong>{' '}
                          {r.participante?.nombre} ({r.puntos} pts)
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {management && tournament?.id && (
              <button
                type='button'
                onClick={() => openBracketBuilder(selected)}
                className='btn-primary px-4 py-2.5 text-xs sm:text-sm font-bold inline-flex items-center gap-2'
              >
                <PlusCircle size={16} />
                Armar cuadro de {selectedCategoryName}
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* VISTA 1 (POR DEFECTO EN TELÉFONO Y PC): ÁRBOL DE BRACKETS CONECTADO Y COMPACTO */}
            <div
              ref={treeScrollRef}
              className={`${
                mobileViewMode === 'rounds' ? 'hidden lg:block' : 'block'
              } ucl-tree-scroll`}
              role='region'
              aria-label='Rondas de eliminatoria'
              tabIndex={0}
            >
              <div ref={treeBoardRef} className={`ucl-tree-board ${zoomOut ? 'is-zoom-out' : ''}`}>
                <svg className='ucl-connectors' aria-hidden='true'>
                  {connectorPaths.map(path => <path key={path.key} d={path.d} />)}
                </svg>
                {(mainTreeRounds.length > 0 ? mainTreeRounds : rounds).map((r) => {
                  const isFinalCol = r.label === 'Final'
                  return (
                    <section
                      key={r.key}
                      ref={(el) => {
                        roundColRefs.current[r.key] = el
                      }}
                      className='ucl-round-column'
                    >
                      <h3 className={`ucl-round-header ${isFinalCol ? 'is-final' : ''}`}>
                        <span className='truncate'>
                          {r.label} ({r.matches.length})
                        </span>
                        {isFinalCol && <Trophy size={12} className='shrink-0' />}
                      </h3>
                      <div className='ucl-round-slots'>
                        {r.matches.map((m, idx) => {
                          const hasWin =
                            m.estado === 'finalizado' &&
                            (m.ganador === 'jugador1' || m.ganador === 'jugador2')
                          const pairClass =
                            r.matches.length > 1
                              ? idx % 2 === 0
                                ? 'is-pair-odd'
                                : 'is-pair-even'
                              : ''
                          return (
                            <div
                              key={m.id}
                              className={`ucl-slot-wrapper ${pairClass} ${
                                hasWin ? 'has-winner' : ''
                              }`}
                            >
                              {compactNodeCard(m, isFinalCol)}
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>

              {/* Tercer puesto compacto debajo del árbol */}
              {mainTreeRounds.length > 0 && thirdPlaceRounds.length > 0 && (
                <div className='mt-4 pt-3 border-t border-[var(--border-color)] flex flex-wrap gap-3'>
                  {thirdPlaceRounds.map((r) => (
                    <section key={r.key} className='w-56 sm:w-64 shrink-0 space-y-1.5'>
                      <h3 className='ucl-round-header'>
                        {r.label} ({r.matches.length})
                      </h3>
                      {r.matches.map((m) => compactNodeCard(m, false))}
                    </section>
                  ))}
                </div>
              )}
            </div>

            {/* VISTA 2 (OPCIONAL EN MÓVIL): LISTA DETALLADA POR RONDA */}
            {mobileViewMode === 'rounds' && (
              <div className='p-3 space-y-3 lg:hidden'>
                <div className='flex items-center gap-2'>
                  <button
                    type='button'
                    aria-label='Ronda anterior'
                    className='btn-secondary p-2.5'
                    disabled={current === 0}
                    onClick={() => setRoundKey(rounds[current - 1].key)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <label className='min-w-0 flex-1'>
                    <span className='sr-only'>Ronda</span>
                    <select
                      aria-label='Ronda del cuadro'
                      className='ucl-builder-control'
                      value={rounds[current].key}
                      onChange={(e) => setRoundKey(e.target.value)}
                    >
                      {rounds.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label} ({r.matches.length})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type='button'
                    aria-label='Ronda siguiente'
                    className='btn-secondary p-2.5'
                    disabled={current === rounds.length - 1}
                    onClick={() => setRoundKey(rounds[current + 1].key)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className='grid gap-2.5'>
                  {rounds[current].matches.map(detailedMatchCard)}
                </div>
              </div>
            )}

            <div className='px-3 pb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]'>
              <span>
                💡 Toca cualquier llave del cuadro para ver cancha, horario o ir al partido.
              </span>
              {management && (
                <span>
                  Usa el ícono ✎ en cada llave para ajustar parejas o clasificados manualmente.
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          MINI-FICHA DE DETALLE RÁPIDO AL TOCAR UNA LLAVE DEL CUADRO (PORTAL)
          ===================================================================== */}
      {selectedMatchDetail &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className='ucl-modal-backdrop'
            onClick={() => setSelectedMatchDetail(null)}
            role='dialog'
            aria-modal='true'
            aria-label='Detalle de llave'
          >
            <div
              className='ucl-modal-shell max-w-md p-4 space-y-3'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='flex items-center justify-between gap-2'>
                <span className='text-xs font-extrabold uppercase tracking-wider text-[var(--color-brand)]'>
                  {selectedMatchDetail.ronda || 'Eliminatoria'} · {selectedCategoryName}
                </span>
                <button
                  type='button'
                  onClick={() => setSelectedMatchDetail(null)}
                  className='btn-ghost p-1.5 rounded-lg'
                  aria-label='Cerrar detalle'
                >
                  <X size={16} />
                </button>
              </div>

              {detailedMatchCard(selectedMatchDetail)}

              <div className='flex flex-wrap items-center justify-end gap-2 pt-1'>
                {management && (
                  <button
                    type='button'
                    onClick={(e) => openEditSlotModal(selectedMatchDetail, e)}
                    className='btn-secondary px-3.5 py-2 text-xs font-bold inline-flex items-center gap-1.5'
                  >
                    <Edit3 size={14} /> Ajustar llave / Clasificado
                  </button>
                )}
                <Link
                  to={`/match/${selectedMatchDetail.id}`}
                  className='btn-primary px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5'
                >
                  Ir al partido <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* =====================================================================
          MODAL 1: GENERADOR / CONFIGURADOR DEL CUADRO ELIMINATORIO POR CATEGORÍA
          ===================================================================== */}
      {builderOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className='ucl-modal-backdrop'
            onClick={(e) => {
              if (e.target === e.currentTarget && !builderBusy) setBuilderOpen(false)
            }}
            role='dialog'
            aria-modal='true'
            aria-label='Configurar cuadro eliminatorio'
          >
            <div className='ucl-modal-shell max-w-5xl' onClick={(e) => e.stopPropagation()}>
              <div className='ucl-modal-header'>
                <div className='space-y-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='badge-brand text-[10px] font-extrabold uppercase tracking-wider'>
                      Constructor Oficial de Brackets
                    </span>
                    <span className='text-xs font-bold text-[var(--text-secondary)]'>
                      {tournament?.nombre || 'Torneo'} · Categoría {selectedCategoryName}
                    </span>
                  </div>
                  <h3 className='text-base sm:text-xl font-black text-[var(--text-primary)]'>
                    Armar y configurar llaves de Fase Eliminatoria
                  </h3>
                </div>
                <button
                  type='button'
                  onClick={() => setBuilderOpen(false)}
                  className='btn-ghost p-2 rounded-xl shrink-0'
                  aria-label='Cerrar'
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateBracketSubmit} className='flex flex-col flex-1 min-h-0'>
                <div className='ucl-modal-body space-y-5'>
                  {builderError && (
                    <p
                      role='alert'
                      className='p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-500 text-xs font-bold'
                    >
                      {builderError}
                    </p>
                  )}

                  {/* Selector de categoría dentro del modal */}
                  {categories.length > 1 && (
                    <div className='space-y-2'>
                      <label className='block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]'>
                        Categoría a configurar:
                      </label>
                      <div className='flex flex-wrap gap-2'>
                        {categories.map(([catId, catName]) => {
                          const isSel = String(catId) === String(selected)
                          const count = knockoutCountByCat.get(catId) || 0
                          return (
                            <button
                              key={catId}
                              type='button'
                              onClick={() => {
                                setCategory(String(catId))
                                populateBuilderForCategory(String(catId))
                              }}
                              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-all inline-flex items-center gap-2 ${
                                isSel
                                  ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)] shadow-sm'
                                  : 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--color-brand)]'
                              }`}
                            >
                              <span>{catName}</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full ${
                                  isSel
                                    ? 'bg-black/20 text-white'
                                    : 'bg-[var(--bg-card)] text-[var(--text-muted)]'
                                }`}
                              >
                                {count > 0 ? <span className='inline-flex items-center gap-1 text-[var(--color-brand)] font-semibold'><Trophy className='w-3 h-3' /> {count} llaves</span> : 'Por armar'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Paso 1: Ronda de inicio */}
                  <div className='space-y-2.5'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <label className='block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]'>
                        1. ¿Desde qué ronda comienza la eliminatoria de {selectedCategoryName}?
                      </label>
                      <span className='text-[11px] font-semibold text-[var(--color-brand)]'>
                        El sistema encadena automáticamente las rondas siguientes hasta la Final
                      </span>
                    </div>

                    <div className='grid grid-cols-2 sm:grid-cols-5 gap-2.5'>
                      {STARTING_ROUNDS.map((r) => {
                        const active = builderStartRound === r.key
                        return (
                          <button
                            key={r.key}
                            type='button'
                            onClick={() => handleBuilderRoundChange(r.key)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              active
                                ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)] ring-1 ring-[var(--color-brand)]'
                                : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--border-hover)]'
                            }`}
                          >
                            <div className='flex items-center justify-between gap-1'>
                              <p className='text-xs sm:text-sm font-black text-[var(--text-primary)]'>
                                {r.short}
                              </p>
                              {active && (
                                <CheckCircle2 size={14} className='text-[var(--color-brand)] shrink-0' />
                              )}
                            </div>
                            <p className='text-[11px] text-[var(--text-secondary)] mt-1 font-medium'>
                              {r.matches} {r.matches === 1 ? 'llave inicial' : 'llaves iniciales'}
                            </p>
                            <p className='text-[10px] text-[var(--text-muted)]'>
                              Hasta {r.slots} parejas/jugadores
                            </p>
                          </button>
                        )
                      })}
                    </div>

                    {/* Opciones del cuadro */}
                    <div className='flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] text-xs'>
                      <div className='flex flex-wrap items-center gap-4'>
                        {builderStartRound !== 'Final' && (
                          <label className='inline-flex items-center gap-2 cursor-pointer font-semibold text-[var(--text-primary)]'>
                            <input
                              type='checkbox'
                              checked={builderThirdPlace}
                              onChange={(e) => setBuilderThirdPlace(e.target.checked)}
                            />
                            Incluir partido por el Tercer puesto
                          </label>
                        )}
                        {rounds.length > 0 && (
                          <label className='inline-flex items-center gap-2 cursor-pointer font-semibold text-amber-600 dark:text-amber-400'>
                            <input
                              type='checkbox'
                              checked={builderReplaceScheduled}
                              onChange={(e) => setBuilderReplaceScheduled(e.target.checked)}
                            />
                            Reemplazar llaves programadas actuales de {selectedCategoryName}
                          </label>
                        )}
                      </div>
                      <span className='text-[11px] text-[var(--text-muted)] font-medium'>
                        Participantes disponibles en {selectedCategoryName}:{' '}
                        <strong className='text-[var(--text-primary)]'>
                          {categoryParticipants.length}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Configuración de Formato de puntuación (Super Game por defecto) */}
                  <ScoringConfigPanel value={builderScoring} onChange={setBuilderScoring} />

                  {/* Ayuda de Clasificados por Grupo */}
                  {categoryGroupsSummary.length > 0 && (
                    <div className='rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3.5 space-y-3'>
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <div>
                          <p className='text-xs font-extrabold uppercase tracking-wider text-[var(--color-brand)]'>
                            Clasificados en Fase de Grupos · {selectedCategoryName}
                          </p>
                          <p className='text-[11px] text-[var(--text-secondary)]'>
                            Puedes autocompletar los cruces sugeridos (1° vs 2° cruzados) o asignarlos manualmente abajo.
                          </p>
                        </div>
                        <div className='flex flex-wrap items-center gap-2'>
                          <button
                            type='button'
                            onClick={autofillFromGroups}
                            className='btn-primary px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5'
                          >
                            <Wand2 size={14} /> Sugerir cruces (1° vs 2°)
                          </button>
                          <button
                            type='button'
                            onClick={() =>
                              setBuilderSlots(getDefaultSlotsForRound(builderStartRound))
                            }
                            className='btn-secondary px-3 py-1.5 text-xs font-semibold'
                          >
                            Limpiar selección
                          </button>
                        </div>
                      </div>

                      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2'>
                        {categoryGroupsSummary.map((g) => (
                          <div
                            key={g.clave}
                            className='rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-2.5 text-xs space-y-1'
                          >
                            <p className='font-extrabold text-[var(--text-primary)] border-b border-[var(--border-color)] pb-1'>
                              {g.nombre}
                            </p>
                            {g.rows.slice(0, 4).map((r) => (
                              <div
                                key={r.id}
                                className='flex items-center justify-between gap-1 text-[11px] pt-0.5'
                              >
                                <span className='truncate'>
                                  <strong className='text-[var(--color-brand)]'>
                                    {r.posicion}°
                                  </strong>{' '}
                                  {r.participante?.nombre}
                                </span>
                                <span className='text-[var(--text-muted)] shrink-0 font-semibold'>
                                  {r.puntos} pts
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Paso 2: Tarjetas de cruces de la primera ronda */}
                  <div className='space-y-3'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <label className='block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]'>
                        2. Configurar llaves de {builderStartRound} ({builderSlots.length}{' '}
                        {builderSlots.length === 1 ? 'llave' : 'llaves'})
                      </label>
                      <span className='text-[11px] text-[var(--text-muted)]'>
                        La fecha, hora y cancha son opcionales (puedes programarlas después).
                      </span>
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                      {builderSlots.map((slot, idx) => {
                        const shortPrefix = ROUND_SHORT_CODE[builderStartRound] || 'L'
                        const codeLabel =
                          builderStartRound === 'Final' ? 'FINAL' : `${shortPrefix}-${idx + 1}`
                        return (
                          <div key={idx} className='ucl-builder-llave-card'>
                            <div className='ucl-builder-llave-head'>
                              <div className='flex items-center gap-2'>
                                <span className='badge-brand text-[10px] font-extrabold px-2 py-0.5'>
                                  {codeLabel}
                                </span>
                                <span className='text-xs font-extrabold text-[var(--text-primary)]'>
                                  Llave #{idx + 1} · {builderStartRound}
                                </span>
                              </div>
                              <label className='inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] cursor-pointer select-none'>
                                <input
                                  type='checkbox'
                                  checked={slot.pase_directo_lado === 1}
                                  onChange={(e) => {
                                    const next = [...builderSlots]
                                    next[idx] = {
                                      ...slot,
                                      pase_directo_lado: e.target.checked ? 1 : 0,
                                      participante2_id: e.target.checked
                                        ? ''
                                        : slot.participante2_id,
                                    }
                                    setBuilderSlots(next)
                                  }}
                                />
                                <span>Pase directo (Bye)</span>
                              </label>
                            </div>

                            <div className='p-3 space-y-2.5'>
                              <div className='space-y-1'>
                                <span className='block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]'>
                                  Lado 1 de la llave
                                </span>
                                <select
                                  aria-label={`Lado 1 llave ${idx + 1}`}
                                  className='ucl-builder-control'
                                  value={slot.participante1_id}
                                  onChange={(e) => {
                                    const next = [...builderSlots]
                                    next[idx] = { ...slot, participante1_id: e.target.value }
                                    setBuilderSlots(next)
                                  }}
                                >
                                  <option value=''>Por definir (asignar más adelante)</option>
                                  {categoryParticipants.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.badge ? `[${p.badge}] ` : ''}
                                      {p.nombre}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className='space-y-1'>
                                <span className='block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]'>
                                  Lado 2 (Rival)
                                </span>
                                <select
                                  aria-label={`Lado 2 llave ${idx + 1}`}
                                  className='ucl-builder-control'
                                  disabled={slot.pase_directo_lado === 1}
                                  value={slot.pase_directo_lado === 1 ? '' : slot.participante2_id}
                                  onChange={(e) => {
                                    const next = [...builderSlots]
                                    next[idx] = { ...slot, participante2_id: e.target.value }
                                    setBuilderSlots(next)
                                  }}
                                >
                                  <option value=''>
                                    {slot.pase_directo_lado === 1
                                      ? 'Pase directo (Lado 1 avanza automático)'
                                      : 'Por definir (asignar más adelante)'}
                                  </option>
                                  {categoryParticipants.map((p) => (
                                    <option
                                      key={p.id}
                                      value={p.id}
                                      disabled={String(p.id) === String(slot.participante1_id)}
                                    >
                                      {p.badge ? `[${p.badge}] ` : ''}
                                      {p.nombre}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className='grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1.5 border-t border-[var(--border-color)]'>
                                <label className='block space-y-0.5'>
                                  <span className='text-[10px] font-bold text-[var(--text-muted)] inline-flex items-center gap-1'>
                                    <Calendar size={10} /> Fecha (opcional)
                                  </span>
                                  <input
                                    type='date'
                                    aria-label={`Fecha llave ${idx + 1}`}
                                    className='ucl-builder-control'
                                    value={slot.fecha_inicio}
                                    onChange={(e) => {
                                      const next = [...builderSlots]
                                      next[idx] = { ...slot, fecha_inicio: e.target.value }
                                      setBuilderSlots(next)
                                    }}
                                  />
                                </label>
                                <label className='block space-y-0.5'>
                                  <span className='text-[10px] font-bold text-[var(--text-muted)] inline-flex items-center gap-1'>
                                    <Clock size={10} /> Hora (opcional)
                                  </span>
                                  <input
                                    type='time'
                                    aria-label={`Hora llave ${idx + 1}`}
                                    className='ucl-builder-control'
                                    value={slot.hora_inicio}
                                    onChange={(e) => {
                                      const next = [...builderSlots]
                                      next[idx] = { ...slot, hora_inicio: e.target.value }
                                      setBuilderSlots(next)
                                    }}
                                  />
                                </label>
                                <label className='block space-y-0.5'>
                                  <span className='text-[10px] font-bold text-[var(--text-muted)] inline-flex items-center gap-1'>
                                    <MapPin size={10} /> Cancha
                                  </span>
                                  <select
                                    aria-label={`Cancha llave ${idx + 1}`}
                                    className='ucl-builder-control'
                                    value={slot.cancha_id}
                                    onChange={(e) => {
                                      const next = [...builderSlots]
                                      next[idx] = { ...slot, cancha_id: e.target.value }
                                      setBuilderSlots(next)
                                    }}
                                  >
                                    <option value=''>Por asignar…</option>
                                    {courts.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.nombre}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className='ucl-modal-footer'>
                  <span className='text-xs text-[var(--text-secondary)] font-medium'>
                    Categoría <strong>{selectedCategoryName}</strong> · Inicio en{' '}
                    <strong>{builderStartRound}</strong> · Modo{' '}
                    <strong className='text-[var(--color-brand)]'>
                      {builderScoring.set_decisivo === 'set_completo'
                        ? 'Super Game (3er set completo)'
                        : 'Normal (Supertiebreak)'}
                    </strong>
                  </span>
                  <div className='flex items-center gap-2 ml-auto'>
                    <button
                      type='button'
                      onClick={() => setBuilderOpen(false)}
                      disabled={builderBusy}
                      className='btn-secondary px-4 py-2 text-xs font-bold'
                    >
                      Cancelar
                    </button>
                    <button
                      type='submit'
                      disabled={builderBusy}
                      className='btn-primary px-5 py-2 text-xs font-bold inline-flex items-center gap-1.5'
                    >
                      <Trophy size={15} />
                      {builderBusy
                        ? 'Guardando cuadro…'
                        : rounds.length > 0
                          ? `Actualizar cuadro de ${selectedCategoryName}`
                          : `Guardar cuadro de ${selectedCategoryName}`}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* =====================================================================
          MODAL 2: EDICIÓN MANUAL DE LLAVE / AVANCE MANUAL ("POR SI HAY ERRORES")
          ===================================================================== */}
      {editingMatch &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className='ucl-modal-backdrop'
            onClick={(e) => {
              if (e.target === e.currentTarget && !slotSaving) setEditingMatch(null)
            }}
            role='dialog'
            aria-modal='true'
            aria-label={`Ajustar llave #${editingMatch.id}`}
          >
            <div className='ucl-modal-shell max-w-2xl' onClick={(e) => e.stopPropagation()}>
              <div className='ucl-modal-header'>
                <div>
                  <span className='text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-brand)]'>
                    Ajuste Manual de Llave · {selectedCategoryName}
                  </span>
                  <h3 className='text-base sm:text-lg font-extrabold text-[var(--text-primary)]'>
                    Partido #{editingMatch.id} ({editingMatch.ronda || 'Eliminatoria'})
                  </h3>
                </div>
                <button
                  type='button'
                  onClick={() => setEditingMatch(null)}
                  className='btn-ghost p-2 rounded-xl'
                  aria-label='Cerrar'
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveSlotSubmit} className='flex flex-col flex-1 min-h-0'>
                <div className='ucl-modal-body space-y-3.5'>
                  {slotError && (
                    <p
                      role='alert'
                      className='p-3 rounded-xl bg-red-500/15 text-red-500 text-xs font-semibold'
                    >
                      {slotError}
                    </p>
                  )}

                  <label className='block text-xs font-semibold text-[var(--text-secondary)]'>
                    Ronda de esta llave
                    <select
                      className='ucl-builder-control mt-1'
                      value={slotForm.ronda}
                      onChange={(e) => setSlotForm({ ...slotForm, ronda: e.target.value })}
                    >
                      {ROUND_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Lado 1 */}
                  <div className='p-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] space-y-2'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='text-xs font-extrabold text-[var(--text-primary)]'>
                        Lado 1 de la llave
                      </span>
                      <div className='flex gap-1 text-[11px]'>
                        {[
                          ['fijo', 'Elegir pareja'],
                          ['ganador', 'Viene de llave'],
                          ['por_definir', 'Por definir'],
                        ].map(([mKey, mLabel]) => (
                          <button
                            key={mKey}
                            type='button'
                            onClick={() => setSlotForm({ ...slotForm, modo_lado1: mKey })}
                            className={`px-2 py-1 rounded-lg font-bold border ${
                              slotForm.modo_lado1 === mKey
                                ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)]'
                            }`}
                          >
                            {mLabel}
                          </button>
                        ))}
                      </div>
                    </div>

                    {slotForm.modo_lado1 === 'fijo' && (
                      <select
                        className='ucl-builder-control'
                        value={slotForm.participante1_id}
                        onChange={(e) =>
                          setSlotForm({ ...slotForm, participante1_id: e.target.value })
                        }
                      >
                        <option value=''>Seleccionar pareja / jugador…</option>
                        {categoryParticipants.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.badge ? `[${p.badge}] ` : ''}
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    )}

                    {slotForm.modo_lado1 === 'ganador' && (
                      <select
                        className='ucl-builder-control'
                        value={slotForm.origen_partido1_id}
                        onChange={(e) =>
                          setSlotForm({ ...slotForm, origen_partido1_id: e.target.value })
                        }
                      >
                        <option value=''>Seleccionar llave de origen…</option>
                        {matches
                          .filter(
                            (m) =>
                              categoryKey(m) === selected && Number(m.id) !== Number(editingMatch.id)
                          )
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              #{m.id} ({m.ronda || m.fase}) — {getParticipantName(m, 1)} vs{' '}
                              {getParticipantName(m, 2)}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>

                  {/* Lado 2 */}
                  <div className='p-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] space-y-2'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='text-xs font-extrabold text-[var(--text-primary)]'>
                        Lado 2 de la llave
                      </span>
                      <div className='flex gap-1 text-[11px]'>
                        {[
                          ['fijo', 'Elegir pareja'],
                          ['ganador', 'Viene de llave'],
                          ['por_definir', 'Por definir'],
                        ].map(([mKey, mLabel]) => (
                          <button
                            key={mKey}
                            type='button'
                            onClick={() => setSlotForm({ ...slotForm, modo_lado2: mKey })}
                            className={`px-2 py-1 rounded-lg font-bold border ${
                              slotForm.modo_lado2 === mKey
                                ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)]'
                            }`}
                          >
                            {mLabel}
                          </button>
                        ))}
                      </div>
                    </div>

                    {slotForm.modo_lado2 === 'fijo' && (
                      <select
                        className='ucl-builder-control'
                        value={slotForm.participante2_id}
                        onChange={(e) =>
                          setSlotForm({ ...slotForm, participante2_id: e.target.value })
                        }
                      >
                        <option value=''>Seleccionar pareja / jugador…</option>
                        {categoryParticipants.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.badge ? `[${p.badge}] ` : ''}
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    )}

                    {slotForm.modo_lado2 === 'ganador' && (
                      <select
                        className='ucl-builder-control'
                        value={slotForm.origen_partido2_id}
                        onChange={(e) =>
                          setSlotForm({ ...slotForm, origen_partido2_id: e.target.value })
                        }
                      >
                        <option value=''>Seleccionar llave de origen…</option>
                        {matches
                          .filter(
                            (m) =>
                              categoryKey(m) === selected && Number(m.id) !== Number(editingMatch.id)
                          )
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              #{m.id} ({m.ronda || m.fase}) — {getParticipantName(m, 1)} vs{' '}
                              {getParticipantName(m, 2)}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>

                  {/* Clasificado / Avance manual */}
                  <div className='p-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-2'>
                    <p className='text-xs font-extrabold text-[var(--color-brand)] flex items-center gap-1.5'>
                      <ShieldCheck size={15} /> Clasificado / Avance manual a siguiente ronda
                    </p>
                    <select
                      className='ucl-builder-control'
                      value={slotForm.ganador_manual}
                      onChange={(e) =>
                        setSlotForm({
                          ...slotForm,
                          ganador_manual: e.target.value,
                          finalizar_manual: Boolean(e.target.value) || slotForm.finalizar_manual,
                        })
                      }
                    >
                      <option value=''>Sin ganador forzado (según marcador en cancha)</option>
                      <option value='jugador1'>
                        Avanza Lado 1 ({getParticipantName(editingMatch, 1)})
                      </option>
                      <option value='jugador2'>
                        Avanza Lado 2 ({getParticipantName(editingMatch, 2)})
                      </option>
                    </select>

                    {slotForm.ganador_manual && (
                      <label className='inline-flex items-center gap-2 text-xs font-semibold cursor-pointer'>
                        <input
                          type='checkbox'
                          checked={slotForm.finalizar_manual}
                          onChange={(e) =>
                            setSlotForm({ ...slotForm, finalizar_manual: e.target.checked })
                          }
                        />
                        Marcar llave como finalizada y avanzar a la siguiente ronda ahora
                      </label>
                    )}
                  </div>

                  <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
                    <label className='block text-xs font-semibold text-[var(--text-secondary)]'>
                      <span className='inline-flex items-center gap-1'>
                        <Calendar size={11} /> Fecha
                      </span>
                      <input
                        type='date'
                        className='ucl-builder-control mt-1'
                        value={slotForm.fecha_inicio}
                        onChange={(e) => setSlotForm({ ...slotForm, fecha_inicio: e.target.value })}
                      />
                    </label>
                    <label className='block text-xs font-semibold text-[var(--text-secondary)]'>
                      <span className='inline-flex items-center gap-1'>
                        <Clock size={11} /> Hora
                      </span>
                      <input
                        type='time'
                        className='ucl-builder-control mt-1'
                        value={slotForm.hora_inicio}
                        onChange={(e) => setSlotForm({ ...slotForm, hora_inicio: e.target.value })}
                      />
                    </label>
                    <label className='block text-xs font-semibold text-[var(--text-secondary)]'>
                      <span className='inline-flex items-center gap-1'>
                        <MapPin size={11} /> Cancha
                      </span>
                      <select
                        className='ucl-builder-control mt-1'
                        value={slotForm.cancha_id}
                        onChange={(e) => setSlotForm({ ...slotForm, cancha_id: e.target.value })}
                      >
                        <option value=''>Por asignar</option>
                        {courts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* Configuración de Formato de puntuación de esta llave */}
                  <ScoringConfigPanel
                    value={slotForm}
                    onChange={(next) => setSlotForm({ ...slotForm, ...next })}
                    compact
                  />
                </div>

                <div className='ucl-modal-footer'>
                  <div className='flex items-center gap-2 ml-auto'>
                    <button
                      type='button'
                      onClick={() => setEditingMatch(null)}
                      className='btn-secondary px-4 py-2 text-xs font-bold'
                    >
                      Cancelar
                    </button>
                    <button
                      type='submit'
                      disabled={slotSaving}
                      className='btn-primary px-5 py-2 text-xs font-bold'
                    >
                      {slotSaving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </section>
  )
}
