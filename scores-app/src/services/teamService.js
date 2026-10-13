import api from './api'

export const teamService = {
  getAll: (params = {}) => api.get('/equipos', { params }),
  getById: (id) => api.get(`/equipos/${id}`),
  create: (data) => api.post('/equipos', data),
  update: (id, data) => api.put(`/equipos/${id}`, data),
  remove: (id, options) => api.delete(`/equipos/${id}`, options),
}
