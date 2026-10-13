import { useEffect, useState } from 'react'
import { playerService } from '../../services/playerService'
import { userService } from '../../services/userService'
export default function LinkPlayer({ user, onSaved }) {
  const [players, setPlayers] = useState([]), [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [loaded, setLoaded] = useState(false), [revision, setRevision] = useState(0)
  useEffect(() => {
    let active=true
    if (!user.jugador) playerService.getAdminAll({ activo: 'true' }).then(r => { if(active) { setPlayers((r.data || []).filter(p => p.activo && !p.usuario)); setLoaded(true); setError('') } }).catch(() => { if(active) setError('No se pudieron consultar los jugadores.') })
    return () => { active=false }
  }, [user.id, revision])
  async function link() {
    if (!selected || busy) return
    setBusy(true); setError('')
    try { await userService.linkPlayer(user.id, Number(selected)); onSaved() }
    catch(e) { setError(e.message || 'No se pudo vincular. Reintenta.') }
    finally { setBusy(false) }
  }
  return <section className='rounded-xl border border-[var(--border-color)] p-4 mt-4 space-y-3'>
    <h3 className='font-bold text-sm'>Actividad como jugador</h3>
    {user.jugador ? <p className='text-sm'>Ficha vinculada: {user.jugador.nombre} {user.jugador.apellido}. Conserva su rol y permisos actuales.</p> : <>
      <p className='text-xs'>Selecciona la ficha de esta misma persona. No cambia su rol ni concede permisos de juez.</p>
      <select aria-label='Ficha de jugador para vincular' className='form-input w-full' disabled={!loaded || busy} value={selected} onChange={e => setSelected(e.target.value)}><option value=''>Seleccionar jugador existente</option>{players.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellido} · #{p.id}</option>)}</select>
      <button type='button' className='btn-secondary px-4 py-2 text-sm' disabled={!selected || busy} onClick={link}>{busy ? 'Vinculando…' : 'Confirmar vinculación'}</button>
    </>}
    {error && <p role='alert' className='text-sm text-red-600'>{error} {!loaded && <button className='underline' onClick={() => setRevision(n=>n+1)}>Reintentar</button>}</p>}
  </section>
}
