import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'
import { resolveApiUrl } from '../../services/api'

const preferenceKey = 'traffic-preference-v1', identityKey = 'traffic-identity-v1', sessionKey = 'traffic-session-v1'
const allowed = /^(\/|\/(live|tennis|padel|sponsors|anuncios|ayuda|pantalla)|\/(match|torneo|player|team)\/[1-9]\d{0,9})$/
const duration = 180 * 86400000
function preference() {
  try { const p = JSON.parse(localStorage.getItem(preferenceKey)); return p?.accept !== false } catch { return false }
}
function source() {
  try {
    const host = new URL(document.referrer).hostname
    if (host === location.hostname) return 'internal'
    if (/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(host)) return 'search'
    if (/(^|\.)(facebook\.com|instagram\.com|t\.co|x\.com|tiktok\.com|linkedin\.com|youtube\.com)$/.test(host)) return 'social'
    return 'referral'
  } catch { return 'direct' }
}
function context() {
  const now = Date.now()
  let visitor = JSON.parse(localStorage.getItem(identityKey) || 'null')
  if (!visitor || now - visitor.at >= duration) { visitor = { id: crypto.randomUUID(), at: now }; localStorage.setItem(identityKey, JSON.stringify(visitor)) }
  let session = JSON.parse(localStorage.getItem(sessionKey) || 'null')
  if (!session || now - session.at >= 1800000) session = { id: crypto.randomUUID(), source: source() }
  session.at = now; localStorage.setItem(sessionKey, JSON.stringify(session))
  return { visitor: visitor.id, session: session.id, source: session.source }
}
export default function TrafficMeasurement() {
  const { pathname } = useLocation()
  const role = useAuthStore(s => s.user?.rol)
  const [choice, setChoice] = useState(preference)
  const last = useRef(null)
  const optOut = navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true
  const eligible = allowed.test(pathname) && !['admin', 'juez', 'juez_director'].includes(role)
  useEffect(() => {
    const update = () => setChoice(preference())
    window.addEventListener('storage', update)
    return () => window.removeEventListener('storage', update)
  }, [])
  useEffect(() => {
    if (!choice || optOut || !eligible) { last.current = null; return }
    let timer
    const send = () => {
      clearTimeout(timer)
      if (document.visibilityState !== 'visible') return
      timer = setTimeout(() => {
        if (last.current === pathname || preference() !== true) return
        try {
          const ids = context()
          last.current = pathname
          const device = /iPad|Tablet/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? 'tablet' : /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
          const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 4000)
          // Deliberately bypass authentication/error interceptors: measurement must never log users out.
          fetch(`${resolveApiUrl().replace(/\/$/, '')}/analytics/view`, { method: 'POST', credentials: 'include', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ids, id: crypto.randomUUID(), path: pathname, device, measurement: true }) }).catch(() => {}).finally(() => clearTimeout(timeout))
        } catch { /* Restricted storage or crypto: no measurement, navigation continues. */ }
      }, 400)
    }
    // Interaction only extends a session; it never submits another page view.
    let touched = 0
    const touch = () => {
      if (Date.now() - touched < 60000 || document.visibilityState !== 'visible') return
      touched = Date.now()
      try {
        const s = JSON.parse(localStorage.getItem(sessionKey) || 'null')
        if (s && touched - s.at < 1800000) localStorage.setItem(sessionKey, JSON.stringify({ ...s, at: touched }))
      } catch {}
    }
    send(); document.addEventListener('visibilitychange', send)
    window.addEventListener('pointerdown', touch, { passive: true }); window.addEventListener('keydown', touch)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', send); window.removeEventListener('pointerdown', touch); window.removeEventListener('keydown', touch) }
  }, [pathname, choice, eligible, optOut])
  return null
}
