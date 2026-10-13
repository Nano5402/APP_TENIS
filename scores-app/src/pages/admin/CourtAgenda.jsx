import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, RefreshCw, MapPin, Clock } from 'lucide-react'
import { matchService } from '../../services/matchService'
import { getParticipantName } from '../../utils/matchParticipants'
import { formatClockTime } from '../../utils/formatDate'
import useAuthStore from '../../store/useAuthStore'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const status = p => p.estado === 'en_vivo' && p.en_vivo?.pausado_at ? 'En pausa / suspendido' : ({ programado: 'Programado', en_vivo: 'En vivo', finalizado: 'Finalizado', cancelado: 'Cancelado' }[p.estado] || p.estado)
export default function CourtAgenda() {
  const admin = useAuthStore(s => s.user?.rol === 'admin')
  const [date, setDate] = useState(today), [court, setCourt] = useState(''), [revision, setRevision] = useState(0)
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    matchService.getAll({ fecha: date, orden: 'asc' }).then(r => { if (active) setRows(r.data || []) })
      .catch(() => { if (active) setError('No se pudo cargar la agenda. Intenta de nuevo.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [date, revision])
  const courts = [...new Map(rows.map(p => [String(p.cancha?.id || 'none'), p.cancha ? `${p.cancha.sede?.nombre ? p.cancha.sede.nombre + ' · ' : ''}${p.cancha.nombre}` : 'Sin cancha asignada'])).entries()]
  const sorted = rows.filter(p => !court || String(p.cancha?.id || 'none') === court).sort((a,b) => String(a.hora_inicio || '99').localeCompare(String(b.hora_inicio || '99')) || a.id-b.id)
  const card = p => <article key={p.id} className='rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-3 min-w-0 shadow-sm'>
    <div className='flex flex-wrap items-center justify-between gap-2 text-xs'><span className='font-bold flex gap-1 items-center'><Clock size={14} />{p.hora_inicio ? formatClockTime(p.hora_inicio) : 'Hora por definir'}</span><span className='rounded-full bg-[var(--bg-hover)] px-2 py-1'>{status(p)}</span></div>
    <p className='font-semibold text-sm break-words'>{getParticipantName(p,1)} <span className='text-[var(--text-muted)] font-normal'>vs.</span> {getParticipantName(p,2)}</p>
    <div className='text-xs text-[var(--text-secondary)] space-y-1 break-words'><p className='flex gap-1 items-center'><MapPin size={13} className='shrink-0' />{p.cancha?.nombre || 'Sin cancha asignada'}</p><p>{p.torneo?.nombre || 'Sin torneo'} · {p.categoria?.nombre || 'Sin categoría'}</p><p>Juez: {p.juez ? [p.juez.nombre,p.juez.apellido].filter(Boolean).join(' ') : 'Por asignar'}</p></div>
    <Link className='inline-block text-sm font-semibold text-[var(--color-brand)] underline py-1' to={admin ? `/admin/partidos?partido=${p.id}` : '/director'}>{admin ? 'Gestionar partido' : 'Ir al control del director'} · #{p.id}</Link>
  </article>
  return <div className='max-w-7xl mx-auto space-y-5 p-3 sm:p-6 min-w-0'>
    <Link className='text-sm underline' to={admin ? '/admin/partidos' : '/director'}>Volver a partidos</Link>
    <header><h1 className='text-2xl font-bold flex gap-2 items-center'><CalendarDays />Agenda por cancha</h1><p className='text-sm text-[var(--text-secondary)] mt-2'>Horarios de Colombia. Los inicios son programados: no representan una duración garantizada.</p></header>
    <div className='card p-4 flex flex-wrap gap-3 items-end'>
      <label className='text-sm min-w-0 w-full sm:w-auto'>Fecha<input aria-label='Fecha de la agenda' className='form-input block w-full mt-1' type='date' required value={date} onChange={e => { if (e.target.value) { setDate(e.target.value); setCourt('') } }} /></label>
      <label className='text-sm min-w-0 w-full sm:flex-1'>Cancha<select aria-label='Cancha de la agenda' className='form-input block w-full mt-1' value={court} onChange={e => setCourt(e.target.value)}><option value=''>Todas las canchas</option>{courts.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <button className='btn-secondary px-3 py-2' onClick={() => { setDate(today()); setCourt('') }}>Hoy</button>
      <button className='btn-secondary px-3 py-2 flex gap-2 items-center' disabled={loading} onClick={() => setRevision(n => n+1)}><RefreshCw size={16} />Actualizar</button>
    </div>
    {loading ? <p role='status'>Consultando agenda…</p> : error ? <p role='alert' className='card p-4 text-red-600'>{error}</p> : <>
      <p className='text-sm text-[var(--text-secondary)]'>{sorted.length} encuentros · incluye finalizados y cancelados. Los partidos sin fecha no aparecen en la agenda diaria.</p>
      {!sorted.length && <p className='card p-6'>No hay encuentros para esta fecha y cancha.</p>}
      <div className='grid gap-3 lg:hidden'>{sorted.map(card)}</div>
      <div className='hidden lg:grid gap-4 items-start' style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>{courts.filter(([id]) => !court || id === court).map(([id,name]) => <section key={id} className='min-w-0 rounded-2xl bg-[var(--bg-hover)] p-3 space-y-3'><h2 className='font-bold text-sm px-1 break-words'>{name}</h2>{sorted.filter(p => String(p.cancha?.id || 'none') === id).map(card)}</section>)}</div>
    </>}
  </div>
}
