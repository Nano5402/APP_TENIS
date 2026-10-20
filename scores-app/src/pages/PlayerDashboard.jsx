import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, CalendarDays, ChevronRight, Compass, GitBranch, ListChecks, ScrollText, Search, Trophy, UserRound, Users } from 'lucide-react'
import useAuthStore from '../store/useAuthStore'
import { matchService } from '../services/matchService'
import { tournamentService } from '../services/tournamentService'
import { useMatchRealtime } from '../hooks/useMatchRealtime'
import MatchCard from '../components/match/MatchCard'
import Avatar from '../components/ui/Avatar'
import Modal from '../components/ui/Modal'
import LatestAnnouncement from '../components/common/LatestAnnouncement'

export default function PlayerDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const [data, setData] = useState(null)
  const [activeTournaments, setActiveTournaments] = useState([])
  const [tournamentsLoading, setTournamentsLoading] = useState(true)
  const [tournamentsError, setTournamentsError] = useState('')
  const tournamentRequest = useRef(0)
  const [groupsModalOpen, setGroupsModalOpen] = useState(false)
  const [modalTargetTab, setModalTargetTab] = useState('standings') // 'standings' | 'bracket'
  const [groupsFilter, setGroupsFilter] = useState('')
  const [groupsCategoryFilter, setGroupsCategoryFilter] = useState('')
  const [error, setError] = useState('')
  const [unlinked, setUnlinked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('historial')
  const [tournament, setTournament] = useState('')
  const [limit, setLimit] = useState(6)
  const request = useRef(0)
  const load = useCallback(async () => {
    const version = ++request.current
    try {
      const response = await matchService.getMyMatches()
      if (version !== request.current) return
      setData(response.data)
      setError('')
      setUnlinked(false)
    } catch (err) {
      if (version !== request.current) return
      setUnlinked(err.status === 404)
      setError(err.status === 404 ? '' : 'No pudimos actualizar tu panel. Intenta nuevamente.')
      if (err.status === 404) setData(null)
    } finally {
      if (version === request.current) setLoading(false)
    }
  }, [])
  const loadTournaments = useCallback(async () => {
    const version = ++tournamentRequest.current
    setTournamentsLoading(true)
    try {
      const response = await tournamentService.getAll({ deporte: 'tenis', archivo: 'activos' })
      if (!Array.isArray(response.data)) throw new Error('Invalid tournament response')
      if (version !== tournamentRequest.current) return
      setActiveTournaments(response.data)
      setTournamentsError('')
    } catch {
      if (version === tournamentRequest.current) setTournamentsError('No pudimos actualizar los torneos.')
    } finally {
      if (version === tournamentRequest.current) setTournamentsLoading(false)
    }
  }, [])
  useEffect(() => { loadTournaments(); return () => { tournamentRequest.current++ } }, [loadTournaments])
  useEffect(() => { load(); return () => { request.current++ } }, [load])
  // Agrupa ráfagas de puntos para no consultar todo el historial por cada acción.
  const refreshTimer = useRef(null)
  useMatchRealtime(useCallback(() => {
    if (!refreshTimer.current) refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null
      load()
    }, 2000)
  }, [load]))
  useEffect(() => () => clearTimeout(refreshTimer.current), [])

  const history = data?.historial || []
  const upcoming = data?.proximos || []
  const live = data?.en_vivo || []
  const all = useMemo(() => [...(data?.en_vivo || []), ...(data?.proximos || []), ...(data?.historial || [])], [data])
  const tournaments = [...new Map(all.filter(m => m.torneo?.id).map(m => [String(m.torneo.id), m.torneo.nombre])).entries()]

  const myTournamentIds = useMemo(
    () => new Set(all.filter(m => m.torneo?.id).map(m => String(m.torneo.id))),
    [all]
  )

  const selectableTournaments = useMemo(() => {
    const map = new Map()
    for (const t of activeTournaments) {
      if (t?.id) map.set(String(t.id), t)
    }
    for (const m of all) {
      if (m.torneo?.id && !map.has(String(m.torneo.id))) {
        map.set(String(m.torneo.id), {
          id: m.torneo.id,
          nombre: m.torneo.nombre,
          categoria: m.torneo.categoria || null,
          modalidad: m.torneo.modalidad || m.modalidad || null,
          estado: m.torneo.estado || null,
        })
      }
    }
    return [...map.values()].sort((a, b) => {
      const aMine = myTournamentIds.has(String(a.id)) ? 1 : 0
      const bMine = myTournamentIds.has(String(b.id)) ? 1 : 0
      if (aMine !== bMine) return bMine - aMine
      const aLive = a.estado === 'en_curso' ? 1 : 0
      const bLive = b.estado === 'en_curso' ? 1 : 0
      if (aLive !== bLive) return bLive - aLive
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
    })
  }, [activeTournaments, all, myTournamentIds])

  const modalCategories = useMemo(() => {
    const map = new Map()
    for (const t of selectableTournaments) {
      if (t.categoria?.nombre) {
        map.set(String(t.categoria.id || t.categoria.nombre), t.categoria.nombre)
      }
    }
    return [...map.entries()]
  }, [selectableTournaments])

  const filteredModalTournaments = useMemo(() => {
    const q = groupsFilter.trim().toLowerCase()
    return selectableTournaments.filter(t => {
      if (groupsCategoryFilter) {
        const catKey = String(t.categoria?.id || t.categoria?.nombre || '')
        if (catKey !== groupsCategoryFilter) return false
      }
      if (!q) return true
      const name = String(t.nombre || '').toLowerCase()
      const cat = String(t.categoria?.nombre || '').toLowerCase()
      return name.includes(q) || cat.includes(q)
    })
  }, [selectableTournaments, groupsFilter, groupsCategoryFilter])

  const quickLinks = [
    {
      onClick: () => {
        if (selectableTournaments.length === 1) {
          navigate(`/torneo/${selectableTournaments[0].id}?tab=bracket`)
          return
        }
        setModalTargetTab('bracket')
        setGroupsFilter('')
        setGroupsCategoryFilter('')
        setGroupsModalOpen(true)
      },
      icon: GitBranch,
      title: 'Cuadros eliminatorios',
      badge: 'Fase final',
      desc:
        selectableTournaments.length === 1
          ? `Mira las llaves de eliminación directa de ${selectableTournaments[0].nombre} y descarga el cuadro en imagen.`
          : 'Consulta cómo van los cruces de octavos, cuartos, semifinales y final por categoría.',
      cta: 'Ver cuadros eliminatorios',
    },
    {
      onClick: () => {
        setModalTargetTab('standings')
        setGroupsFilter('')
        setGroupsCategoryFilter('')
        setGroupsModalOpen(true)
      },
      icon: Users,
      title: 'Grupos del torneo',
      badge: selectableTournaments.length > 0 ? `${selectableTournaments.length} ${selectableTournaments.length === 1 ? 'torneo' : 'torneos'}` : null,
      desc:
        selectableTournaments.length > 1
          ? `Elige entre ${selectableTournaments.length} torneos disponibles para consultar grupos y posiciones.`
          : selectableTournaments.length === 1
            ? `Consulta los grupos y tabla de posiciones de ${selectableTournaments[0].nombre}.`
            : 'Selecciona el torneo para revisar cómo van sus grupos y posiciones.',
      cta: 'Elegir torneo y ver grupos',
    },
    {
      to: '/tennis?tab=results',
      icon: ListChecks,
      title: 'Resultados generales',
      desc: 'Consulta todos los marcadores y partidos finalizados del club.',
      cta: 'Ver resultados',
    },
    {
      to: '/tennis?tab=tournaments',
      icon: Trophy,
      title: 'Torneos y programación',
      desc: 'Explora los torneos activos, parejas inscritas y próximos partidos.',
      cta: 'Ir a torneos',
    },
  ]

  const filteredHistory = history.filter(m => !tournament || String(m.torneo?.id) === tournament)
  const wins = filteredHistory.filter(m => m.resultado === 'victoria').length
  const losses = filteredHistory.filter(m => m.resultado === 'derrota').length
  const decided = wins + losses
  const list = (tab === 'historial' ? history : upcoming).filter(m => !tournament || String(m.torneo?.id) === tournament)

  return <div className='space-y-6 animate-fade-up'>
    {['admin', 'juez', 'juez_director'].includes(user?.rol) && <nav aria-label='Cambiar actividad' className='flex flex-wrap gap-2'><span className='btn-primary px-4 py-2 text-sm'>Mi actividad · jugador</span><Link className='btn-secondary px-4 py-2 text-sm' to='/juez'>Mesa de juez</Link>{user?.rol === 'juez_director' && <Link className='btn-secondary px-4 py-2 text-sm' to='/director'>Dirección</Link>}</nav>}
    <section className='card p-5 sm:p-7 flex flex-wrap items-center gap-4'>
      <Avatar src={data?.jugador?.foto || user?.avatar} name={`${user?.nombre || ''} ${user?.apellido || ''}`} size='lg' />
      <div className='flex-1 min-w-[160px]'>
        <p className='text-xs font-bold uppercase tracking-widest' style={{ color: 'var(--color-brand)' }}>Mi panel</p>
        <h1 className='text-2xl font-bold mt-1'>Hola, {user?.nombre}</h1>
        <p className='text-sm mt-1' style={{ color: 'var(--text-muted)' }}>Tus partidos, resultados y acceso directo al torneo en un solo lugar.</p>
      </div>
      <div className='flex flex-wrap gap-2 w-full sm:w-auto'>
        <Link to='/reglamento' className='btn-secondary flex-1 sm:flex-initial justify-center px-4 py-2 rounded-xl inline-flex gap-2 text-sm'><ScrollText size={16} /> Reglamento</Link>
        <Link to='/profile' className='btn-secondary flex-1 sm:flex-initial justify-center px-4 py-2 rounded-xl inline-flex gap-2 text-sm'><UserRound size={16} /> Mi perfil</Link>
      </div>
    </section>

    <section className='space-y-3' aria-label='Acceso rápido al torneo'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='font-bold text-lg flex items-center gap-2'>
          <Compass size={20} style={{ color: 'var(--color-brand)' }} />
          Acceso rápido
        </h2>
        <span className='text-xs font-medium' style={{ color: 'var(--text-muted)' }}>
          Todo el torneo a un toque
        </span>
      </div>
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>
        {quickLinks.map((item) => {
          const Icon = item.icon
          const inner = (
            <>
              <div className='space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                  <span
                    className='w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0'
                    style={{ background: 'var(--color-brand-dim)', color: 'var(--color-brand)' }}
                  >
                    <Icon size={20} />
                  </span>
                  <div className='flex items-center gap-2'>
                    {item.badge && (
                      <span className='badge-brand text-[10px] px-2 py-0.5'>
                        {item.badge}
                      </span>
                    )}
                    <ArrowRight
                      size={16}
                      className='transition-transform duration-200 group-hover:translate-x-1'
                      style={{ color: 'var(--color-brand)' }}
                    />
                  </div>
                </div>
                <h3 className='font-bold text-base' style={{ color: 'var(--text-primary)' }}>
                  {item.title}
                </h3>
                <p className='text-xs leading-relaxed' style={{ color: 'var(--text-secondary)' }}>
                  {item.desc}
                </p>
              </div>
              <span
                className='text-xs font-bold inline-flex items-center gap-1 pt-1'
                style={{ color: 'var(--color-brand)' }}
              >
                {item.cta}
              </span>
            </>
          )
          if (item.onClick) {
            return (
              <button
                key={item.title}
                type='button'
                onClick={item.onClick}
                className='card-hover p-4 flex flex-col justify-between gap-3 group text-left w-full cursor-pointer'
              >
                {inner}
              </button>
            )
          }
          return (
            <Link
              key={item.title}
              to={item.to}
              className='card-hover p-4 flex flex-col justify-between gap-3 group'
            >
              {inner}
            </Link>
          )
        })}
      </div>
    </section>

    <Modal
      isOpen={groupsModalOpen}
      onClose={() => setGroupsModalOpen(false)}
      title={modalTargetTab === 'bracket' ? 'Cuadros de Fase Eliminatoria' : 'Grupos del torneo'}
      subtitle='Selecciona el torneo para revisar sus cuadros eliminatorios o grupos'
      icon={modalTargetTab === 'bracket' ? GitBranch : Users}
      maxWidth='max-w-xl'
      footer={
        <div className='flex flex-wrap items-center justify-between gap-2 w-full'>
          <Link
            to='/tennis?tab=tournaments'
            onClick={() => setGroupsModalOpen(false)}
            className='text-xs font-semibold hover:underline inline-flex items-center gap-1'
            style={{ color: 'var(--color-brand)' }}
          >
            Ver directorio completo de torneos <ArrowRight size={13} />
          </Link>
          <button
            type='button'
            onClick={() => setGroupsModalOpen(false)}
            className='btn-secondary px-4 py-2 rounded-xl text-xs font-semibold'
          >
            Cerrar
          </button>
        </div>
      }
    >
      {tournamentsLoading && <p role='status'>Cargando torneos…</p>}
      {tournamentsError && <p role='alert'>{tournamentsError} <button type='button' className='underline font-bold' disabled={tournamentsLoading} onClick={loadTournaments}>Reintentar torneos</button></p>}
      {selectableTournaments.length > 1 && (
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-2.5'>
          <div className='relative'>
            <Search
              size={15}
              className='absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none'
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type='search'
              value={groupsFilter}
              onChange={(e) => setGroupsFilter(e.target.value)}
              placeholder='Buscar torneo o categoría...'
              className='form-input pl-9 py-2 text-xs w-full'
            />
          </div>
          {modalCategories.length > 1 && (
            <select
              value={groupsCategoryFilter}
              onChange={(e) => setGroupsCategoryFilter(e.target.value)}
              className='form-input py-2 text-xs w-full'
              aria-label='Filtrar por categoría'
            >
              <option value=''>Todas las categorías</option>
              {modalCategories.map(([catKey, catName]) => (
                <option key={catKey} value={catKey}>
                  {catName}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {filteredModalTournaments.length === 0 ? (!tournamentsLoading && !tournamentsError && (
        <div className='card p-6 text-center space-y-2'>
          <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
            No se encontraron torneos
          </p>
          <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
            Puedes explorar el listado general de torneos del club.
          </p>
        </div>
      )) : (
        <div className='space-y-2.5'>
          {filteredModalTournaments.map((t) => {
            const isMine = myTournamentIds.has(String(t.id))
            const statusLabel =
              t.estado === 'en_curso'
                ? 'En curso'
                : t.estado === 'programado'
                  ? 'Programado'
                  : t.estado === 'finalizado'
                    ? 'Finalizado'
                    : String(t.estado || '').replace('_', ' ')
            return (
              <div
                key={t.id}
                className='rounded-xl border p-3.5 sm:p-4 transition-colors flex flex-col gap-3'
                style={{
                  backgroundColor: isMine ? 'var(--color-brand-dim)' : 'var(--bg-card)',
                  borderColor: isMine ? 'var(--color-brand)' : 'var(--border-color)',
                }}
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0 space-y-1'>
                    <div className='flex flex-wrap items-center gap-1.5'>
                      {isMine && (
                        <span className='badge-brand text-[10px] px-2 py-0.5'>
                          Tu torneo
                        </span>
                      )}
                      {t.categoria?.nombre && (
                        <span
                          className='text-[11px] font-bold px-2 py-0.5 rounded-md border'
                          style={{
                            backgroundColor: 'var(--bg-card)',
                            borderColor: 'var(--border-color)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {t.categoria.nombre}
                        </span>
                      )}
                      <span className='text-[11px] font-medium' style={{ color: 'var(--text-muted)' }}>
                        {t.modalidad === 'dobles' ? 'Dobles' : t.modalidad === 'individual' ? 'Individual' : 'Torneo'}{statusLabel ? ` · ${statusLabel}` : ''}
                      </span>
                    </div>
                    <h3 className='font-bold text-sm sm:text-base leading-snug' style={{ color: 'var(--text-primary)' }}>
                      {t.nombre}
                    </h3>
                    {(typeof t.inscripciones_count === 'number' || typeof t.partidos_count === 'number') && (
                      <p className='text-xs' style={{ color: 'var(--text-secondary)' }}>
                        {typeof t.inscripciones_count === 'number' ? `${t.inscripciones_count} inscripciones` : ''}
                        {typeof t.inscripciones_count === 'number' && typeof t.partidos_count === 'number' ? ' · ' : ''}
                        {typeof t.partidos_count === 'number' ? `${t.partidos_count} partidos` : ''}
                      </p>
                    )}
                  </div>
                </div>

                <div className='flex flex-wrap items-center gap-2 pt-1'>
                  <button
                    type='button'
                    onClick={() => {
                      setGroupsModalOpen(false)
                      navigate(`/torneo/${t.id}?tab=bracket`)
                    }}
                    className={`${
                      modalTargetTab === 'bracket' ? 'btn-primary font-bold flex-1 sm:flex-initial' : 'btn-secondary font-semibold'
                    } px-3.5 py-2 rounded-xl text-xs inline-flex items-center gap-1.5 justify-center`}
                  >
                    <GitBranch size={14} />
                    Ver cuadro eliminatorio
                    {modalTargetTab === 'bracket' && <ChevronRight size={14} />}
                  </button>
                  <button
                    type='button'
                    onClick={() => {
                      setGroupsModalOpen(false)
                      navigate(`/torneo/${t.id}?tab=standings`)
                    }}
                    className={`${
                      modalTargetTab === 'standings' ? 'btn-primary font-bold flex-1 sm:flex-initial' : 'btn-secondary font-semibold'
                    } px-3.5 py-2 rounded-xl text-xs inline-flex items-center gap-1.5 justify-center`}
                  >
                    <Users size={14} />
                    Ver grupos y posiciones
                    {modalTargetTab === 'standings' && <ChevronRight size={14} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>

    <LatestAnnouncement />
    {loading ? <div className='skeleton h-48 rounded-xl' /> : unlinked ? <section className='card p-6'>
      <h2 className='font-bold'>Vincula tu cuenta con tu ficha de jugador</h2>
      <p className='text-sm mt-2'>Pide al administrador que vincule tu usuario al jugador correspondiente. Aquí aparecerán sus partidos y resultados; mientras tanto puedes usar los accesos rápidos de arriba para consultar resultados, torneos y grupos.</p>
    </section> : <>
      {error && <div role='alert' className='card p-4 text-sm'>{error} <button className='underline font-bold' onClick={load}>Reintentar</button></div>}
      {data && <>
        <section className='space-y-3'>
          <h2 className='font-bold text-lg flex gap-2 items-center'><CalendarDays size={20} /> {live.length ? 'Estás en cancha' : 'Tu próximo partido'}</h2>
          {live.length ? <div className='grid md:grid-cols-2 gap-4'>{live.map(match => <MatchCard key={match.id} match={match} />)}</div> : upcoming[0] ? <MatchCard match={upcoming[0]} /> : <div className='card p-8 text-center text-sm' style={{ color: 'var(--text-muted)' }}>No tienes partidos programados por el momento.</div>}
        </section>
        <section className='space-y-4'>
          <div className='flex flex-wrap justify-between items-center gap-3'>
            <h2 className='font-bold text-lg flex gap-2 items-center'><BarChart3 size={20} /> Mi balance</h2>
            <label className='text-sm flex items-center gap-2'>Torneo <select className='form-input max-w-full py-2 min-h-[42px]' value={tournament} onChange={e => { setTournament(e.target.value); setLimit(6) }}><option value=''>Todos</option>{tournaments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          </div>
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
            {[['Finalizados', filteredHistory.length], ['Victorias', wins], ['Derrotas', losses], ['De victorias', decided ? `${Math.round(wins / decided * 100)}%` : '—']].map(([label, value]) => <div className='card p-4 text-center' key={label}><strong className='text-2xl' style={{ color: 'var(--color-brand)' }}>{value}</strong><p className='text-xs mt-1'>{label}</p></div>)}
          </div>
          <p className='text-xs' style={{ color: 'var(--text-muted)' }}>El porcentaje cuenta solo partidos con ganador definido. En dobles, el resultado corresponde a tu pareja. Los cancelados no se incluyen.</p>
        </section>
        <section className='space-y-4'>
          <h2 className='font-bold text-lg flex items-center gap-2'><Trophy size={20} /> Mis partidos</h2>
          <div className='flex gap-2' role='group' aria-label='Tipo de partidos'>
            {[['proximos', 'Próximos'], ['historial', 'Historial']].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setLimit(6) }} className={`rounded-xl px-4 py-2 text-sm ${tab === value ? 'btn-primary' : 'btn-secondary'}`}>{label}</button>)}
          </div>
          {list.length === 0 && <p className='card p-6 text-sm'>No hay partidos en esta selección.</p>}
          <div className='grid md:grid-cols-2 gap-4'>
            {list.slice(0, limit).map(match => <div key={match.id} className='min-w-0 space-y-2'>
              {tab === 'historial' && <p className='text-xs font-bold px-1' style={{ color: match.resultado === 'victoria' ? 'var(--club-green)' : 'var(--text-secondary)' }}>{match.resultado === 'victoria' ? 'Victoria' : match.resultado === 'derrota' ? 'Derrota' : 'Sin ganador registrado'}{match.modalidad === 'dobles' ? ' · Dobles' : ' · Individual'}</p>}
              <MatchCard match={match} />
              {tab === 'historial' && <Link className='inline-flex items-center gap-2 text-sm font-semibold p-2' style={{ color: 'var(--color-brand)' }} to={`/match/${match.id}`}><BarChart3 size={16} /> Ver estadísticas y comparación</Link>}
            </div>)}
          </div>
          {list.length > limit && <button className='btn-secondary rounded-xl px-4 py-2' onClick={() => setLimit(n => n + 6)}>Mostrar más partidos</button>}
        </section>
      </>}
    </>}
  </div>
}
