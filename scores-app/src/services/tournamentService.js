import api from './api'

export const tournamentService = {
  setArchived: (id, archivado, esperado) => api.put(`/torneos/${id}/archivo`, { archivado, esperado }),
  getRetirements: (id) => api.get(`/torneos/${id}/retiros`),
  getRetirementParticipants: (id) => api.get(`/torneos/${id}/retiros/participantes`),
  getRetirementAudit: (id) => api.get(`/torneos/${id}/retiros/auditoria`),
  setRetirement: (id, data) => api.put(`/torneos/${id}/retiros`, data),
  getGroups: (id) => api.get(`/torneos/${id}/grupos`),
  saveGroups: (id, grupos, version) => api.put(`/torneos/${id}/grupos`, { grupos, version }),
  getStandings: (id, management = false) => api.get(`/torneos/${id}/posiciones${management ? '/gestion' : ''}`),
  getInscripciones: (id) => api.get(`/torneos/${id}/inscripciones`),
  inscribirEquiposBulk: (id, equipoIds) =>
    api.post(`/torneos/${id}/inscripciones`, { equipo_ids: equipoIds }),
  removeInscripcion: (id, equipoId) => api.delete(`/torneos/${id}/inscripciones/${equipoId}`),
  getAll: (params = {}) => api.get('/torneos', { params }),
  getById: (id) => api.get(`/torneos/${id}`),
  create: (data) => api.post('/torneos', data),
  update: (id, data) => api.put(`/torneos/${id}`, data),
  remove: (id, options) => api.delete(`/torneos/${id}`, options),
}
