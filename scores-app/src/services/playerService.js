import api from './api'

export const playerService = {
  getAll: (params = {}) => api.get('/jugadores', { params }),
  getAdminAll: (params = {}) => api.get('/jugadores/gestion', { params }),
  getById: (id) => api.get(`/jugadores/${id}`),
  create: (data) => api.post('/jugadores', data),
  update: (id, data) => api.put(`/jugadores/${id}`, data),
  remove: (id, options) => api.delete(`/jugadores/${id}`, options),
  uploadFoto: (id, file) => {
    const data = new FormData()
    data.append('foto', file)
    return api.put(`/jugadores/${id}/foto`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  deleteFoto: (id) => api.delete(`/jugadores/${id}/foto`),
  linkUser: (id, userId) => api.put(`/jugadores/${id}/usuario`, { user_id: userId }),
  unlinkUser: (id) => api.delete(`/jugadores/${id}/usuario`),
}
