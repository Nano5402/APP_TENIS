import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  RefreshCw,
  Search,
  Filter,
  UserCheck,
  Users,
  Ban,
  RotateCcw,
  Play,
  Calendar,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Trophy,
  SlidersHorizontal,
  Radio,
} from 'lucide-react'
import { matchService } from '../../services/matchService'
import MatchAuditButton from '../../components/match/MatchAuditButton'
import { sedeService } from '../../services/sedeService'
import { categoriaService } from '../../services/categoriaService'
import { useMatchRealtime } from '../../hooks/useMatchRealtime'
import { getParticipantName } from '../../utils/matchParticipants'
import { confirm } from '../../utils/confirm'
import useUIStore from '../../store/useUIStore'
import ModalReasignarJuez from '../../components/match/ModalReasignarJuez'
import ModalAsignarCancha from '../../components/match/ModalAsignarCancha'
import ModalFinalizarW from '../../components/match/ModalFinalizarW'
import ModalCancelarPartido from '../../components/match/ModalCancelarPartido'
import ModalSustitucionParticipante from '../../components/match/ModalSustitucionParticipante'
import ModalCorregirMarcador from '../../components/match/ModalCorregirMarcador'

export default function DirectorDashboard() {
  const navigate = useNavigate()
  const { addToast } = useUIStore()

  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const fetching = useRef(false)
  const realtimeTimer = useRef(null)
  const [busyId, setBusyId] = useState(null)

  // Modales
  const [matchToReassign, setMatchToReassign] = useState(null)
  const [matchToCourt, setMatchToCourt] = useState(null)
  const [matchToSubstitute, setMatchToSubstitute] = useState(null)
  const [matchToScore, setMatchToScore] = useState(null)
  const [matchToCancel, setMatchToCancel] = useState(null)
  const [matchToWalkover, setMatchToWalkover] = useState(null)

  // Filtros
  const [search, setSearch] = useState('')
  const [sportFilter, setSportFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [courtFilter, setCourtFilter] = useState('todas')
  const [categoryFilter, setCategoryFilter] = useState('todas')

  const fetchMatches = useCallback(async () => {
    if (fetching.current) return
    fetching.current = true
    const request = ++requestId.current
    try {
      // El Juez Director tiene visibilidad completa de todos los partidos
      const res = await matchService.getAll({ orden: 'asc' })
      if (request !== requestId.current) return
      setMatches(res.data || [])
      setError('')
    } catch (err) {
      if (request === requestId.current) setError(err.message || 'Error al cargar los partidos')
    } finally {
      if (request === requestId.current) {
        fetching.current = false
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchMatches()
    const timer = setInterval(fetchMatches, 30000)
    return () => { clearInterval(timer); clearTimeout(realtimeTimer.current); realtimeTimer.current = null; fetching.current = false; ++requestId.current }
  }, [fetchMatches])

  // Suscripción a eventos en tiempo real
  useMatchRealtime(
    useCallback(() => {
      if (realtimeTimer.current) return
      realtimeTimer.current = setTimeout(() => {
        realtimeTimer.current = null
        fetchMatches()
      }, 750)
    }, [fetchMatches])
  )

  const [allCourts, setAllCourts] = useState([])
  const [allCategories, setAllCategories] = useState([])

  // Cargar catálogo de canchas y categorías del club
  useEffect(() => {
    Promise.all([
      sedeService.getAll().catch(() => ({ data: [] })),
      categoriaService.getAll().catch(() => ({ data: [] })),
    ]).then(async ([locRes, catRes]) => {
      setAllCategories(catRes.data || [])
      const courtResponses = await Promise.all(
        (locRes.data || []).map(async (location) => {
          const res = await sedeService.getCanchasBySede(location.id).catch(() => ({ data: [] }))
          return (res.data || []).map((court) => ({
            ...court,
            sede_nombre: location.nombre,
          }))
        })
      )
      setAllCourts(courtResponses.flat())
    })
  }, [])

  // Opciones únicas de canchas y categorías para los filtros
  const courts = useMemo(() => {
    const map = new Map()
    // 1. Canchas oficiales del club
    allCourts.forEach((c) => {
      if (c.id && c.nombre) {
        map.set(String(c.id), c.nombre)
      }
    })
    // 2. Canchas asignadas en partidos
    matches.forEach((m) => {
      const id = m.cancha?.id ?? m.cancha_id
      const name = m.cancha?.nombre ?? m.cancha_nombre
      if (id && name) {
        map.set(String(id), name)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [allCourts, matches])

  const categories = useMemo(() => {
    const map = new Map()
    // 1. Categorías oficiales del club
    allCategories.forEach((cat) => {
      if (cat.id && cat.nombre) {
        map.set(String(cat.id), cat.nombre)
      }
    })
    // 2. Categorías asignadas en partidos
    matches.forEach((m) => {
      const id = m.categoria?.id ?? m.categoria_id
      const name = m.categoria?.nombre ?? m.categoria_nombre
      if (id && name) {
        map.set(String(id), name)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [allCategories, matches])

  // Contadores KPI
  const stats = useMemo(() => {
    let enVivo = 0
    let programados = 0
    let sinJuez = 0
    let finalizados = 0
    let cancelados = 0

    matches.forEach((m) => {
      const judgeId = m.juez?.id ?? m.juez_id
      if (m.estado === 'en_vivo') enVivo++
      else if (m.estado === 'programado') programados++
      else if (m.estado === 'finalizado') finalizados++
      else if (m.estado === 'cancelado') cancelados++

      if (['en_vivo', 'programado'].includes(m.estado) && !judgeId) {
        sinJuez++
      }
    })

    return { total: matches.length, enVivo, programados, sinJuez, finalizados, cancelados }
  }, [matches])

  // Filtrado de la lista
  const filteredMatches = useMemo(() => {
    const q = search.trim().toLowerCase()

    return matches.filter((m) => {
      const matchCourtId = m.cancha?.id ?? m.cancha_id
      const matchCategoryId = m.categoria?.id ?? m.categoria_id
      const matchJudgeId = m.juez?.id ?? m.juez_id

      if (sportFilter !== 'todos' && m.deporte !== sportFilter) return false

      if (statusFilter === 'sin_juez') {
        if (matchJudgeId || !['en_vivo', 'programado'].includes(m.estado)) return false
      } else if (statusFilter !== 'todos' && m.estado !== statusFilter) {
        return false
      }

      if (courtFilter === 'sin_cancha') {
        if (matchCourtId) return false
      } else if (courtFilter !== 'todas' && String(matchCourtId) !== String(courtFilter)) {
        return false
      }

      if (categoryFilter === 'sin_categoria') {
        if (matchCategoryId) return false
      } else if (categoryFilter !== 'todas' && String(matchCategoryId) !== String(categoryFilter)) {
        return false
      }

      if (q) {
        const p1 = getParticipantName(m, 1) || ''
        const p2 = getParticipantName(m, 2) || ''
        const judge = m.juez
          ? `${m.juez.nombre || ''} ${m.juez.apellido || ''}`.trim()
          : `${m.juez_nombre || ''} ${m.juez_apellido || ''}`.trim()
        const court = m.cancha?.nombre || m.cancha_nombre || ''
        const cat = m.categoria?.nombre || m.categoria_nombre || ''
        const tour = m.torneo?.nombre || m.torneo_nombre || ''
        const text = `${p1} ${p2} ${judge} ${court} ${cat} ${tour}`.toLowerCase()
        if (!text.includes(q)) return false
      }

      return true
    })
  }, [matches, search, sportFilter, statusFilter, courtFilter, categoryFilter])

  // Bajar / Cancelar partido (abre modal con motivo)
  const handleCancelMatch = (match) => {
    setMatchToCancel(match)
  }

  // Reactivar partido
  const handleReactivateMatch = async (match) => {
    if (busyId !== null) return
    const ok = await confirm({
      title: 'Reactivar Partido',
      message: '¿Deseas reactivar este partido? Si ya había comenzado, conservará el marcador y quedará pausado para revisarlo antes de continuar.',
      confirmLabel: 'Reactivar',
    })
    if (!ok) return

    try {
      setBusyId(match.id)
      await matchService.reactivateMatch(match.id, match.control_version)
      addToast({
        type: 'success',
        title: 'Partido reactivado',
        message: 'El historial se conserva. Si ya había comenzado, reanúdalo desde la mesa de juez.',
      })
      fetchMatches()
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error al reactivar',
        message: err.message || 'No se pudo reactivar el partido',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className='space-y-5 pb-8 animate-fade-up'>
      {/* Header Banner */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
        <div>
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='text-2xl font-extrabold tracking-tight' style={{ color: 'var(--text-primary)' }}>
              Supervisión de partidos
            </h1>
            <span
              className='text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider'
              style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}
            >
              Juez Director
            </span>
          </div>
          <p className='text-xs sm:text-sm mt-0.5' style={{ color: 'var(--text-muted)' }}>
            Supervisión integral de canchas, reasignación de jueces, cancelación y sustitución de participantes.
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-2 min-w-0'>
          <button
            onClick={fetchMatches}
            disabled={loading}
            className='btn-secondary text-xs flex items-center gap-2 px-3 py-2'
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
          <Link to='/director/agenda' className='btn-secondary px-4 py-2'>Agenda por cancha</Link>
          <Link
            to='/juez'
            className='btn-primary text-xs flex items-center gap-1.5 px-3.5 py-2'
          >
            <Play size={14} />
            <span>Mesa de Juez</span>
          </Link>
        </div>
      </div>

      {error && (
        <div
          className='p-3.5 rounded-xl text-xs flex items-center gap-2'
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
        >
          <AlertTriangle size={17} className='shrink-0' />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3'>
        <button
          onClick={() => setStatusFilter('todos')}
          className={`p-3 rounded-xl border text-left transition-all ${
            statusFilter === 'todos'
              ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)] ring-1 ring-[var(--color-brand)]'
              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <span className='text-[11px] font-medium block' style={{ color: 'var(--text-muted)' }}>
            Total Partidos
          </span>
          <strong className='text-xl font-extrabold block' style={{ color: 'var(--text-primary)' }}>
            {stats.total}
          </strong>
        </button>

        <button
          onClick={() => setStatusFilter('en_vivo')}
          className={`p-3 rounded-xl border text-left transition-all ${
            statusFilter === 'en_vivo'
              ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <span className='text-[11px] font-medium flex items-center gap-1.5' style={{ color: '#10b981' }}>
            <span className='w-2 h-2 rounded-full bg-emerald-500 animate-pulse' />
            En Juego
          </span>
          <strong className='text-xl font-extrabold block text-emerald-500'>
            {stats.enVivo}
          </strong>
        </button>

        <button
          onClick={() => setStatusFilter('programado')}
          className={`p-3 rounded-xl border text-left transition-all ${
            statusFilter === 'programado'
              ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500'
              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <span className='text-[11px] font-medium block' style={{ color: 'var(--text-muted)' }}>
            Programados
          </span>
          <strong className='text-xl font-extrabold block' style={{ color: 'var(--text-primary)' }}>
            {stats.programados}
          </strong>
        </button>

        <button
          onClick={() => setStatusFilter('sin_juez')}
          className={`p-3 rounded-xl border text-left transition-all ${
            statusFilter === 'sin_juez'
              ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500'
              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <span className='text-[11px] font-medium flex items-center gap-1 text-amber-500'>
            <AlertTriangle size={13} />
            Sin Juez
          </span>
          <strong className='text-xl font-extrabold block text-amber-500'>
            {stats.sinJuez}
          </strong>
        </button>

        <button
          onClick={() => setStatusFilter('finalizado')}
          className={`p-3 rounded-xl border text-left transition-all ${
            statusFilter === 'finalizado'
              ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)] ring-1 ring-[var(--color-brand)]'
              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <span className='text-[11px] font-medium block' style={{ color: 'var(--text-muted)' }}>
            Finalizados
          </span>
          <strong className='text-xl font-extrabold block' style={{ color: 'var(--text-primary)' }}>
            {stats.finalizados}
          </strong>
        </button>

        <button
          onClick={() => setStatusFilter('cancelado')}
          className={`p-3 rounded-xl border text-left transition-all ${
            statusFilter === 'cancelado'
              ? 'border-red-500 bg-red-500/10 ring-1 ring-red-500'
              : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          <span className='text-[11px] font-medium block text-red-400'>
            Cancelados
          </span>
          <strong className='text-xl font-extrabold block text-red-500'>
            {stats.cancelados}
          </strong>
        </button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div
        className='p-3.5 rounded-2xl border space-y-3'
        style={{ backgroundColor: 'var(--bg-sidebar)', borderColor: 'var(--border-color)' }}
      >
        <div className='flex flex-col sm:flex-row gap-2.5'>
          {/* Input de Búsqueda */}
          <div className='relative flex-1'>
            <Search size={16} className='absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]' />
            <input
              type='text'
              placeholder='Buscar por jugador, pareja, juez o cancha…'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='form-input pl-9 text-xs'
            />
          </div>

          {/* Select Deporte */}
          <div className='w-full sm:w-36'>
            <select
              className='form-input text-xs'
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
            >
              <option value='todos'>Todos los deportes</option>
              <option value='tenis'>Tenis</option>
              <option value='padel'>Pádel</option>
            </select>
          </div>

          {/* Select Estado */}
          <div className='w-full sm:w-40'>
            <select
              className='form-input text-xs'
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value='todos'>Todos los estados</option>
              <option value='en_vivo'>En Juego</option>
              <option value='programado'>Programados</option>
              <option value='sin_juez'>Sin Juez Asignado</option>
              <option value='finalizado'>Finalizados</option>
              <option value='cancelado'>Cancelados</option>
            </select>
          </div>
        </div>

        {/* Filtros secundarios: Cancha y Categoría */}
        <div className='flex flex-wrap items-center gap-2 pt-1 border-t' style={{ borderColor: 'var(--border-color)' }}>
          <div className='flex items-center gap-1 text-[11px] text-[var(--text-muted)] shrink-0'>
            <SlidersHorizontal size={13} />
            <span>Filtrar:</span>
          </div>

          <select
            className='form-input text-xs w-auto py-1'
            value={courtFilter}
            onChange={(e) => setCourtFilter(e.target.value)}
          >
            <option value='todas'>Todas las canchas</option>
            <option value='sin_cancha'>Sin cancha asignada</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className='form-input text-xs w-auto py-1'
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value='todas'>Todas las categorías</option>
            <option value='sin_categoria'>Sin categoría</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          {(search || sportFilter !== 'todos' || statusFilter !== 'todos' || courtFilter !== 'todas' || categoryFilter !== 'todas') && (
            <button
              onClick={() => {
                setSearch('')
                setSportFilter('todos')
                setStatusFilter('todos')
                setCourtFilter('todas')
                setCategoryFilter('todas')
              }}
              className='text-[11px] font-medium ml-auto'
              style={{ color: 'var(--color-brand)' }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Listado de Partidos */}
      {loading ? (
        <div className='p-12 text-center text-xs text-[var(--text-muted)]'>
          <RefreshCw size={24} className='animate-spin mx-auto mb-2 opacity-50' />
          Cargando partidos de la jornada…
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className='card p-10 text-center space-y-2'>
          <Trophy size={36} className='mx-auto opacity-30 text-[var(--text-muted)]' />
          <h3 className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
            No se encontraron partidos
          </h3>
          <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
            Prueba ajustando los filtros de búsqueda o el estado seleccionado.
          </p>
        </div>
      ) : (
        <div className='grid md:grid-cols-2 gap-3.5'>
          {filteredMatches.map((match) => {
            const p1 = getParticipantName(match, 1) || 'Lado 1'
            const p2 = getParticipantName(match, 2) || 'Lado 2'
            const isLive = match.estado === 'en_vivo'
            const isCancelled = match.estado === 'cancelado'
            const isFinished = match.estado === 'finalizado'
            const judgeId = match.juez?.id ?? match.juez_id
            const hasJudge = Boolean(judgeId)
            const judgeFullName = match.juez
              ? `${match.juez.nombre || ''} ${match.juez.apellido || ''}`.trim()
              : `${match.juez_nombre || ''} ${match.juez_apellido || ''}`.trim()
            const courtDisplayName = match.cancha?.nombre || match.cancha_nombre || 'Cancha por definir'
            const tournamentDisplayName = match.torneo?.nombre || match.torneo_nombre || 'Partido libre'
            const categoryDisplayName = match.categoria?.nombre || match.categoria_nombre || 'General'

            return (
              <div
                key={match.id}
                className='card p-4 flex flex-col justify-between space-y-3 transition-all hover:border-[var(--color-brand-dim)]'
                style={{
                  borderLeft: `4px solid ${
                    isLive
                      ? '#10b981'
                      : isCancelled
                      ? '#ef4444'
                      : !hasJudge
                      ? '#f59e0b'
                      : 'var(--border-color)'
                  }`,
                }}
              >
                {/* Cabecera de la tarjeta: Cancha, hora y estado */}
                <div className='flex items-start justify-between gap-2 text-xs'>
                  <div className='min-w-0'>
                    <span className='font-bold text-[var(--text-primary)] flex items-center gap-1.5'>
                      <MapPin size={13} className='text-[var(--color-brand)] shrink-0' />
                      <span className='truncate'>{courtDisplayName}</span>
                    </span>
                    <span className='text-[11px] text-[var(--text-muted)] block mt-0.5 truncate'>
                      {tournamentDisplayName} · {match.deporte?.toUpperCase()} · {categoryDisplayName}
                    </span>
                  </div>

                  <div className='shrink-0 text-right'>
                    <span
                      className='text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider inline-flex items-center gap-1'
                      style={{
                        backgroundColor:
                          isLive
                            ? 'rgba(16, 185, 129, 0.15)'
                            : isCancelled
                            ? 'rgba(239, 68, 68, 0.15)'
                            : isFinished
                            ? 'rgba(148, 163, 184, 0.15)'
                            : 'rgba(59, 130, 246, 0.15)',
                        color:
                          isLive
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
                        ? 'En Juego'
                        : isCancelled
                        ? 'Cancelado'
                        : isFinished
                        ? 'Finalizado'
                        : 'Programado'}
                    </span>
                    {match.hora_inicio && (
                      <span className='text-[11px] text-[var(--text-muted)] flex items-center justify-end gap-1 mt-0.5'>
                        <Clock size={11} /> {match.hora_inicio.slice(0, 5)}
                      </span>
                    )}
                  </div>
                </div>

                <MatchAuditButton match={match} responsive={false} />
                {/* Participantes */}
                <div
                  className='p-3 rounded-xl space-y-1.5'
                  style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
                >
                  <div className='flex items-center justify-between text-xs'>
                    <strong
                      className={`truncate ${
                        match.ganador === 'jugador1' ? 'text-[var(--color-brand)] font-bold' : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {p1}
                    </strong>
                    <span className='font-mono font-bold ml-2 shrink-0'>
                      {(match.sets || []).map((s) => s.games_j1).join(' · ')}
                      {isLive && match.marcador_actual?.displayPoints && ` | ${match.marcador_actual.displayPoints[0]}`}
                    </span>
                  </div>

                  <div className='border-t' style={{ borderColor: 'var(--border-color)' }} />

                  <div className='flex items-center justify-between text-xs'>
                    <strong
                      className={`truncate ${
                        match.ganador === 'jugador2' ? 'text-[var(--color-brand)] font-bold' : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {p2}
                    </strong>
                    <span className='font-mono font-bold ml-2 shrink-0'>
                      {(match.sets || []).map((s) => s.games_j2).join(' · ')}
                      {isLive && match.marcador_actual?.displayPoints && ` | ${match.marcador_actual.displayPoints[1]}`}
                    </span>
                  </div>
                </div>

                {/* Info del Juez Asignado */}
                <div className='flex items-center justify-between text-xs pt-1'>
                  <div className='flex items-center gap-1.5 min-w-0'>
                    {hasJudge ? (
                      <>
                        <UserCheck size={14} className='text-[var(--color-brand)] shrink-0' />
                        <span className='text-[var(--text-muted)] truncate'>
                          Juez: <strong className='text-[var(--text-primary)]'>{judgeFullName}</strong>
                        </span>
                      </>
                    ) : (
                      <span
                        className='text-[11px] px-2 py-0.5 rounded-md font-semibold flex items-center gap-1'
                        style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}
                      >
                        <AlertTriangle size={12} /> Sin juez asignado
                      </span>
                    )}
                  </div>
                </div>

                {/* Botones de Acción del Director */}
                <div className='flex flex-wrap items-center gap-1.5 pt-2 border-t' style={{ borderColor: 'var(--border-color)' }}>
                  {/* Reasignar Juez */}
                  <button
                    type='button'
                    onClick={() => setMatchToReassign(match)}
                    disabled={isCancelled || isFinished || busyId !== null}
                    className='btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1'
                    title='Cambiar o asignar el juez de este partido'
                  >
                    <UserCheck size={13} />
                    <span>{hasJudge ? 'Cambiar juez' : 'Asignar juez'}</span>
                  </button>

                  {/* Asignar o Reasignar Cancha */}
                  <button
                    type='button'
                    onClick={() => setMatchToCourt(match)}
                    disabled={isCancelled || isFinished || busyId !== null}
                    className='btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1'
                    title='Asignar o reasignar la cancha de este partido'
                  >
                    <MapPin size={13} />
                    <span>{match.cancha_id || match.cancha?.id ? 'Reasignar cancha' : 'Asignar cancha'}</span>
                  </button>

                  {/* Sustituir Jugador / Pareja */}
                  <button
                    type='button'
                    onClick={() => setMatchToSubstitute(match)}
                    disabled={match.estado !== 'programado' || Boolean(match.en_vivo?.iniciado_at) || busyId !== null}
                    className='btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1'
                    title='Sustituir a un jugador o pareja por otro registro existente'
                  >
                    <Users size={13} />
                    <span>Sustituir</span>
                  </button>

                  {/* Corregir Marcador */}
                  <button
                    type='button'
                    onClick={() => setMatchToScore(match)}
                    disabled={isCancelled || busyId !== null}
                    className='btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1'
                    style={{ color: 'var(--club-clay)' }}
                    title='Corregir tanteador o resultado del partido'
                  >
                    <Radio size={13} />
                    <span>Marcador</span>
                  </button>

                  {/* Dar Victoria por W */}
                  {!isCancelled && !isFinished && (
                    <button
                      type='button'
                      onClick={() => setMatchToWalkover(match)}
                      disabled={busyId !== null}
                      className='btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 text-amber-500 hover:bg-amber-500/10'
                      title='Declarar victoria por W (Walkover o Retiro)'
                    >
                      <Trophy size={13} />
                      <span>Dar W</span>
                    </button>
                  )}

                  {/* Bajar / Cancelar o Reactivar */}
                  {!isCancelled && !isFinished ? (
                    <button
                      type='button'
                      onClick={() => handleCancelMatch(match)}
                      disabled={busyId !== null}
                      className='btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 text-red-500 hover:bg-red-500/10'
                      title='Bajar o cancelar partido con motivo'
                    >
                      <Ban size={13} />
                      <span>Cancelar</span>
                    </button>
                  ) : isCancelled ? (
                    <button
                      type='button'
                      onClick={() => handleReactivateMatch(match)}
                      disabled={busyId !== null}
                      className='btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 text-blue-400 hover:bg-blue-400/10'
                      title='Reactivar partido a programado'
                    >
                      <RotateCcw size={13} />
                      <span>Reactivar</span>
                    </button>
                  ) : null}

                  {/* Ir a Arbitrar a Mesa de Cancha */}
                  <Link
                    to='/juez'
                    className='btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 ml-auto'
                    style={{ color: 'var(--color-brand)' }}
                    title='Abrir en la mesa de juez para anotar'
                  >
                    <Play size={13} />
                    <span>Arbitrar</span>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Reasignar Juez */}
      {matchToReassign && (
        <ModalReasignarJuez
          isOpen={Boolean(matchToReassign)}
          onClose={() => setMatchToReassign(null)}
          match={matchToReassign}
          onSuccess={() => {
            fetchMatches()
            setMatchToReassign(null)
          }}
        />
      )}

      {/* Modal Asignar / Reasignar Cancha */}
      {matchToCourt && (
        <ModalAsignarCancha
          isOpen={Boolean(matchToCourt)}
          onClose={() => setMatchToCourt(null)}
          match={matchToCourt}
          onSuccess={() => {
            fetchMatches()
            setMatchToCourt(null)
          }}
        />
      )}

      {/* Modal Sustitución de Participante */}
      {matchToSubstitute && (
        <ModalSustitucionParticipante
          isOpen={Boolean(matchToSubstitute)}
          onClose={() => setMatchToSubstitute(null)}
          match={matchToSubstitute}
          onSuccess={() => {
            fetchMatches()
            setMatchToSubstitute(null)
          }}
        />
      )}

      {/* Modal Corregir Marcador */}
      {matchToScore && (
        <ModalCorregirMarcador
          isOpen={Boolean(matchToScore)}
          onClose={() => setMatchToScore(null)}
          match={matchToScore}
          onSuccess={() => {
            fetchMatches()
            setMatchToScore(null)
          }}
        />
      )}

      {/* Modal Victoria por W */}
      {matchToWalkover && (
        <ModalFinalizarW
          isOpen={Boolean(matchToWalkover)}
          onClose={() => setMatchToWalkover(null)}
          match={matchToWalkover}
          onSuccess={() => {
            fetchMatches()
            setMatchToWalkover(null)
          }}
        />
      )}

      {/* Modal Cancelar Partido */}
      {matchToCancel && (
        <ModalCancelarPartido
          isOpen={Boolean(matchToCancel)}
          onClose={() => setMatchToCancel(null)}
          match={matchToCancel}
          onSuccess={() => {
            fetchMatches()
            setMatchToCancel(null)
          }}
        />
      )}
    </div>
  )
}
