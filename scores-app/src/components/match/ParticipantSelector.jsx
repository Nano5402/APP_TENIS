import { useEffect, useState } from 'react'
import { Controller, useWatch } from 'react-hook-form'
import { getMatchupLabel } from '../../utils/matchParticipants'

const searchable = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const matchesSearch = (value, query) =>
  searchable(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => searchable(value).includes(part))

// Controlled selects retain reset values while their asynchronous options arrive.
export function FormSelect({ control, name, rules, children, ...props }) {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field }) => (
        <select {...props} {...field} value={field.value ?? ''}>
          {children}
        </select>
      )}
    />
  )
}

export default function ParticipantSelector({
  label,
  mode,
  modeField,
  fixedField,
  sourceField,
  fixedLabel,
  fixedOptions,
  sourceMatches,
  control,
  disabled = false,
  error,
}) {
  const [query, setQuery] = useState('')
  const values = useWatch({ control })
  const otherSide = fixedField.includes('1') ? '2' : '1'
  const opposite = fixedField.replace(/[12]/, otherSide)
  const context = `${values.torneo_id}-${values.categoria_id}-${values.grupo}-${values.fase}-${values[fixedField] || ''}`
  useEffect(() => {
    setQuery('')
  }, [context])
  const visibleOptions = fixedOptions.filter(
    (option) =>
      !(
        values[`participante${otherSide}_tipo`] !== 'ganador' &&
        String(option.id) === String(values[opposite])
      ) &&
      (String(option.id) === String(values[fixedField]) ||
        matchesSearch(option.search || option.label, query))
  )
  return (
    <div className='form-group'>
      <label className='form-label'>{label}</label>
      <FormSelect className='form-input' control={control} name={modeField}>
        <option value='fijo'>{fixedLabel} definido</option>
        <option value='ganador' disabled={!sourceMatches.length}>
          Ganador de otro partido
        </option>
        {values.fase === 'eliminacion' && (
          <option value='por_definir'>{fixedLabel} por definir (pendiente en llave)</option>
        )}
      </FormSelect>

      {mode === 'por_definir' ? (
        <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
          Este lado quedará como «Por definir» hasta que se asigne la pareja/jugador o clasifique de otra llave.
        </p>
      ) : mode === 'ganador' ? (
        <>
          <FormSelect
            key={sourceField}
            control={control}
            name={sourceField}
            className='form-input'
            rules={{ required: 'Selecciona el partido de origen' }}
          >
            <option value=''>Seleccionar partido</option>
            {sourceMatches.map((match) => (
              <option key={match.id} value={match.id}>
                Gdor: {getMatchupLabel(match)}
              </option>
            ))}
          </FormSelect>
          {sourceMatches.length === 0 && (
            <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
              Primero crea otro partido de la misma categoría.
            </p>
          )}
        </>
      ) : (
        <>
          <input
            className='form-input'
            aria-label={`Buscar ${label.toLowerCase()}`}
            placeholder='Buscar por nombre o apellido…'
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
          />
          <FormSelect
            key={fixedField}
            control={control}
            name={fixedField}
            disabled={disabled}
            className='form-input'
            rules={{ required: `Selecciona un ${fixedLabel.toLowerCase()}` }}
          >
            <option value=''>Seleccionar</option>
            {visibleOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </FormSelect>
          {!visibleOptions.length && (
            <p className='text-xs'>No hay participantes disponibles para esta selección.</p>
          )}
        </>
      )}
      {error && <p className='form-error'>{error.message}</p>}
    </div>
  )
}
