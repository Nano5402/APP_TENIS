import { useEffect, useState } from 'react'
import { BarChart3, Download, RefreshCw } from 'lucide-react'
import api from '../../services/api'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const before = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10)
const labels = { mobile: 'Celular', tablet: 'Tableta', desktop: 'Computador', direct: 'Directo / sin referencia', search: 'Buscadores', social: 'Redes sociales', referral: 'Otros sitios', internal: 'Dentro del sitio' }
const number = n => n == null ? '—' : Number(n).toLocaleString('es-CO')
export default function Traffic() {
  const [filters, setFilters] = useState(() => ({ from: before(today(), 29), to: today(), channel: 'public' }))
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [exporting, setExporting] = useState(false)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null)
    api.get('/analytics/report', { params: filters }).then(r => { if (active) setData(r.data) }).catch(e => { if (active) setError(e.message || 'No se pudieron cargar las estadísticas') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, attempt])
  async function download() {
    setExporting(true)
    try {
      const blob = await api.get('/analytics/report', { params: { ...filters, format: 'csv' }, responseType: 'blob' })
      const url = URL.createObjectURL(blob), a = document.createElement('a')
      a.href = url; a.download = `visitas-${filters.from}-${filters.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('No se pudo descargar el informe. Reintenta.') } finally { setExporting(false) }
  }
  const max = Math.max(1, ...(data?.daily || []).map(d => Number(d.views)))
  return <div className='max-w-6xl mx-auto space-y-5 min-w-0'>
    <header className='flex flex-wrap justify-between gap-3 items-center'><div><h1 className='text-2xl font-bold flex gap-2 items-center'><BarChart3 />Estadísticas de visitas</h1><p className='text-sm mt-1' style={{ color: 'var(--text-muted)' }}>Tráfico medido · Hora de Colombia</p></div><button className='btn-secondary' disabled={loading || !data || exporting} onClick={download}><Download size={17} />{exporting ? 'Exportando…' : 'Exportar CSV'}</button></header>
    <section className='card p-4 space-y-3'><div className='flex flex-wrap gap-2'>{[['Hoy', 0], ['7 días', 6], ['30 días', 29], ['90 días', 89]].map(([name, days]) => <button className='btn-secondary text-sm min-h-11' key={name} onClick={() => setFilters(f => ({ ...f, from: before(today(), days), to: today() }))}>{name}</button>)}</div><div className='grid sm:grid-cols-3 gap-3'>
      {[['from', 'Desde'], ['to', 'Hasta']].map(([key, label]) => <label key={key} className='text-sm min-w-0'>{label}<input className='form-input mt-1 w-full min-w-0' type='date' value={filters[key]} max={today()} onChange={e => { if (e.target.value) setFilters(f => ({ ...f, [key]: e.target.value })) }} /></label>)}
      <label className='text-sm'>Tipo de tráfico<select className='form-input mt-1 w-full' value={filters.channel} onChange={e => setFilters(f => ({ ...f, channel: e.target.value }))}><option value='public'>Público</option><option value='display'>Pantallas de resultados</option></select></label>
    </div></section>
    {error && <div role='alert' className='card p-4 text-sm text-red-600'>{error}<button className='btn-secondary ml-2' onClick={() => setAttempt(n => n + 1)}><RefreshCw size={15} />Reintentar</button></div>}
    {loading && <p role='status' className='card p-6'>Cargando estadísticas…</p>}
    {data && <>
      <p className='text-xs' style={{ color: 'var(--text-muted)' }}>Registro habilitado: {data.started_at ? new Date(`${String(data.started_at).replace(' ', 'T').replace(/Z$/, '')}Z`).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : 'pendiente'}. No incluye visitas anteriores, uso administrativo ni navegadores que rechazan la medición.</p>
      <div className='grid sm:grid-cols-3 gap-3'>{[['views', 'Vistas de página'], ['sessions', 'Sesiones iniciadas'], ['visitors', 'Visitantes estimados']].map(([key, label]) => <div className='card p-5' key={key}><p className='text-sm' style={{ color: 'var(--text-muted)' }}>{label}</p><strong className='text-3xl block my-2' style={{ color: 'var(--color-brand)' }}>{number(data.totals[key])}</strong><p className='text-xs'>Período anterior: {number(data.previous[key])}</p></div>)}</div>
      <p className='text-xs' style={{ color: 'var(--text-muted)' }}>Una sesión termina tras 30 minutos sin actividad. Visitantes estima navegadores, no personas; se calcula solo para rangos dentro de los últimos 90 días. La comparación anterior puede tener cobertura parcial.</p>
      <section className='card p-4'><h2 className='font-semibold mb-3'>Vistas por día</h2>{!data.daily.length ? <p className='text-sm py-6'>Todavía no hay visitas medidas en este período.</p> : <div className='max-h-72 overflow-auto space-y-2' role='list'>{data.daily.map(d => <div key={d.day} className='flex items-center gap-3 text-xs' role='listitem'><span className='w-20 shrink-0'>{d.day}</span><div className='flex-1 rounded-full overflow-hidden h-3' style={{ background: 'var(--bg-hover)' }}><div className='h-full rounded-full' style={{ width: `${Number(d.views) / max * 100}%`, background: 'var(--color-brand)' }} /></div><span className='w-12 text-right'>{number(d.views)}</span></div>)}</div>}</section>
      <div className='grid lg:grid-cols-3 gap-4'>{[['pages', 'Páginas más consultadas'], ['devices', 'Dispositivos'], ['sources', 'Procedencia']].map(([key, label]) => <section className='card p-4 min-w-0' key={key}><h2 className='font-semibold mb-3'>{label}</h2>{!data[key].length && <p className='text-sm'>Sin datos.</p>}<ol className='space-y-3 max-h-80 overflow-auto'>{data[key].map(row => <li key={row.label} className='flex justify-between gap-3 text-sm'><span className='break-all'>{labels[row.label] || row.label}</span><strong className='shrink-0'>{number(row.views)}</strong></li>)}</ol></section>)}</div>
      <p className='text-xs' style={{ color: 'var(--text-muted)' }}>Se conservan detalles durante 90 días y resúmenes durante 24 meses. Las actualizaciones automáticas del marcador no generan vistas. Se filtran robots conocidos; las cifras no equivalen a una auditoría antifraude.</p>
    </>}
  </div>
}
