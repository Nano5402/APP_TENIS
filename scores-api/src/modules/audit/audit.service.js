const db = require('../../config/db')
const sources = [
  { name: 'retiros', table: 'auditoria_retiros', actor: 'actor_id' },
  { name: 'archivo', table: 'auditoria_archivo_torneos', actor: 'actor_id' },
  { name: 'eliminaciones', table: 'auditoria_eliminaciones', actor: 'actor_id' },
  { name: 'partidos', table: 'auditoria_control_partido', actor: 'created_by' },
  { name: 'ediciones', table: 'auditoria_ediciones', actor: 'actor_id' },
]
const invalid = () => Object.assign(new Error('Filtro de historial inválido.'), { status: 400 })
exports.list = async ({ tipo = 'todos', pagina = '0', actor = '' } = {}) => {
  if (typeof tipo !== 'string' || (tipo !== 'todos' && !sources.some(s => s.name === tipo))) throw invalid()
  if (!/^\d{1,3}$/.test(String(pagina)) || Number(pagina) > 100) throw invalid()
  if (typeof actor !== 'string' || (actor && (!/^[1-9]\d{0,9}$/.test(actor)))) throw invalid()
  const selected = sources.map((s, index) => ({ ...s, index })).filter(s => tipo === 'todos' || s.name === tipo)
  const params = []
  // Union only numbers and timestamps: text collations may differ in existing databases.
  const union = selected.map(s => {
    if (actor) params.push(actor)
    return `SELECT id,created_at,${s.index} AS source FROM ${s.table}${actor ? ` WHERE ${s.actor}=?` : ''}`
  }).join(' UNION ALL ')
  const [keys] = await db.query(`SELECT * FROM (${union}) history ORDER BY created_at DESC,source DESC,id DESC LIMIT 51 OFFSET ${Number(pagina) * 50}`, params)
  const page = keys.slice(0, 50)
  const entries = new Map()
  for (const s of selected) {
    const ids = page.filter(k => Number(k.source) === s.index).map(k => k.id)
    if (!ids.length) continue
    const [rows] = await db.query(`SELECT a.*,CONCAT_WS(' ',u.nombre,u.apellido) AS autor FROM ${s.table} a LEFT JOIN users u ON u.id=a.${s.actor} WHERE a.id IN (${ids.map(() => '?').join(',')})`, ids)
    for (const row of rows) {
      let detail = row.detalle
      if (typeof detail === 'string') { try { detail = JSON.parse(detail) } catch { /* preserve legacy text */ } }
      const action = s.name === 'retiros' ? (row.retirado ? 'Retiro' : 'Reincorporación') : s.name === 'archivo' ? (row.archivado ? 'Archivar torneo' : 'Restaurar torneo') : s.name === 'eliminaciones' ? (row.entidad === 'auditoria_partido' ? 'Intervención conservada' : 'Eliminación') : row.accion
      entries.set(`${s.index}:${row.id}`, { key: `${s.index}:${row.id}`, tipo: s.name, accion: action, fecha: row.created_at, actor_id: row[s.actor], autor: row.autor || 'Cuenta no disponible', entidad: s.name === 'retiros' || s.name === 'archivo' ? 'torneo' : s.name === 'partidos' ? 'partido' : row.entidad, registro_id: row.torneo_id ?? row.partido_id ?? row.registro_id,
        detalle: s.name === 'retiros' ? { participante: row.participante_id, tipo: row.tipo, motivo: row.motivo } : detail ?? {} })
    }
  }
  return { items: page.map(k => entries.get(`${k.source}:${k.id}`)).filter(Boolean), siguiente: keys.length > 50 && Number(pagina) < 100 ? Number(pagina) + 1 : null }
}
