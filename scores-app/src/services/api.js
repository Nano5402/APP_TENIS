import axios from 'axios'
import { showAlert } from '../utils/confirm'
import useAuthStore from '../store/useAuthStore'
import { saveSessionRecovery } from '../utils/sessionRecovery'

// Elimina el almacenamiento usado por la versión anterior, que guardaba el JWT.
localStorage.removeItem('auth-storage')

export const resolveApiUrl = (configuredUrl = import.meta.env.VITE_API_URL) => {
  const configured = configuredUrl || (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api')
  if (configured.startsWith('/')) {
    return configured
  }
  // En el navegador, si la URL configurada apunta a localhost pero la app se abrió
  // desde una IP o dominio distinto (ej: probando desde un celular en http://192.168.1.15:5173),
  // sustituimos localhost por la IP/host actual del navegador para que las peticiones lleguen a la API.
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location?.hostname) {
    const { hostname, protocol } = window.location
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      try {
        const url = new URL(configured)
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          return `${protocol}//${hostname}:${url.port || '3001'}${url.pathname}`
        }
      } catch {}
    }
  }
  return configured
}

const api = axios.create({
  baseURL: resolveApiUrl(),
  timeout: 20000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      // Keep the account-scoped judge outbox intact. Never retain credentials.
      try {
        saveSessionRecovery(sessionStorage, useAuthStore.getState().user, window.location.pathname)
      } catch {}
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    const payload = error.response?.data || error
    if (payload && typeof payload === 'object' && error.response?.status) {
      payload.status = error.response.status
    }
    if (
      error.config?.method?.toLowerCase() === 'delete' &&
      !error.config?.suppressDeleteAlert &&
      Number(error.response?.status) >= 400
    ) {
      void showAlert({
        title: 'No se puede eliminar',
        message: payload?.message || 'El registro tiene relaciones que impiden eliminarlo.',
        danger: true,
      })
    }
    return Promise.reject(payload)
  }
)

export default api
