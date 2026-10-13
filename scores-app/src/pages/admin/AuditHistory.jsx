import { useEffect, useState } from 'react'
import { History, ShieldCheck } from 'lucide-react'
import api from '../../services/api'
import ActionDialog from '../../components/common/ActionDialog'

const types = { todos: 'Toda la actividad', ediciones: 'Ediciones · antes y después', retiros: 'Retiros y reincorporaciones', archivo: 'Archivo de torneos', eliminaciones: 'Eliminaciones', partidos: 'Intervenciones en partidos' }
const labels = { cancha_id: 'Cancha (ID)', juez_id: 'Juez (ID)', torneo_id: 'Torneo (ID)', categoria_id: 'Categoría (ID)', jugador1_id: 'Jugador 1 (ID)', jugador2_id: 'Jugador 2 (ID)', equipo1_id: 'Pareja 1 (ID)', equipo2_id: 'Pareja 2 (ID)', fecha_inicio: 'Fecha de inicio', fecha_fin: 'Fecha de cierre', hora_inicio: 'Hora de inicio', distribucion: 'Distribución de grupos', sets: 'Resultado por sets', estado: 'Estado', ganador: 'Ganador', grupo: 'Grupo', nombre: 'Nombre', notas: 'Notas' }
const date = value => value ? new Date(value).toLocaleString('es-CO') : 'Fecha no disponible'
function Details({ value }) {
  if (value?.cambios && typeof value.cambios === 'object') return <div className='space-y-4'>{Object.entries(value.cambios).map(([key, change]) => <section key={key} className='rounded-xl border border-[var(--border-color)] overflow-hidden'><h4 className='px-4 py-2 font-semibold text-sm bg-[var(--bg-secondary)]'>{labels[key] || key.replaceAll('_', ' ')}</h4><div className='grid grid-cols-1 sm:grid-cols-2 gap-4 p-4'><div className='min-w-0'><p className='text-xs text-[var(--text-muted)] mb-2'>Antes</p><Details value={change.antes} /></div><div className='min-w-0'><p className='text-xs font-semibold text-[var(--color-brand)] mb-2'>Después</p><Details value={change.despues} /></div></div></section>)}</div>
  if (!value || typeof value !== 'object') return <span className='break-words whitespace-pre-wrap'>{String(value ?? '—')}</span>
  return <dl className='space-y-3'>{Object.entries(value).map(([key, child]) => <div key={key} className='border-l-2 border-[var(--border-color)] pl-3 min-w-0'><dt className='text-xs font-semibold text-[var(--text-muted)] break-words'>{key.replaceAll('_', ' ')}</dt><dd className='text-sm mt-1 min-w-0'><Details value={child} /></dd></div>)}</dl>
}
export default function AuditHistory() {
  const [tipo, setTipo] = useState('todos'), [pagina, setPagina] = useState(0), [retry, setRetry] = useState(0)
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [detail, setDetail] = useState(null)
  useEffect(() => {
    let active = true
    setBusy(true); setError(''); setData(null)
    api.get('/auditoria', { params: { tipo, pagina } }).then(r => { if (active) setData(r.data) }).catch(() => { if (active) setError('No se pudo cargar el historial. Puedes volver a intentarlo.') }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [tipo, pagina, retry])
  return <div className='max-w-5xl mx-auto space-y-5 min-w-0'>
    <header className='card p-5 space-y-3'><div className='flex gap-3 items-center'><History className='text-[var(--color-brand)] shrink-0' /><h1 className='text-xl font-bold'>Historial administrativo</h1></div><p className='text-sm text-[var(--text-muted)]'>Quién realizó cada acción y cuándo. Solo incluye acciones que el sistema registró; no es un historial completo de todas las ediciones.</p><p className='text-xs flex gap-2 items-center'><ShieldCheck size={16} /> Solo administradores · Consulta de solo lectura</p></header>
    <div className='flex flex-wrap gap-3 items-end'><label className='flex-1 min-w-0 text-sm'>Actividad<select aria-label='Actividad' className='input w-full mt-1' value={tipo} onChange={e => { setTipo(e.target.value); setPagina(0) }}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className='btn-secondary' onClick={() => { setPagina(0); setRetry(n => n + 1) }} disabled={busy}>Actualizar</button></div>
    <p className='text-xs text-[var(--text-muted)]'>Más recientes primero, hasta 5.050 registros por filtro. Actualiza para consultar nuevas acciones. Las intervenciones conservadas corresponden a partidos eliminados; sus detalles pueden contener la fecha y el autor originales.</p>
    {busy ? <p role='status'>Cargando historial…</p> : error ? <div role='alert' className='card p-4'>{error}<button className='btn-secondary mt-3' onClick={() => setRetry(n => n + 1)}>Reintentar</button></div> : <>
      {!data?.items?.length && <p className='card p-6'>No hay registros para este filtro.</p>}
      <ol className='space-y-3'>{data?.items?.map(item => <li key={item.key} className='card p-4 sm:p-5 space-y-2 min-w-0'><div className='flex flex-wrap justify-between gap-2'><span className='text-xs text-[var(--color-brand)] font-semibold'>{types[item.tipo]}</span><time className='text-xs text-[var(--text-muted)]'>{date(item.fecha)}</time></div><h2 className='font-semibold break-words'>{item.accion.replaceAll('_', ' ')} · {item.entidad} #{item.registro_id}</h2><p className='text-sm break-words'>{item.autor}{item.actor_id ? ` · Usuario #${item.actor_id}` : ''}</p><button className='btn-secondary text-sm' onClick={() => setDetail(item)}>Ver registro</button></li>)}</ol>
      <nav aria-label='Páginas del historial' className='flex flex-wrap gap-3 items-center justify-between'><button className='btn-secondary' disabled={!pagina} onClick={() => setPagina(n => n - 1)}>Anterior</button><span className='text-sm'>Página {pagina + 1}</span><button className='btn-secondary' disabled={data?.siguiente == null} onClick={() => setPagina(data.siguiente)}>Siguiente</button></nav>
    </>}
    {detail && <ActionDialog title='Detalle del registro' onClose={() => setDetail(null)}><p className='text-sm'>{detail.autor} · {date(detail.fecha)}</p><h3 className='font-semibold break-words'>{detail.accion.replaceAll('_', ' ')} · {detail.entidad} #{detail.registro_id}</h3>{Object.keys(detail.detalle).length ? <Details value={detail.detalle} /> : <p>No hay detalles adicionales registrados.</p>}</ActionDialog>}
  </div>
}
