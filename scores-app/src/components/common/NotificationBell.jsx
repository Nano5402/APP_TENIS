import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'
import api from '../../services/api'
import ActionDialog from './ActionDialog'
import PushSettings from './PushSettings'
import MatchNoticePreference from './MatchNoticePreference'

export default function NotificationBell() {
  const userId = useAuthStore((s) => s.user?.id)
  const official = useAuthStore((s) => ['admin','juez','juez_director'].includes(s.user?.rol))
  const [open, setOpen] = useState(false),
    [data, setData] = useState({ items: [], pendientes: 0 }),
    [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    setData({ items: [], pendientes: 0 })
    setError('')
    if (!userId) return
    let alive = true,
      pending = false
    const load = async () => {
      if (pending || document.hidden || !navigator.onLine) return
      pending = true
      try {
        const result = await api.get('/notificaciones')
        if (alive) {
          setData(result.data)
          setError('')
        }
      } catch {
        if (alive)
          setError(
            'No se pudieron actualizar las notificaciones. Se reintentará al recuperar conexión.'
          )
      } finally {
        pending = false
      }
    }
    void load()
    const timer = setInterval(load, 60000)
    document.addEventListener('visibilitychange', load)
    window.addEventListener('online', load)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', load)
      window.removeEventListener('online', load)
    }
  }, [userId, open])
  const mark = async (item) => {
    if (busy) return
    setBusy(true)
    try {
      await api.put(item ? `/notificaciones/${item.id}/leer` : '/notificaciones/leer-todas')
      setData((current) => ({
        items: current.items.map((n) => (!item || n.id === item.id ? { ...n, leido_at: true } : n)),
        pendientes: item ? Math.max(0, current.pendientes - (item.leido_at ? 0 : 1)) : 0,
      }))
      if (item && /^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(item.link)) {
        setOpen(false)
        navigate(item.link)
      }
    } catch {
      setError('No se pudo marcar como leída. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }
  if (!userId) return null
  return (
    <>
      <button
        className='btn-ghost relative p-2 shrink-0'
        aria-label={`Notificaciones${data.pendientes ? `, ${data.pendientes} sin leer` : ''}`}
        onClick={() => setOpen(true)}
      >
        <Bell size={20} />
        {data.pendientes > 0 && (
          <span className='absolute -top-1 -right-1 text-[10px] bg-[var(--color-brand)] text-white rounded-full px-1'>
            {data.pendientes > 99 ? '99+' : data.pendientes}
          </span>
        )}
      </button>
      {open && (
        <ActionDialog title='Notificaciones' onClose={() => setOpen(false)} busy={busy}>
          {official && <PushSettings />}
          <MatchNoticePreference key={userId} />
          <p className='text-sm text-[var(--text-secondary)]'>
            Avisos personales y de soporte · últimas 50 notificaciones.
          </p>
          {error && (
            <p role='alert' className='text-red-600'>
              {error}
            </p>
          )}
          {data.pendientes > 0 && (
            <button disabled={busy} className='text-sm underline' onClick={() => mark(null)}>
              Marcar todas como leídas
            </button>
          )}
          {data.items.length === 0 && <p>Aún no tienes notificaciones.</p>}
          {data.items.map((n) => (
            <button
              disabled={busy}
              key={n.id}
              onClick={() => mark(n)}
              className={`block w-full text-left rounded-xl p-3 space-y-1 ${n.leido_at ? '' : 'bg-[var(--bg-hover)]'}`}
            >
              <strong className='block'>
                {!n.leido_at && '• '}
                {n.titulo}
              </strong>
              <span className='block text-sm break-words'>{n.mensaje}</span>
            </button>
          ))}
        </ActionDialog>
      )}
    </>
  )
}
