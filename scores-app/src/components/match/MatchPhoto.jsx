import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download, Maximize2, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useMatchRealtime } from '../../hooks/useMatchRealtime'
import { getPhoto, photoUrl, removePhoto, updatePhotoFraming } from '../../services/matchPhotoService'
import useAuthStore from '../../store/useAuthStore'
import { confirm } from '../../utils/confirm'
import { PHOTOCALL_SPONSORS } from '../../data/photocallSponsors'
import { getParticipantName } from '../../utils/matchParticipants'
import { exportMatchPhoto } from '../../utils/exportMatchPhoto'
import './matchPhoto.css'

export default function MatchPhoto({ matchId, match, dark = false }) {
  const isAdmin = useAuthStore(store => store.user?.rol === 'admin')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [photo, setPhoto] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [framing, setFraming] = useState(false)
  const [manualCrop, setCrop] = useState(null)
  const [savingFraming, setSavingFraming] = useState(false)
  const [framingNotice, setFramingNotice] = useState('')
  const [framingError, setFramingError] = useState('')
  const [dimensions, setDimensions] = useState(null)
  // Legacy portrait photos receive a gentle, reversible zoom. Saved framing wins.
  const portrait = dimensions?.version === photo?.version && dimensions?.height > dimensions?.width
  const crop = manualCrop || photo?.encuadre || { zoom: portrait ? 1.15 : 1, x: 50, y: 50 }
  const cardRef = useRef(null)
  useEffect(() => {
    setCrop(null)
    setFraming(false)
    setFramingNotice('')
    setFramingError('')
  }, [matchId, photo?.version])

  const refresh = useCallback(() => {
    getPhoto(matchId)
      .then((response) => {
        setPhoto(response.data)
        setFailed(false)
      })
      .catch(() => {})
  }, [matchId])

  useEffect(() => {
    let active = true
    setPhoto(null)
    setExpanded(false)
    setFailed(false)
    const load = () =>
      getPhoto(matchId)
        .then((r) => {
          if (active) setPhoto(r.data)
        })
        .catch(() => {})
    load()
    if (match?.estado !== 'en_vivo') return () => { active = false }
    const interval = setInterval(load, 60000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [matchId, match?.estado])

  useMatchRealtime(
    useCallback(
      (event) => {
        if (event.action === 'photo' && Number(event.matchId) === Number(matchId)) refresh()
      },
      [refresh, matchId],
    ),
  )

  const handleDownload = async () => {
    if (!photo || downloading) return
    setDownloading(true)
    setDownloadError('')
    try {
      if (failed) throw new Error('Reintenta cargar la foto antes de descargar el marco.')
      await Promise.all([...cardRef.current.querySelectorAll('img')].map(image => image.decode()))
      const blob = await exportMatchPhoto(cardRef.current, photoUrl(matchId, photo.version, false))
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = `partido-${matchId}-marco.png`
      link.href = url
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (error) {
      setDownloadError(error.name === 'EncodingError'
        ? 'No se pudo abrir una imagen para generar el marco. Recarga la página e intenta nuevamente.'
        : error.message || 'No se pudo descargar el marco. Intenta nuevamente.')
    } finally {
      setDownloading(false)
    }
  }

  const handleSaveFraming = async () => {
    if (!isAdmin || !photo || savingFraming || downloading || deleting) return
    setSavingFraming(true)
    setFramingError('')
    setFramingNotice('')
    try {
      const payload = {
        zoom: Number(Number(crop.zoom).toFixed(2)),
        x: Math.round(Number(crop.x)),
        y: Math.round(Number(crop.y)),
      }
      const response = await updatePhotoFraming(matchId, photo.version, payload)
      setPhoto(response.data)
      setCrop(null)
      setFramingNotice('Encuadre oficial guardado permanentemente para todos los usuarios.')
    } catch (error) {
      setFramingError(error.message || 'No se pudo guardar el encuadre. Intenta nuevamente.')
      if (error.status === 409) refresh()
    } finally {
      setSavingFraming(false)
    }
  }

  const handleDelete = async () => {
    if (!isAdmin || !photo || deleting || downloading) return
    const version = photo.version
    setDeleting(true)
    setDeleteError('')
    try {
      if (!await confirm({ title: 'Eliminar foto del partido', message: 'Se eliminará la fotografía publicada. El partido y su marcador se conservarán. Esta acción no se puede deshacer.', danger: true, confirmLabel: 'Eliminar foto' })) return
      await removePhoto(matchId, version)
      setPhoto(null)
    } catch (error) {
      setDeleteError(error.message || 'No se pudo eliminar la foto. Intenta nuevamente.')
      if (error.status === 409) refresh()
    } finally { setDeleting(false) }
  }

  if (!photo) return null

  const marker = match?.marcador_actual
  const sets = marker?.sets || []
  const finished = match?.estado === 'finalizado'
  return (
    <section ref={cardRef} className='match-photocall-card' aria-label='Foto del partido' data-dark={dark || undefined}>
      <header className='match-photocall-header'>
        <div><span className='photocall-kicker'>CLUB UNIÓN · TENIS</span><h2 className='match-photocall-title'>Foto oficial del partido</h2></div>
        <span className='match-photocall-badge'>{photo.momento === 'inicio' ? 'Foto de inicio' : 'Foto de cierre'}</span>
      </header>
      <div className='photocall-photo-wrapper'>
        {failed ? <p role='status'>No se pudo cargar la fotografía. <button onClick={refresh}>Reintentar</button></p> :
          <button type='button' className='photocall-photo-btn' data-expanded={expanded || undefined} onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Reducir foto' : 'Ampliar foto'}>
            <span className='photocall-photo-backdrop' aria-hidden='true' style={{ backgroundImage: `url("${photoUrl(matchId, photo.version, true)}")` }} />
            {/* Native lazy loading requests the full photo near the viewport. The
                thumbnail backdrop remains visible while it loads; never upscale
                that thumbnail as the foreground, even in the collapsed view. */}
            <img src={photoUrl(matchId, photo.version, false)} alt='Jugadores del partido' loading='lazy' decoding='async' onLoad={e => setDimensions({ version: photo.version, width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} onError={() => setFailed(true)} className='photocall-photo-img' style={{ transform: `scale(${crop.zoom})`, transformOrigin: `${crop.x}% ${crop.y}%` }} />
            <span className='photocall-expand' aria-hidden='true'><Maximize2 size={15} /></span>
          </button>}
      </div>
      {match && <div className='photocall-score'>
        <div className='photocall-score-meta'><span>{match.torneo?.nombre || 'Encuentro de tenis'}</span><strong>{finished ? 'Resultado final' : match.estado === 'cancelado' ? 'Cancelado' : match.estado === 'en_vivo' ? 'Marcador actual' : 'Programado'}</strong></div>
        <table aria-label='Marcador de la foto'>
          <thead><tr><th>Jugador / pareja</th>{sets.map((set, i) => <th key={i}>{set.type === 'match_tiebreak' ? 'STB' : `S${i + 1}`}</th>)}{!finished && marker && <th>Pts</th>}</tr></thead>
          <tbody>{[1, 2].map((side, i) => <tr key={side} data-winner={finished && match.ganador === `jugador${side}` ? 'true' : undefined}><th scope='row'>{getParticipantName(match, side)}</th>{sets.map((set, index) => <td key={index}>{set.games?.[i] ?? '—'}{set.type !== 'match_tiebreak' && set.tiebreak?.some(Boolean) && <sup>{set.tiebreak[i]}</sup>}</td>)}{!finished && marker && <td>{marker.displayPoints?.[i] ?? '—'}</td>}</tr>)}</tbody>
        </table>
        {!marker && <p className='photocall-score-note'>Marcador no disponible</p>}
        {!finished && marker && <p className='photocall-score-note'>Marcador actual, no necesariamente el del momento de la foto.</p>}
      </div>}
      <div className='photocall-sponsors' aria-label='Patrocinadores oficiales'>
        {PHOTOCALL_SPONSORS.map(sponsor => <div className={`photocall-logo${sponsor.name === 'Metrollantas' ? ' photocall-logo-large' : ''}${sponsor.name === 'Supermercados Más x Menos' ? ' photocall-logo-mxm' : ''}`} key={sponsor.image} title={sponsor.name}><img src={sponsor.image} alt={sponsor.name} loading='eager' decoding='async' /></div>)}
      </div>
      <div className='photocall-actions'>
        <button type='button' className='photocall-download-btn' disabled={downloading || failed} aria-expanded={framing} onClick={() => { setFraming(!framing); setExpanded(false); setFramingNotice(''); setFramingError('') }}><SlidersHorizontal size={14} /> Ajustar encuadre</button>
        {framing && <fieldset className='photocall-framing' disabled={downloading || savingFraming}>
          <legend>Encuadra a los jugadores</legend>
          <p>
            {isAdmin
              ? 'Acerca y desplaza la fotografía sin perder calidad. Puedes guardar este encuadre de forma permanente para que todos los visitantes vean la foto bien encuadrada.'
              : 'Acerca y mueve la foto sin cortar cabezas ni pies. Este ajuste solo se aplica a tu descarga; no cambia la foto guardada.'}
          </p>
          {[['zoom', `Acercamiento (${Math.round(crop.zoom * 100)}%)`, 1, 2.5, .05], ['x', `Posición horizontal (${Math.round(crop.x)}%)`, 0, 100, 1], ['y', `Posición vertical (${Math.round(crop.y)}%)`, 0, 100, 1]].map(([key, label, min, max, step]) => (
            <label key={key}>
              {label}
              <input
                type='range'
                min={min}
                max={max}
                step={step}
                value={crop[key]}
                onChange={e => {
                  const val = Number(e.target.value)
                  setFramingNotice('')
                  setCrop(c => {
                    const base = c || crop
                    const nextZoom = key !== 'zoom' && base.zoom === 1 ? 1.15 : base.zoom
                    return { ...base, zoom: nextZoom, [key]: val }
                  })
                }}
              />
            </label>
          ))}
          <div className='photocall-framing-actions'>
            <button type='button' className='photocall-download-btn' onClick={() => { setFramingNotice(''); setCrop({ zoom: 1, x: 50, y: 50 }) }}>Restablecer foto completa</button>
            {isAdmin && (
              <button type='button' className='photocall-save-framing-btn' disabled={savingFraming} onClick={handleSaveFraming}>
                <Check size={14} />
                {savingFraming ? 'Guardando encuadre…' : 'Guardar encuadre permanente'}
              </button>
            )}
          </div>
          {framingNotice && <p role='status' className='photocall-framing-ok'>{framingNotice}</p>}
          {framingError && <p role='alert' className='photocall-framing-err'>{framingError}</p>}
        </fieldset>}
        <button type='button' className='photocall-download-btn' disabled={downloading || deleting} onClick={handleDownload}><Download size={14} /> {downloading ? 'Preparando imagen…' : 'Descargar foto con marco'}</button>{downloadError && <p role='alert'>{downloadError}</p>}
        {isAdmin && <button type='button' className='photocall-download-btn' disabled={deleting || downloading} onClick={handleDelete}><Trash2 size={14} /> {deleting ? 'Eliminando…' : 'Eliminar foto'}</button>}
        {deleteError && <p role='alert'>{deleteError}</p>}
      </div>
    </section>
  )
}
