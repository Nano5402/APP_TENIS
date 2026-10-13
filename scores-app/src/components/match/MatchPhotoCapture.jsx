import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { compressPhoto, getPhoto, getPhotoStatus, photoDraft, photoUrl, sendPhoto } from '../../services/matchPhotoService'
import { PHOTOCALL_SPONSORS } from '../../data/photocallSponsors'

export default function MatchPhotoCapture({ matchId, userId, finished, deferUpload = false, disabled = false }) {
  const key = `${userId}:${matchId}`
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [known, setKnown] = useState(false)
  const [restored, setRestored] = useState(false)
  const [storageReady, setStorageReady] = useState(false)
  const [retry, setRetry] = useState(0)
  const [draft, setDraft] = useState(null)
  const [pending, setPending] = useState(null)
  const [blocked, setBlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [momento, setMomento] = useState(finished ? 'final' : 'inicio')
  const [consent, setConsent] = useState(false)
  const [preview, setPreview] = useState('')
  const [crop, setCrop] = useState({ zoom: 1, x: 50, y: 50 })
  const dialog = useRef(null)
  const working = useRef(false)
  const priority = useRef(deferUpload)
  priority.current = deferUpload
  useEffect(() => {
    let active = true
    photoDraft(key).then(item => { if (active) { setPending(item || null); setRestored(true) } }).catch(() => { if (active) setMessage('No se pudo abrir el guardado local. Recarga o revisa el espacio del dispositivo antes de tomar la foto.') })
    getPhoto(matchId).then(r => { if (active) { setPhoto(r.data); setKnown(true) } }).catch(error => { if (active) setMessage(error.status ? error.message : 'Conéctate para consultar si el partido ya tiene foto.') })
    getPhotoStatus(matchId).then(r => { if (active) setStorageReady(Boolean(r.data?.configured && r.data?.writable)) }).catch(error => { if (active) { setStorageReady(false); setMessage(error.status ? error.message : 'No se pudo comprobar el almacenamiento del servidor. Reintenta cuando tengas conexión.') } })
    return () => { active = false }
  }, [key, matchId])
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  useEffect(() => { if (!draft && !pending) setMomento(finished ? 'final' : 'inicio') }, [finished, draft, pending])
  useEffect(() => {
    const blob = draft || pending?.blob
    if (!blob) { setPreview(''); return }
    const url = URL.createObjectURL(blob); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [draft, pending])
  useEffect(() => {
    if (!pending || blocked) return
    let active = true
    const controller = new AbortController()
    const attempt = async () => {
      if (!active || working.current || !navigator.onLine || priority.current || document.visibilityState !== 'visible') return
      working.current = true; setSending(true)
      try {
        // Attempted status is durable: never silently cancel a potentially committed upload.
        await photoDraft(key, 'put', { ...pending, attempted: true })
        const result = await sendPhoto(matchId, pending, controller.signal)
        if (!result?.ok || result.data?.version !== pending.version) throw { status: 502, message: 'El servidor no confirmó esta fotografía. La copia local se conserva para reintentar.' }
        await photoDraft(key, 'delete')
        if (active) { setPending(null); setPhoto(result.data); setKnown(true); setStorageReady(true); setMessage('Foto guardada en el servidor.') }
      } catch (error) {
        if (active) {
          const permanent = error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)
          if (permanent) setBlocked(true)
          setMessage(error.status ? `${error.message || 'El servidor rechazó la carga.'} La copia pendiente sigue en este dispositivo.` : 'Foto guardada en este dispositivo. Se reintentará al recuperar conexión; puedes seguir marcando.')
        }
      } finally { working.current = false; if (active) setSending(false) }
    }
    attempt()
    const interval = setInterval(attempt, 10000)
    window.addEventListener('online', attempt)
    return () => { active = false; controller.abort(); clearInterval(interval); window.removeEventListener('online', attempt) }
  }, [pending, blocked, key, matchId, retry])

  async function retryNow() {
    setMessage('Comprobando el servidor…')
    try {
      const [status, current] = await Promise.all([getPhotoStatus(matchId), getPhoto(matchId)])
      setStorageReady(Boolean(status.data?.configured && status.data?.writable)); setPhoto(current.data); setKnown(true)
      setMessage(pending ? 'Preparando reintento de la foto pendiente.' : 'Almacenamiento disponible. Puedes tomar la foto.')
      if (!blocked) setRetry(value => value + 1)
    } catch (error) { setMessage(error.status ? error.message : 'No se pudo contactar al servidor. La foto pendiente no se ha borrado.') }
  }

  async function choose(event) {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    setBusy(true); setMessage('')
    try { setDraft(await compressPhoto(file)); setCrop({ zoom: 1, x: 50, y: 50 }); setConsent(false) }
    catch (error) { setMessage(error.message || 'No se pudo abrir la imagen') }
    finally { setBusy(false) }
  }
  async function save() {
    if (disabled || !draft || !known || !restored || !storageReady || !consent || busy || pending) return
    if (photo && !window.confirm('Este partido ya tiene una foto. ¿Reemplazarla por esta imagen?')) return
    setBusy(true)
    try {
      const item = { blob: draft, encuadre: crop, version: crypto.randomUUID(), expected: photo?.version || '', momento, createdAt: Date.now() }
      await photoDraft(key, 'put', item)
      setPending(item); setDraft(null); setBlocked(false); setMessage('Foto pendiente de envío. Puedes cerrar esta ventana y seguir marcando.')
    } catch { setMessage('No hay espacio para guardar la foto de forma segura en el dispositivo. Libera espacio y reintenta.') }
    finally { setBusy(false) }
  }
  async function resolveConflict() {
    if (!window.confirm('¿Descartar la copia pendiente de este dispositivo? No se eliminará la foto del servidor.')) return
    try {
      const result = await getPhoto(matchId)
      await photoDraft(key, 'delete'); setPhoto(result.data); setKnown(true); setPending(null); setBlocked(false); setMessage('Foto actual consultada. Puedes seleccionar otra para reemplazarla.')
    } catch { setMessage('Conéctate para consultar la foto actual antes de descartar la pendiente.') }
  }
  return <>
    <button className='judge-tool' disabled={disabled} onClick={() => { setOpen(true); retryNow() }} aria-label={pending ? 'Foto del partido pendiente' : 'Foto del partido'}><Camera size={17} /><span className='text-xs'>{pending ? 'Pendiente' : 'Foto'}</span></button>
    <dialog ref={dialog} onCancel={() => setOpen(false)} className='rounded-2xl p-5 w-[min(94vw,520px)] max-h-[90dvh] overflow-auto backdrop:bg-black/60' style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      <div className='flex items-center justify-between mb-3'><h2 className='font-bold'>Una foto del partido</h2><button onClick={() => setOpen(false)} aria-label='Cerrar fotografía'><X /></button></div>
      <p className='text-sm mb-3'>Puedes tomarla al inicio o al final. No es obligatoria para marcar puntos.</p>
      {(preview || photo) && (
        <div className='rounded-xl overflow-hidden p-2.5 bg-[#0b1c15] border border-white/10 mb-3'>
          <div className='flex items-center justify-between px-1 pb-2 text-[10px] font-bold text-slate-300 border-b border-white/10 mb-2'>
            <span className='text-emerald-400'>● MARCO OFICIAL CON PATROCINADORES</span>
            <span>{PHOTOCALL_SPONSORS.length} MARCAS</span>
          </div>
          <div className='relative aspect-[3/2] overflow-hidden rounded-lg'>
          <div aria-hidden='true' className='absolute inset-0 bg-cover bg-center blur-xl opacity-50' style={{ backgroundImage: `url("${preview || photoUrl(matchId, photo.version, true)}")` }} />
          <img
            src={preview || photoUrl(matchId, photo.version, true)}
            alt='Vista previa de la foto del partido'
            className='relative w-full h-full object-contain'
            style={{ transform: `scale(${(draft ? crop : pending?.encuadre || photo?.encuadre)?.zoom || 1})`, transformOrigin: `${(draft ? crop : pending?.encuadre || photo?.encuadre)?.x ?? 50}% ${(draft ? crop : pending?.encuadre || photo?.encuadre)?.y ?? 50}%` }}
          />
          </div>
          <div className='flex gap-1.5 overflow-x-auto py-1 mt-2 justify-center opacity-85'>
            {PHOTOCALL_SPONSORS.slice(0, 7).map((s, i) => (
              <span key={i} className='bg-white rounded px-1.5 py-0.5 shrink-0'>
                <img src={s.image} alt='' className='h-3.5 max-w-[45px] object-contain inline' />
              </span>
            ))}
            <span className='text-[10px] text-slate-400 self-center font-semibold'>+{PHOTOCALL_SPONSORS.length - 7} más</span>
          </div>
        </div>
      )}
      <p role='status' className='text-sm my-2'>{sending ? 'Subiendo foto… puedes seguir marcando.' : pending ? message || 'Foto pendiente en este dispositivo.' : message}</p>
      {pending && <p className='text-xs mb-3'>Para sincronizar, mantén este partido abierto en la aplicación. No borres los datos del navegador. El público solo verá la foto cuando esté confirmada.</p>}
      {(pending || !storageReady || !known) && <div className='flex flex-wrap gap-3 mb-3'>
        {!blocked && <button className='btn-secondary' disabled={sending || busy} onClick={retryNow}>Reintentar ahora</button>}
        {pending && preview && <a className='btn-secondary' href={preview} download={`partido-${matchId}.webp`}>Guardar copia en el dispositivo</a>}
      </div>}
      {!pending && <>
        <div className='flex gap-2 flex-wrap my-3'>
          <label className='btn-secondary cursor-pointer'>Tomar foto<input className='sr-only' type='file' accept='image/jpeg,image/png,image/webp' capture='environment' disabled={busy || !known || !restored || !storageReady} onChange={choose} /></label>
          <label className='btn-secondary cursor-pointer'>Elegir imagen<input className='sr-only' type='file' accept='image/jpeg,image/png,image/webp' disabled={busy || !known || !restored || !storageReady} onChange={choose} /></label>
        </div>
        {draft && <div className='space-y-3'>
          <fieldset className='rounded-xl border p-3 space-y-2' disabled={busy}>
            <legend className='text-sm font-semibold px-1'>Ajustar encuadre</legend>
            <p className='text-xs text-muted'>Acerca y desplaza la foto. Revisa que todas las personas queden dentro del marco; la foto completa se conserva.</p>
            {[['zoom', 'Acercamiento', 1, 2.5, .05], ['x', 'Horizontal', 0, 100, 1], ['y', 'Vertical', 0, 100, 1]].map(([key, label, min, max, step]) => <label className='flex items-center gap-3 text-sm' key={key}><span className='w-28 shrink-0'>{label}</span><input aria-label={label} className='min-w-0 w-full accent-green-700 h-8' type='range' min={min} max={max} step={step} value={crop[key]} disabled={key !== 'zoom' && crop.zoom === 1} onChange={e => setCrop(c => ({ ...c, [key]: Number(e.target.value) }))} /></label>)}
            <button type='button' className='text-sm underline min-h-10' onClick={() => setCrop({ zoom: 1, x: 50, y: 50 })}>Ver foto completa</button>
          </fieldset>
          <label className='block text-sm'>Momento de la foto<select className='input w-full' value={momento} onChange={e => setMomento(e.target.value)}><option value='inicio'>Inicio del partido</option><option value='final'>Final del partido</option></select></label>
          <label className='flex gap-2 text-sm'><input type='checkbox' checked={consent} onChange={e => setConsent(e.target.checked)} />Confirmo que cuento con autorización para mostrar esta foto en el detalle público del partido.</label>
          <button className='btn-primary w-full' disabled={busy || !consent} onClick={save}>{photo ? 'Reemplazar foto del partido' : 'Guardar foto del partido'}</button>
        </div>}
      </>}
      {blocked && <button className='btn-secondary' onClick={resolveConflict}>Revisar foto actual y descartar pendiente</button>}
    </dialog>
  </>
}
