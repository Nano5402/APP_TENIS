import { useEffect, useState } from 'react'
import api from '../../services/api'

export default function MatchNoticePreference() {
  const [enabled, setEnabled] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    api.get('/notificaciones/preferencias').then(r => { if (active) { setEnabled(r.data.cambios_partidos); setError('') } })
      .catch(() => { if (active) setError('No se pudieron cargar tus preferencias.') })
    return () => { active = false }
  }, [revision])
  async function toggle() {
    setBusy(true); setError('')
    try { const r = await api.put('/notificaciones/preferencias', { cambios_partidos: !enabled }); setEnabled(r.data.cambios_partidos) }
    catch { setError('No se pudo guardar. Tu preferencia no ha cambiado.') }
    finally { setBusy(false) }
  }
  return <div className='rounded-xl border border-[var(--border-color)] p-3 space-y-2'>
    <label className='flex gap-3 items-start text-sm'><input className='mt-1' type='checkbox' checked={enabled === true} disabled={enabled === null || busy} onChange={toggle} /><span>Avisarme de cambios en mis partidos<small className='block text-[var(--text-secondary)]'>Horario, cancha, suspensión y cancelación. Requiere una ficha de jugador vinculada a tu cuenta.</small></span></label>
    {error && <p role='alert' className='text-xs text-red-600'>{error} <button className='underline' onClick={() => setRevision(n => n+1)}>Reintentar</button></p>}
  </div>
}
