import { useEffect, useState } from 'react'
import { Star, UserCheck, Check, RefreshCw } from 'lucide-react'
import { caddieService } from '../../services/caddieService'
import useAuthStore from '../../store/useAuthStore'

export function CaddieRatings({ items }) {
  return <div className='space-y-2'>{items.map((r, index) => <div key={index} className='rounded-xl p-3 border' style={{ borderColor: 'var(--border-color)', background: 'var(--bg-hover)' }}>
    <div className='flex flex-wrap gap-2 items-center text-xs'><span className='font-semibold text-amber-600' aria-label={`${r.estrellas} de 5 estrellas`}>{'★'.repeat(r.estrellas)}{'☆'.repeat(5 - r.estrellas)}</span><span>{r.propia ? 'Tu valoración' : r.tipo === 'juez' ? 'Juez' : 'Jugador'}</span></div>
    {r.comentario && <p className='text-sm mt-1 break-words whitespace-pre-wrap'>{r.comentario}</p>}
  </div>)}</div>
}

export default function MatchCaddie({ matchId, status, disabled = false, compact = false }) {
  const user = useAuthStore(s => s.user)
  const [data, setData] = useState(null)
  const [caddies, setCaddies] = useState([])
  const [selection, setSelection] = useState('')
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [attempt, setAttempt] = useState(0)
  function accept(next) {
    setData(next); setSelection(String(next.caddie?.caddie_id || ''))
    setStars(next.propia?.estrellas || 0); setComment(next.propia?.comentario || '')
  }
  useEffect(() => {
    if (!user) return
    let active = true
    setLoading(true); setError(''); setSaved(''); setData(null)
    caddieService.status(matchId).then(async res => {
      if (!active) return
      accept(res.data)
      if (res.data.can_assign) {
        const list = await caddieService.list()
        if (active) setCaddies(list.data.filter(c => Boolean(c.activo)))
      }
    }).catch(e => { if (active && e.status !== 403) setError(e.message || 'No se pudo consultar el caddie') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [matchId, status, user?.id, attempt])
  if (!user || (!loading && !data && !error)) return null
  async function save(kind) {
    if (busy || disabled) return
    setBusy(true); setError(''); setSaved('')
    try {
      const result = kind === 'assign'
        ? await caddieService.assign(matchId, { caddie_id: Number(selection), expected_revision: data.revision })
        : await caddieService.rate(matchId, { caddie_id: data.caddie.caddie_id, estrellas: stars, comentario: comment, expected_revision: data.propia?.revision || 0 })
      accept(result.data)
      setSaved(kind === 'assign' ? 'Caddie confirmado' : 'Gracias. Tu valoración quedó guardada')
    } catch (e) { setError(e.message || 'No se pudo guardar. Reintenta con conexión') }
    finally { setBusy(false) }
  }
  const body = <div className='space-y-3'>
    {loading && <p className='text-sm'>Consultando caddie…</p>}
    {error && <div role='alert' className='text-sm text-red-600 space-y-2'><p>{error}</p><button type='button' className='btn-secondary text-xs' disabled={busy} onClick={() => setAttempt(n => n + 1)}><RefreshCw size={14} />Actualizar</button></div>}
    {saved && <p role='status' className='text-sm flex gap-2 items-center' style={{ color: 'var(--color-brand)' }}><Check size={16} />{saved}</p>}
    {data?.can_assign && <fieldset disabled={busy || loading || disabled} className='flex flex-col sm:flex-row gap-2 min-w-0'>
      <label className='flex-1 min-w-0'><span className='sr-only'>Caddie del partido</span><select className='form-input w-full min-w-0 min-h-11' value={selection} onChange={e => setSelection(e.target.value)}>
        <option value=''>Seleccionar caddie</option>
        {data.caddie && !caddies.some(c => c.id === data.caddie.caddie_id) && <option value={data.caddie.caddie_id}>{data.caddie.nombre} (asignado)</option>}
        {caddies.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select></label>
      <button type='button' className='btn-secondary min-h-11' disabled={!selection} onClick={() => save('assign')}>{busy ? 'Guardando…' : 'Confirmar caddie'}</button>
    </fieldset>}
    {data?.can_assign && !loading && !caddies.length && !error && <p className='text-sm'>Administración debe registrar los caddies disponibles.</p>}
    {data?.can_rate && <form onSubmit={e => { e.preventDefault(); save('rate') }} className='rounded-2xl p-4 border space-y-3' style={{ background: 'var(--color-brand-dim)', borderColor: 'var(--border-color)' }}>
      <div><h3 className='font-semibold'>{data.propia ? 'Tu valoración' : '¿Cómo fue el acompañamiento?'}</h3><p className='text-sm'>{data.caddie.nombre}</p></div>
      <fieldset disabled={busy || disabled}><legend className='sr-only'>Valoración de 1 a 5 estrellas</legend><div className='flex justify-between'>{[1, 2, 3, 4, 5].map(n => <button key={n} type='button' className='min-w-0 flex-1 min-h-11 flex items-center justify-center rounded-xl transition-colors' aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`} aria-pressed={stars === n} onClick={() => setStars(n)} style={{ color: n <= stars ? '#a5680b' : 'var(--text-muted)', background: n <= stars ? 'rgba(211,164,56,.13)' : 'transparent' }}><Star size={27} fill={n <= stars ? 'currentColor' : 'none'} /></button>)}</div></fieldset>
      <label className='block text-sm'>Comentario opcional<textarea className='form-input w-full mt-1 resize-y' rows={2} maxLength={1000} value={comment} disabled={busy || disabled} onChange={e => setComment(e.target.value)} placeholder='¿Qué destacarías o qué podría mejorar?' /></label>
      <p className='text-xs' style={{ color: 'var(--text-muted)' }}>Visible para ti, el juez del partido, administración y dirección.</p>
      <button type='submit' className='btn-primary w-full min-h-11' disabled={!stars || busy || disabled}>{busy ? 'Guardando…' : data.propia ? 'Actualizar valoración' : 'Enviar valoración'}</button>
    </form>}
    {data?.can_view_ratings && data.valoraciones.length > 0 && <details><summary className='cursor-pointer text-sm py-2 font-semibold'>Valoraciones del partido ({data.valoraciones.length})</summary><CaddieRatings items={data.valoraciones} /></details>}
    {data?.propia && !data.can_rate && <CaddieRatings items={[data.propia]} />}
    {data && !data.caddie && !data.can_assign && <p className='text-sm'>Aún no se ha registrado el caddie de este partido.</p>}
  </div>
  return <section className='rounded-2xl border p-4 min-w-0' style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }} aria-label='Caddie del partido'>
    {compact ? <details><summary className='cursor-pointer flex gap-2 items-center text-sm font-semibold min-h-10'><UserCheck size={18} />Caddie · {data?.caddie?.nombre || 'Seleccionar'}</summary>{body}</details> : <><h2 className='font-semibold flex items-center gap-2 mb-3'><UserCheck size={18} />{data?.caddie?.nombre ? `Caddie · ${data.caddie.nombre}` : 'Caddie del partido'}</h2>{body}</>}
  </section>
}
