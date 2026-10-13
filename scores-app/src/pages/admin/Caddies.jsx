import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserCheck, Plus, Star } from 'lucide-react'
import useAuthStore from '../../store/useAuthStore'
import { caddieService } from '../../services/caddieService'
import { CaddieRatings } from '../../components/match/MatchCaddie'

export default function Caddies() {
  const admin = useAuthStore(s => s.user?.rol === 'admin')
  const [list, setList] = useState([])
  const [draft, setDraft] = useState(null)
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setReport(null)
    Promise.all([caddieService.list(), caddieService.report(filter, page)]).then(([a, b]) => {
      if (active) { setList(a.data); setReport(b.data) }
    }).catch(e => { if (active) setError(e.message || 'No se pudieron cargar los caddies') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filter, page, attempt])
  async function save(e) {
    e.preventDefault(); if (busy) return
    setBusy(true); setError('')
    try { await caddieService.save(draft.id, { nombre: draft.nombre, activo: draft.activo, expected_revision: draft.revision }); setDraft(null); setAttempt(n => n + 1) }
    catch (err) { setError(err.message || 'No se pudo guardar el caddie') }
    finally { setBusy(false) }
  }
  return <div className='space-y-5 max-w-5xl mx-auto min-w-0'>
    <header className='flex flex-wrap items-center justify-between gap-3'><div><h1 className='text-2xl font-bold flex gap-2 items-center'><UserCheck />Caddies</h1><p className='text-sm mt-1' style={{ color: 'var(--text-muted)' }}>Directorio y valoraciones de los partidos</p></div>{admin && <button className='btn-primary min-h-11' disabled={busy} onClick={() => setDraft({ nombre: '', activo: true })}><Plus size={17} />Añadir caddie</button>}</header>
    {error && <div role='alert' className='rounded-xl p-3 bg-red-500/10 text-sm text-red-600'>{error}<button className='underline ml-3' disabled={busy} onClick={() => setAttempt(n => n + 1)}>Actualizar</button></div>}
    {draft && <form onSubmit={save} className='card p-4 space-y-3'><h2 className='font-semibold'>{draft.id ? 'Editar caddie' : 'Nuevo caddie'}</h2><label className='block text-sm'>Nombre<input className='form-input w-full mt-1' autoFocus required maxLength={120} value={draft.nombre} disabled={busy} onChange={e => setDraft(d => ({ ...d, nombre: e.target.value }))} /></label><label className='flex gap-2 text-sm items-center min-h-10'><input type='checkbox' checked={draft.activo} disabled={busy} onChange={e => setDraft(d => ({ ...d, activo: e.target.checked }))} />Disponible para nuevas asignaciones</label><div className='flex gap-2'><button className='btn-primary' disabled={busy || !draft.nombre.trim()}>{busy ? 'Guardando…' : 'Guardar'}</button><button type='button' className='btn-secondary' disabled={busy} onClick={() => setDraft(null)}>Cancelar</button></div></form>}
    {admin && <details className='card p-4' open><summary className='font-semibold cursor-pointer min-h-10'>Directorio ({list.length})</summary><div className='grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto'>{list.map(c => <button key={c.id} disabled={busy} className='text-left rounded-xl border p-3 min-w-0' style={{ borderColor: 'var(--border-color)' }} onClick={() => setDraft({ ...c, activo: Boolean(c.activo) })}><strong className='block break-words text-sm'>{c.nombre}</strong><span className='text-xs' style={{ color: 'var(--text-muted)' }}>{c.activo ? 'Disponible' : 'Inactivo · historial conservado'}</span></button>)}</div>{!loading && !list.length && <p className='text-sm'>Aún no hay caddies registrados.</p>}</details>}
    <section className='card p-4 space-y-3'><h2 className='font-semibold flex items-center gap-2'><Star size={18} />Valoraciones</h2><label className='block text-sm'>Caddie<select className='form-input w-full mt-1' value={filter} onChange={e => { setFilter(e.target.value); setPage(1) }}><option value=''>Todos los caddies</option>{list.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      {loading ? <p className='text-sm'>Cargando…</p> : report && !report.items.length ? <p className='text-sm'>No hay valoraciones para mostrar.</p> : report?.items.map((r, i) => <article key={i} className='space-y-2 border-t pt-3' style={{ borderColor: 'var(--border-color)' }}><div className='flex flex-wrap gap-2 justify-between text-sm'><strong>{r.caddie_nombre}</strong><Link className='underline' to={`/match/${r.partido_id}`}>Partido #{r.partido_id}</Link></div><p className='text-xs' style={{ color: 'var(--text-muted)' }}>{r.torneo_nombre || 'Partido amistoso'}</p><CaddieRatings items={[r]} /></article>)}
      <div className='flex justify-between gap-2 pt-2'><button className='btn-secondary' disabled={loading || page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span className='text-sm self-center'>{page}</span><button className='btn-secondary' disabled={loading || !report?.more} onClick={() => setPage(p => p + 1)}>Siguiente</button></div>
    </section>
  </div>
}
