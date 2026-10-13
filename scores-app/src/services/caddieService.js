import api from './api'
export const caddieService = {
  list: () => api.get('/caddies'),
  save: (id, body) => id ? api.put(`/caddies/${id}`, body) : api.post('/caddies', body),
  report: (caddieId, page = 1) => api.get('/caddies/valoraciones', { params: { caddie_id: caddieId || undefined, page } }),
  status: id => api.get(`/caddies/partidos/${id}`),
  assign: (id, body) => api.put(`/caddies/partidos/${id}/asignacion`, body),
  rate: (id, body) => api.put(`/caddies/partidos/${id}/valoracion`, body),
}
