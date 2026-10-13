import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Radio,
  Plus,
  Trash2,
  Trophy,
  AlertCircle,
  Clock,
  Play,
  CheckCircle2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { matchService } from '../../services/matchService'
import { getParticipantName } from '../../utils/matchParticipants'
import useUIStore from '../../store/useUIStore'
import { useDialogFocus } from '../../hooks/useDialogFocus'

const ESTADOS = [
  { value: 'en_vivo', label: 'En Juego' },
  { value: 'finalizado', label: 'Finalizado' },
]

export default function ModalCorregirMarcador({ isOpen, onClose, match, onSuccess }) {
  const { addToast } = useUIStore()

  const [estado, setEstado] = useState('programado')
  const [ganador, setGanador] = useState('')
  const [sets, setSets] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialogFocus(isOpen, onClose, saving)
  const [control, setControl] = useState(null)
  const [servidor, setServidor] = useState('jugador1')
  const [motivo, setMotivo] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const maxSets = control?.partido?.formato?.mejor_de_sets || match?.formato?.mejor_de_sets || 3

  // Bloquear scroll de la página mientras el modal esté abierto
  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen])

  // Inicializar los datos del partido y sus sets
  useEffect(() => {
    if (!isOpen || !match) return

    setError('')
    setLoading(true)
    setControl(null)
    setMotivo('')
    setConfirmReset(false)
    let active = true

    // Consultamos el partido por ID para asegurar tener los sets más recientes de BD
    matchService
      .getControl(match.id)
      .then((res) => {
        if (!active) return
        const fresh = res.data.partido
        setControl(res.data)
        setServidor(res.data.marcador?.server || 'jugador1')
        setEstado(fresh.estado === 'finalizado' ? 'finalizado' : 'en_vivo')
        setGanador(fresh.ganador || '')

        if (fresh.sets && fresh.sets.length > 0) {
          const loadedSets = fresh.sets
            .slice()
            .sort((a, b) => a.numero_set - b.numero_set)
            .map((s) => ({
              numero_set: s.numero_set,
              games_j1: s.games_j1 ?? 0,
              games_j2: s.games_j2 ?? 0,
              tiebreak_j1: s.tiebreak_j1 != null ? String(s.tiebreak_j1) : '',
              tiebreak_j2: s.tiebreak_j2 != null ? String(s.tiebreak_j2) : '',
              completado: Boolean(s.completado),
            }))
          while (loadedSets.length > 1 && !loadedSets.at(-1).completado && loadedSets.at(-1).games_j1 === 0 && loadedSets.at(-1).games_j2 === 0) loadedSets.pop()
          setSets(loadedSets)
        } else {
          // Por defecto 3 sets vacíos si el partido apenas inicia
          setSets([
            { numero_set: 1, games_j1: 0, games_j2: 0, tiebreak_j1: '', tiebreak_j2: '', completado: false },
          ])
        }
      })
      .catch((err) => {
        if (active) setError(err.message || 'Error al cargar los datos del partido')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [isOpen, match])

  const p1 = useMemo(() => getParticipantName(match, 1) || 'Lado 1', [match])
  const p2 = useMemo(() => getParticipantName(match, 2) || 'Lado 2', [match])
  const courtName = match?.cancha?.nombre || match?.cancha_nombre || 'Cancha por definir'
  const sport = (match?.deporte || 'tenis').toUpperCase()
  const categoryName = match?.categoria?.nombre || match?.categoria_nombre || 'General'

  if (!isOpen || !match) return null

  // Manejar cambios en un set
  const handleSetChange = (index, field, value) => {
    setSets((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  // Agregar un nuevo set
  const handleAddSet = () => {
    if (sets.length >= maxSets) return
    const nextNum = sets.length + 1
    setSets((prev) => [
      ...prev,
      { numero_set: nextNum, games_j1: 0, games_j2: 0, tiebreak_j1: '', tiebreak_j2: '', completado: false },
    ])
  }

  // Quitar el último set
  const handleRemoveLastSet = () => {
    if (sets.length <= 1) return
    setSets((prev) => prev.slice(0, -1))
  }

  // Guardar corrección de marcador
  const handleSave = async (e) => {
    e?.preventDefault?.()
    if (saving || loading || !control) return
    setError('')
    if (!confirmReset || motivo.trim().length < 5) {
      setError('Indica el motivo y confirma el reinicio del game actual en 0-0.')
      return
    }

    // Validar sets
    if (!sets.length) {
      setError('Debes configurar al menos un set')
      return
    }

    const payloadSets = []
    for (const s of sets) {
      const g1 = s.games_j1 === '' ? NaN : Number(s.games_j1)
      const g2 = s.games_j2 === '' ? NaN : Number(s.games_j2)

      if (!Number.isInteger(g1) || g1 < 0 || g1 > 99 || !Number.isInteger(g2) || g2 < 0 || g2 > 99) {
        setError(`Los games del Set ${s.numero_set} deben ser números válidos entre 0 y 99`)
        return
      }

      const tb1 = s.tiebreak_j1 !== '' ? Number(s.tiebreak_j1) : null
      const tb2 = s.tiebreak_j2 !== '' ? Number(s.tiebreak_j2) : null
      if ([tb1, tb2].some((n) => n !== null && (!Number.isInteger(n) || n < 0 || n > 99))) {
        setError('Los puntos de tiebreak deben ser enteros entre 0 y 99')
        return
      }

      payloadSets.push({
        numero_set: s.numero_set,
        games_j1: g1,
        games_j2: g2,
        tiebreak_j1: Number.isInteger(tb1) ? tb1 : null,
        tiebreak_j2: Number.isInteger(tb2) ? tb2 : null,
        completado: Boolean(s.completado),
      })
    }

    // Validar finalización con ganador
    if (estado === 'finalizado' && !ganador) {
      setError('Para marcar el partido como finalizado debes seleccionar cuál de los lados resultó ganador')
      return
    }

    setSaving(true)
    try {
      const res = await matchService.correctScore(match.id, {
        estado,
        ganador: ganador || null,
        sets: payloadSets,
        servidor, motivo: motivo.trim(), confirmar_reinicio_game: confirmReset,
        expected_revision: control.revision,
        expected_configuration: control.configuration,
        expected_control_version: control.partido.control_version,
      })

      addToast({
        type: 'success',
        title: 'Marcador corregido',
        message: 'El marcador y estado del partido se actualizaron correctamente.',
      })

      if (onSuccess) onSuccess(res.data)
      onClose()
    } catch (err) {
      setError(err.message || 'Error al guardar el marcador')
    } finally {
      setSaving(false)
    }
  }

  const modalContent = (
    <div
      className='fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fade-in'
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={() => !saving && onClose()}
      role='dialog'
      ref={dialogRef}
      tabIndex={-1}
      aria-label='Corregir marcador'
      aria-modal='true'
    >
      <div
        className='w-full rounded-2xl overflow-hidden flex flex-col max-h-[92vh] animate-scale-in'
        style={{
          maxWidth: '560px',
          backgroundColor: 'var(--bg-sidebar)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div
          className='flex items-center justify-between px-5 py-4 border-b'
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className='flex items-center gap-2.5 min-w-0'>
            <div
              className='w-9 h-9 rounded-xl flex items-center justify-center shrink-0'
              style={{ backgroundColor: 'rgba(198, 93, 50, 0.15)', color: 'var(--club-clay)' }}
            >
              <Radio size={20} />
            </div>
            <div className='min-w-0'>
              <h2 className='text-base font-bold truncate leading-tight' style={{ color: 'var(--text-primary)' }}>
                Corregir Marcador
              </h2>
              <p className='text-xs truncate' style={{ color: 'var(--text-muted)' }}>
                {courtName} · {sport} · {categoryName}
              </p>
            </div>
          </div>
          <button
            type='button'
            className='btn-ghost p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            onClick={onClose}
            disabled={saving}
            aria-label='Cerrar'
          >
            <X size={19} />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className='p-5 overflow-y-auto space-y-4 flex-1'>
          {/* Banner de aviso / ayuda */}
          {match.estado === 'en_vivo' && (
            <div
              className='p-3 rounded-xl text-xs flex items-start justify-between gap-3 border'
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                borderColor: 'rgba(16, 185, 129, 0.25)',
                color: 'var(--text-primary)',
              }}
            >
              <div className='flex items-start gap-2'>
                <span className='w-2 h-2 rounded-full bg-emerald-500 animate-pulse mt-1 shrink-0' />
                <div>
                  <strong className='text-emerald-500 block'>Partido actualmente En Juego</strong>
                  <p className='text-[11px] text-[var(--text-muted)] mt-0.5'>
                    Antes de corregir, pausa el partido desde la mesa de juez. Después de guardar quedará pausado para revisar y reanudar.
                  </p>
                </div>
              </div>
              <Link
                to='/juez'
                onClick={onClose}
                className='btn-secondary text-[11px] px-2.5 py-1 flex items-center gap-1 shrink-0'
                style={{ color: 'var(--color-brand)' }}
              >
                <Play size={12} />
                <span>Mesa de Juez</span>
              </Link>
            </div>
          )}

          {error && (
            <div
              className='p-3 rounded-xl text-xs flex items-center gap-2'
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
            >
              <AlertCircle size={16} className='shrink-0' />
              <span>{error}</span>
            </div>
          )}

          {/* Participantes */}
          <div
            className='p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs'
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            <div className='flex-1 min-w-0'>
              <span className='text-[11px] text-[var(--text-muted)] block'>Lado 1</span>
              <strong className='text-xs font-bold text-[var(--text-primary)] truncate block'>{p1}</strong>
            </div>
            <span className='text-xs font-bold px-2 py-0.5 rounded text-[var(--text-muted)]' style={{ backgroundColor: 'var(--bg-primary)' }}>
              VS
            </span>
            <div className='flex-1 min-w-0 text-right'>
              <span className='text-[11px] text-[var(--text-muted)] block'>Lado 2</span>
              <strong className='text-xs font-bold text-[var(--text-primary)] truncate block'>{p2}</strong>
            </div>
          </div>

          {/* Estado del Partido y Ganador */}
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <label className='text-xs font-medium text-[var(--text-secondary)] block'>
                Estado del Partido
              </label>
              <select
                className='form-input text-xs w-full py-2'
                value={estado}
                onChange={(e) => {
                  const newEst = e.target.value
                  setEstado(newEst)
                  if (newEst !== 'finalizado' && ganador) {
                    setGanador('')
                  }
                }}
              >
                {ESTADOS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>

            <div className='space-y-1.5'>
              <label className='text-xs font-medium text-[var(--text-secondary)] block'>
                Ganador del Partido
              </label>
              <select
                className='form-input text-xs w-full py-2'
                value={ganador}
                onChange={(e) => {
                  const newWinner = e.target.value
                  setGanador(newWinner)
                  if (newWinner && estado !== 'finalizado') {
                    setEstado('finalizado')
                  }
                }}
              >
                <option value=''>Sin ganador asignado</option>
                <option value='jugador1'>Lado 1 ({p1})</option>
                <option value='jugador2'>Lado 2 ({p2})</option>
              </select>
            </div>
          </div>

          {/* Sets y Games */}
          <div className='space-y-3 rounded-xl border p-3' style={{ borderColor: 'var(--border-color)' }}>
            <label className='block text-xs'>
              Sacador al continuar
              <select aria-label='Sacador al continuar' className='form-input mt-1' value={servidor} onChange={(e) => setServidor(e.target.value)} disabled={saving}>
                <option value='jugador1'>{p1}</option>
                <option value='jugador2'>{p2}</option>
              </select>
            </label>
            <label className='block text-xs'>
              Motivo de la corrección
              <textarea aria-label='Motivo de la corrección' className='form-input mt-1' maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={saving} />
            </label>
            <label className='flex items-start gap-2 text-xs'>
              <input type='checkbox' checked={confirmReset} onChange={(e) => setConfirmReset(e.target.checked)} disabled={saving} />
              Confirmo que el game o tiebreak en curso se reiniciará en 0-0. La corrección no añade puntos a las estadísticas.
            </label>
            <p className='text-xs text-[var(--text-muted)]'>Configura solo los sets jugados. En un match tiebreak finalizado, escribe sus puntos (por ejemplo 10-8) en las casillas de games.</p>
          </div>
          <div className='space-y-2.5 pt-2'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-bold text-[var(--text-primary)]'>
                Puntaje de Sets y Games
              </span>
              <span className='text-[11px] text-[var(--text-muted)]'>
                {sets.length} set{sets.length !== 1 ? 's' : ''} configurado{sets.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className='space-y-2'>
              {sets.map((s, index) => {
                const g1Num = Number.parseInt(s.games_j1, 10) || 0
                const g2Num = Number.parseInt(s.games_j2, 10) || 0
                const isTiedOrDecisive = Math.max(g1Num, g2Num) >= 6

                return (
                  <div
                    key={s.numero_set}
                    className='p-3 rounded-xl border space-y-2'
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
                  >
                    <div className='flex items-center justify-between'>
                      <span className='text-xs font-bold' style={{ color: 'var(--color-brand)' }}>
                        Set {s.numero_set}
                      </span>
                      <label className='flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer select-none'>
                        <input
                          type='checkbox'
                          checked={s.completado}
                          onChange={(e) => handleSetChange(index, 'completado', e.target.checked)}
                          className='rounded text-emerald-600 focus:ring-emerald-500'
                        />
                        <span>Set completado</span>
                      </label>
                    </div>

                    {/* Inputs de Games */}
                    <div className='flex items-center justify-between gap-2'>
                      <div className='flex-1 flex items-center gap-2 min-w-0'>
                        <span className='text-xs text-[var(--text-secondary)] truncate flex-1'>{p1}</span>
                        <input
                          type='number'
                          min='0'
                          max='99'
                          value={s.games_j1}
                          onChange={(e) => handleSetChange(index, 'games_j1', e.target.value)}
                          className='form-input text-center text-sm font-bold w-16 py-1.5'
                          placeholder='0'
                        />
                      </div>

                      <span className='text-xs font-bold text-[var(--text-muted)] px-1'>–</span>

                      <div className='flex-1 flex items-center gap-2 min-w-0 justify-end'>
                        <input
                          type='number'
                          min='0'
                          max='99'
                          value={s.games_j2}
                          onChange={(e) => handleSetChange(index, 'games_j2', e.target.value)}
                          className='form-input text-center text-sm font-bold w-16 py-1.5'
                          placeholder='0'
                        />
                        <span className='text-xs text-[var(--text-secondary)] truncate flex-1 text-right'>{p2}</span>
                      </div>
                    </div>

                    {/* Tiebreak opcional */}
                    {isTiedOrDecisive && (
                      <div
                        className='pt-2 mt-1 border-t flex items-center justify-between text-[11px]'
                        style={{ borderColor: 'var(--border-color)' }}
                      >
                        <span className='text-[var(--text-muted)]'>Puntos Tiebreak (opcional):</span>
                        <div className='flex items-center gap-2'>
                          <input
                            type='number'
                            min='0'
                            max='99'
                            placeholder='TB 1'
                            value={s.tiebreak_j1}
                            onChange={(e) => handleSetChange(index, 'tiebreak_j1', e.target.value)}
                            className='form-input text-center text-xs w-14 py-1'
                          />
                          <span className='text-[var(--text-muted)]'>:</span>
                          <input
                            type='number'
                            min='0'
                            max='99'
                            placeholder='TB 2'
                            value={s.tiebreak_j2}
                            onChange={(e) => handleSetChange(index, 'tiebreak_j2', e.target.value)}
                            className='form-input text-center text-xs w-14 py-1'
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Botones Agregar / Quitar Sets */}
            <div className='flex items-center gap-2 pt-1'>
              <button
                type='button'
                onClick={handleAddSet}
                disabled={sets.length >= maxSets || saving}
                className='btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5'
              >
                <Plus size={14} />
                <span>Agregar Set</span>
              </button>

              {sets.length > 1 && (
                <button
                  type='button'
                  onClick={handleRemoveLastSet}
                  disabled={saving}
                  className='btn-ghost text-xs px-3 py-1.5 flex items-center gap-1 text-red-500 hover:bg-red-500/10'
                >
                  <Trash2 size={13} />
                  <span>Quitar último set</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className='flex items-center justify-end gap-2 px-5 py-3.5 border-t'
          style={{ borderColor: 'var(--border-color)' }}
        >
          <button
            type='button'
            className='btn-ghost text-xs px-4 py-2'
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type='button'
            className='btn-primary text-xs px-5 py-2 flex items-center gap-1.5'
            onClick={handleSave}
            disabled={loading || saving || !control || !confirmReset}
          >
            {saving ? (
              'Guardando…'
            ) : (
              <>
                <CheckCircle2 size={14} />
                <span>Guardar Corrección</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null
}
