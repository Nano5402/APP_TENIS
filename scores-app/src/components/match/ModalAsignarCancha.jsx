import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, MapPin, CheckCircle2, AlertCircle } from 'lucide-react'
import { sedeService } from '../../services/sedeService'
import { matchService } from '../../services/matchService'
import useUIStore from '../../store/useUIStore'
import { getParticipantName } from '../../utils/matchParticipants'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export default function ModalAsignarCancha({ isOpen, onClose, match, onSuccess, allowUnassigned = true }) {
  const { addToast } = useUIStore()
  const [courts, setCourts] = useState([])
  const [loading, setLoading] = useState(true)
  const [courtsLoaded, setCourtsLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const initialCourtId = match?.cancha?.id ?? match?.cancha_id
  const [selectedCourtId, setSelectedCourtId] = useState(initialCourtId ? String(initialCourtId) : '')
  const [search, setSearch] = useState('')
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
    const cId = match?.cancha?.id ?? match?.cancha_id
    setSelectedCourtId(cId ? String(cId) : '')
    setSearch('')
    setError('')
    setLoading(true)
    setCourtsLoaded(false)

    sedeService.getAll()
      .then(async (res) => {
        const locations = res.data || []
        const courtResponses = await Promise.all(
          locations.map(async (location) => {
            const courtRes = await sedeService.getCanchasBySede(location.id)
            return (courtRes.data || []).map((court) => ({
              ...court,
              sede_nombre: location.nombre,
            }))
          })
        )
        const flatCourts = courtResponses.flat()
        // Filtrar por deporte del partido (o canchas aptas para 'ambos')
        const matchDeporte = match.deporte || 'tenis'
        const compatible = flatCourts.filter(
          (c) => c.deporte === matchDeporte || c.deporte === 'ambos'
        )
        setCourts(compatible.filter(c => c.activa !== false && c.activa !== 0))
        setCourtsLoaded(true)
      })
      .catch((err) => {
        setError(err.message || 'No se pudieron cargar las canchas disponibles')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isOpen, match])

  const filteredCourts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return courts
    return courts.filter((c) => {
      const full = `${c.nombre || ''} ${c.sede_nombre || ''} ${c.deporte || ''}`.toLowerCase()
      return full.includes(q)
    })
  }, [courts, search])

  if (!isOpen || !match) return null

  const handleSave = async (e) => {
    e?.preventDefault?.()
    if (saving || loading || !courtsLoaded || (!allowUnassigned && !selectedCourtId)) return
    setSaving(true)
    setError('')

    try {
      const courtIdToSend = selectedCourtId ? Number(selectedCourtId) : null
      const res = await matchService.reassignCourt(match.id, courtIdToSend, match.control_version)
      addToast({
        type: 'success',
        title: courtIdToSend ? 'Cancha asignada' : 'Cancha retirada',
        message: courtIdToSend
          ? 'La cancha del partido se actualizó correctamente.'
          : 'El partido quedó sin cancha asignada.',
      })
      if (onSuccess) onSuccess(res.data)
      onClose()
    } catch (err) {
      setError(err.message || 'Error al asignar la cancha')
    } finally {
      setSaving(false)
    }
  }

  const p1 = getParticipantName(match, 1) || 'Lado 1'
  const p2 = getParticipantName(match, 2) || 'Lado 2'
  const currentCourtName = match.cancha?.nombre
    ? `${match.cancha.nombre}${match.cancha.sede_nombre ? ` · ${match.cancha.sede_nombre}` : ''}`
    : match.cancha_nombre || 'Sin cancha asignada'

  const modalContent = (
    <div
      className='fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fade-in'
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={() => !saving && onClose()}
      role='dialog'
      ref={dialogRef}
      tabIndex={-1}
      aria-modal='true'
      aria-labelledby='modal-asignar-cancha-title'
    >
      <div
        className='card w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border animate-scale-up'
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className='flex items-center justify-between p-4 sm:p-5 border-b' style={{ borderColor: 'var(--border-color)' }}>
          <div className='flex items-center gap-2.5'>
            <div
              className='w-9 h-9 rounded-xl flex items-center justify-center text-emerald-400'
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
            >
              <MapPin className='w-5 h-5' />
            </div>
            <div>
              <h2 id='modal-asignar-cancha-title' className='text-base font-bold' style={{ color: 'var(--text-primary)' }}>
                {match.cancha ? 'Reasignar cancha' : 'Asignar cancha'}
              </h2>
              <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
                {p1} vs {p2}
              </p>
            </div>
          </div>
          <button
            onClick={() => !saving && onClose()}
            className='btn-ghost p-1.5'
            aria-label='Cerrar'
            disabled={saving}
          >
            <X className='w-5 h-5' />
          </button>
        </div>

        {/* Cancha actual */}
        <div className='px-4 sm:px-5 pt-3'>
          <div
            className='p-3 rounded-xl border flex items-center justify-between text-xs'
            style={{ backgroundColor: 'var(--bg-hover)', borderColor: 'var(--border-color)' }}
          >
            <span style={{ color: 'var(--text-muted)' }}>Cancha actual:</span>
            <span className='font-semibold flex items-center gap-1.5' style={{ color: 'var(--text-primary)' }}>
              <MapPin className='w-3.5 h-3.5 text-emerald-500' />
              {currentCourtName}
            </span>
          </div>
        </div>

        {/* Buscador */}
        <div className='p-4 sm:p-5 pb-2'>
          <div className='relative'>
            <Search className='w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2' style={{ color: 'var(--text-muted)' }} />
            <input
              type='text'
              placeholder='Buscar cancha o sede…'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='form-input pl-9 text-xs'
              disabled={loading || saving}
            />
          </div>
        </div>

        {/* Lista de canchas */}
        <div className='flex-1 overflow-y-auto px-4 sm:px-5 py-2 space-y-1.5 min-h-[160px] max-h-[300px]'>
          {loading ? (
            <div className='py-8 text-center text-xs' style={{ color: 'var(--text-muted)' }}>
              Cargando canchas disponibles…
            </div>
          ) : (
            <>
              {/* Opción Sin Cancha */}
              {allowUnassigned && <button
                type='button'
                onClick={() => setSelectedCourtId('')}
                className='w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between text-xs'
                style={{
                  borderColor: selectedCourtId === '' ? 'var(--color-brand)' : 'var(--border-color)',
                  backgroundColor: selectedCourtId === '' ? 'var(--color-brand-dim)' : 'transparent',
                }}
              >
                <div>
                  <div className='font-semibold' style={{ color: 'var(--text-primary)' }}>
                    Sin cancha asignada
                  </div>
                  <div className='text-[11px]' style={{ color: 'var(--text-muted)' }}>
                    Retirar cancha actual del encuentro
                  </div>
                </div>
                {selectedCourtId === '' && <CheckCircle2 className='w-4 h-4 text-emerald-500 shrink-0' />}
              </button>}

              {filteredCourts.map((court) => {
                const isSelected = String(court.id) === String(selectedCourtId)
                return (
                  <button
                    key={court.id}
                    type='button'
                    onClick={() => setSelectedCourtId(String(court.id))}
                    className='w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between text-xs'
                    style={{
                      borderColor: isSelected ? 'var(--color-brand)' : 'var(--border-color)',
                      backgroundColor: isSelected ? 'var(--color-brand-dim)' : 'transparent',
                    }}
                  >
                    <div>
                      <div className='font-semibold flex items-center gap-1.5' style={{ color: 'var(--text-primary)' }}>
                        <MapPin className='w-3.5 h-3.5 text-emerald-500' />
                        {court.nombre}
                      </div>
                      <div className='text-[11px] mt-0.5' style={{ color: 'var(--text-muted)' }}>
                        {court.sede_nombre} · {court.superficie || 'Cancha oficial'} · {court.deporte}
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className='w-4 h-4 text-emerald-500 shrink-0' />}
                  </button>
                )
              })}

              {!filteredCourts.length && (
                <div className='py-6 text-center text-xs' style={{ color: 'var(--text-muted)' }}>
                  No se encontraron canchas que coincidan con la búsqueda.
                </div>
              )}
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className='px-4 sm:px-5 pb-2'>
            <div className='p-2.5 rounded-xl text-xs flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20'>
              <AlertCircle className='w-4 h-4 shrink-0' />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className='flex items-center justify-end gap-2.5 p-4 sm:p-5 border-t mt-auto' style={{ borderColor: 'var(--border-color)' }}>
          <button
            type='button'
            onClick={() => onClose()}
            className='btn-ghost px-4 py-2 text-xs font-semibold'
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type='button'
            onClick={handleSave}
            className='btn-primary px-5 py-2 text-xs font-semibold'
            disabled={saving || loading || !courtsLoaded || (!allowUnassigned && !selectedCourtId)}
          >
            {saving ? 'Guardando…' : 'Confirmar cancha'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
