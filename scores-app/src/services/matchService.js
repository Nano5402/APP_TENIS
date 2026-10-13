import api from './api'

import { toJudgeState } from '../utils/judgeState'

const judgeResponse = (response) => ({ ...response, data: toJudgeState(response.data) })

const pointReason = (result) => ({
  winner: 'tiro_ganador',
  ace: 'ace',
  error_no_forzado: 'error_no_forzado',
  doble_falta: 'doble_falta',
}[result] || 'punto_sin_detalle')

export const matchService = {
  getAttention: () => api.get('/partidos/gestion/pendientes'),
  checkSchedule: data => api.post('/partidos/gestion/programacion', data),
  getAudit: (id, after = 0) => api.get(`/partidos/${id}/auditoria`, { params: { after } }),
  getAll: (params = {}) => api.get('/partidos', { params }),
  getById: (id) => api.get(`/partidos/${id}`),
  getMyMatches: () => api.get('/partidos/mios'),
  getLive: () => api.get('/partidos', { params: { estado: 'en_vivo' } }),
  getUpcoming: () => api.get('/partidos', { params: { estado: 'programado' } }),
  getFinished: () => api.get('/partidos', { params: { estado: 'finalizado' } }),
  create: (data) => api.post('/partidos', data),
  update: (id, data) => api.put(`/partidos/${id}`, data),
  updateParticipants: (id, data) => api.put(`/partidos/${id}/participantes`, data),
  reassignCourt: (id, cancha_id, expected_control_version) => api.put(`/partidos/${id}/reasignar-cancha`, { cancha_id, expected_control_version }),
  reassignJudge: (id, juez_id, expected_control_version) => api.put(`/partidos/${id}/reasignar-juez`, { juez_id, expected_control_version }),
  walkoverMatch: (id, expected_control_version, ganador, motivo, extra = {}) =>
    api.put(`/partidos/${id}/walkover`, { expected_control_version, ganador, motivo, ...extra }),
  cancelMatch: (id, expected_control_version, motivo = '', extra = {}) => api.put(`/partidos/${id}/cancelar-partido`, { expected_control_version, motivo, ...extra }),
  reactivateMatch: (id, expected_control_version) => api.put(`/partidos/${id}/reactivar`, { expected_control_version }),
  correctScore: (id, data) => api.put(`/partidos/${id}/correccion`, data),
  substitute: (id, data) => api.put(`/partidos/${id}/sustitucion`, data),
  updateMarcador: (id, data) => api.put(`/partidos/${id}/marcador`, data),
  getManaged: () => api.get('/partidos/gestion/mis-partidos'),
  getControl: (id) => api.get(`/partidos/${id}/control`),
  getStats: (id, set = null) => api.get(`/partidos/${id}/estadisticas`, { params: set ? { set } : {} }),
  start: (id) => api.post(`/partidos/${id}/iniciar`),
  setPaused: (id, pausado) => api.put(`/partidos/${id}/pausa`, { pausado }),
  changeServer: (id, servidor) => api.put(`/partidos/${id}/saque`, { servidor }),
  addEvent: (id, data) => api.post(`/partidos/${id}/eventos`, data),
  undoEvent: (id) => api.post(`/partidos/${id}/deshacer`),
  // Adaptadores para la mesa unificada incluida en el diseño del equipo.
  getAssignments: () => api.get('/partidos/gestion/mis-partidos'),
  getLiveState: async (id) => judgeResponse(await api.get(`/partidos/${id}/control`)),
  addJudgeEvent: async (id, data) => judgeResponse(await api.post(`/partidos/${id}/eventos`, data)),
  startLive: async (id) => judgeResponse(await api.post(`/partidos/${id}/iniciar`)),
  pauseLive: async (id, pausado) => judgeResponse(await api.put(`/partidos/${id}/pausa`, { pausado })),
  suspendLive: async (id, motivo) => judgeResponse(await api.put(`/partidos/${id}/pausa`, { pausado: true, motivo })),
  setServer: async (id, servidor) => judgeResponse(await api.put(`/partidos/${id}/saque`, { servidor })),
  setDoublesOrder: async (id, data) => judgeResponse(await api.put(`/partidos/${id}/orden-saque-dobles`, data)),
  recordPoint: async (id, ganador, metadata = {}, serviceAttempt = 1) => {
    const needsFirstFault =
      Number(serviceAttempt) === 1 &&
      (metadata.tipo_saque === 'segundo_saque' || metadata.resultado === 'doble_falta')
    if (needsFirstFault) {
      await api.post(`/partidos/${id}/eventos`, { tipo: 'primera_falta' })
    }
    const response = await api.post(`/partidos/${id}/eventos`, {
      tipo: 'punto',
      ganador,
      motivo: pointReason(metadata.resultado),
    })
    return judgeResponse(response)
  },
  undoPoint: async (id) => judgeResponse(await api.post(`/partidos/${id}/deshacer`)),
  finishLive: async (id) => judgeResponse(await api.get(`/partidos/${id}/control`)),
  remove: (id, options) => api.delete(`/partidos/${id}`, options),
}
