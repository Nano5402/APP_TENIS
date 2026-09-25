import { useState } from 'react'
import { Link } from 'react-router-dom'
import ParticipantAvatar from '../ui/ParticipantAvatar'
import useAuthStore from '../../store/useAuthStore'
import { ChevronDown, BarChart3 } from 'lucide-react'

export default function TournamentStandings({ data }) {
  const management = useAuthStore(s => s.isAuthenticated && ['admin', 'juez_director'].includes(s.user?.rol)) && data.puede_ver_gestion === true
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
            {management ? 'No hay parejas asignadas. Guarda la distribución desde «Parejas inscritas».' : 'Las posiciones de este grupo estarán disponibles cuando la organización publique su distribución.'}
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
                <details className='group mt-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden'>
                  <summary className='list-none cursor-pointer flex items-center gap-2 min-h-11 px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]'>
                    <BarChart3 size={15} aria-hidden='true' /> Ver detalle del rendimiento
                    <ChevronDown size={16} className='ml-auto transition-transform group-open:rotate-180 motion-reduce:transition-none' aria-hidden='true' />
                  </summary>
                  <div className='p-3 pt-0 space-y-3'>
                    <p className='text-xs text-[var(--text-muted)]'>Resumen acumulado de los partidos finalizados de esta tabla.</p>
                    <div className='grid gap-2 sm:grid-cols-3'>
                      <Performance title='Partidos' won={r.pg} lost={r.pp} total={r.pj} positive='Ganados' negative='Perdidos' />
                      <Performance title='Sets' won={r.sets_ganados} lost={r.sets_perdidos} total={r.sets_jugados} positive='Ganados' negative='Perdidos' />
                      <Performance title='Games' won={r.games_favor} lost={r.games_contra} total={r.games_jugados} positive='A favor' negative='En contra' />
                    </div>
                    <p className='text-[11px] leading-relaxed text-[var(--text-muted)]'>El porcentaje compara los ganados con el total jugado. El supertiebreak cuenta como un set y un game, no como sus puntos individuales.</p>
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className='text-xs text-[var(--text-muted)]'>
        Victoria: 1 punto; derrota: 0. Empate entre dos: porcentaje de sets, porcentaje de games
        y enfrentamiento directo. Triple empate: quien tenga el mayor porcentaje de games en
        solitario queda primero; los otros dos se ordenan por su enfrentamiento directo.
        Si no hay un líder único o empatan más de tres, se comparan porcentajes de sets y games.
        Un supertiebreak aporta 1 set y 1 game al ganador, y 0 al perdedor.
      </p>
      {management && !!data.sin_grupo?.length && (
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
      {management && !!data.incidencias?.length && (
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

function Performance({ title, won = 0, lost = 0, total = 0, positive, negative }) {
  const percent = total > 0 ? Math.max(0, Math.min(100, Number(won) / Number(total) * 100)) : 0
  return (
    <section className='rounded-xl p-3 bg-[var(--bg-hover)] space-y-2'>
      <div className='flex items-baseline justify-between gap-2'>
        <h4 className='text-xs font-semibold'>{title}</h4>
        <strong className='text-lg tabular-nums text-[var(--color-brand)]'>{total > 0 ? `${percent.toFixed(1)}%` : '—'}</strong>
      </div>
      <div className='h-1.5 rounded-full bg-[var(--bg-card)] overflow-hidden' aria-hidden='true'>
        <div className='h-full rounded-full bg-[var(--color-brand)]' style={{ width: `${percent}%` }} />
      </div>
      <dl className='grid grid-cols-3 gap-1 text-center text-[10px] text-[var(--text-muted)]'>
        {[[positive, won], [negative, lost], ['Total', total]].map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd className='text-sm font-semibold tabular-nums text-[var(--text-primary)] mt-1'>{value}</dd></div>
        ))}
      </dl>
      {!total && <p className='text-[10px] text-[var(--text-muted)]'>Sin datos finalizados todavía</p>}
    </section>
  )
}
