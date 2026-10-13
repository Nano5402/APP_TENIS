import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react'
import { matchService } from '../../services/matchService'

const labels = { todos: 'Todos', retiros: 'Retiros', programacion: 'Programación', grupos: 'Grupos', revision: 'Revisión', soporte: 'Soporte' }
export default function AdminAttention() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0), [type, setType] = useState('todos'), [limit, setLimit] = useState(6)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    matchService.getAttention().then(r => { if (active) setData(r.data) })
      .catch(e => { if (active) setError(e.message || 'No se pudieron consultar los pendientes.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])
  const items = (data?.items || []).filter(i => type === 'todos' || i.type === type)
  return <section className='card p-4 sm:p-5 space-y-4 min-w-0' aria-label='Pendientes de administración'>
    <div className='flex flex-wrap gap-3 items-center justify-between'>
      <div><h2 className='font-bold flex items-center gap-2'><AlertCircle size={19} /> Necesita atención</h2>
        </div>
      <button type='button' className='btn-secondary px-3 py-2 text-sm flex gap-2 items-center' disabled={loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={15} /> Actualizar pendientes</button>
    </div>
    {loading ? <p role='status' className='text-sm'>Consultando pendientes…</p> : error ? <p role='alert' className='text-sm text-red-600'>{error} Usa Actualizar pendientes para reintentar.</p> : <>
      <div className='flex flex-wrap gap-2' role='group' aria-label='Filtrar pendientes'>{Object.entries(labels).map(([key, label]) => <button key={key} type='button' aria-pressed={type === key} className={`${type === key ? 'btn-primary' : 'btn-secondary'} px-3 py-2 text-xs rounded-xl`} onClick={() => { setType(key); setLimit(6) }}>{label} ({key === 'todos' ? data?.total : data?.items.filter(i => i.type === key).length})</button>)}</div>
      {!items.length ? <p className='text-sm flex gap-2 items-center'><CheckCircle2 size={18} /> No hay pendientes detectados en esta selección.</p> : <div className='grid gap-3 md:grid-cols-2'>{items.slice(0, limit).map(item => <Link key={item.key} to={item.to} className='rounded-xl border border-[var(--border-color)] p-3 sm:p-4 flex gap-3 items-start hover:bg-[var(--bg-hover)] min-w-0'>
        <div className='min-w-0 flex-1'><span className='text-xs font-semibold text-[var(--color-brand)]'>{labels[item.type]}</span><h3 className='font-semibold text-sm mt-1 break-words'>{item.title}</h3><p className='text-xs text-[var(--text-secondary)] mt-1 leading-relaxed'>{item.detail}</p></div><ArrowRight size={17} className='shrink-0 mt-1' /></Link>)}</div>}
      {items.length > limit && <button className='btn-secondary px-4 py-2 text-sm' onClick={() => setLimit(n => n + 12)}>Ver más pendientes</button>}
      {data?.checkedAt && <p className='text-xs text-[var(--text-muted)]'>Última consulta: {new Date(data.checkedAt).toLocaleTimeString('es-CO')}. Un pendiente no siempre implica un error.</p>}
    </>}
  </section>
}
