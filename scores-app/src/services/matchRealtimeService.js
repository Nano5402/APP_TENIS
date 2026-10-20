import api, { resolveApiUrl } from './api'

const listeners = new Set()
let source = null
let timer = null
let version = null
let pending = false
let generation = 0

const streamUrl = () => {
  const base = resolveApiUrl()
  return `${base.replace(/\/$/, '')}/partidos/stream`
}

const notify = (event) => {
  for (const listener of listeners) {
    try { listener(event) } catch (error) { console.error('No se pudo actualizar una vista del partido', error) }
  }
}

const poll = async () => {
  if (!listeners.size || pending || document.visibilityState === 'hidden' || navigator.onLine === false) return
  pending = true
  const current = generation
  try {
    const response = await api.get('/partidos/live-version')
    const next = response.data?.version ?? response.version
    if (current !== generation || next === undefined) return
    if (version !== null && version !== next) notify({ action: 'updated', matchId: null })
    version = next
  } catch { /* The next interval retries without interrupting scoring. */ }
  finally { if (current === generation) pending = false }
}

const connect = () => {
  if (!timer && typeof window !== 'undefined') {
    timer = setInterval(poll, 5000)
    document.addEventListener('visibilitychange', poll)
    window.addEventListener('online', poll)
  }
  if (source || typeof window === 'undefined' || !('EventSource' in window)) return
  source = new EventSource(streamUrl(), { withCredentials: true })
  source.addEventListener('matches.changed', (message) => {
    try {
      notify(JSON.parse(message.data))
    } catch {
      notify({ action: 'updated', matchId: null })
    }
  })
}

const disconnect = () => {
  if (listeners.size) return
  source?.close()
  source = null
  clearInterval(timer)
  timer = null
  generation++
  pending = false
  version = null
  document.removeEventListener('visibilitychange', poll)
  window.removeEventListener('online', poll)
}

export const matchRealtimeService = {
  subscribe(listener) {
    listeners.add(listener)
    connect()
    return () => {
      listeners.delete(listener)
      disconnect()
    }
  },
}
