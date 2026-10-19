import { useEffect, useRef, useState } from 'react'
import { Search, Users, Check, ArrowRight, AlertTriangle, SlidersHorizontal } from 'lucide-react'
import {
  choiceKey,
  incompatibility,
  pairText,
  previousMeetings,
  searchPair,
} from '../../utils/matchPlanner.mjs'
import './MatchPlanner.css'

export default function MatchPlanner({
  choices,
  firstId,
  secondId,
  categoryId,
  group,
  phase,
  useGroups,
  tournamentId,
  matches,
  loading,
  error,
  busy,
  onRetry,
  onFirst,
  onSecond,
  onClear,
  onManual,
  onContinue,
  firstMode,
  secondMode,
}) {
  const first =
    firstMode !== 'ganador' &&
    choices.find(
      (p) =>
        String(p.equipo_id) === String(firstId) &&
        String(p.categoria_id) === String(categoryId) &&
        (!useGroups || phase !== 'grupos' || p.grupo === group)
    )
  const second =
    secondMode !== 'ganador' &&
    choices.find(
      (p) =>
        String(p.equipo_id) === String(secondId) &&
        String(p.categoria_id) === String(categoryId) &&
        (!useGroups || phase !== 'grupos' || p.grupo === group)
    )
  const [side, setSide] = useState(1)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [showUnavailable, setShowUnavailable] = useState(false)
  const [limit, setLimit] = useState(12)
  const [browsing, setBrowsing] = useState(true)
  const input = useRef(null)
  useEffect(() => {
    setSide(1)
    setQuery('')
    setCategoryFilter('')
    setGroupFilter('')
    setLimit(12)
  }, [tournamentId])
  useEffect(() => {
    if (!firstId) {
      setSide(1)
      setQuery('')
    }
  }, [firstId])
  useEffect(() => {
    setLimit(12)
  }, [query, side, categoryFilter, groupFilter, showUnavailable])
  const groupPhase = useGroups && phase === 'grupos'
  const candidates = choices
    .filter((p) => side === 1 || Number(p.equipo_id) !== Number(first?.equipo_id))
    .map((pair) => ({
      pair,
      reason: incompatibility(pair, side === 2 ? first : null, groupPhase),
      meetings: side === 2 ? previousMeetings(matches, tournamentId, first, pair) : [],
    }))
    .filter(
      ({ pair }) =>
        searchPair(pair, query) &&
        (!categoryFilter || String(pair.categoria_id) === categoryFilter) &&
        (!groupFilter || pair.grupo === groupFilter)
    )
    .sort(
      (a, b) =>
        Number(Boolean(a.reason)) - Number(Boolean(b.reason)) ||
        Number(Boolean(a.meetings.length)) - Number(Boolean(b.meetings.length)) ||
        a.pair.nombre.localeCompare(b.pair.nombre, 'es')
    )
  const visible = candidates.filter((c) => showUnavailable || !c.reason)
  const meetings = previousMeetings(matches, tournamentId, first, second)
  const ready = first && second && !incompatibility(second, first, groupPhase)
  useEffect(() => {
    setBrowsing(!ready)
  }, [Boolean(ready)])
  const categories = [
    ...new Map(choices.map((p) => [String(p.categoria_id), p.categoria_nombre])).entries(),
  ]
  const groups = [
    ...new Set(
      choices
        .filter((p) => !categoryFilter || String(p.categoria_id) === categoryFilter)
        .map((p) => p.grupo)
        .filter(Boolean)
    ),
  ]
  const select = (pair) => {
    if (side === 1) {
      onFirst(pair)
      setSide(2)
    } else {
      onSecond(pair)
      setBrowsing(false)
    }
    setQuery('')
    setCategoryFilter('')
    setGroupFilter('')
    setShowUnavailable(false)
    if (side === 1) requestAnimationFrame(() => input.current?.focus({ preventScroll: true }))
  }
  return (
    <section className='match-planner sm:col-span-2' aria-label='Asistente de encuentros'>
      <header className='match-planner__header'>
        <div>
          <span className='match-planner__eyebrow'>CREAR ENCUENTRO</span>
          <h3>¿Quiénes van a jugar?</h3>
          <p>Busca a cualquier integrante. Nosotros ubicamos su categoría y grupo.</p>
        </div>
        <Users size={24} aria-hidden='true' />
      </header>
      <div className='match-planner__steps' aria-label='Progreso del encuentro'>
        <span className={first ? 'is-done' : ''}>
          {first ? <Check size={14} /> : '1'} Primera pareja
        </span>
        <span className={ready ? 'is-done' : ''}>{ready ? <Check size={14} /> : '2'} Rival</span>
        <span>3 Programación</span>
      </div>
      <div className='match-planner__versus'>
        {[
          { pair: first, n: 1 },
          { pair: second, n: 2 },
        ].map(({ pair, n }) => (
          <button
            key={n}
            type='button'
            disabled={busy || (n === 2 && !first)}
            className={`match-planner__slot ${side === n ? 'is-active' : ''}`}
            aria-pressed={side === n}
            onClick={() => {
              setSide(n)
              setQuery('')
              setCategoryFilter('')
              setGroupFilter('')
              setBrowsing(true)
            }}
          >
            <span className='match-planner__eyebrow'>{n === 1 ? 'PRIMERA PAREJA' : 'RIVAL'}</span>
            <span className='match-planner__pair-avatars' aria-hidden='true'>
              {[pair?.jugador1, pair?.jugador2].map((player, i) => (
                <span key={i}>
                  {player
                    ? `${(player.nombre || '').slice(0, 1)}${(player.apellido || '').slice(0, 1)}`
                    : pair?.nombre?.split('/')[i]?.trim().slice(0, 1) || '+'}
                </span>
              ))}
            </span>
            <strong>
              {pair?.nombre || (n === 1 ? 'Seleccionar pareja' : 'Seleccionar rival')}
            </strong>
            <small>
              {pair
                ? `${pair.categoria_nombre} · ${pair.grupo || 'Sin grupo'}`
                : n === 1
                  ? 'Todas las inscripciones'
                  : groupPhase
                    ? 'De la misma categoría y grupo'
                    : 'De la misma categoría'}
            </small>
            {pair && <span className='match-planner__change'>Cambiar</span>}
          </button>
        ))}
        <span className='match-planner__vs' aria-hidden='true'>
          VS
        </span>
      </div>
      {ready && (
        <div role='status' className='match-planner__ready'>
          <Check size={18} />
          <span>
            <strong>Encuentro seleccionado</strong>
            <small>
              {first.categoria_nombre} ·{' '}
              {groupPhase ? group : 'Cruce entre grupos permitido en esta fase'}
            </small>
          </span>
          <button
            type='button'
            className='btn-secondary'
            onClick={() =>
              onContinue ? onContinue() : document.querySelector('[name="fecha_inicio"]')?.focus()
            }
          >
            Programar <ArrowRight size={14} />
          </button>
        </div>
      )}
      {meetings.length > 0 && (
        <p role='status' className='match-planner__warning'>
          <AlertTriangle size={17} /> Estas parejas ya tienen {meetings.length} encuentro(s) en este
          torneo. Revisa si necesitas crear otro.
        </p>
      )}
      {(!ready || browsing) && (
        <div className='match-planner__body'>
          <label className='form-label' htmlFor='quick-pair-search'>
            {side === 1 ? 'Encuentra la primera pareja' : 'Busca un rival compatible'}
          </label>
          <div className='match-planner__search'>
            <Search size={18} />
            <input
              ref={input}
              id='quick-pair-search'
              value={query}
              disabled={busy || loading}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Nombre, apellido o pareja…'
            />
          </div>
          <div className='match-planner__filters'>
            <select
              aria-label='Filtrar parejas por categoría'
              className='form-input'
              value={categoryFilter}
              disabled={busy}
              onChange={(e) => {
                setCategoryFilter(e.target.value)
                setGroupFilter('')
              }}
            >
              <option value=''>Todas las categorías</option>
              {categories.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            {useGroups && (
              <select
                aria-label='Filtrar parejas por grupo'
                className='form-input'
                value={groupFilter}
                disabled={busy}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option value=''>Todos los grupos</option>
                {groups.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            )}
          </div>
          <div className='match-planner__results-title'>
            <span>
              {side === 2 ? 'Rivales' : 'Parejas'} · {visible.length}
            </span>
            <label>
              <input
                type='checkbox'
                checked={showUnavailable}
                onChange={(e) => setShowUnavailable(e.target.checked)}
              />{' '}
              Ver no compatibles
            </label>
          </div>
          {error ? (
            <p role='alert' className='form-error'>
              {error}{' '}
              <button type='button' onClick={onRetry} className='underline'>
                Reintentar
              </button>
            </p>
          ) : loading ? (
            <p role='status'>Consultando inscripciones y grupos…</p>
          ) : (
            <div className='match-planner__results' aria-label='Parejas encontradas'>
              {visible.slice(0, limit).map(({ pair, reason, meetings: history }) => (
                <button
                  type='button'
                  key={choiceKey(pair)}
                  disabled={busy || Boolean(reason)}
                  onClick={() => select(pair)}
                  className='match-planner__result'
                >
                  <span className='match-planner__avatar' aria-hidden='true'>
                    {(pair.jugador1?.apellido || pair.nombre || '?').slice(0, 1)}
                    {(pair.jugador2?.apellido || '').slice(0, 1)}
                  </span>
                  <span className='match-planner__person'>
                    <strong>{pair.nombre}</strong>
                    <small>{pairText({ ...pair, nombre: '' })}</small>
                    <span className='match-planner__tags'>
                      <span>{pair.categoria_nombre}</span>
                      <span>{pair.grupo || 'Sin grupo asignado'}</span>
                    </span>
                    {reason && <small>{reason}</small>}
                    {history.length > 0 && (
                      <small className='match-planner__history'>
                        {history.length} cruce(s) existente(s) ·{' '}
                        {history.some((m) => m.estado === 'finalizado')
                          ? 'Incluye finalizados'
                          : 'Pendiente / en curso'}
                      </small>
                    )}
                  </span>
                  {!reason && <ArrowRight size={16} aria-hidden='true' />}
                </button>
              ))}
              {!visible.length && (
                <div className='match-planner__empty'>
                  <Users size={24} />
                  <strong>
                    {query
                      ? 'Sin coincidencias'
                      : side === 2
                        ? 'No hay rivales compatibles disponibles'
                        : 'No hay parejas disponibles'}
                  </strong>
                  <p>
                    {side === 2
                      ? 'Revisa los filtros o consulta los no compatibles para conocer el motivo.'
                      : 'Revisa los filtros y las asignaciones de grupos del torneo.'}
                  </p>
                </div>
              )}
              {visible.length > limit && (
                <button
                  type='button'
                  className='btn-secondary w-full'
                  onClick={() => setLimit((n) => n + 12)}
                >
                  Mostrar más ({visible.length - limit})
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <footer className='match-planner__footer'>
        <button type='button' disabled={busy} onClick={onManual}>
          <SlidersHorizontal size={15} /> Selección manual / ganador de otro partido
        </button>
        {(firstId || secondId) && (
          <button type='button' disabled={busy} onClick={onClear}>
            Limpiar selección
          </button>
        )}
      </footer>
    </section>
  )
}
