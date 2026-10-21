import { Plus, Radio, Trash2 } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

export default function ModalMarcadorManual({
  isOpen,
  onClose,
  marcadorParticipante1,
  marcadorParticipante2,
  isSubmitting,
  onSubmit,
  register,
  estados,
  setNumbers,
  addSet,
  removeLastSet,
  maxSets,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Editar marcador manual'
      subtitle={`${marcadorParticipante1} vs ${marcadorParticipante2}`}
      icon={Radio}
      iconColor='var(--club-clay)'
      iconBg='rgba(234, 88, 12, 0.15)'
      maxWidth='max-w-xl'
      busy={isSubmitting}
      onSubmit={onSubmit}
      footer={
        <>
          <Button
            type='button'
            variant='secondary'
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button type='submit' loading={isSubmitting}>
            Guardar marcador
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        <div className='grid grid-cols-2 gap-4'>
          <div className='form-group'>
            <label className='form-label'>Estado</label>
            <select className='form-input' {...register('estado')}>
              {estados.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <div className='form-group'>
            <label className='form-label'>Ganador</label>
            <select className='form-input' {...register('ganador')}>
              <option value=''>Sin ganador</option>
              <option value='jugador1'>{marcadorParticipante1}</option>
              <option value='jugador2'>{marcadorParticipante2}</option>
            </select>
          </div>
        </div>

        {/* Sets */}
        <div>
          <p className='form-label mb-1'>Puntos por set</p>
          <p className='text-xs mb-3' style={{ color: 'var(--text-muted)' }}>
            Ingresa los games de cada jugador o equipo. Los tres primeros sets son fijos; los sets
            adicionales se pueden agregar o quitar.
          </p>
          <div className='space-y-2'>
            {setNumbers.map((num) => (
              <div key={num} className='flex items-center gap-3'>
                <span
                  className='text-xs font-medium w-12 shrink-0'
                  style={{ color: 'var(--text-muted)' }}
                >
                  Set {num}
                </span>
                <input
                  type='number'
                  min='0'
                  max='99'
                  placeholder={num > 2 ? '/' : '0'}
                  className='form-input w-20 text-center'
                  aria-label={`${marcadorParticipante1}, set ${num}`}
                  {...register(`set_${num}_j1`)}
                />
                <span style={{ color: 'var(--text-muted)' }}>–</span>
                <input
                  type='number'
                  min='0'
                  max='99'
                  placeholder={num > 2 ? '/' : '0'}
                  className='form-input w-20 text-center'
                  aria-label={`${marcadorParticipante2}, set ${num}`}
                  {...register(`set_${num}_j2`)}
                />
                <div className='form-group flex-row items-center gap-2 m-0'>
                  <input
                    type='checkbox'
                    id={`comp_${num}`}
                    value='true'
                    className='rounded'
                    {...register(`set_${num}_completado`)}
                  />
                  <label
                    htmlFor={`comp_${num}`}
                    className='text-xs cursor-pointer'
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Completado
                  </label>
                </div>
              </div>
            ))}
          </div>
          <div className='flex flex-wrap gap-2 mt-3'>
            <button
              type='button'
              onClick={addSet}
              disabled={setNumbers.length >= maxSets}
              className='btn-secondary text-sm'
            >
              <Plus className='w-4 h-4' /> Agregar set
            </button>
            {setNumbers.length > 3 && (
              <button
                type='button'
                onClick={removeLastSet}
                className='btn-secondary text-sm'
                style={{ color: '#dc2626' }}
              >
                <Trash2 className='w-4 h-4' /> Quitar último set
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
