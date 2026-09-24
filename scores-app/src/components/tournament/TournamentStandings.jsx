import { useState } from 'react'
import { Link } from 'react-router-dom'
import ParticipantAvatar from '../ui/ParticipantAvatar'

export default function TournamentStandings({ data }) {
  const [category, setCategory] = useState(''),
    [group, setGroup] = useState('')
  const categories = data.categorias || []
  const selected = categories.find((c) => String(c.id) === category) || categories[0]
  const available =
    selected?.grupos || (data.nombres_grupos || []).map((clave) => ({ clave, nombre: clave }))
  const current = available.find((g) => g.clave === group) || available[0]
  const rows = current
    ? data.grupos[current.clave] || []
    : data.grupos_explicitos
      ? []
      : data.tabla_general || []
  return (
    <div className='space-y-4 min-w-0'>
      <section className='card p-4 space-y-3'>
        <h2 className='font-bold text-lg'>Posiciones por grupo</h2>
        <p className='text-sm text-[var(--text-secondary)]'>
          Selecciona una categoría y un grupo. Todas sus parejas aparecen, incluso si aún no han
          jugado.
        </p>
        <div className='grid grid-cols-2 gap-2'>
          <label className='text-xs'>
            Categoría
            <select
              className='form-input mt-1'
              aria-label='Categoría de posiciones'
              value={selected?.id || ''}
              onChange={(e) => {
                setCategory(e.target.value)
                setGroup('')
              }}
            >
              {!categories.length && <option value=''>Sin categorías</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className='text-xs'>
            Grupo
            <select
              className='form-input mt-1'
              aria-label='Grupo de posiciones'
              value={current?.clave || ''}
              onChange={(e) => setGroup(e.target.value)}
            >
              {!available.length && <option value=''>Sin grupos</option>}
              {available.map((g) => (
                <option key={g.clave} value={g.clave}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className='card p-3 sm:p-5 min-w-0'>
        <div className='flex justify-between gap-2 mb-4'>
          <h3 className='font-bold'>
            {selected?.nombre}
            {selected ? ' · ' : ''}
            {current?.nombre || 'Distribución pendiente'}
          </h3>
          <span className='text-xs shrink-0 text-[var(--text-muted)]'>{rows.length} parejas</span>
        </div>
        {!rows.length ? (
          <p className='text-sm text-[var(--text-secondary)]'>
            No hay parejas asignadas. La organización debe guardar los grupos desde «Parejas
            inscritas»; no se deducen de los partidos.
          </p>
        ) : (
          <div className='space-y-2'>
            {rows.map((r) => (
              <article key={r.id} className='rounded-xl p-3 bg-[var(--bg-hover)]'>
                <div className='flex gap-2.5 items-center min-w-0'>
                  <span className='font-bold text-base w-6 text-center text-[var(--color-brand)] shrink-0'>
                    #{r.posicion}
                  </span>
                  <ParticipantAvatar
                    team={data.modalidad === 'dobles' ? r.participante : null}
                    player={r.participante}
                    name={r.participante.nombre}
                  />
                  <span className='font-semibold text-sm break-words flex-1'>
                    {r.participante.nombre}
                  </span>
                  <span className='text-right shrink-0'>
                    <strong className='text-lg text-[var(--color-brand)]'>{r.puntos}</strong>
                    <span className='block text-[10px] text-[var(--text-muted)]'>
                      {r.puntos === 1 ? 'punto' : 'puntos'}
                    </span>
                  </span>
                </div>
                <dl className='grid grid-cols-5 gap-1 sm:gap-2 mt-3 text-center text-xs'>
                  {[
                    ['PJ', r.pj],
                    ['PG', r.pg],
                    ['PP', r.pp],
                    ['% Sets', r.sets_jugados > 0 ? `${(r.ratio_sets * 100).toFixed(1)}%` : '—'],
                    ['% Games', r.games_jugados > 0 ? `${(r.ratio_games * 100).toFixed(1)}%` : '—'],
                  ].map(([label, value]) => (
                    <div key={label} className='p-1.5 rounded-lg bg-[var(--bg-card)]'>
                      <dt className='text-[var(--text-muted)] text-[10px]'>{label}</dt>
                      <dd className='font-bold mt-0.5 text-xs'>{value}</dd>
                    </div>
                  ))}
                </dl>
                <details className='mt-2 text-xs'>
                  <summary className='cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]'>
                    Detalle de sets y games
                  </summary>
                  <p className='pt-1.5 text-[var(--text-muted)]'>
                    Sets: {r.sets_ganados || 0} ganados / {r.sets_perdidos || 0} perdidos ({r.sets_jugados || 0} jugados) · Games:{' '}
                    {r.games_favor || 0} a favor / {r.games_contra || 0} en contra ({r.games_jugados || 0} jugados)
                  </p>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className='text-xs text-[var(--text-muted)]'>
        Criterio oficial: 1 punto al ganador y 0 al perdedor. En caso de empate se define por efectividad de sets (% sets ganados/jugados), efectividad de games (% games favor/jugados) y enfrentamiento directo. Los supertiebreaks se computan como 1 game y 1 set.
      </p>
      {!!data.sin_grupo?.length && (
        <details className='card p-4'>
          <summary className='font-semibold cursor-pointer'>
            {data.sin_grupo.length} parejas aún sin grupo
          </summary>
          <p className='text-xs my-2'>
            Siguen inscritas; se muestran aquí para que ninguna desaparezca.
          </p>
          {data.sin_grupo.map((r) => (
            <p className='text-sm py-1' key={r.id}>
              {r.participante.nombre}
            </p>
          ))}
        </details>
      )}
      {!!data.incidencias?.length && (
        <details className='card p-4 border border-amber-500/40'>
          <summary className='font-semibold cursor-pointer'>
            {data.incidencias.length} cruces fuera de la distribución
          </summary>
          <p className='text-xs my-2'>
            Se conservan los partidos y sus resultados, pero no se suman a un grupo incorrecto.
          </p>
          {data.incidencias.map((i) => (
            <p key={i.partido_id} className='text-sm py-1'>
              <Link className='underline' to={`/match/${i.partido_id}`}>
                Partido #{i.partido_id}
              </Link>{' '}
              · {i.message}
            </p>
          ))}
        </details>
      )}
    </div>
  )
}
