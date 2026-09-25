import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Maximize2, SlidersHorizontal } from 'lucide-react'
import { useMatchRealtime } from '../../hooks/useMatchRealtime'
import { getPhoto, photoUrl } from '../../services/matchPhotoService'
import { PHOTOCALL_SPONSORS } from '../../data/photocallSponsors'
import { getParticipantName } from '../../utils/matchParticipants'
import { exportMatchPhoto } from '../../utils/exportMatchPhoto'
import './matchPhoto.css'

export default function MatchPhoto({ matchId, match, dark = false }) {
  const [photo, setPhoto] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [framing, setFraming] = useState(false)
  const [crop, setCrop] = useState({ zoom: 1, x: 50, y: 50 })
  const cardRef = useRef(null)
  useEffect(() => {
    setCrop({ zoom: 1, x: 50, y: 50 })
    setFraming(false)
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
    const interval = setInterval(load, 60000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [matchId])

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
      setDownloadError(error.message || 'No se pudo descargar el marco. Intenta nuevamente.')
    } finally {
      setDownloading(false)
    }
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
            <img src={photoUrl(matchId, photo.version, !expanded && !framing)} alt='Jugadores del partido' loading='lazy' decoding='async' onError={() => setFailed(true)} className='photocall-photo-img' style={{ transform: `scale(${crop.zoom})`, transformOrigin: `${crop.x}% ${crop.y}%` }} />
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
        <button type='button' className='photocall-download-btn' disabled={downloading || failed} aria-expanded={framing} onClick={() => { setFraming(!framing); setExpanded(false) }}><SlidersHorizontal size={14} /> Ajustar encuadre</button>
        {framing && <fieldset className='photocall-framing' disabled={downloading}>
          <legend>Encuadra a los jugadores</legend>
          <p>Acerca y mueve la foto sin cortar cabezas ni pies. Este ajuste solo se aplica a tu descarga; no cambia la foto guardada.</p>
          {[['zoom', 'Acercamiento', 1, 2.5, .05], ['x', 'Posición horizontal', 0, 100, 1], ['y', 'Posición vertical', 0, 100, 1]].map(([key, label, min, max, step]) => <label key={key}>{label}<input type='range' min={min} max={max} step={step} value={crop[key]} disabled={key !== 'zoom' && crop.zoom === 1} onChange={e => setCrop(c => ({ ...c, [key]: Number(e.target.value) }))} /></label>)}
          <button type='button' className='photocall-download-btn' onClick={() => setCrop({ zoom: 1, x: 50, y: 50 })}>Restablecer foto completa</button>
        </fieldset>}
        <button type='button' className='photocall-download-btn' disabled={downloading} onClick={handleDownload}><Download size={14} /> {downloading ? 'Preparando imagen…' : 'Descargar foto con marco'}</button>{downloadError && <p role='alert'>{downloadError}</p>}
      </div>
    </section>
  )
}
