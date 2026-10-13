import { useEffect, useState } from 'react'
import { playerService } from '../../services/playerService'
import { categoriaService } from '../../services/categoriaService'

export default function MemberPlayerFields({ value, onChange, onSelectPlayer, nombre, apellido }) {
  const [players, setPlayers] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    Promise.all([playerService.getAdminAll({ activo: 'true' }), categoriaService.getAll()])
      .then(([p, c]) => { if (active) { setPlayers(p.data || []); setCategories(c.data || []) } })
      .catch(() => { if (active) setError('No se pudo cargar la lista. Reintenta antes de vincular o crear un jugador.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])
  const available = players.filter((p) => p.activo && !p.usuario)
  const filtered = available.filter((p) => `${p.nombre} ${p.apellido} ${p.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || String(p.id) === String(value.id))
  const selected = available.find((p) => String(p.id) === String(value.id))
  return <fieldset className='min-w-0 rounded-xl border p-4 space-y-3' style={{ borderColor: 'var(--border-color)' }}>
    <legend className='px-2 font-semibold text-sm'>Ficha de jugador de esta cuenta</legend>
    <label className='form-group'><span className='form-label'>Vinculación de jugador</span>
      <select className='form-input' value={value.modo} onChange={(e) => onChange({ modo: e.target.value, deporte: 'tenis', categoria_id: '' })}>
        <option value='ninguno'>Sin jugador por ahora</option>
        <option value='existente'>Seleccionar jugador existente</option>
        <option value='nuevo'>Crear jugador con esta cuenta</option>
      </select>
    </label>
    {value.modo !== 'ninguno' && <>
      {loading && <p className='text-sm' role='status'>Cargando jugadores y categorías…</p>}
      {error && <p role='alert' className='text-sm text-red-500'>{error} <button type='button' className='underline' onClick={() => setRetry((n) => n + 1)}>Reintentar</button></p>}
      {value.modo === 'existente' ? <>
        <label className='form-group'><span className='form-label'>Buscar jugador por nombre o ID</span><input className='form-input' value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label className='form-group'><span className='form-label'>Jugador disponible</span><select className='form-input' required value={value.id || ''} disabled={loading || !!error} onChange={(e) => {
          onChange({ ...value, id: e.target.value })
          const player = available.find((p) => String(p.id) === e.target.value)
          if (player) onSelectPlayer(player)
        }}><option value=''>Selecciona un jugador</option>{filtered.map((p) => <option key={p.id} value={p.id}>#{p.id} · {p.nombre} {p.apellido} · {p.deporte}</option>)}</select></label>
        <p className='text-xs' style={{ color: 'var(--text-muted)' }}>Jugadores activos sin cuenta vinculada.</p>
        {selected && <p className='text-sm font-medium'>Vincular: {selected.nombre} {selected.apellido} · #{selected.id}</p>}
      </> : <>
        <p className='text-sm'>Nuevo jugador: <strong>{nombre || 'Nombre'} {apellido || 'Apellido'}</strong>. Se usarán los nombres escritos arriba.</p>
        <div className='grid sm:grid-cols-2 gap-3'>
          <label className='form-group'><span className='form-label'>Deporte del jugador</span><select className='form-input' value={value.deporte} onChange={(e) => onChange({ ...value, deporte: e.target.value, categoria_id: '' })}><option value='tenis'>Tenis</option><option value='padel'>Pádel</option><option value='ambos'>Ambos</option></select></label>
          <label className='form-group'><span className='form-label'>Categoría del jugador (opcional)</span><select className='form-input' value={value.categoria_id || ''} disabled={loading || !!error} onChange={(e) => onChange({ ...value, categoria_id: e.target.value })}><option value=''>Por definir</option>{categories.filter((c) => value.deporte === 'ambos' || [value.deporte, 'ambos'].includes(c.deporte)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        </div>
        <p className='text-xs' style={{ color: 'var(--text-muted)' }}>Si el jugador ya existe, selecciónalo para conservar sus partidos y estadísticas.</p>
      </>}
    </>}
  </fieldset>
}
