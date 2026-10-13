import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, CalendarDays, Trophy, UserRound } from 'lucide-react'
import useAuthStore from '../store/useAuthStore'
import { matchService } from '../services/matchService'
import { useMatchRealtime } from '../hooks/useMatchRealtime'
import MatchCard from '../components/match/MatchCard'
import Avatar from '../components/ui/Avatar'
import LatestAnnouncement from '../components/common/LatestAnnouncement'

export default function PlayerDashboard() {
  const user = useAuthStore(state => state.user)
  const [data, setData] = useState(null)
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
    } finally {
      if (version === request.current) setLoading(false)
    }
  }, [])
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
  const all = [...live, ...upcoming, ...history]
  const tournaments = [...new Map(all.filter(m => m.torneo?.id).map(m => [String(m.torneo.id), m.torneo.nombre])).entries()]
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
        <p className='text-sm mt-1' style={{ color: 'var(--text-muted)' }}>Tus partidos, resultados y evolución en un solo lugar.</p>
      </div>
      <Link to='/profile' className='btn-secondary w-full sm:w-auto justify-center px-4 py-2 rounded-xl inline-flex gap-2 text-sm'><UserRound size={16} /> Mi perfil</Link>
    </section>
    <LatestAnnouncement />
    {loading ? <div className='skeleton h-48 rounded-xl' /> : unlinked ? <section className='card p-6'>
      <h2 className='font-bold'>Vincula tu cuenta con tu ficha de jugador</h2>
      <p className='text-sm mt-2'>Pide al administrador que vincule tu usuario al jugador correspondiente. Aquí aparecerán sus partidos y resultados; no necesitas crear otra cuenta.</p>
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
            <label className='text-sm'>Torneo <select className='input max-w-full ml-1' value={tournament} onChange={e => { setTournament(e.target.value); setLimit(6) }}><option value=''>Todos</option>{tournaments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
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
