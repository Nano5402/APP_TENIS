import { Check, CalendarDays, MapPin, Users } from 'lucide-react'
import './MatchWizard.css'

export default function MatchWizardSummary({
  tournament,
  category,
  group,
  phase,
  participants,
  date,
  time,
  court,
  judge,
  format,
  review = false,
}) {
  return (
    <section
      className={`match-wizard-summary ${review ? 'is-review' : ''}`}
      aria-label={review ? 'Revisión del partido' : 'Resumen del encuentro'}
    >
      <span className='match-wizard-eyebrow'>{review ? 'ANTES DE GUARDAR' : 'TU ENCUENTRO'}</span>
      <h3>{review ? 'Todo listo para confirmar' : 'Resumen del encuentro'}</h3>
      <p className='match-wizard-tournament'>{tournament || 'Partido libre'}</p>
      <div className='match-wizard-tags'>
        <span>{category || 'Categoría pendiente'}</span>
        {group && phase === 'grupos' && <span>{group}</span>}
        {phase === 'eliminacion' && <span>Eliminatoria</span>}
      </div>
      <div className='match-wizard-matchup'>
        {participants.map((p, i) => (
          <div key={i} className='match-wizard-participant'>
            <span className='match-wizard-initial' aria-hidden='true'>
              {p ? <Check size={16} /> : i + 1}
            </span>
            <strong>{p || (i ? 'Rival por seleccionar' : 'Participante por seleccionar')}</strong>
          </div>
        ))}
      </div>
      <dl>
        <div>
          <dt>
            <CalendarDays size={15} /> Fecha y hora
          </dt>
          <dd>
            {date ? date.split('-').reverse().join('/') : 'Fecha pendiente'}
            {time ? ` · ${time}` : ' · Sin hora'}
          </dd>
        </div>
        <div>
          <dt>
            <MapPin size={15} /> Cancha
          </dt>
          <dd>{court || 'Sin asignar'}</dd>
        </div>
        <div>
          <dt>
            <Users size={15} /> Juez
          </dt>
          <dd>{judge || 'Sin asignar'}</dd>
        </div>
        {review && (
          <div>
            <dt>Formato</dt>
            <dd>{format}</dd>
          </div>
        )}
      </dl>
      {review && (!date || !time || !court) && (
        <p className='match-wizard-pending'>
          Quedará con programación pendiente en los campos sin completar.
        </p>
      )}
    </section>
  )
}
