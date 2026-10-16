import api from './api'

export const photoUrl = (id, version, thumbnail = false) => `${api.defaults.baseURL.replace(/\/$/, '')}/partidos/${id}/foto/imagen?v=${encodeURIComponent(version)}${thumbnail ? '&miniatura=1' : ''}`
export const getPhoto = id => api.get(`/partidos/${id}/foto`)
export const removePhoto = (id, expected) => api.delete(`/partidos/${id}/foto`, { data: { expected }, suppressDeleteAlert: true })
export const updatePhotoFraming = (id, expected, encuadre) => api.patch(`/partidos/${id}/foto/encuadre`, { expected, encuadre })
export const getPhotoStatus = id => api.get(`/partidos/${id}/foto/estado`)
export const sendPhoto = (id, item, signal) => {
  const form = new FormData()
  form.append('version', item.version)
  form.append('expected', item.expected)
  form.append('momento', item.momento)
  form.append('consentimiento', 'true')
  if (item.encuadre) form.append('encuadre', JSON.stringify(item.encuadre))
  form.append('foto', item.blob, 'partido.webp')
  return api.put(`/partidos/${id}/foto`, form, { headers: { 'Content-Type': undefined }, timeout: 60000, signal })
}

// Photos never go into localStorage. IndexedDB keeps the confirmed draft across reloads.
export async function photoDraft(key, operation = 'get', value) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('tenis-match-photos', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('pending')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('pending', operation === 'get' ? 'readonly' : 'readwrite')
      const store = tx.objectStore('pending')
      const request = operation === 'put' ? store.put(value, key) : operation === 'delete' ? store.delete(key) : store.get(key)
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('No se pudo guardar en el dispositivo'))
    })
  } finally { db.close() }
}

export async function compressPhoto(file) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Usa JPEG, PNG o WebP. Si tu cámara guarda HEIC, selecciona una versión JPEG.')
  if (file.size > 20 * 1024 * 1024) throw new Error('La imagen original no puede superar 20 MB')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    // Preserve facial detail before the server's metadata-stripping re-encode.
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.92))
    if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('No se pudo reducir la foto. Selecciona otra.')
    return blob
  } finally { bitmap.close() }
}
