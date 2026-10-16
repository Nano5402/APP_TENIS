import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Trophy, AlertTriangle, UserX, Users, User, CheckCircle2 } from 'lucide-react'
import { matchService } from '../../services/matchService'
import useUIStore from '../../store/useUIStore'
import { getParticipantName } from '../../utils/matchParticipants'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useMatchClosure } from '../../hooks/useMatchClosure'

const QUICK_REASONS = [
  'No presentación (Incomparecencia / No Show)',
  'Retiro por lesión física',
  'Descalificación por infracción / conducta',
  'Abandono voluntario por motivos personales',
]

export default function ModalFinalizarW({ isOpen, onClose, match, onSuccess }) {
  const { addToast } = useUIStore()
  const closure = useMatchClosure(isOpen, match)

  // 'jugador1' | 'jugador2' | 'ambos'
  const [retirado, setRetirado] = useState('')

  // Para dobles: 'pareja_completa' | 'integrante_1' | 'integrante_2'
  const [miembroRetirado, setMiembroRetirado] = useState('pareja_completa')

  const [tipoIncidencia, setTipoIncidencia] = useState(QUICK_REASONS[0])
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialogFocus(isOpen, onClose, saving)

  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !match) return
    setRetirado('')
    setMiembroRetirado('pareja_completa')
    setTipoIncidencia(QUICK_REASONS[0])
    setMotivo('')
    setError('')
  }, [isOpen, match])

  const isDoubles = match?.modalidad === 'dobles' || Boolean(match?.equipo1 || match?.equipo2)
  const p1 = match ? getParticipantName(match, 1) || 'Lado 1' : 'Lado 1'
  const p2 = match ? getParticipantName(match, 2) || 'Lado 2' : 'Lado 2'

  // Extracción de integrantes individuales para parejas de dobles
  const team1Player1 = match?.equipo1?.jugador1
    ? `${match.equipo1.jugador1.nombre || ''} ${match.equipo1.jugador1.apellido || ''}`.trim()
    : null
  const team1Player2 = match?.equipo1?.jugador2
    ? `${match.equipo1.jugador2.nombre || ''} ${match.equipo1.jugador2.apellido || ''}`.trim()
    : null

  const team2Player1 = match?.equipo2?.jugador1
    ? `${match.equipo2.jugador1.nombre || ''} ${match.equipo2.jugador1.apellido || ''}`.trim()
    : null
  const team2Player2 = match?.equipo2?.jugador2
    ? `${match.equipo2.jugador2.nombre || ''} ${match.equipo2.jugador2.apellido || ''}`.trim()
    : null

  const team1MembersFromLabel = p1.includes('/') ? p1.split('/').map((s) => s.trim()) : []
  const team2MembersFromLabel = p2.includes('/') ? p2.split('/').map((s) => s.trim()) : []

  const t1Member1 = team1Player1 || team1MembersFromLabel[0] || 'Primer integrante'
  const t1Member2 = team1Player2 || team1MembersFromLabel[1] || 'Segundo integrante'
  const t2Member1 = team2Player1 || team2MembersFromLabel[0] || 'Primer integrante'
  const t2Member2 = team2Player2 || team2MembersFromLabel[1] || 'Segundo integrante'

  // Determinar texto descriptivo de la persona/pareja que se retiró
  const personaRetiradaText = useMemo(() => {
    if (retirado === 'ambos') {
      return 'Ambos participantes'
    }
    if (retirado === 'jugador1') {
      if (!isDoubles) return p1
      if (miembroRetirado === 'integrante_1') return `${t1Member1} (${p1})`
      if (miembroRetirado === 'integrante_2') return `${t1Member2} (${p1})`
      return `Toda la pareja (${p1})`
    }
    if (retirado === 'jugador2') {
      if (!isDoubles) return p2
      if (miembroRetirado === 'integrante_1') return `${t2Member1} (${p2})`
      if (miembroRetirado === 'integrante_2') return `${t2Member2} (${p2})`
      return `Toda la pareja (${p2})`
    }
    return ''
  }, [retirado, isDoubles, miembroRetirado, p1, p2, t1Member1, t1Member2, t2Member1, t2Member2])

  // Ganador automático
  const winnerParam = useMemo(() => {
    if (retirado === 'jugador1') return 'jugador2'
    if (retirado === 'jugador2') return 'jugador1'
    if (retirado === 'ambos') return 'ninguno'
    return ''
  }, [retirado])

  const winnerName = useMemo(() => {
    if (winnerParam === 'jugador1') return p1
    if (winnerParam === 'jugador2') return p2
    if (winnerParam === 'ninguno') return 'Sin ganador (Doble Walkover)'
    return ''
  }, [winnerParam, p1, p2])

  if (!isOpen || !match) return null

  const handleSave = async (e) => {
    e?.preventDefault?.()
    if (saving) return
    if (!closure.snapshot) { setError(closure.error || 'Espera mientras se verifica el partido.'); return }
    if (!retirado) {
      setError('Debes indicar quién se retiró o no se presentó.')
      return
    }
    const cleanMotivo = motivo.trim()
    if (cleanMotivo.length < 3) {
      setError('Debes especificar el motivo o justificación (mínimo 3 caracteres).')
      return
    }

    setSaving(true)
    setError('')

    try {
      const extra = {
        ...closure.snapshot,
        retirado,
        persona_retirada: personaRetiradaText,
        tipo_incidencia: tipoIncidencia,
      }
      const res = await matchService.walkoverMatch(
        match.id,
        match.control_version,
        winnerParam === 'ninguno' ? null : winnerParam,
        cleanMotivo,
        extra
      )
      addToast({
        type: 'success',
        title: winnerParam === 'ninguno' ? 'Doble W.O. registrado' : 'Victoria por W asignada',
        message:
          winnerParam === 'ninguno'
            ? 'El partido finalizó como Doble Walkover sin ganador.'
            : `El encuentro finalizó a favor de ${winnerName}. ${res.data?.walkover?.marcador_oficial ? 'Marcador: ' + res.data.walkover.marcador_oficial : 'Se conserva el juego registrado.'}`,
      })
      if (onSuccess) onSuccess(res.data)
      onClose()
    } catch (err) {
      setError(err.message || 'Error al finalizar el partido por Walkover')
    } finally {
      setSaving(false)
    }
  }

  const modalContent = (
    <div
      className='fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 animate-fade-in'
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={() => !saving && onClose()}
      role='dialog'
      ref={dialogRef}
      tabIndex={-1}
      aria-modal='true'
      aria-labelledby='modal-walkover-title'
    >
      <div
        className='w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border animate-scale-up overflow-hidden'
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-color)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado Fijo */}
        <div
          className='flex items-center justify-between px-5 sm:px-6 py-4 border-b shrink-0'
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
        >
          <div className='flex items-center gap-3 min-w-0'>
            <div
              className='w-10 h-10 rounded-xl flex items-center justify-center text-amber-400 shrink-0'
              style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)' }}
            >
              <Trophy className='w-5 h-5' />
            </div>
            <div className='min-w-0'>
              <h2 id='modal-walkover-title' className='text-base sm:text-lg font-bold truncate' style={{ color: 'var(--text-primary)' }}>
                Declarar Victoria por W (Walkover / Retiro)
              </h2>
              <p className='text-xs truncate mt-0.5' style={{ color: 'var(--text-muted)' }}>
                {match.torneo?.nombre || 'Partido'} · {match.cancha?.nombre || 'Sin cancha asignada'}
              </p>
            </div>
          </div>
          <button
            onClick={() => !saving && onClose()}
            className='btn-ghost p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ml-3 shrink-0'
            aria-label='Cerrar'
            disabled={saving}
          >
            <X className='w-5 h-5' />
          </button>
        </div>

        {/* Formulario Desplazable */}
        <form onSubmit={handleSave} className='flex flex-col flex-1 min-h-0 overflow-hidden'>
          <div className='flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4 custom-scrollbar'>
            {/* Aviso de cierre definitivo */}
            <div
              className='p-3.5 rounded-xl border flex items-start gap-3 text-xs'
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                borderColor: 'rgba(245, 158, 11, 0.3)',
                color: 'var(--text-primary)',
              }}
            >
              <AlertTriangle className='w-4 h-4 text-amber-500 shrink-0 mt-0.5' />
              <div>
                <span className='font-bold block text-amber-500 mb-0.5'>Cierre oficial del encuentro</span>
                Al confirmar, el partido pasará a estado <strong>Finalizado</strong>, asignando la victoria al rival correspondiente o declarando Doble W.
              </div>
            </div>

            {/* Paso 1: ¿Quién se retiró o no se presentó? */}
            <div>
              <label className='block text-xs font-bold uppercase tracking-wider mb-2' style={{ color: 'var(--text-primary)' }}>
                1. ¿Quién se retiró o no se presentó? <span className='text-red-500'>*</span>
              </label>

              <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
                {/* Opción Lado 1 */}
                <button
                  type='button'
                  onClick={() => {
                    setRetirado('jugador1')
                    setMiembroRetirado('pareja_completa')
                  }}
                  className='p-3 rounded-xl border text-left transition-all flex flex-col justify-between'
                  style={{
                    backgroundColor: retirado === 'jugador1' ? 'var(--color-brand-dim)' : 'var(--bg-hover)',
                    borderColor: retirado === 'jugador1' ? 'var(--color-brand)' : 'var(--border-color)',
                    borderWidth: retirado === 'jugador1' ? '2px' : '1px',
                  }}
                >
                  <div>
                    <span className='text-[10px] uppercase font-bold text-[var(--text-muted)] block'>
                      {isDoubles ? 'Pareja 1' : 'Jugador 1'}
                    </span>
                    <strong className='text-sm mt-0.5 block truncate' style={{ color: retirado === 'jugador1' ? 'var(--color-brand)' : 'var(--text-primary)' }}>
                      {p1}
                    </strong>
                  </div>
                  <span className='text-[11px] mt-2 font-medium' style={{ color: retirado === 'jugador1' ? 'var(--color-brand)' : 'var(--text-muted)' }}>
                    {retirado === 'jugador1' ? '✓ Se retira / No llegó' : 'Seleccionar'}
                  </span>
                </button>

                {/* Opción Lado 2 */}
                <button
                  type='button'
                  onClick={() => {
                    setRetirado('jugador2')
                    setMiembroRetirado('pareja_completa')
                  }}
                  className='p-3 rounded-xl border text-left transition-all flex flex-col justify-between'
                  style={{
                    backgroundColor: retirado === 'jugador2' ? 'var(--color-brand-dim)' : 'var(--bg-hover)',
                    borderColor: retirado === 'jugador2' ? 'var(--color-brand)' : 'var(--border-color)',
                    borderWidth: retirado === 'jugador2' ? '2px' : '1px',
                  }}
                >
                  <div>
                    <span className='text-[10px] uppercase font-bold text-[var(--text-muted)] block'>
                      {isDoubles ? 'Pareja 2' : 'Jugador 2'}
                    </span>
                    <strong className='text-sm mt-0.5 block truncate' style={{ color: retirado === 'jugador2' ? 'var(--color-brand)' : 'var(--text-primary)' }}>
                      {p2}
                    </strong>
                  </div>
                  <span className='text-[11px] mt-2 font-medium' style={{ color: retirado === 'jugador2' ? 'var(--color-brand)' : 'var(--text-muted)' }}>
                    {retirado === 'jugador2' ? '✓ Se retira / No llegó' : 'Seleccionar'}
                  </span>
                </button>

                {/* Opción Ambos */}
                <button
                  type='button'
                  onClick={() => {
                    setRetirado('ambos')
                    setMiembroRetirado('pareja_completa')
                  }}
                  className='p-3 rounded-xl border text-left transition-all flex flex-col justify-between'
                  style={{
                    backgroundColor: retirado === 'ambos' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-hover)',
                    borderColor: retirado === 'ambos' ? '#ef4444' : 'var(--border-color)',
                    borderWidth: retirado === 'ambos' ? '2px' : '1px',
                  }}
                >
                  <div>
                    <span className='text-[10px] uppercase font-bold text-red-400 block'>
                      Doble W.O.
                    </span>
                    <strong className='text-sm mt-0.5 block truncate text-red-400'>
                      Fueron ambos
                    </strong>
                  </div>
                  <span className='text-[11px] mt-2 font-medium text-red-400'>
                    {retirado === 'ambos' ? '✓ Ambos ausentes' : 'Ambos no llegaron'}
                  </span>
                </button>
              </div>
            </div>

            {/* Sub-selector de integrante si es partido de Dobles y se seleccionó una pareja */}
            {isDoubles && (retirado === 'jugador1' || retirado === 'jugador2') && (
              <div className='p-3 rounded-xl border bg-[var(--bg-hover)] space-y-2' style={{ borderColor: 'var(--border-color)' }}>
                <span className='text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5'>
                  <Users size={14} className='text-[var(--color-brand)]' />
                  ¿Cuál integrante de la pareja tuvo la incidencia?
                </span>
                <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
                  <button
                    type='button'
                    onClick={() => setMiembroRetirado('pareja_completa')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all flex items-center justify-between ${
                      miembroRetirado === 'pareja_completa'
                        ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)] text-[var(--color-brand)]'
                        : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span>Toda la pareja</span>
                    {miembroRetirado === 'pareja_completa' && <CheckCircle2 size={14} />}
                  </button>

                  <button
                    type='button'
                    onClick={() => setMiembroRetirado('integrante_1')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all flex items-center justify-between ${
                      miembroRetirado === 'integrante_1'
                        ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)] text-[var(--color-brand)]'
                        : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className='truncate'>{retirado === 'jugador1' ? t1Member1 : t2Member1}</span>
                    {miembroRetirado === 'integrante_1' && <CheckCircle2 size={14} className='shrink-0 ml-1' />}
                  </button>

                  <button
                    type='button'
                    onClick={() => setMiembroRetirado('integrante_2')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all flex items-center justify-between ${
                      miembroRetirado === 'integrante_2'
                        ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)] text-[var(--color-brand)]'
                        : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className='truncate'>{retirado === 'jugador1' ? t1Member2 : t2Member2}</span>
                    {miembroRetirado === 'integrante_2' && <CheckCircle2 size={14} className='shrink-0 ml-1' />}
                  </button>
                </div>
              </div>
            )}

            {/* Paso 2: Tipo de incidencia */}
            <div>
              <label className='block text-xs font-bold uppercase tracking-wider mb-2' style={{ color: 'var(--text-primary)' }}>
                2. Tipo de incidencia <span className='text-red-500'>*</span>
              </label>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-1.5'>
                {QUICK_REASONS.map((r) => (
                  <button
                    key={r}
                    type='button'
                    onClick={() => {
                      setTipoIncidencia(r)
                      if (!motivo) {
                        setMotivo(r)
                      }
                    }}
                    className='text-xs px-3 py-2 rounded-xl border text-left transition-all flex items-center justify-between'
                    style={{
                      backgroundColor: tipoIncidencia === r ? 'var(--color-brand-dim)' : 'var(--bg-hover)',
                      borderColor: tipoIncidencia === r ? 'var(--color-brand)' : 'var(--border-color)',
                      color: tipoIncidencia === r ? 'var(--color-brand)' : 'var(--text-primary)',
                      borderWidth: tipoIncidencia === r ? '2px' : '1px',
                    }}
                  >
                    <span className='truncate'>{r}</span>
                    {tipoIncidencia === r && <CheckCircle2 size={14} className='shrink-0 ml-1.5' />}
                  </button>
                ))}
              </div>
            </div>

            {/* Paso 3: Observaciones y justificación */}
            <div>
              <label className='block text-xs font-bold uppercase tracking-wider mb-1.5' style={{ color: 'var(--text-primary)' }}>
                3. Justificación del juez <span className='text-red-500'>*</span>
              </label>
              <textarea
                className='form-input text-xs w-full resize-none'
                rows={3}
                required
                minLength={3}
                maxLength={500}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder='Escribe el detalle (ej.: El jugador no llegó a la cancha pasados los 15 min de tolerancia reglamentaria)...'
              />
              <span className='text-[11px] text-[var(--text-muted)] mt-1 block'>
                Mínimo 3 caracteres. Quedará archivado en las notas oficiales del partido y auditoría.
              </span>
            </div>

            {/* Cuadro de Resolución y Resumen */}
            {retirado && (
              <div
                className='p-3.5 rounded-xl border space-y-1.5 text-xs'
                style={{
                  backgroundColor: retirado === 'ambos' ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-brand-dim)',
                  borderColor: retirado === 'ambos' ? 'rgba(239, 68, 68, 0.3)' : 'var(--color-brand)',
                }}
              >
                <div className='font-bold flex items-center gap-1.5' style={{ color: retirado === 'ambos' ? '#ef4444' : 'var(--color-brand)' }}>
                  {retirado === 'ambos' ? <UserX size={15} /> : <Trophy size={15} />}
                  <span>Resolución del W.O.:</span>
                </div>
                <div className='space-y-0.5' style={{ color: 'var(--text-primary)' }}>
                  <div>
                    <strong>Afectado / Retirado:</strong> {personaRetiradaText}
                  </div>
                  <div>
                    <strong>Causa:</strong> {tipoIncidencia}
                  </div>
                  <div>
                    <strong>Resultado oficial:</strong>{' '}
                    <span className='font-bold underline' style={{ color: retirado === 'ambos' ? '#ef4444' : 'var(--color-brand)' }}>
                      {winnerName}
                    </span>
                  </div>
                  {retirado !== 'ambos' && (
                    <div className='pt-1'>
                      <strong>Marcador asignado:</strong>{' '}
                      <span className='font-bold text-[var(--color-brand)]'>
                        6/0 6/0 solo por incomparecencia sin juego registrado. Si hubo juego, se conserva el marcador; otros cierres no asignan parciales.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <p role='alert' className='text-xs text-red-500 bg-red-500/10 p-3 rounded-xl border border-red-500/20 font-medium'>
                {error}
              </p>
            )}
          </div>

          {/* Pie Fijo de Acciones */}
          <div
            className='flex items-center justify-end gap-3 px-5 sm:px-6 py-4 border-t shrink-0 mt-auto'
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
          >
            <button
              type='button'
              onClick={onClose}
              className='btn-secondary text-xs px-4 py-2'
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type='submit'
              className='btn-primary text-xs px-5 py-2 flex items-center gap-1.5'
              disabled={saving || !retirado || motivo.trim().length < 3}
              style={{
                backgroundColor: retirado === 'ambos' ? '#ef4444' : '#f59e0b',
                borderColor: retirado === 'ambos' ? '#ef4444' : '#f59e0b',
                color: retirado === 'ambos' ? '#ffffff' : '#000000',
              }}
            >
              {retirado === 'ambos' ? <UserX size={14} /> : <Trophy size={14} />}
              <span>
                {saving
                  ? 'Guardando…'
                  : retirado === 'ambos'
                  ? 'Declarar Doble W (Sin ganador)'
                  : `Declarar Victoria por W para ${winnerParam === 'jugador1' ? p1 : p2}`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
