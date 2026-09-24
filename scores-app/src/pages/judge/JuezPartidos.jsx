import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  ArrowLeft,
  Pause,
  Play,
  Undo2,
  RefreshCw,
  X,
  Settings2,
  BarChart3,
  UserCheck,
  AlertTriangle,
  Search,
  Trophy,
  Ban,
  Calendar,
  Filter,
  MapPin,
  User,
  Users,
  Sparkles,
} from 'lucide-react'
import { matchService } from '../../services/matchService'
import { getParticipantName } from '../../utils/matchParticipants'
import { createJudgeSession } from '../../utils/judgeSession'
import { confirm } from '../../utils/confirm'
import MatchStats from '../../components/match/MatchStats'
import MatchPhotoCapture from '../../components/match/MatchPhotoCapture'
import ModalFinalizarW from '../../components/match/ModalFinalizarW'
import ModalCancelarPartido from '../../components/match/ModalCancelarPartido'
import ModalAsignarCancha from '../../components/match/ModalAsignarCancha'
import { useMatchTimer } from '../../hooks/useMatchTimer'
import { useMatchRealtime } from '../../hooks/useMatchRealtime'
import './judge.css'
import useAuthStore from '../../store/useAuthStore'
import { projectJudgeEvent } from '../../utils/projectJudgeEvent'
import { doublesServer } from '../../utils/doublesServer'
import { applyEvent, computeBreakpoint, createInitialState, serializeState } from '../../generated/scoreEngine.js'
import { toJudgeState } from '../../utils/judgeState.js'

const reasons = [
  ['tiro_ganador', 'Winner', 'Golpe ganador que el rival no logra devolver'],
  ['ace', 'Ace', 'Saque válido que gana el punto sin que el rival toque la pelota'],
  ['error_no_forzado', 'Error no forzado', 'Fallo sin presión clara del oponente'],
  ['error_forzado', 'Error forzado', 'Fallo provocado por la presión del oponente'],
  ['infraccion', 'Infracción del rival', 'Por ejemplo, tocar la red'],
  ['penalizacion', 'Penalización', 'Punto otorgado por sanción'],
]
const reasonLabel = (event, names) => {
  if (!event) return 'Todavía no hay acciones registradas'
  if (event.tipo === 'primera_falta') return 'Primera falta · segundo saque'
  if (event.tipo === 'let') return 'Let · se repite el saque'
  if (event.tipo === 'cambio_servidor') return 'Cambio de sacador'
  if (event.tipo === 'correccion') return 'Corrección de marcador por supervisión'
  const reason = event.motivo === 'doble_falta' ? 'Doble falta' : reasons.find(([key]) => key === event.motivo)?.[1] || 'Punto sin detalle'
  return `${names[event.ganador]} · ${reason}`
}

export default function JuezPartidos() {
  const { setScoringActive } = useOutletContext() || {}
  const user = useAuthStore((store) => store.user)
  const userId = user?.id
  const [exclusive, setExclusive] = useState(false)
  const lockAllowed = useRef(false)
  const [matches, setMatches] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [view, setView] = useState({ match: null, control: null, busy: false })
  const sessionRef = useRef(null)
  const [quick, setQuick] = useState(false)
  const [pending, setPending] = useState(null)
  const [panel, setPanel] = useState(null)
  const [firstServers, setFirstServers] = useState(['', ''])
  const [suspending, setSuspending] = useState(false)
  const [suspensionReason, setSuspensionReason] = useState('')
  const [conflictReview, setConflictReview] = useState(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewChecked, setReviewChecked] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [nameDraft, setNameDraft] = useState(['', ''])
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState('')
  const isDirectorOrAdmin = ['admin', 'juez_director'].includes(user?.rol)

  // Modo Práctica / Partidos de Prueba (100% privado y en memoria)
  const [practiceMatch, setPracticeMatch] = useState(null)
  const [practiceControl, setPracticeControl] = useState(null)
  const [practiceHistory, setPracticeHistory] = useState([])

  // Filtros y pestañas ordenadas para jueces y directores
  const [statusTab, setStatusTab] = useState('programados') // 'programados' | 'finalizados' | 'todos'
  const [dateFilter, setDateFilter] = useState('todas')
  const [categoryFilter, setCategoryFilter] = useState('todas')
  const [judgeFilter, setJudgeFilter] = useState('todos')
  const [matchSearch, setMatchSearch] = useState('')

  // Modales W, Cancelar y Cancha
  const [matchToWalkover, setMatchToWalkover] = useState(null)
  const [matchToCancel, setMatchToCancel] = useState(null)
  const [matchToCourt, setMatchToCourt] = useState(null)

  const listRequest = useRef(0)

  const assignedJudges = useMemo(() => {
    const map = new Map()
    matches.forEach((m) => {
      if (m.juez?.id) {
        map.set(m.juez.id, `${m.juez.nombre} ${m.juez.apellido || ''}`.trim())
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [matches])

  const availableDates = useMemo(() => {
    const set = new Set()
    matches.forEach((m) => {
      if (m.fecha_inicio) {
        set.add(String(m.fecha_inicio).slice(0, 10))
      }
    })
    return Array.from(set).sort()
  }, [matches])

  const availableCategories = useMemo(() => {
    const map = new Map()
    matches.forEach((m) => {
      const id = m.categoria?.id ?? m.categoria_id
      const name = m.categoria?.nombre ?? m.categoria_nombre
      if (id && name) {
        map.set(String(id), name)
      } else if (name) {
        map.set(name, name)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [matches])

  const countProgramados = useMemo(
    () => matches.filter((m) => ['programado', 'en_vivo'].includes(m.estado)).length,
    [matches]
  )
  const countFinalizados = useMemo(
    () => matches.filter((m) => m.estado === 'finalizado').length,
    [matches]
  )
  const countCancelados = useMemo(
    () => matches.filter((m) => m.estado === 'cancelado').length,
    [matches]
  )
  const countTodos = matches.length

  const formatDateLabel = (dateStr) => {
    if (!dateStr) return ''
    try {
      const clean = dateStr.slice(0, 10)
      const parts = clean.split('-')
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`
      }
      return clean
    } catch {
      return dateStr
    }
  }

  const hasActiveFilters =
    statusTab !== 'programados' ||
    dateFilter !== 'todas' ||
    categoryFilter !== 'todas' ||
    matchSearch.trim() !== '' ||
    (isDirectorOrAdmin && judgeFilter !== 'todos')

  const resetFilters = () => {
    setStatusTab('programados')
    setDateFilter('todas')
    setCategoryFilter('todas')
    setMatchSearch('')
    setJudgeFilter('todos')
  }

  const visibleMatches = useMemo(() => {
    return matches.filter((m) => {
      // 1. Pestañas de estado (programados / finalizados / cancelados / todos)
      if (statusTab === 'programados') {
        if (!['programado', 'en_vivo'].includes(m.estado)) return false
      } else if (statusTab === 'finalizados') {
        if (m.estado !== 'finalizado') return false
      } else if (statusTab === 'cancelados') {
        if (m.estado !== 'cancelado') return false
      }

      // 2. Filtro por fecha
      if (dateFilter !== 'todas') {
        const d = m.fecha_inicio ? String(m.fecha_inicio).slice(0, 10) : ''
        if (d !== dateFilter) return false
      }

      // 3. Filtro por categoría
      if (categoryFilter !== 'todas') {
        const catId = m.categoria?.id ?? m.categoria_id
        const catName = m.categoria?.nombre ?? m.categoria_nombre
        if (String(catId) !== String(categoryFilter) && catName !== categoryFilter) return false
      }

      // 4. Filtro por juez (supervisión director/admin)
      if (isDirectorOrAdmin) {
        if (judgeFilter === 'mis_partidos') {
          if (Number(m.juez?.id) !== Number(userId)) return false
        } else if (judgeFilter === 'sin_juez') {
          if (m.juez?.id) return false
        } else if (judgeFilter !== 'todos') {
          if (String(m.juez?.id) !== String(judgeFilter)) return false
        }
      }

      // 5. Búsqueda por texto (jugadores, juez, cancha, torneo)
      if (matchSearch.trim()) {
        const q = matchSearch.trim().toLowerCase()
        const p1 = getParticipantName(m, 1) || ''
        const p2 = getParticipantName(m, 2) || ''
        const judgeName = `${m.juez?.nombre || ''} ${m.juez?.apellido || ''}`.toLowerCase()
        const court = (m.cancha?.nombre || m.cancha_nombre || '').toLowerCase()
        const cat = (m.categoria?.nombre || m.categoria_nombre || '').toLowerCase()
        const tour = (m.torneo?.nombre || m.torneo_nombre || '').toLowerCase()
        if (!`${p1} ${p2} ${court} ${cat} ${tour} ${judgeName}`.toLowerCase().includes(q)) {
          return false
        }
      }

      return true
    })
  }, [matches, statusTab, dateFilter, categoryFilter, judgeFilter, isDirectorOrAdmin, matchSearch, userId])

  const refreshMatches = useCallback(async () => {
    const request = ++listRequest.current
    setListLoading(true)
    try {
      const response = await matchService.getAssignments()
      if (request !== listRequest.current) return
      setMatches(response.data || [])
      setListError('')
    } catch (error) {
      if (request === listRequest.current) setListError(error.message || 'No se pudieron cargar tus partidos')
    } finally {
      if (request === listRequest.current) setListLoading(false)
    }
  }, [])

  useEffect(() => {
    const session = createJudgeSession(matchService, setView, { storage: localStorage, userId, isOnline: () => navigator.onLine, project: projectJudgeEvent, canWrite: () => lockAllowed.current })
    sessionRef.current = session
    let release, stopped = false
    const held = new Promise(resolve => { release = resolve })
    if (navigator.locks) navigator.locks.request(`judge-outbox:${userId}`, async (lock) => {
      if (!lock || stopped) return
      lockAllowed.current = true; setExclusive(true)
      session.restore()
      session.sync()
      await held
    })
    refreshMatches()
    return () => { stopped = true; release(); lockAllowed.current = false; session.dispose(); ++listRequest.current }
  }, [refreshMatches, userId])

  const isPractice = Boolean(practiceMatch)
  const selectedId = isPractice ? 'practica' : view.match?.id

  const startPracticeMatch = (isDoubles = false) => {
    const config = {
      mejor_de_sets: 3,
      juegos_por_set: 6,
      diferencia_juegos: 2,
      modo_game: 'ventaja',
      set_decisivo: 'match_tiebreak',
      tiebreak_en: 6,
      tiebreak_puntos: 7,
      match_tiebreak_puntos: 10,
      servidor_inicial: 'jugador1',
    }
    const rawEngine = createInitialState(config)
    const serialized = serializeState(rawEngine)
    const practiceMatchObj = {
      id: 'practica',
      isPractice: true,
      deporte: 'tenis',
      modalidad: isDoubles ? 'dobles' : 'individual',
      estado: 'en_vivo',
      categoria: { id: 0, nombre: 'Modo Práctica' },
      torneo: { id: 0, nombre: 'Partido de Entrenamiento' },
      cancha: { nombre: 'Cancha de Práctica (Virtual)' },
      jugador1: isDoubles ? null : { id: -1, nombre: 'Jugador 1', apellido: '(Práctica)' },
      jugador2: isDoubles ? null : { id: -2, nombre: 'Jugador 2', apellido: '(Práctica)' },
      equipo1: isDoubles
        ? {
            id: -1,
            nombre: 'Pareja 1 (Práctica)',
            jugador1: { id: -1, nombre: 'Jugador 1A', apellido: '' },
            jugador2: { id: -2, nombre: 'Jugador 1B', apellido: '' },
          }
        : null,
      equipo2: isDoubles
        ? {
            id: -2,
            nombre: 'Pareja 2 (Práctica)',
            jugador1: { id: -3, nombre: 'Jugador 2A', apellido: '' },
            jugador2: { id: -4, nombre: 'Jugador 2B', apellido: '' },
          }
        : null,
      formato: config,
      nombre_override_j1: null,
      nombre_override_j2: null,
    }

    const practiceCtrl = toJudgeState({
      partido: practiceMatchObj,
      marcador: serialized,
      raw_marcador: rawEngine,
      revision: '1:1',
      configuration: '1:1',
      eventos_recientes: [],
      breakpoint: computeBreakpoint(rawEngine, config),
      en_vivo: {
        estado: 'en_vivo',
        iniciado_at: new Date().toISOString(),
        pausado_at: null,
        saca: 'jugador1',
      },
    })

    setPracticeMatch(practiceMatchObj)
    setPracticeControl(practiceCtrl)
    setPracticeHistory([])
  }

  const exitPractice = async () => {
    if (
      await confirm({
        title: 'Salir del partido de prueba',
        message: '¿Estás seguro de salir del partido de prueba? Los datos de entrenamiento no se guardarán.',
        confirmLabel: 'Salir de práctica',
      })
    ) {
      setPracticeMatch(null)
      setPracticeControl(null)
      setPracticeHistory([])
      setPending(null)
      setPanel(null)
    }
  }

  const togglePracticePause = () => {
    setPracticeControl((prev) => {
      if (!prev) return prev
      const isPaused = Boolean(prev.en_vivo?.pausado_at)
      return toJudgeState({
        ...prev,
        en_vivo: {
          ...prev.en_vivo,
          pausado_at: isPaused ? null : new Date().toISOString(),
        },
      })
    })
  }

  const changePracticeServer = (newServer) => {
    setPracticeControl((prev) => {
      if (!prev) return prev
      return toJudgeState({
        ...prev,
        raw_marcador: { ...prev.raw_marcador, server: newServer },
        en_vivo: { ...prev.en_vivo, saca: newServer },
      })
    })
  }

  useEffect(() => {
    if (isPractice) return
    const recover = () => {
      setOnline(navigator.onLine)
      if (navigator.onLine && document.visibilityState === 'visible') sessionRef.current?.sync()
    }
    window.addEventListener('online', recover)
    window.addEventListener('offline', recover)
    window.addEventListener('focus', recover)
    document.addEventListener('visibilitychange', recover)
    const interval = setInterval(recover, view.pending ? 5000 : 30000)
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', recover)
      window.removeEventListener('offline', recover)
      window.removeEventListener('focus', recover)
      document.removeEventListener('visibilitychange', recover)
    }
  }, [selectedId, Boolean(view.pending), isPractice])

  useMatchRealtime(useCallback((event) => {
    if (isPractice) return
    if (selectedId) {
      if (event.matchId == null || Number(event.matchId) === Number(selectedId)) sessionRef.current?.sync()
    } else refreshMatches()
  }, [selectedId, refreshMatches, isPractice]))

  const state = isPractice ? practiceControl : view.control
  const match = isPractice ? practiceMatch : (state?.partido || view.match)
  const names = { jugador1: getParticipantName(match || {}, 1) || 'Jugador 1', jugador2: getParticipantName(match || {}, 2) || 'Jugador 2' }
  const score = state?.marcador
  const live = state?.en_vivo
  const finished = score?.terminado || ['finalizado', 'cancelado'].includes(live?.estado)
  const paused = Boolean(live?.pausado_at)
  const playing = live?.estado === 'en_vivo' && !finished
  useEffect(() => {
    setScoringActive?.(playing && !paused)
    return () => setScoringActive?.(false)
  }, [playing, paused, setScoringActive])
  useEffect(() => {
    if (isPractice || !view.pendingCount) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [Boolean(view.pendingCount), isPractice])
  const locked = !isPractice && (view.busy || view.needsSync || view.conflict || nameBusy || !exclusive)
  const adminLocked = !isPractice && (locked || Boolean(view.pendingCount) || !online)
  const canScore = isPractice ? (playing && !paused) : (playing && !paused && !locked)
  const server = live?.saca || 'jugador1'
  const isDoubles = match?.modalidad === 'dobles'
  const individualServer = doublesServer(state?.raw_marcador, state?.doubles_order)
  const servingPlayer = individualServer && match?.[`equipo${individualServer.team}`]?.[`jugador${individualServer.member}`]
  const servingName = servingPlayer ? [servingPlayer.nombre, servingPlayer.apellido].filter(Boolean).join(' ') : null
  const receiver = server === 'jugador1' ? 'jugador2' : 'jugador1'
  const lastEvent = state?.eventos_recientes?.[0]
  const { formatted: elapsed } = useMatchTimer(live, live?.estado)

  const write = async (operation) => {
    if (isPractice) {
      setPending(null)
      setPanel(null)
      togglePracticePause()
      return true
    }
    if (adminLocked) return false
    const success = await sessionRef.current.write(operation)
    if (success) { setPending(null); setPanel(null) }
    return success
  }
  const record = async (event) => {
    if (isPractice) {
      setPending(null)
      try {
        const config = practiceMatch.formato
        const prevControl = practiceControl
        const nextRaw = applyEvent(prevControl.raw_marcador, event, config)
        const nextSerialized = serializeState(nextRaw)
        const nextControl = toJudgeState({
          ...prevControl,
          revision: '1:1',
          partido: {
            ...practiceMatch,
            estado: nextRaw.winner ? 'finalizado' : 'en_vivo',
          },
          raw_marcador: nextRaw,
          marcador: nextSerialized,
          breakpoint: computeBreakpoint(nextRaw, config),
          eventos_recientes: [
            { ...event, id: crypto.randomUUID(), local: true },
            ...(prevControl.eventos_recientes || []),
          ].slice(0, 20),
          en_vivo: {
            ...prevControl.en_vivo,
            estado: nextRaw.winner ? 'finalizado' : 'en_vivo',
            saca: nextRaw.server || prevControl.en_vivo.saca,
          },
        })
        setPracticeHistory((prev) => [...prev, prevControl])
        setPracticeControl(nextControl)
        return true
      } catch (err) {
        console.error('Error en práctica:', err)
        return false
      }
    }
    if (locked) return
    setPending(null)
    return sessionRef.current.record(event)
  }
  const point = (ganador, motivo = 'punto_sin_detalle') => record({ tipo: 'punto', ganador, motivo })
  const select = (item) => {
    setPending(null); setPanel(null)
    sessionRef.current.select(item)
  }
  const undo = async () => {
    if (isPractice) {
      if (!practiceHistory.length) return
      if (
        await confirm({
          title: 'Deshacer última acción',
          message: '¿Deseas revertir el último punto en este partido de prueba?',
          confirmLabel: 'Deshacer',
        })
      ) {
        const previous = practiceHistory[practiceHistory.length - 1]
        setPracticeHistory((prev) => prev.slice(0, -1))
        setPracticeControl(previous)
      }
      return
    }
    if (await confirm({ title: 'Deshacer última acción', message: reasonLabel(lastEvent, names), confirmLabel: 'Deshacer' })) {
      if (view.canUndoLocal) sessionRef.current.undoLocal()
      else await write((id) => matchService.undoPoint(id))
    }
  }
  const openSettings = () => {
    setNameDraft([match?.nombre_override_j1 || '', match?.nombre_override_j2 || ''])
    setNameError(''); setPanel('settings')
  }
  const saveNames = async (event) => {
    event.preventDefault()
    if (nameBusy || adminLocked) return
    if (isPractice) {
      setPracticeMatch((prev) => ({
        ...prev,
        nombre_override_j1: nameDraft[0] || null,
        nombre_override_j2: nameDraft[1] || null,
        jugador1: prev.jugador1 ? { ...prev.jugador1, nombre: nameDraft[0] || 'Jugador 1' } : null,
        jugador2: prev.jugador2 ? { ...prev.jugador2, nombre: nameDraft[1] || 'Jugador 2' } : null,
        equipo1: prev.equipo1 ? { ...prev.equipo1, nombre: nameDraft[0] || 'Pareja 1' } : null,
        equipo2: prev.equipo2 ? { ...prev.equipo2, nombre: nameDraft[1] || 'Pareja 2' } : null,
      }))
      setPanel(null)
      return
    }
    setNameBusy(true); setNameError('')
    try {
      await matchService.updateParticipants(selectedId, { nombre_override_j1: nameDraft[0] || null, nombre_override_j2: nameDraft[1] || null })
      await sessionRef.current.sync()
      setPanel(null)
    } catch (error) { setNameError(error.message || 'No se pudieron guardar los nombres') }
    finally { setNameBusy(false) }
  }

  return (
    <>
      {!selectedId ? (
        <section className='space-y-4 py-2'>
          <div className='flex items-center justify-between gap-2'>
            <div>
              <div className='flex items-center gap-2'>
                <h1 className='text-xl font-bold'>Mesa de juez</h1>
                {isDirectorOrAdmin && (
                  <span
                    className='text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider'
                    style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}
                  >
                    Supervisión Jueces
                  </span>
                )}
              </div>
              <p className='text-sm text-[var(--text-muted)]'>
                {isDirectorOrAdmin
                  ? 'Viendo todos los partidos de la jornada. Selecciona el que desees arbitrar.'
                  : 'Selecciona el partido que vas a arbitrar.'}
              </p>
            </div>
            <button
              className='btn-ghost p-3'
              onClick={refreshMatches}
              disabled={listLoading}
              aria-label='Actualizar partidos'
            >
              <RefreshCw size={20} className={listLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Sección Modo Práctica / Partido de Prueba para Jueces */}
          <div
            className='p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm'
            style={{
              backgroundColor: 'rgba(234, 179, 8, 0.05)',
              borderColor: 'rgba(234, 179, 8, 0.25)',
            }}
          >
            <div className='flex items-start gap-3'>
              <div className='p-2.5 rounded-xl bg-amber-500/10 text-amber-400 shrink-0 mt-0.5'>
                <Sparkles size={20} />
              </div>
              <div>
                <div className='flex items-center gap-2'>
                  <h2 className='text-sm font-bold text-amber-300'>Modo Práctica para Jueces</h2>
                  <span className='text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-500/20 text-amber-300'>
                    Entrenamiento
                  </span>
                </div>
                <p className='text-xs text-[var(--text-muted)] mt-0.5 max-w-xl'>
                  Inicia un partido de prueba virtual para practicar el arbitraje, conteo de puntos, desempates y uso de la mesa. No se guarda en la base de datos, no afecta estadísticas ni aparecerá en la programación pública.
                </p>
              </div>
            </div>

            <div className='flex items-center gap-2 shrink-0'>
              <button
                type='button'
                onClick={() => startPracticeMatch(false)}
                className='px-3.5 py-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm'
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid rgba(234, 179, 8, 0.4)',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#eab308')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(234, 179, 8, 0.4)')}
              >
                <User size={14} className='text-amber-400' />
                <span>Práctica Individual</span>
              </button>
              <button
                type='button'
                onClick={() => startPracticeMatch(true)}
                className='px-3.5 py-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm'
                style={{
                  backgroundColor: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid rgba(234, 179, 8, 0.5)',
                  color: '#fef08a',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(234, 179, 8, 0.25)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(234, 179, 8, 0.15)')}
              >
                <Users size={14} className='text-amber-400' />
                <span>Práctica Dobles</span>
              </button>
            </div>
          </div>

          {/* Pestañas de Estado (Programados, Finalizados, Todos) */}
          <div className='flex flex-wrap items-center gap-2'>
            <div
              className='flex p-1 rounded-xl border text-xs font-semibold'
              style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
            >
              <button
                type='button'
                onClick={() => setStatusTab('programados')}
                className='px-3 py-1.5 rounded-lg transition-all flex items-center gap-2'
                style={{
                  backgroundColor: statusTab === 'programados' ? 'var(--color-brand)' : 'transparent',
                  color: statusTab === 'programados' ? 'var(--color-brand-contrast)' : 'var(--text-muted)',
                }}
              >
                <span>Programados</span>
                <span
                  className='text-[10px] px-1.5 py-0.5 rounded-full font-bold'
                  style={{
                    backgroundColor: statusTab === 'programados' ? 'rgba(0,0,0,0.2)' : 'var(--bg-hover)',
                    color: statusTab === 'programados' ? 'inherit' : 'var(--text-primary)',
                  }}
                >
                  {countProgramados}
                </span>
              </button>

              <button
                type='button'
                onClick={() => setStatusTab('finalizados')}
                className='px-3 py-1.5 rounded-lg transition-all flex items-center gap-2'
                style={{
                  backgroundColor: statusTab === 'finalizados' ? 'var(--color-brand)' : 'transparent',
                  color: statusTab === 'finalizados' ? 'var(--color-brand-contrast)' : 'var(--text-muted)',
                }}
              >
                <span>Finalizados</span>
                <span
                  className='text-[10px] px-1.5 py-0.5 rounded-full font-bold'
                  style={{
                    backgroundColor: statusTab === 'finalizados' ? 'rgba(0,0,0,0.2)' : 'var(--bg-hover)',
                    color: statusTab === 'finalizados' ? 'inherit' : 'var(--text-primary)',
                  }}
                >
                  {countFinalizados}
                </span>
              </button>

              <button
                type='button'
                onClick={() => setStatusTab('cancelados')}
                className='px-3 py-1.5 rounded-lg transition-all flex items-center gap-2'
                style={{
                  backgroundColor: statusTab === 'cancelados' ? '#ef4444' : 'transparent',
                  color: statusTab === 'cancelados' ? '#ffffff' : 'var(--text-muted)',
                }}
              >
                <Ban size={13} className={statusTab === 'cancelados' ? 'text-white' : 'text-red-400'} />
                <span>Cancelados</span>
                <span
                  className='text-[10px] px-1.5 py-0.5 rounded-full font-bold'
                  style={{
                    backgroundColor: statusTab === 'cancelados' ? 'rgba(0,0,0,0.25)' : 'rgba(239, 68, 68, 0.15)',
                    color: statusTab === 'cancelados' ? '#ffffff' : '#ef4444',
                  }}
                >
                  {countCancelados}
                </span>
              </button>

              <button
                type='button'
                onClick={() => setStatusTab('todos')}
                className='px-3 py-1.5 rounded-lg transition-all flex items-center gap-2'
                style={{
                  backgroundColor: statusTab === 'todos' ? 'var(--color-brand)' : 'transparent',
                  color: statusTab === 'todos' ? 'var(--color-brand-contrast)' : 'var(--text-muted)',
                }}
              >
                <span>Todos</span>
                <span
                  className='text-[10px] px-1.5 py-0.5 rounded-full font-bold'
                  style={{
                    backgroundColor: statusTab === 'todos' ? 'rgba(0,0,0,0.2)' : 'var(--bg-hover)',
                    color: statusTab === 'todos' ? 'inherit' : 'var(--text-primary)',
                  }}
                >
                  {countTodos}
                </span>
              </button>
            </div>
          </div>

          {/* Barra de Filtros: Búsqueda por jugador/texto, Fecha, Categoría (y Juez para admin/director) */}
          <div
            className='p-3.5 rounded-2xl border space-y-2.5'
            style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
          >
            <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2'>
              {/* Búsqueda */}
              <div className='relative sm:col-span-2 md:col-span-1'>
                <Search size={15} className='absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]' />
                <input
                  type='text'
                  placeholder='Buscar por jugador, cancha…'
                  value={matchSearch}
                  onChange={(e) => setMatchSearch(e.target.value)}
                  className='form-input pl-9 text-xs w-full'
                />
              </div>

              {/* Filtro por Fecha */}
              <div>
                <select
                  className='form-input text-xs w-full'
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                >
                  <option value='todas'>Todas las fechas</option>
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {formatDateLabel(d)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Categoría */}
              <div>
                <select
                  className='form-input text-xs w-full'
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value='todas'>Todas las categorías</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Juez (Solo si es Director / Admin) */}
              {isDirectorOrAdmin && (
                <div>
                  <select
                    className='form-input text-xs w-full'
                    value={judgeFilter}
                    onChange={(e) => setJudgeFilter(e.target.value)}
                  >
                    <option value='todos'>Todos los jueces ({matches.length})</option>
                    <option value='mis_partidos'>Mis partidos asignados</option>
                    <option value='sin_juez'>Sin juez asignado</option>
                    {assignedJudges.map((j) => (
                      <option key={j.id} value={j.id}>
                        Juez: {j.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Resumen y botón de limpiar filtros */}
            <div className='flex items-center justify-between text-[11px] text-[var(--text-muted)] px-0.5'>
              <span>
                Mostrando {visibleMatches.length} de {matches.length} partidos
              </span>
              {hasActiveFilters && (
                <button
                  type='button'
                  onClick={resetFilters}
                  className='font-semibold text-[var(--color-brand)] hover:underline'
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {listError && <p role='alert' className='text-xs text-red-500'>{listError}</p>}
          {!exclusive && (
            <p role='status' className='text-sm'>
              Abre la mesa en una sola pestaña y usa un navegador actualizado con HTTPS. Si tienes otra mesa abierta, ciérrala y recarga esta.
            </p>
          )}
          {listLoading && <p role='status'>Cargando partidos…</p>}
          {!listLoading && !visibleMatches.length && (
            <p className='card p-5 text-center text-sm text-[var(--text-muted)]'>
              {statusTab === 'cancelados'
                ? 'No hay partidos cancelados para los filtros seleccionados.'
                : statusTab === 'finalizados'
                ? 'No hay partidos finalizados para los filtros seleccionados.'
                : 'No se encontraron partidos para los filtros seleccionados.'}
            </p>
          )}

          {/* Grid de Partidos */}
          <div className='grid sm:grid-cols-2 gap-3'>
            {visibleMatches.map((item) => {
              const isLive = item.estado === 'en_vivo'
              const isFinished = item.estado === 'finalizado'
              const isCancelled = item.estado === 'cancelado'
              const p1 = getParticipantName(item, 1) || 'Lado 1'
              const p2 = getParticipantName(item, 2) || 'Lado 2'
              const courtName = item.cancha?.nombre || item.cancha_nombre || 'Cancha por definir'
              const categoryName = item.categoria?.nombre || item.categoria_nombre || 'Categoría general'
              const tournamentName = item.torneo?.nombre || item.torneo_nombre || 'Partido libre'
              const dateStr = item.fecha_inicio ? formatDateLabel(String(item.fecha_inicio).slice(0, 10)) : ''
              const timeStr = item.hora_inicio ? item.hora_inicio.slice(0, 5) : ''

              return (
                <div
                  key={item.id}
                  onClick={() => select(item)}
                  role='button'
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      select(item)
                    }
                  }}
                  className={`judge-assignment card p-4 text-left flex flex-col justify-between cursor-pointer transition-all hover:border-[var(--color-brand)] ${
                    isLive ? 'is-live' : ''
                  }`}
                >
                  <div>
                    {/* Cabecera: Cancha y Estado */}
                    <div className='flex items-center justify-between gap-2 text-xs text-[var(--text-muted)] mb-1'>
                      <span className='truncate font-semibold text-[var(--text-primary)]'>
                        {courtName} · {categoryName}
                      </span>
                      <span
                        className='shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider inline-flex items-center gap-1'
                        style={{
                          backgroundColor: isLive
                            ? 'rgba(16, 185, 129, 0.15)'
                            : isCancelled
                            ? 'rgba(239, 68, 68, 0.15)'
                            : isFinished
                            ? 'rgba(148, 163, 184, 0.15)'
                            : 'rgba(59, 130, 246, 0.15)',
                          color: isLive
                            ? '#10b981'
                            : isCancelled
                            ? '#ef4444'
                            : isFinished
                            ? 'var(--text-muted)'
                            : '#3b82f6',
                        }}
                      >
                        {isLive && <span className='w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse' />}
                        {isLive
                          ? 'En vivo'
                          : isCancelled
                          ? 'Cancelado'
                          : isFinished
                          ? 'Finalizado'
                          : 'Programado'}
                      </span>
                    </div>

                    {/* Fecha y torneo */}
                    <div className='text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 mb-2 truncate'>
                      {dateStr && (
                        <span className='inline-flex items-center gap-1'>
                          <Calendar size={11} /> {dateStr} {timeStr ? `· ${timeStr}` : ''}
                        </span>
                      )}
                      <span>· {tournamentName}</span>
                    </div>

                    {/* Participantes */}
                    <div className='judge-assignment-players'>
                      <strong className={isFinished && item.ganador === 'jugador1' ? 'text-[var(--color-brand)] font-bold' : ''}>
                        <i aria-hidden='true' />{p1}
                      </strong>
                      <span>contra</span>
                      <strong className={isFinished && item.ganador === 'jugador2' ? 'text-[var(--color-brand)] font-bold' : ''}>
                        <i aria-hidden='true' />{p2}
                      </strong>
                    </div>

                    {/* Ganador si está finalizado */}
                    {isFinished && (
                      item.ganador ? (
                        <div className='text-[11px] font-semibold text-emerald-400 flex items-center gap-1 mt-1'>
                          <Trophy size={12} />
                          <span>Ganador: {item.ganador === 'jugador1' ? p1 : p2}</span>
                        </div>
                      ) : (
                        item.notas?.toLowerCase().includes('doble w') || item.notas?.toLowerCase().includes('incomparecencia') ? (
                          <div className='text-[11px] font-semibold text-amber-400 flex items-center gap-1 mt-1'>
                            <AlertTriangle size={12} />
                            <span>Doble W.O. · Sin ganador</span>
                          </div>
                        ) : null
                      )
                    )}

                    {/* Si está cancelado, mostrar motivo / nota con badge distintivo */}
                    {isCancelled && item.notas && (
                      <div
                        className='text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2 mt-2 flex items-start gap-1.5'
                      >
                        <Ban size={13} className='shrink-0 mt-0.5 text-red-400' />
                        <span className='leading-tight break-words'>{item.notas}</span>
                      </div>
                    )}

                    {/* Notas de finalización o W.O. si las hay */}
                    {isFinished && item.notas && (
                      <div className='text-[10px] text-[var(--text-muted)] bg-[var(--bg-hover)] rounded-md p-1.5 mt-1.5 line-clamp-2'>
                        {item.notas}
                      </div>
                    )}

                    <span className='judge-assignment-action mt-2'>
                      {isCancelled
                        ? 'Ver detalle / Cancelado'
                        : isFinished
                        ? 'Consultar encuentro'
                        : isLive
                        ? 'Ir a la mesa'
                        : 'Preparar encuentro'}{' '}
                      <span aria-hidden='true'>↗</span>
                    </span>
                  </div>

                  {/* Barra inferior: Juez asignado, Cancha y Acciones (Dar W / Cancelar) */}
                  <div
                    className='flex flex-wrap items-center justify-between gap-2 pt-2.5 mt-2.5 border-t'
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    {isDirectorOrAdmin && (
                      <div className='flex flex-wrap items-center gap-1.5'>
                        {item.juez ? (
                          <span
                            className='text-[11px] font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1.5'
                            style={{
                              backgroundColor:
                                Number(item.juez.id) === Number(userId)
                                  ? 'var(--color-brand-dim)'
                                  : 'var(--bg-primary)',
                              color:
                                Number(item.juez.id) === Number(userId)
                                  ? 'var(--color-brand)'
                                  : 'var(--text-primary)',
                              border: '1px solid var(--border-color)',
                            }}
                          >
                            <UserCheck size={12} />
                            Juez: {item.juez.nombre} {item.juez.apellido}{' '}
                            {Number(item.juez.id) === Number(userId) ? '(Tú)' : ''}
                          </span>
                        ) : (
                          <span
                            className='text-[11px] font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1 text-amber-500'
                            style={{
                              backgroundColor: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                            }}
                          >
                            <AlertTriangle size={12} /> Sin juez asignado
                          </span>
                        )}

                        {/* Asignar o reasignar cancha para Director / Admin */}
                        {!isFinished && !isCancelled && (
                          <button
                            type='button'
                            onClick={(e) => {
                              e.stopPropagation()
                              setMatchToCourt(item)
                            }}
                            className='btn-ghost text-[11px] px-2 py-0.5 rounded-md inline-flex items-center gap-1 text-zinc-300 hover:text-white hover:bg-[var(--bg-hover)]'
                            title='Asignar o reasignar la cancha de este partido'
                          >
                            <MapPin size={11} className='text-emerald-400' />
                            <span>{item.cancha?.id || item.cancha_id ? 'Reasignar cancha' : 'Asignar cancha'}</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Acciones de W y Cancelar para partidos no finalizados */}
                    {!isFinished && !isCancelled && (
                      <div
                        className='flex items-center gap-1.5 ml-auto'
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type='button'
                          onClick={() => setMatchToWalkover(item)}
                          disabled={!online || !exclusive || Boolean(view.pendingCount) || view.syncing}
                          className='btn-secondary text-[11px] px-2.5 py-1 flex items-center gap-1 text-amber-500 hover:bg-amber-500/10'
                          title='Declarar victoria por W (Walkover o Retiro)'
                        >
                          <Trophy size={12} />
                          <span>Dar W</span>
                        </button>
                        <button
                          type='button'
                          onClick={() => setMatchToCancel(item)}
                          disabled={!online || !exclusive || Boolean(view.pendingCount) || view.syncing}
                          className='btn-ghost text-[11px] px-2.5 py-1 flex items-center gap-1 text-red-400 hover:bg-red-400/10'
                          title='Cancelar partido con motivo'
                        >
                          <Ban size={12} />
                          <span>Cancelar</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : (
        <section className='judge-desk' aria-label='Control del partido'>
          {isPractice && (
            <div className='flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs sm:text-sm font-medium mb-3 shadow-sm'>
              <div className='flex items-center gap-2.5'>
                <Sparkles size={18} className='text-amber-400 shrink-0' />
                <span>
                  <strong>MODO PRÁCTICA:</strong> Partido virtual de entrenamiento ({match?.modalidad === 'dobles' ? 'Dobles' : 'Individual'}). No se guarda en la base de datos ni afecta estadísticas.
                </span>
              </div>
              <button
                type='button'
                onClick={exitPractice}
                className='ml-3 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold whitespace-nowrap'
              >
                Salir
              </button>
            </div>
          )}
          {!isPractice && !exclusive && (
            <p role='status' className='text-xs'>
              Otra pestaña controla la mesa o el navegador no admite el guardado seguro. Cierra la otra mesa y recarga.
            </p>
          )}
          <div className='judge-toolbar'>
            <button
              className='judge-tool'
              disabled={!isPractice && (view.busy || nameBusy || Boolean(view.pending))}
              onClick={() => {
                if (isPractice) {
                  exitPractice()
                } else {
                  select(null)
                  refreshMatches()
                }
              }}
            >
              <ArrowLeft size={17} /> Partidos
            </button>
            <span className='text-xs truncate'>
              {isPractice ? 'Partido de Prueba (Virtual)' : (match?.cancha?.nombre || 'Mesa de juez')}
            </span>
            {!isPractice && (
              <MatchPhotoCapture
                key={`${userId}:${selectedId}`}
                matchId={selectedId}
                userId={userId}
                finished={finished}
                disabled={!exclusive}
                deferUpload={Boolean(view.pendingCount) || view.syncing || !exclusive}
              />
            )}
            {!isPractice && (
              <button
                className='judge-tool'
                disabled={view.busy || view.syncing}
                onClick={() => sessionRef.current.sync()}
                aria-label='Sincronizar marcador'
              >
                <RefreshCw size={17} />
              </button>
            )}
            {isPractice && (
              <button
                type='button'
                className='judge-tool text-amber-400 hover:text-amber-300'
                onClick={() => startPracticeMatch(match?.modalidad === 'dobles')}
                title='Reiniciar partido de prueba desde cero'
              >
                <RefreshCw size={17} /> Reiniciar
              </button>
            )}
          </div>
          {!state ? (
            <div className='card p-6' role='status'>
              {view.error || 'Cargando marcador…'}
            </div>
          ) : (
            <>
              <div className='judge-status'>
                <span>
                  {finished
                    ? live?.estado === 'cancelado'
                      ? 'Cancelado'
                      : 'Finalizado'
                    : paused
                    ? 'Pausado'
                    : playing
                    ? '● En vivo'
                    : 'Programado'}
                </span>
                <span>Tiempo: {elapsed}</span>
                <span>
                  {score.currentSet.tiebreak
                    ? 'Desempate'
                    : score.deuce
                    ? match?.formato?.modo_game === 'sin_ventaja'
                      ? 'Punto decisivo'
                      : 'Iguales · 40–40'
                    : score.breakpoint
                    ? 'Oportunidad de ganar el juego al sacador'
                    : `Set ${score.sets.length + (finished ? 0 : 1)}`}
                </span>
              </div>
              {(live?.estado === 'cancelado' || match?.estado === 'cancelado') && (
                <div
                  className='p-3.5 rounded-xl border flex items-start gap-2.5 text-xs text-red-400'
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderColor: 'rgba(239, 68, 68, 0.25)',
                  }}
                >
                  <Ban size={16} className='shrink-0 mt-0.5' />
                  <div>
                    <strong className='block text-red-300 font-bold mb-0.5'>Partido cancelado</strong>
                    <span>{match?.notas || live?.notas || 'Este partido fue marcado como cancelado por la organización o supervisión arbitral.'}</span>
                  </div>
                </div>
              )}
              {!finished && (
                <div className='judge-serve-bar'>
                  <div>
                    <small>
                      AL SAQUE · {score.numero_servicio === 1 ? 'PRIMER SERVICIO' : 'SEGUNDO SERVICIO'}
                    </small>
                    <strong>{servingName || names[server]}</strong>
                    {isDoubles && !servingName && (
                      <small>Falta confirmar el jugador de la pareja</small>
                    )}
                  </div>
                  <button className='judge-tool' disabled={view.busy} onClick={() => setPanel('serve')}>
                    <RefreshCw size={15} /> Cambiar saque
                  </button>
                </div>
              )}
              <div
                className='judge-scoreboard judge-scoreboard-sets'
                style={{ '--set-count': state.raw_marcador?.sets?.length || 1 }}
              >
                <div className='judge-score-title'>
                  <span>MESA DE MARCACIÓN</span>
                  <span>{finished ? 'Resultado' : paused ? 'En pausa' : 'Cada punto cuenta'}</span>
                </div>
                <div className='judge-score-heading'>
                  <span>Jugador / pareja</span>
                  {(state.raw_marcador?.sets || []).map((set, i) => (
                    <span key={i}>
                      {set.type === 'match_tiebreak' ? 'STB' : `S${i + 1}`}
                      <small>{set.completed ? 'Final' : 'Actual'}</small>
                    </span>
                  ))}
                  <span>Punto</span>
                </div>
                {['jugador1', 'jugador2'].map((side, i) => (
                  <div
                    key={side}
                    className={`judge-score-row judge-team-${i + 1} ${
                      !finished && server === side ? 'is-serving' : ''
                    }`}
                  >
                    <div className='min-w-0'>
                      <strong className='judge-player-name'>{names[side]}</strong>
                      {!finished && server === side ? (
                        <span className='judge-serving-badge'>
                          ● AL SAQUE · {score.numero_servicio === 1 ? 'Primero' : 'Segundo'}
                        </span>
                      ) : finished && score.ganador === side ? (
                        <span className='judge-serving-badge'>Ganador</span>
                      ) : (
                        <span className='text-xs text-[var(--text-muted)]'>
                          {!finished ? 'Recibe' : ''}
                        </span>
                      )}
                    </div>
                    {(state.raw_marcador?.sets || []).map((set, index) => (
                      <strong
                        key={index}
                        className={`judge-set-value ${!set.completed ? 'is-current' : ''}`}
                        aria-label={`Set ${index + 1}: ${set.games[i]}${
                          set.completed ? ', final' : ', actual'
                        }`}
                      >
                        {set.games[i]}
                        {set.type !== 'match_tiebreak' && set.tiebreak?.some(Boolean) && (
                          <sup>{set.tiebreak[i]}</sup>
                        )}
                      </strong>
                    ))}
                    <strong
                      key={`${side}:${score[`punto_j${i + 1}`]}`}
                      className='judge-points'
                    >
                      {finished ? '—' : score[`punto_j${i + 1}`]}
                    </strong>
                  </div>
                ))}
                <div className='judge-set-history' aria-label='Marcador por sets'>
                  {(state.raw_marcador?.sets || []).map((set, i) => (
                    <div key={i} className={`judge-set-chip ${!set.completed ? 'is-current' : ''}`}>
                      <span>
                        {set.type === 'match_tiebreak' ? 'Super TB' : `Set ${i + 1}`} ·{' '}
                        {set.completed ? 'cerrado' : 'actual'}
                      </span>
                      <strong>
                        <span>{set.games[0]}</span>
                        <span aria-hidden='true'>–</span>
                        <span>{set.games[1]}</span>
                      </strong>
                      {set.type !== 'match_tiebreak' && set.tiebreak?.some(Boolean) && (
                        <small>
                          TB {set.tiebreak[0]}–{set.tiebreak[1]}
                        </small>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div
                className={`judge-feedback ${view.pending ? 'is-pending' : ''}`}
                role='status'
                aria-live='polite'
              >
                {isPractice
                  ? `Modo Práctica · ${practiceHistory.length} puntos jugados · ${reasonLabel(lastEvent, names)}`
                  : view.pending
                  ? `Marcador local · ${view.pendingCount} pendientes · ${
                      view.sending ? 'sincronizando' : 'guardados aquí'
                    }`
                  : !online
                  ? 'Sin conexión · los puntos se guardarán aquí'
                  : view.busy
                  ? 'Confirmando en el servidor…'
                  : view.needsSync
                  ? 'Revisa la conexión · pulsa sincronizar'
                  : `Confirmado: ${reasonLabel(lastEvent, names)}`}
              </div>
              {view.pending && (
                <p className='sr-only'>
                  Puedes seguir anotando. La pantalla pública se actualizará al sincronizar. No borres los datos del navegador.
                </p>
              )}
              {view.error && (view.conflict || !view.pending) && (
                <p role='alert' className='text-xs text-red-500'>
                  {view.error}
                </p>
              )}
              {view.conflict && (
                <section
                  className='rounded-2xl border p-4 space-y-3'
                  style={{ borderColor: 'var(--color-brand)', background: 'var(--bg-card)' }}
                  aria-label='Revisión de marcación'
                >
                  <h2 className='font-bold'>Revisemos antes de continuar</h2>
                  <p className='text-sm'>
                    Hay acciones locales sin confirmar. No se sumarán automáticamente sobre un marcador distinto.
                  </p>
                  <button
                    className='judge-tool'
                    disabled={reviewBusy || !exclusive || !online}
                    onClick={async () => {
                      setReviewBusy(true)
                      setReviewChecked(false)
                      setConflictReview(null)
                      try {
                        setConflictReview(await sessionRef.current.reviewConflict())
                      } finally {
                        setReviewBusy(false)
                      }
                    }}
                  >
                    {reviewBusy ? 'Consultando…' : '1. Consultar marcador del servidor'}
                  </button>
                  {conflictReview && (
                    <>
                      <div
                        className='rounded-xl p-3 text-sm'
                        style={{ background: 'var(--color-brand-dim)' }}
                      >
                        <strong>Servidor al consultar</strong>
                        <p>
                          Puntos: {conflictReview.control.marcador.punto_j1} –{' '}
                          {conflictReview.control.marcador.punto_j2}
                        </p>
                        <p>
                          Games: {conflictReview.control.marcador.currentSet?.games_j1 ?? '—'} –{' '}
                          {conflictReview.control.marcador.currentSet?.games_j2 ?? '—'}
                        </p>
                        <p>
                          Sets:{' '}
                          {conflictReview.control.marcador.sets
                            ?.map((set) => `${set.games_j1}–${set.games_j2}`)
                            .join(' / ') || 'sin sets terminados'}
                        </p>
                        <p className='text-xs mt-1'>
                          Orden: {names.jugador1} / {names.jugador2}
                        </p>
                      </div>
                      <h3 className='font-semibold text-sm'>
                        2. Contrasta estas acciones con lo ocurrido en cancha
                      </h3>
                      <ol className='list-decimal pl-5 space-y-2 text-sm max-h-60 overflow-y-auto'>
                        {conflictReview.actions.map((event) => (
                          <li key={event.client_action_id}>
                            {reasonLabel(event, names)}
                            <span className='block text-xs opacity-70'>
                              {event.attempted
                                ? 'Enviada anteriormente: puede estar registrada; no la repitas sin verificar.'
                                : 'Guardada localmente, aún no enviada.'}
                            </span>
                          </li>
                        ))}
                      </ol>
                      <p className='text-sm'>
                        Si tienes dudas, consulta al juez director. Mantén los pendientes hasta aclararlo.
                      </p>
                      <label className='flex items-start gap-3 py-3 text-sm'>
                        <input
                          type='checkbox'
                          className='mt-1 h-5 w-5 shrink-0'
                          checked={reviewChecked}
                          onChange={(e) => setReviewChecked(e.target.checked)}
                        />
                        Revisé la lista y sé cuáles acciones ya están registradas y cuáles faltan.
                      </label>
                      <button
                        className='judge-tool'
                        disabled={!reviewChecked || reviewBusy || !online || !exclusive}
                        onClick={async () => {
                          setReviewBusy(true)
                          try {
                            if (
                              await confirm({
                                title: 'Conservar el marcador del servidor',
                                message:
                                  'La lista pendiente se archivará en este navegador y dejará de enviarse. Esto no modifica el marcador del servidor. Después registra únicamente las acciones que verificaste que faltan. La copia local no se restaura automáticamente.',
                                requireText: 'REVISADO',
                                confirmLabel: 'Archivar pendientes y continuar',
                                danger: true,
                              })
                            ) {
                              await sessionRef.current.discardConflict(conflictReview.revision)
                              setConflictReview(null)
                              setReviewChecked(false)
                            }
                          } finally {
                            setReviewBusy(false)
                          }
                        }}
                      >
                        3. Resolver revisión
                      </button>
                    </>
                  )}
                </section>
              )}
              {playing && (
                <>
                  <label className={`judge-mode ${!quick ? 'is-detailed' : ''}`}>
                    <span className='judge-mode-copy'>
                      <strong>¿Cómo se ganó el punto?</strong>
                      <small>
                        {quick
                          ? 'Rápido: suma sin clasificar el motivo'
                          : 'Detallado: elige ganador y motivo'}
                      </small>
                    </span>
                    <span className='judge-mode-switch'>
                      <input
                        aria-label='Registrar motivo del punto'
                        type='checkbox'
                        checked={!quick}
                        disabled={locked || Boolean(pending)}
                        onChange={(event) => setQuick(!event.target.checked)}
                      />
                      <span>{quick ? 'Activar detalle' : 'Detalle activo'}</span>
                    </span>
                  </label>
                  <div className='judge-point-buttons'>
                    {['jugador1', 'jugador2'].map((side, i) => (
                      <button
                        key={side}
                        className={`judge-point judge-side-${i + 1}`}
                        disabled={!canScore || Boolean(pending)}
                        onClick={() => (quick ? point(side) : setPending(side))}
                      >
                        <span className='judge-point-label'>
                          Punto para <span className='judge-team-dot' aria-hidden='true' />
                        </span>
                        <strong>{names[side]}</strong>
                        <span className='judge-point-add' aria-hidden='true'>
                          +1
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className='judge-service-controls'>
                    <button
                      className='judge-tool'
                      disabled={!canScore}
                      onClick={() =>
                        score.numero_servicio === 1
                          ? record({ tipo: 'primera_falta' })
                          : point(receiver, 'doble_falta')
                      }
                    >
                      {score.numero_servicio === 1 ? '1ª falta · sin punto' : 'Marcar doble falta'}
                    </button>
                    <button
                      className='judge-tool'
                      disabled={!canScore}
                      onClick={() => record({ tipo: 'let' })}
                    >
                      Let · repetir {score.numero_servicio === 1 ? '1er' : '2º'} saque
                    </button>
                  </div>
                </>
              )}
              {!playing && !finished && (
                <section className='judge-state-card'>
                  <span className='judge-eyebrow'>ANTES DEL PRIMER SAQUE</span>
                  <h2>Todo listo para comenzar</h2>
                  <p>Comprueba los participantes y la cancha. Al iniciar se activa la marcación.</p>
                  <div className='judge-preflight'>
                    <span>
                      Formato<strong>Al mejor de {state?.reglas?.mejor_de ?? '—'} sets</strong>
                    </span>
                    <span>
                      Por set<strong>{state?.reglas?.juegos_por_set ?? '—'} juegos</strong>
                    </span>
                  </div>
                  <p>
                    El saque cambia automáticamente. Si necesitas corregir el sacador inicial, entra en Ajustes después de iniciar y antes de anotar el primer punto.
                  </p>
                  <button
                    className='btn-primary py-4 w-full'
                    disabled={adminLocked}
                    onClick={() => write((id) => matchService.startLive(id))}
                  >
                    <Play size={18} /> Iniciar partido
                  </button>
                </section>
              )}
              {paused && !finished && (
                <section className='judge-state-card' role='status'>
                  <span className='judge-eyebrow'>
                    {live?.motivo_suspension ? 'PARTIDO SUSPENDIDO' : 'MESA EN PAUSA'}
                  </span>
                  <h2>Marcador conservado</h2>
                  {live?.motivo_suspension && (
                    <p className='break-words'>
                      <strong>Motivo:</strong> {live.motivo_suspension}
                    </p>
                  )}
                  <p>
                    No puedes sumar puntos durante la pausa. Usa Reanudar cuando el encuentro continúe.
                  </p>
                </section>
              )}
              {finished && (
                <section className='judge-state-card' role='status'>
                  <span className='judge-eyebrow'>
                    {isPractice
                      ? 'PARTIDO DE PRÁCTICA FINALIZADO'
                      : live?.estado === 'cancelado'
                      ? 'ENCUENTRO CANCELADO'
                      : 'CIERRE DEL ENCUENTRO'}
                  </span>
                  <h2>
                    {score.ganador
                      ? `Ganador: ${names[score.ganador]}`
                      : 'Este partido no admite puntos.'}
                  </h2>
                  <p>
                    {isPractice
                      ? 'Has completado el partido de prueba. Puedes reiniciar para entrenar de nuevo o volver a la lista de partidos.'
                      : view.pendingCount
                      ? 'El resultado sigue pendiente de envío. Conserva este navegador y recupera la conexión.'
                      : view.needsSync
                      ? 'Sincroniza para verificar el estado del resultado.'
                      : 'Consulta el resumen en Estadísticas.'}
                  </p>
                  {isPractice && (
                    <div className='flex flex-wrap gap-2 mt-4'>
                      <button
                        type='button'
                        className='btn-secondary flex-1'
                        onClick={() => startPracticeMatch(match?.modalidad === 'dobles')}
                      >
                        <RefreshCw size={16} /> Reiniciar práctica
                      </button>
                      <button
                        type='button'
                        className='btn-primary flex-1'
                        onClick={exitPractice}
                      >
                        Salir de práctica
                      </button>
                    </div>
                  )}
                </section>
              )}
              <div className='judge-bottom-controls'>
                {playing && (
                  <button
                    className='judge-tool'
                    disabled={adminLocked}
                    onClick={() => write((id) => matchService.pauseLive(id, !paused))}
                  >
                    {paused ? <Play size={18} /> : <Pause size={18} />}
                    {paused ? 'Reanudar' : 'Pausar'}
                  </button>
                )}
                <button
                  className='judge-tool'
                  disabled={
                    isPractice
                      ? practiceHistory.length === 0
                      : (view.canUndoLocal ? locked : adminLocked) || !lastEvent || live?.estado === 'cancelado'
                  }
                  onClick={undo}
                >
                  <Undo2 size={18} />
                  {isPractice ? 'Deshacer punto' : view.canUndoLocal ? 'Deshacer local' : 'Deshacer'}
                </button>
                <button className='judge-tool' disabled={view.busy} onClick={() => setPanel('stats')}>
                  <BarChart3 size={18} /> Estadísticas
                </button>
                <button className='judge-tool' disabled={view.busy} onClick={openSettings}>
                  <Settings2 size={18} /> Ajustes
                </button>
              </div>
            </>
          )}

          {suspending && (
            <JudgePanel title='Suspender el encuentro' onClose={() => setSuspending(false)} busy={view.busy}>
              <form
                className='space-y-4'
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (adminLocked || suspensionReason.trim().length < 5) return
                  if (await write((id) => matchService.suspendLive(id, suspensionReason.trim())))
                    setSuspending(false)
                }}
              >
                <p className='judge-panel-tip'>
                  El marcador se conserva y no se declara ganador. Podrás continuar desde este punto con Reanudar. El motivo quedará en el historial de control.
                </p>
                <label className='block text-sm font-semibold'>
                  Motivo de suspensión
                  <textarea
                    className='form-input mt-2'
                    rows={3}
                    required
                    minLength={5}
                    maxLength={500}
                    value={suspensionReason}
                    onChange={(e) => setSuspensionReason(e.target.value)}
                    placeholder='Ejemplo: lluvia; la cancha no permite continuar.'
                  />
                </label>
                <p className='text-xs text-[var(--text-muted)]'>
                  Entre 5 y 500 caracteres. Evita incluir datos personales o médicos.
                </p>
                {view.error && <p role='alert' className='text-sm text-red-500'>{view.error}</p>}
                <button
                  type='submit'
                  className='btn-primary w-full'
                  disabled={adminLocked || suspensionReason.trim().length < 5}
                >
                  {view.busy ? 'Guardando…' : 'Confirmar suspensión'}
                </button>
              </form>
            </JudgePanel>
          )}

          {pending && (
            <JudgePanel
              compact
              title={`Punto para ${names[pending]}`}
              onClose={() => setPending(null)}
              busy={view.busy}
            >
              <p className='judge-panel-tip'>
                Error cometido por: <strong>{names[pending === 'jugador1' ? 'jugador2' : 'jugador1']}</strong>. Cerrar no registra el punto.
              </p>
              <div className='judge-reason-groups'>
                {[
                  ['Golpe ganador', reasons.slice(0, 2)],
                  ['Fallo del rival', reasons.slice(2, 4)],
                  ['Decisión arbitral', reasons.slice(4)],
                ].map(([heading, options]) => (
                  <fieldset key={heading} className='judge-reason-group'>
                    <legend>{heading}</legend>
                    <div className='judge-reason-grid'>
                      {options.map(([key, label, description]) => (
                        <button
                          key={key}
                          className={`judge-reason reason-${key}`}
                          disabled={locked || !canScore || (key === 'ace' && pending !== server)}
                          onClick={() => point(pending, key)}
                        >
                          <strong>
                            {label}
                            <span className='judge-reason-arrow' aria-hidden='true'>
                              ↗
                            </span>
                          </strong>
                          <span>
                            {key === 'ace' && pending !== server
                              ? 'Solo disponible para quien está sacando'
                              : description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              {view.error && <p role='alert' className='text-sm mt-3'>{view.error}</p>}
            </JudgePanel>
          )}

          {panel && (
            <JudgePanel
              title={
                panel === 'stats'
                  ? 'Estadísticas y últimas acciones'
                  : panel === 'serve'
                  ? 'Control de saque'
                  : 'Ajustes del partido'
              }
              onClose={() => setPanel(null)}
              busy={nameBusy || view.busy}
            >
              {panel === 'stats' ? (
                <>
                  {!isPractice && (
                    <MatchStats matchId={selectedId} player1={names.jugador1} player2={names.jugador2} />
                  )}
                  {isPractice && (
                    <div className='p-3 bg-[var(--bg-hover)] rounded-lg text-xs text-[var(--text-muted)] mb-3'>
                      Estadísticas de entrenamiento (este partido es virtual y no genera registros en base de datos).
                    </div>
                  )}
                  <h3 className='font-bold mt-5 mb-2'>Últimas acciones</h3>
                  <ol className='space-y-2 text-sm'>
                    {state?.eventos_recientes?.map((event, idx) => (
                      <li key={event.id || idx}>
                        #{state.eventos_recientes.length - idx} · {reasonLabel(event, names)}
                      </li>
                    ))}
                    {(!state?.eventos_recientes || state.eventos_recientes.length === 0) && (
                      <li className='text-xs text-[var(--text-muted)]'>No hay acciones registradas aún.</li>
                    )}
                  </ol>
                </>
              ) : (
                <div className='space-y-4'>
                  <p className='text-sm'>
                    Al mejor de {state?.reglas?.mejor_de} sets · {state?.reglas?.juegos_por_set} games por set. El formato configurado del torneo se conserva.
                  </p>
                  {!isPractice && playing && panel !== 'serve' && (
                    <button
                      className='judge-tool w-full'
                      disabled={adminLocked}
                      onClick={() => {
                        setPanel(null)
                        setSuspensionReason('')
                        setSuspending(true)
                      }}
                    >
                      <Pause size={18} /> Suspender con motivo
                    </button>
                  )}

                  {!isPractice && !finished && panel !== 'serve' && (
                    <div className='pt-2 border-t space-y-2' style={{ borderColor: 'var(--border-color)' }}>
                      <button
                        type='button'
                        className='judge-tool w-full text-amber-500 hover:bg-amber-500/10'
                        disabled={adminLocked}
                        onClick={() => {
                          setPanel(null)
                          setMatchToWalkover(match)
                        }}
                      >
                        <Trophy size={16} /> Declarar victoria por W (Walkover / Retiro)
                      </button>
                      <button
                        type='button'
                        className='judge-tool w-full text-red-400 hover:bg-red-400/10'
                        disabled={adminLocked}
                        onClick={() => {
                          setPanel(null)
                          setMatchToCancel(match)
                        }}
                      >
                        <Ban size={16} /> Cancelar partido con motivo
                      </button>
                    </div>
                  )}

                  <p className='text-xs'>
                    El saque cambia automáticamente. Corrígelo aquí solo si es necesario.
                  </p>
                  <button
                    className='judge-tool w-full'
                    disabled={!canScore || (!isPractice && adminLocked)}
                    onClick={async () => {
                      setPanel(null)
                      if (
                        await confirm({
                          title: 'Cambiar sacador',
                          message: `¿Debe sacar ${names[receiver]}?`,
                          confirmLabel: 'Cambiar saque',
                        })
                      ) {
                        if (isPractice) {
                          changePracticeServer(receiver)
                        } else {
                          await write((id) => matchService.setServer(id, receiver))
                        }
                      }
                    }}
                  >
                    Cambiar saque a {names[receiver]}
                  </button>
                  {isDoubles && !finished && (
                    <form
                      className='judge-state-card'
                      onSubmit={async (e) => {
                        e.preventDefault()
                        if (!firstServers.every(Boolean)) return
                        if (isPractice) {
                          setPracticeControl((prev) => ({
                            ...prev,
                            doubles_order: {
                              ...prev?.doubles_order,
                              [state.raw_marcador.currentSet]: {
                                1: Number(firstServers[0]),
                                2: Number(firstServers[1]),
                              },
                            },
                          }))
                          setPanel(null)
                          return
                        }
                        if (
                          await write((id) =>
                            matchService.setDoublesOrder(id, {
                              first1: Number(firstServers[0]),
                              first2: Number(firstServers[1]),
                              set: state.raw_marcador.currentSet,
                            })
                          )
                        )
                          setPanel(null)
                      }}
                    >
                      <h3 className='font-semibold'>Orden de saque · set {state.raw_marcador?.currentSet}</h3>
                      <p>
                        Antes del primer saque del set, selecciona quién sirve primero dentro de cada pareja. Los compañeros se alternarán automáticamente en los juegos y desempates. Vuelve a confirmar al comenzar otro set.
                      </p>
                      {[1, 2].map((team, i) => (
                        <label key={team} className='text-sm'>
                          {names[`jugador${team}`]}
                          <select
                            className='form-input mt-1'
                            required
                            value={firstServers[i]}
                            onChange={(e) =>
                              setFirstServers((old) =>
                                old.map((v, index) => (index === i ? e.target.value : v))
                              )
                            }
                          >
                            <option value=''>Primer sacador de esta pareja</option>
                            {[1, 2].map((member) => {
                              const player = match[`equipo${team}`]?.[`jugador${member}`]
                              return (
                                player && (
                                  <option key={member} value={member}>
                                    {player.nombre} {player.apellido}
                                  </option>
                                )
                              )
                            })}
                          </select>
                        </label>
                      ))}
                      <button
                        className='btn-primary'
                        disabled={adminLocked || !firstServers.every(Boolean)}
                      >
                        Confirmar orden
                      </button>
                      {view.error && <p role='alert'>{view.error}</p>}
                    </form>
                  )}
                  {panel !== 'serve' && (
                    <form className='space-y-3' onSubmit={saveNames}>
                      <h3 className='font-semibold'>Nombres en pantalla</h3>
                      <p className='text-xs'>
                        Solo cambia la etiqueta; no sustituye al jugador registrado. Vacío restaura su nombre.
                      </p>
                      {nameDraft.map((name, index) => (
                        <label key={index} className='block text-sm'>
                          Jugador / pareja {index + 1}
                          <input
                            className='form-input mt-1'
                            maxLength={120}
                            value={name}
                            onChange={(event) =>
                              setNameDraft((old) =>
                                old.map((value, i) => (i === index ? event.target.value : value))
                              )
                            }
                          />
                        </label>
                      ))}
                      <button className='btn-primary' disabled={adminLocked}>
                        {nameBusy ? 'Guardando…' : 'Guardar nombres'}
                      </button>
                      {nameError && <p role='alert'>{nameError}</p>}
                    </form>
                  )}
                </div>
              )}
            </JudgePanel>
          )}
        </section>
      )}

      {/* Modales globales de Walkover y Cancelación */}
      {matchToWalkover && (
        <ModalFinalizarW
          isOpen={Boolean(matchToWalkover)}
          onClose={() => setMatchToWalkover(null)}
          match={matchToWalkover}
          onSuccess={async () => {
            setMatchToWalkover(null)
            if (view.match) {
              await sessionRef.current?.sync?.()
              select(null)
            }
            refreshMatches()
          }}
        />
      )}

      {matchToCancel && (
        <ModalCancelarPartido
          isOpen={Boolean(matchToCancel)}
          onClose={() => setMatchToCancel(null)}
          match={matchToCancel}
          onSuccess={async () => {
            setMatchToCancel(null)
            if (view.match) {
              await sessionRef.current?.sync?.()
              select(null)
            }
            refreshMatches()
          }}
        />
      )}

      {matchToCourt && (
        <ModalAsignarCancha
          isOpen={Boolean(matchToCourt)}
          onClose={() => setMatchToCourt(null)}
          match={matchToCourt}
          onSuccess={() => {
            setMatchToCourt(null)
            refreshMatches()
          }}
        />
      )}
    </>
  )
}

function JudgePanel({ title, children, onClose, busy, compact = false }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className={`judge-dialog${compact ? ' judge-dialog-compact' : ''}`} aria-labelledby='judge-panel-title' onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }}>
    <div className='judge-dialog-heading'><h2 className='font-bold' id='judge-panel-title'>{title}</h2><button className='judge-tool' onClick={onClose} disabled={busy} aria-label='Cerrar panel'><X size={20} /></button></div>
    <div className='p-4'>{children}</div>
  </dialog>
}
