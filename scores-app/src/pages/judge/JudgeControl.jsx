import { useEffect, useState } from 'react'
import RetirementNotice from '../../components/match/RetirementNotice'
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  Clock3,
  Pencil,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Undo2,
  X,
  Zap,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import MatchStats from '../../components/match/MatchStats'
import Button from '../../components/ui/Button'
import { useMatchTimer } from '../../hooks/useMatchTimer'
import { matchService } from '../../services/matchService'
import useUIStore from '../../store/useUIStore'
import { getParticipantName } from '../../utils/matchParticipants'

const REASONS = {
  positive: [
    { value: 'ace', label: 'Ace', detail: 'Saque directo', icon: Sparkles },
    { value: 'tiro_ganador', label: 'Winner', detail: 'Tiro ganador', icon: Trophy },
  ],
  negative: [
    { value: 'error_no_forzado', label: 'Error no forzado', detail: 'Error del rival', icon: X },
    { value: 'falta', label: 'Falta', detail: 'Primera falta', icon: AlertTriangle },
    { value: 'doble_falta', label: 'Doble falta', detail: 'Segunda falta', icon: AlertTriangle },
  ],
}

export default function JudgeControl() {
  const { id } = useParams()
  const [control, setControl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [quickMode, setQuickMode] = useState(true)
  const [selectedWinner, setSelectedWinner] = useState(null)
  const [showStats, setShowStats] = useState(false)
  const { addToast } = useUIStore()
  const matchTimer = useMatchTimer(control?.en_vivo, control?.partido?.estado)

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const response = await matchService.getControl(id)
      setControl(response.data)
    } catch (error) {
      addToast({ type: 'error', title: 'No se pudo abrir el control', message: error.message })
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load({ quiet: true }), 15000)
    return () => window.clearInterval(timer)
  }, [id])

  const run = async (operation, successTitle) => {
    setBusy(true)
    try {
      const response = await operation()
      setControl(response.data)
      setSelectedWinner(null)
      if (successTitle) addToast({ type: 'success', title: successTitle })
    } catch (error) {
      addToast({ type: 'error', title: 'No se pudo actualizar el partido', message: error.message })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className='skeleton h-[620px] rounded-2xl' />
  if (!control) return <p style={{ color: 'var(--text-muted)' }}>No fue posible cargar el partido.</p>

  const { partido, marcador, estadisticas, eventos_recientes: events, en_vivo: liveState } = control
  const names = {
    jugador1: getParticipantName(partido, 1) || 'Jugador 1',
    jugador2: getParticipantName(partido, 2) || 'Jugador 2',
  }
  const isFinished = Boolean(marcador.winner)
  const isStarted = Boolean(liveState?.iniciado_at) || partido.estado === 'en_vivo' || isFinished
  const isPaused = Boolean(liveState?.pausado_at)
  const receiver = marcador.server === 'jugador1' ? 'jugador2' : 'jugador1'
  const isFirstServe = marcador.serviceAttempt === 1
  const { formatted: elapsed } = matchTimer

  const registerPoint = (winner, reason = 'punto_sin_detalle') =>
    run(() => matchService.addEvent(id, { tipo: 'punto', ganador: winner, motivo: reason }))

  const handleReasonClick = (reason) => {
    if (reason === 'falta' && isFirstServe) {
      run(() => matchService.addEvent(id, { tipo: 'primera_falta' }))
      return
    }
    registerPoint(selectedWinner, reason)
  }

  const chooseWinner = (winner) => {
    if (quickMode) registerPoint(winner)
    else setSelectedWinner(winner)
  }

  const reasonDisabled = (reason) => {
    if (reason === 'ace') return selectedWinner !== marcador.server
    if (reason === 'doble_falta') return isFirstServe || selectedWinner !== receiver
    if (reason === 'falta') return !isFirstServe
    return false
  }

  return (
    <div className='space-y-4 animate-fade-up'>
      <RetirementNotice match={partido} />
      <div className='flex items-center justify-between gap-3'>
        <Link to='/juez' className='btn-ghost inline-flex items-center gap-2 text-sm'>
          <ArrowLeft className='w-4 h-4' /> Partidos
        </Link>
        <div className='flex items-center gap-2'>
          {isStarted && (
            <span className='inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-mono font-bold' style={{ backgroundColor: 'var(--bg-hover)', color: isPaused ? 'var(--club-clay)' : 'var(--text-secondary)' }}>
              <Clock3 className='w-3.5 h-3.5' /> {elapsed}
            </span>
          )}
          <span className={partido.estado === 'en_vivo' && !isPaused ? 'badge-live' : 'badge-atp'}>
            {isFinished ? 'Finalizado' : isPaused ? 'Pausado' : isStarted ? 'En vivo' : 'Listo para iniciar'}
          </span>
        </div>
      </div>

      <section className='card overflow-hidden'>
        <div className='px-4 py-3 flex flex-wrap items-center justify-between gap-3' style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <p className='text-[11px] font-bold uppercase tracking-wider' style={{ color: 'var(--color-brand)' }}>
              {partido.categoria?.nombre || 'Tenis'} · Mejor de {partido.formato?.mejor_de_sets || 3}
            </p>
            <p className='text-xs mt-1' style={{ color: 'var(--text-muted)' }}>
              Sets a {partido.formato?.juegos_por_set || 6} juegos
              {partido.cancha?.nombre ? ` · ${partido.cancha.nombre}` : ''}
            </p>
          </div>
          <div className='flex gap-2'>
            <button type='button' onClick={() => setShowStats((value) => !value)} className='btn-secondary px-3 py-2 text-xs'>
              <BarChart3 className='w-4 h-4' /> Estadísticas
            </button>
            <button type='button' onClick={() => run(() => matchService.undoEvent(id), 'Última acción deshecha')} disabled={busy || events.length === 0} className='btn-secondary px-3 py-2 text-xs disabled:opacity-40'>
              <Undo2 className='w-4 h-4' /> Deshacer
            </button>
          </div>
        </div>

        <Scoreboard marcador={marcador} names={names} matchId={id} version={partido.control_version} onSaved={load} />

        {!isFinished && (
          <div className='px-4 pb-4 flex flex-wrap items-center gap-2'>
            <span className='text-xs font-semibold rounded-full px-3 py-1.5' style={{ backgroundColor: 'var(--color-brand-dim)', color: 'var(--color-brand)' }}>
              Servicio: {names[marcador.server]}
            </span>
            {marcador.breakpoint && (
              <span className='text-xs font-bold rounded-full px-3 py-1.5' style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                {marcador.breakpoint.count === 2 ? '2 BP' : 'BP'}
              </span>
            )}
          </div>
        )}
      </section>

      {!isFinished && (
        <section className='card p-4 space-y-4'>
          {!isStarted ? (
            <Button className='w-full justify-center min-h-14' disabled={busy} onClick={() => run(() => matchService.start(id), 'Partido iniciado')} leftIcon={<Play className='w-4 h-4' />}>
              Iniciar partido
            </Button>
          ) : (
            <div className='grid sm:grid-cols-2 gap-2'>
              <Button variant={isPaused ? 'primary' : 'secondary'} disabled={busy} onClick={() => run(() => matchService.setPaused(id, !isPaused))} leftIcon={isPaused ? <Play className='w-4 h-4' /> : <Pause className='w-4 h-4' />}>
                {isPaused ? 'Reanudar partido' : 'Pausar partido'}
              </Button>
              <Button variant='secondary' disabled={busy || isPaused} onClick={() => run(() => matchService.changeServer(id, receiver), 'Servicio corregido')}>
                Cambiar saque a {shortName(names[receiver])}
              </Button>
            </div>
          )}

          {isStarted && !isPaused && (
            <>
              <div className='flex items-center justify-between gap-3 rounded-xl p-3' style={{ backgroundColor: 'var(--bg-hover)' }}>
                <div>
                  <p className='text-sm font-bold flex items-center gap-1.5' style={{ color: 'var(--text-primary)' }}>
                    <Zap className='w-4 h-4' /> {quickMode ? 'Modo rápido' : 'Modo detallado'}
                  </p>
                  <p className='text-[11px] mt-0.5' style={{ color: 'var(--text-muted)' }}>
                    {quickMode ? 'Un toque registra el punto.' : 'Elige cómo terminó cada punto.'}
                  </p>
                </div>
                <button type='button' aria-pressed={!quickMode} onClick={() => { setQuickMode((value) => !value); setSelectedWinner(null) }} className='rounded-full px-3 py-2 text-xs font-bold' style={{ backgroundColor: quickMode ? 'var(--color-brand)' : 'var(--club-clay)', color: 'white' }}>
                  Cambiar a {quickMode ? 'detallado' : 'rápido'}
                </button>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                {['jugador1', 'jugador2'].map((side, index) => (
                  <button key={side} type='button' disabled={busy} onClick={() => chooseWinner(side)} className='rounded-2xl min-h-28 px-3 py-5 flex flex-col items-center justify-center gap-2 font-black shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60' style={{ background: index === 0 ? 'linear-gradient(145deg,#176b3a,#0d4a29)' : 'linear-gradient(145deg,#d8652a,#a94318)', color: 'white', outline: selectedWinner === side ? '4px solid rgba(255,255,255,.75)' : 'none', outlineOffset: '-7px' }}>
                    <span className='text-[11px] uppercase tracking-widest opacity-80'>Punto para</span>
                    <span className='text-base sm:text-xl leading-tight'>{names[side]}</span>
                  </button>
                ))}
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <button type='button' disabled={busy} onClick={() => run(() => matchService.addEvent(id, { tipo: 'let' }))} className='btn-secondary min-h-14 justify-center disabled:opacity-40'>
                  <RotateCcw className='w-4 h-4' /> Let / repetir
                </button>
              </div>
            </>
          )}

          {selectedWinner && !quickMode && !isPaused && (
            <div className='rounded-2xl p-4 animate-fade-up' style={{ border: '2px solid var(--color-brand)', backgroundColor: 'var(--bg-card)' }}>
              <div className='flex justify-between gap-3 mb-3'>
                <div>
                  <p className='text-xs uppercase font-bold' style={{ color: 'var(--color-brand)' }}>¿Cómo terminó el punto?</p>
                  <h3 className='font-extrabold mt-1' style={{ color: 'var(--text-primary)' }}>{names[selectedWinner]}</h3>
                </div>
                <button type='button' className='btn-ghost p-2' onClick={() => setSelectedWinner(null)}><X className='w-4 h-4' /></button>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-2'>
                  <p className='text-[10px] font-bold uppercase tracking-wider' style={{ color: 'var(--text-muted)' }}>Negativo</p>
                  {REASONS.negative.map((reason) => {
                    const disabled = reasonDisabled(reason.value)
                    return (
                      <button key={reason.value} type='button' disabled={busy || disabled} onClick={() => handleReasonClick(reason.value)} className='w-full text-left rounded-xl p-3 flex gap-3 transition-colors disabled:opacity-35 disabled:cursor-not-allowed' style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
                        <reason.icon className='w-5 h-5 shrink-0 mt-0.5' style={{ color: '#ef4444' }} />
                        <span>
                          <strong className='block text-sm' style={{ color: 'var(--text-primary)' }}>{reason.label}</strong>
                          <span className='block text-[11px] mt-0.5' style={{ color: 'var(--text-muted)' }}>{reason.detail}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className='space-y-2'>
                  <p className='text-[10px] font-bold uppercase tracking-wider' style={{ color: 'var(--text-muted)' }}>Positivo</p>
                  {REASONS.positive.map((reason) => {
                    const disabled = reasonDisabled(reason.value)
                    return (
                      <button key={reason.value} type='button' disabled={busy || disabled} onClick={() => handleReasonClick(reason.value)} className='w-full text-left rounded-xl p-3 flex gap-3 transition-colors disabled:opacity-35 disabled:cursor-not-allowed' style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
                        <reason.icon className='w-5 h-5 shrink-0 mt-0.5' style={{ color: 'var(--color-brand)' }} />
                        <span>
                          <strong className='block text-sm' style={{ color: 'var(--text-primary)' }}>{reason.label}</strong>
                          <span className='block text-[11px] mt-0.5' style={{ color: 'var(--text-muted)' }}>{reason.detail}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {isFinished && (
        <section className='card p-6 text-center'>
          <Trophy className='w-10 h-10 mx-auto mb-3' style={{ color: 'var(--club-clay)' }} />
          <p className='text-sm' style={{ color: 'var(--text-muted)' }}>Ganador del partido</p>
          <h2 className='text-2xl font-black mt-1' style={{ color: 'var(--text-primary)' }}>{names[marcador.winner]}</h2>
        </section>
      )}

      {showStats && (
        <section className='card p-4 animate-fade-up'>
          <MatchStats matchId={partido.id} player1={names.jugador1} player2={names.jugador2} initialStats={estadisticas} />
        </section>
      )}
      <RecentEvents events={events} names={names} />
    </div>
  )
}

function Scoreboard({ marcador, names, matchId, version, onSaved }) {
  const visibleSets = Math.max(marcador.sets?.length || 1, 3)
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [editVersion, setEditVersion] = useState(null)
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const sideKey = editing === 'jugador1' ? 'nombre_override_j1' : 'nombre_override_j2'
      await matchService.updateParticipants(matchId, { [sideKey]: editValue || null, expected_control_version: editVersion })
      setEditing(null)
      onSaved?.()
    } catch (error) {
      setEditError(error.message || 'No se pudo guardar. Actualiza y vuelve a abrir la edición.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='p-3 sm:p-5 overflow-x-auto'>
      {editError && <p role='alert' className='text-sm text-red-600 mb-2'>{editError}</p>}
      <div className='min-w-[470px]'>
        <div className='grid gap-2 text-center text-[10px] uppercase font-bold mb-2' style={{ gridTemplateColumns: `minmax(190px,1fr) repeat(${visibleSets},48px) 68px` }}>
          <span className='text-left' style={{ color: 'var(--text-muted)' }}>Jugador</span>
          {Array.from({ length: visibleSets }, (_, index) => <span key={index} style={{ color: 'var(--text-muted)' }}>Set {index + 1}</span>)}
          <span style={{ color: 'var(--text-muted)' }}>Puntos</span>
        </div>
        {['jugador1', 'jugador2'].map((side, sideIndex) => (
          <div key={side} className='grid gap-2 items-center py-3' style={{ gridTemplateColumns: `minmax(190px,1fr) repeat(${visibleSets},48px) 68px`, borderTop: '1px solid var(--border-color)' }}>
            <div className='flex items-center gap-2 min-w-0'>
              <span className='w-2.5 h-2.5 rounded-full shrink-0' style={{ backgroundColor: marcador.server === side && !marcador.winner ? 'var(--club-clay)' : 'transparent' }} />
              {editing === side ? (
                <div className='flex items-center gap-1 flex-1 min-w-0'>
                  <input
                    type='text'
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    className='text-sm font-bold bg-transparent border-b-2 flex-1 min-w-0 outline-none'
                    style={{ borderColor: 'var(--color-brand)', color: 'var(--text-primary)' }}
                    autoFocus
                  />
                  <button onClick={handleSave} disabled={saving} className='p-1'><Check className='w-3.5 h-3.5' style={{ color: 'var(--color-brand)' }} /></button>
                  <button onClick={() => setEditing(null)} className='p-1'><X className='w-3.5 h-3.5' style={{ color: 'var(--text-muted)' }} /></button>
                </div>
              ) : (
                <>
                  <strong className='truncate' style={{ color: 'var(--text-primary)' }}>{names[side]}</strong>
                  <button onClick={() => { setEditing(side); setEditVersion(version); setEditError(''); setEditValue('') }} className='p-1 opacity-50 hover:opacity-100'><Pencil className='w-3 h-3' style={{ color: 'var(--text-muted)' }} /></button>
                </>
              )}
              {marcador.winner === side && <Trophy className='w-4 h-4 shrink-0' style={{ color: 'var(--club-clay)' }} />}
            </div>
            {Array.from({ length: visibleSets }, (_, index) => (
              <strong key={index} className='text-center text-lg' style={{ color: 'var(--text-primary)' }}>
                {marcador.sets?.[index]?.games?.[sideIndex] ?? (index === (marcador.currentSet || 1) - 1 ? 0 : '/')}
              </strong>
            ))}
            <strong className='text-center text-2xl rounded-lg py-1' style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
              {marcador.displayPoints?.[sideIndex] ?? '0'}
            </strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecentEvents({ events, names }) {
  if (!events.length) return null
  return (
    <details className='card p-4'>
      <summary className='font-bold cursor-pointer' style={{ color: 'var(--text-primary)' }}>Historial de acciones</summary>
      <div className='mt-3 space-y-2'>
        {events.slice(0, 12).map((event) => (
          <div key={event.id} className='flex items-center justify-between gap-3 text-xs py-2' style={{ borderTop: '1px solid var(--border-color)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{eventText(event, names)}</span>
            <span className='font-bold shrink-0' style={{ color: 'var(--text-primary)' }}>{event.marcador?.displayPoints?.join(' – ')}</span>
          </div>
        ))}
      </div>
    </details>
  )
}

const shortName = (name) => String(name || '').split(' ')[0]
const reasonLabel = (value) => {
  if (value === 'punto_sin_detalle') return 'Punto sin detalle'
  if (value === 'tiro_ganador') return 'Winner'
  const all = [...REASONS.positive, ...REASONS.negative]
  return all.find((r) => r.value === value)?.label || value
}
const eventText = (event, names) => {
  if (event.tipo === 'primera_falta') return `Primera falta · ${names[event.servidor]}`
  if (event.tipo === 'let') return 'Let / repetir punto'
  if (event.tipo === 'cambio_servidor') return `Servicio corregido · ${names[event.ganador]}`
  if (event.tipo === 'walkover') return event.ganador ? `Cierre por W.O. · ${names[event.ganador]}` : 'Doble W.O. · Sin ganador'
  return `${names[event.ganador]} · ${reasonLabel(event.motivo)}`
}
