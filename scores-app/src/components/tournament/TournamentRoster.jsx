import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tournamentService } from '../../services/tournamentService'
import { categoriaService } from '../../services/categoriaService'
import ParticipantAvatar from '../ui/ParticipantAvatar'
import { confirm } from '../../utils/confirm'

export default function TournamentRoster({
  tournament,
  data,
  admin,
  remove,
  removing,
  onDirtyChange,
}) {
  const [groups, setGroups] = useState([]),
    [categories, setCategories] = useState([]),
    [issues, setIssues] = useState([])
  const [version, setVersion] = useState('')
  const [filter, setFilter] = useState(''),
    [search, setSearch] = useState(''),
    [dirty, setDirty] = useState(false)
  const [groupFilter, setGroupFilter] = useState('')
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [newCat, setNewCat] = useState(''),
    [prefixMode, setPrefixMode] = useState('GRUPO'),
    [customPrefix, setCustomPrefix] = useState(''),
    [numbering, setNumbering] = useState('numbers'),
    [ordinal, setOrdinal] = useState('1')
  const [savedCategories, setSavedCategories] = useState({})
  const [selectedGroups, setSelectedGroups] = useState([])
  const groupKey = (g) => `${g.categoria_id}:${g.nombre}`
  const removeSelectedGroups = async () => {
    const visible = groups.filter(
      (g) => (!filter || String(g.categoria_id) === filter) && selectedGroups.includes(groupKey(g))
    )
    if (!visible.length || busy) return
    if (
      !(await confirm({
        title: 'Quitar grupos seleccionados',
        message: `Se quitarán ${visible.length} grupos. Sus parejas seguirán inscritas y quedarán sin grupo. No se eliminarán jugadores ni partidos. Al guardar se comprobará que no se invaliden cruces existentes.`,
        confirmLabel: 'Quitar grupos',
        danger: true,
      }))
    )
      return
    const keys = new Set(visible.map(groupKey))
    setGroups((old) => old.filter((g) => !keys.has(groupKey(g))))
    setSelectedGroups([])
    setDirty(true)
  }
  const letters = (n) => {
    let label = ''
    for (; n > 0; n = Math.floor((n - 1) / 26))
      label = String.fromCharCode(65 + ((n - 1) % 26)) + label
    return label
  }
  const prefix =
    prefixMode === 'GRUPO' ? 'GRUPO' : customPrefix.trim().replace(/\s+/g, ' ').toUpperCase()
  const newName = prefix + ' ' + (numbering === 'numbers' ? ordinal : letters(Number(ordinal)))
  const validPrefix = /^\p{L}[\p{L} -]{0,11}$/u.test(prefix)
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  const grouped = tournament.sistema === 'grupos_eliminacion'
  useEffect(() => {
    let active = true
    Promise.all([
      grouped
        ? tournamentService.getGroups(tournament.id)
        : Promise.resolve({ data: { grupos: [], incidencias: [] } }),
      categoriaService.getAll(),
    ])
      .then(([g, c]) => {
        if (active) {
          setGroups(g.data.grupos)
          setSavedCategories(
            Object.fromEntries(
              (g.data.parejas || []).map((p) => [p.equipo_id, Number(p.categoria_id)])
            )
          )
          setVersion(g.data.version)
          setIssues(g.data.incidencias)
          setCategories(c.data.filter((x) => [tournament.deporte, 'ambos'].includes(x.deporte)))
          setFilter(
            String(g.data.grupos[0]?.categoria_id || data.categorias[0]?.categoria_id || '')
          )
          setBusy(false)
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message || 'No se pudo cargar la distribución')
          setBusy(false)
        }
      })
    return () => {
      active = false
    }
  }, [tournament.id, grouped, tournament.deporte])
  useEffect(() => {
    if (!dirty) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const teams = data.categorias.flatMap((c) => c.parejas)
  const catName = (id) =>
    categories.find((c) => Number(c.id) === Number(id))?.nombre || 'Sin categoría'
  const assigned = new Map(groups.flatMap((g, i) => g.equipo_ids.map((id) => [Number(id), i])))
  const matches = (p) =>
    `${p.nombre} ${p.jugador1?.nombre || ''} ${p.jugador1?.apellido || ''} ${p.jugador2?.nombre || ''} ${p.jugador2?.apellido || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  const categoryFor = (p) => savedCategories[p.equipo_id] ?? Number(p.categoria_id)
  const move = (id, value) => {
    const team = teams.find((p) => Number(p.equipo_id) === Number(id))
    if (
      value !== '' &&
      (!team || Number(groups[Number(value)]?.categoria_id) !== categoryFor(team))
    ) {
      setError('Selecciona un grupo de la categoría de esta pareja.')
      return
    }
    setGroups((old) =>
      old.map((g, i) => ({
        ...g,
        equipo_ids: [
          ...g.equipo_ids.filter((e) => Number(e) !== Number(id)),
          ...(String(i) === value ? [Number(id)] : []),
        ],
      }))
    )
    setDirty(true)
  }
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await tournamentService.saveGroups(tournament.id, groups, version)
      setGroups(r.data.grupos)
      setSavedCategories(
        Object.fromEntries((r.data.parejas || []).map((p) => [p.equipo_id, Number(p.categoria_id)]))
      )
      setVersion(r.data.version)
      setIssues(r.data.incidencias)
      setDirty(false)
    } catch (e) {
      setError(e.message || 'No se guardó la distribución')
    } finally {
      setBusy(false)
    }
  }
  const importPlan = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > 250000) throw Error('El archivo es demasiado grande')
      const plan = JSON.parse(await file.text())
      if (
        Number(plan.torneo?.id) !== Number(tournament.id) ||
        plan.torneo?.nombre !== tournament.nombre
      )
        throw Error('La propuesta corresponde a otro torneo')
      if (groups.length)
        throw Error(
          'Ya hay grupos. Edita la distribución actual para no reemplazarla por una propuesta anterior.'
        )
      if (!Array.isArray(plan.categorias)) throw Error('Formato de propuesta inválido')
      const imported = plan.categorias.flatMap((c) =>
        c.grupos.map((members, index) => ({
          categoria_id: Number(c.categoria_id),
          nombre: `Grupo ${index + 1}`,
          equipo_ids: members
            .filter((id) => id !== null && teams.some((t) => Number(t.equipo_id) === Number(id)))
            .map(Number),
        }))
      )
      if (imported.length > 200) throw Error('Demasiados grupos')
      setGroups(imported)
      setDirty(true)
      setError(
        'Propuesta cargada, todavía sin guardar. Revisa las parejas y las inferencias del archivo; las no inscritas quedaron fuera.'
      )
    } catch (e) {
      setError(e.message || 'No se pudo leer el archivo')
    }
  }
  const row = (p) => (
    <article key={p.equipo_id} className='py-3 border-t border-[var(--border-color)] space-y-2'>
      <div className='flex gap-3 items-center min-w-0'>
        <ParticipantAvatar team={p} />
        <div className='min-w-0 flex-1'>
          <Link to={`/team/${p.equipo_id}`} className='font-semibold text-sm break-words'>
            {p.nombre}
          </Link>
          <p className='text-xs text-[var(--text-muted)]'>
            {[p.jugador1, p.jugador2]
              .filter(Boolean)
              .map((j) => `${j.nombre} ${j.apellido || ''}`)
              .join(' · ')}
          </p>
        </div>
      </div>
      {admin && grouped && (
        <label className='block text-xs text-[var(--text-secondary)]'>
          Asignación en este torneo
          <select
            aria-label={`Grupo de ${p.nombre}`}
            className='form-input mt-1 text-sm'
            disabled={busy}
            value={
              assigned.has(Number(p.equipo_id)) ? String(assigned.get(Number(p.equipo_id))) : ''
            }
            onChange={(e) => move(p.equipo_id, e.target.value)}
          >
            <option value=''>Sin grupo asignado</option>
            {groups
              .map((g, i) => ({ g, i }))
              .filter(({ g }) => Number(g.categoria_id) === categoryFor(p))
              .map(({ g, i }) => (
                <option key={i} value={i}>
                  {catName(g.categoria_id)} · {g.nombre}
                </option>
              ))}
          </select>
        </label>
      )}
      {admin && (
        <button
          className='btn-ghost text-xs min-h-9'
          disabled={removing || dirty || busy}
          onClick={() => remove(p)}
        >
          Retirar del torneo
        </button>
      )}
    </article>
  )
  return (
    <div className='space-y-4 min-w-0'>
      <div className='card p-4 space-y-3'>
        <h2 className='font-bold'>Parejas y grupos</h2>
        <p className='text-sm text-[var(--text-secondary)]'>
          {teams.length} inscritas · {groups.length} grupos ·{' '}
          {teams.filter((p) => !assigned.has(Number(p.equipo_id))).length} sin asignar
        </p>
        <div className='grid gap-2 sm:grid-cols-2'>
          <input
            aria-label='Buscar pareja inscrita'
            className='form-input'
            placeholder='Buscar pareja o jugador…'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label='Categoría de inscritos'
            className='form-input'
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setGroupFilter('')
            }}
          >
            <option value=''>Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {grouped && (
            <select
              aria-label='Filtrar grupos inscritos'
              className='form-input'
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value=''>Todos los grupos de esta categoría</option>
              {groups
                .filter((g) => !filter || String(g.categoria_id) === filter)
                .map((g) => (
                  <option
                    key={`${g.categoria_id}:${g.nombre}`}
                    value={`${g.categoria_id}:${g.nombre}`}
                  >
                    {!filter ? catName(g.categoria_id) + ' · ' : ''}
                    {g.nombre}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>
      {error && (
        <p role='alert' className='card p-3 text-red-600'>
          {error}
        </p>
      )}
      {admin && grouped && (
        <details className='card p-4'>
          <summary className='font-semibold cursor-pointer'>Crear un grupo</summary>
          {!groups.length && (
            <label className='block text-xs mt-3'>
              Opcional: cargar propuesta JSON para revisar antes de guardar
              <input
                type='file'
                accept='.json,application/json'
                className='block w-full mt-2'
                disabled={busy}
                onChange={importPlan}
              />
            </label>
          )}
          <p className='text-xs my-3'>
            La categoría pertenece a este torneo; no cambia la ficha general del jugador o pareja.
            No se generan partidos.
          </p>
          <div className='grid gap-2 sm:grid-cols-3'>
            <select
              aria-label='Categoría del nuevo grupo'
              className='form-input'
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            >
              <option value=''>Categoría…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select
              aria-label='Prefijo del grupo'
              className='form-input'
              value={prefixMode}
              onChange={(e) => setPrefixMode(e.target.value)}
            >
              <option value='GRUPO'>GRUPO</option>
              <option value='custom'>Otra palabra…</option>
            </select>
            {prefixMode === 'custom' && (
              <label className='text-xs'>
                Prefijo personalizado (solo letras)
                <input
                  aria-label='Prefijo personalizado'
                  className='form-input'
                  maxLength={12}
                  value={customPrefix}
                  onChange={(e) => setCustomPrefix(e.target.value)}
                  placeholder='Ej.: ZONA'
                />
              </label>
            )}
            <select
              aria-label='Sistema de numeración'
              className='form-input'
              value={numbering}
              onChange={(e) => setNumbering(e.target.value)}
            >
              <option value='numbers'>Números: 1, 2, 3…</option>
              <option value='letters'>Letras: A, B, C…</option>
            </select>
            <select
              aria-label='Identificador del grupo'
              className='form-input'
              value={ordinal}
              onChange={(e) => setOrdinal(e.target.value)}
            >
              {Array.from({ length: 200 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {numbering === 'numbers' ? n : letters(n)}
                </option>
              ))}
            </select>
            <p className='text-sm self-center' aria-live='polite'>
              Nombre: <strong>{validPrefix ? newName : 'Introduce un prefijo válido'}</strong>
            </p>
            <button
              className='btn-secondary'
              disabled={busy || !newCat || !validPrefix || newName.length > 20}
              onClick={() => {
                const name = newName.trim().replace(/\s+/g, ' ')
                if (
                  groups.some(
                    (g) =>
                      Number(g.categoria_id) === Number(newCat) &&
                      g.nombre.toLowerCase() === name.toLowerCase()
                  )
                ) {
                  setError('Ese grupo ya existe')
                  return
                }
                setGroups([
                  ...groups,
                  { categoria_id: Number(newCat), nombre: name, equipo_ids: [] },
                ])
                setDirty(true)
                setOrdinal(String(Math.min(200, Number(ordinal) + 1)))
                setError('')
              }}
            >
              Añadir grupo
            </button>
          </div>
        </details>
      )}
      {dirty && (
        <div className='sticky top-16 z-20 card p-3 flex items-center gap-3 shadow-lg'>
          <span className='text-xs flex-1'>
            Distribución sin guardar. Guarda antes de cambiar de sección.
          </span>
          <button className='btn-primary px-3 py-2 text-sm' disabled={busy} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar grupos'}
          </button>
        </div>
      )}
      {admin && issues.length > 0 && (
        <details className='card p-4 border border-amber-500/40'>
          <summary className='font-semibold'>{issues.length} partidos por revisar</summary>
          <p className='text-xs my-2'>
            No cuentan en las posiciones de grupo hasta corregir categoría, grupo o participantes.
          </p>
          {issues.map((i) => (
            <p key={i.partido_id} className='text-sm py-1'>
              <Link
                to={admin ? `/admin/partidos?partido=${i.partido_id}` : `/match/${i.partido_id}`}
              >
                Partido #{i.partido_id}
              </Link>{' '}
              · {i.message}
            </p>
          ))}
        </details>
      )}
      <div className='grid gap-4 lg:grid-cols-2'>
        {admin && grouped && (
          <div className='flex flex-wrap gap-2 lg:col-span-2'>
            <button
              className='btn-ghost text-xs'
              disabled={busy}
              onClick={() =>
                setSelectedGroups(
                  groups.filter((g) => !filter || String(g.categoria_id) === filter).map(groupKey)
                )
              }
            >
              Seleccionar grupos de esta categoría
            </button>
            <button
              className='btn-ghost text-xs'
              disabled={busy}
              onClick={() => setSelectedGroups([])}
            >
              Limpiar selección
            </button>
            <button
              className='btn-secondary text-xs'
              disabled={busy || !selectedGroups.length}
              onClick={removeSelectedGroups}
            >
              Quitar grupos seleccionados
            </button>
          </div>
        )}
        {groups
          .map((g, i) => ({ g, i }))
          .filter(
            ({ g }) =>
              (!filter || String(g.categoria_id) === filter) &&
              (!groupFilter || `${g.categoria_id}:${g.nombre}` === groupFilter)
          )
          .map(({ g, i }) => (
            <section className='card p-4 min-w-0' key={`${g.categoria_id}:${g.nombre}`}>
              <header className='flex justify-between gap-2 items-start mb-2'>
                {admin && grouped && (
                  <input
                    type='checkbox'
                    className='w-5 h-5 shrink-0'
                    aria-label={`Seleccionar ${catName(g.categoria_id)} ${g.nombre}`}
                    disabled={busy}
                    checked={selectedGroups.includes(groupKey(g))}
                    onChange={(e) =>
                      setSelectedGroups((old) =>
                        e.target.checked
                          ? [...old, groupKey(g)]
                          : old.filter((k) => k !== groupKey(g))
                      )
                    }
                  />
                )}
                <div>
                  <p className='text-xs text-[var(--color-brand)]'>{catName(g.categoria_id)}</p>
                  <h3 className='font-bold'>{g.nombre}</h3>
                  <p className='text-xs text-[var(--text-muted)]'>{g.equipo_ids.length} parejas</p>
                </div>
                {admin && !g.equipo_ids.length && (
                  <button
                    className='btn-ghost text-xs'
                    disabled={busy}
                    onClick={() => {
                      setGroups(groups.filter((_, j) => j !== i))
                      setDirty(true)
                    }}
                  >
                    Quitar grupo vacío
                  </button>
                )}
              </header>
              {teams
                .filter((p) => g.equipo_ids.includes(Number(p.equipo_id)) && matches(p))
                .map(row)}
              {!g.equipo_ids.length && (
                <p className='text-sm py-3 text-[var(--text-muted)]'>
                  Asigna parejas desde «Sin grupo».
                </p>
              )}
            </section>
          ))}
      </div>
      <section className='card p-4'>
        <h3 className='font-bold'>{grouped ? 'Sin grupo asignado' : 'Participantes'}</h3>
        <p className='text-xs text-[var(--text-muted)] mb-2'>
          {grouped
            ? 'Estas parejas siguen inscritas, pero aún no participan en ninguna tabla de grupo.'
            : 'Parejas inscritas por categoría.'}
        </p>
        {teams
          .filter(
            (p) =>
              !assigned.has(Number(p.equipo_id)) &&
              (!filter || String(p.categoria_id) === filter) &&
              matches(p)
          )
          .map(row)}
      </section>
    </div>
  )
}
