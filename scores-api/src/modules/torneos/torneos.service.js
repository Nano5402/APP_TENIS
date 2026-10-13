const pool = require('../../config/db')
const { AsyncLocalStorage } = require('node:async_hooks')
const transaction = new AsyncLocalStorage()
const db = { query: (...args) => (transaction.getStore() || pool).query(...args), getConnection: (...args) => pool.getConnection(...args) }
const { rethrowDeleteConflict } = require('../../utils/deleteConflict')

const MODALIDADES = ['individual', 'dobles']
const SISTEMAS = ['por_definir', 'eliminacion_directa', 'todos_contra_todos', 'grupos_eliminacion']
const ESTADOS = ['proximo', 'en_curso', 'finalizado', 'cancelado']

const SELECT = `
  SELECT
    t.id, t.nombre, t.deporte, t.categoria_id, t.modalidad, t.sistema,
    t.fecha_inicio, t.fecha_fin, t.estado, t.archivado_at,
    c.nombre AS categoria_nombre,
    (SELECT COUNT(*) FROM partidos p WHERE p.torneo_id = t.id) AS partidos_count,
    (SELECT COUNT(*) FROM inscripciones i WHERE i.torneo_id=t.id AND i.estado<>'eliminado') AS inscripciones_count
  FROM torneos t
  LEFT JOIN categorias c ON c.id = t.categoria_id
`

exports.getAll = async ({ deporte, estado, modalidad, archivo = 'activos' }) => {
  if (!['activos', 'archivados', 'todos'].includes(archivo)) throw { status: 400, message: 'Filtro de archivo inválido' }
  let query = `${SELECT} WHERE 1 = 1`
  const params = []
  if (archivo !== 'todos') query += archivo === 'archivados' ? ' AND t.archivado_at IS NOT NULL' : ' AND t.archivado_at IS NULL'

  if (deporte) {
    query += ' AND t.deporte = ?'
    params.push(deporte)
  }
  if (estado) {
    query += ' AND t.estado = ?'
    params.push(estado)
  }
  if (modalidad) {
    query += ' AND t.modalidad = ?'
    params.push(modalidad)
  }

  query += ' ORDER BY t.fecha_inicio IS NULL, t.fecha_inicio DESC, t.id DESC'
  const [rows] = await db.query(query, params)
  return rows.map(formatTournament)
}

exports.getById = async (id) => {
  const [rows] = await db.query(`${SELECT} WHERE t.id = ? LIMIT 1`, [id])
  if (!rows.length) throw { status: 404, message: 'Torneo no encontrado' }
  return formatTournament(rows[0])
}

exports.create = async (body) => {
  const tournament = await validateTournament(body)
  const [result] = await db.query(
    `INSERT INTO torneos
       (nombre, deporte, categoria_id, modalidad, sistema, fecha_inicio, fecha_fin, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tournament.nombre,
      tournament.deporte,
      tournament.categoria_id,
      tournament.modalidad,
      tournament.sistema,
      tournament.fecha_inicio,
      tournament.fecha_fin,
      tournament.estado,
    ]
  )
  return exports.getById(result.insertId)
}

exports.update = async (id, body) => {
  const [existing] = await db.query(
    'SELECT id, deporte, categoria_id, modalidad FROM torneos WHERE id = ?',
    [id]
  )
  if (!existing.length) throw { status: 404, message: 'Torneo no encontrado' }

  const tournament = await validateTournament(body)
  const [[groupCount]] = await db.query(
    'SELECT COUNT(*) AS total FROM torneo_grupos WHERE torneo_id=?',
    [id]
  )
  if (
    Number(groupCount.total) > 0 &&
    (tournament.sistema !== 'grupos_eliminacion' ||
      tournament.modalidad !== 'dobles' ||
      tournament.deporte !== existing[0].deporte ||
      tournament.categoria_id)
  )
    throw {
      status: 409,
      message:
        'Conserva el sistema, deporte y categorías mientras existan grupos. Revisa la distribución primero.',
    }
  const structureChanged =
    existing[0].deporte !== tournament.deporte ||
    (existing[0].categoria_id ? Number(existing[0].categoria_id) : null) !==
      tournament.categoria_id ||
    existing[0].modalidad !== tournament.modalidad

  if (structureChanged) {
    const [[enrolled]] = await db.query(
      "SELECT COUNT(*) AS total FROM inscripciones WHERE torneo_id=? AND estado<>'eliminado'",
      [id]
    )
    if (Number(enrolled.total) > 0)
      throw {
        status: 409,
        message:
          'No puedes cambiar deporte, categoría o modalidad mientras haya inscripciones. Revisa los participantes primero.',
      }
    const [[usage]] = await db.query('SELECT COUNT(*) AS total FROM partidos WHERE torneo_id = ?', [
      id,
    ])
    if (Number(usage.total) > 0) {
      throw {
        status: 409,
        message:
          'No puedes cambiar deporte, categoría o modalidad porque el torneo ya tiene partidos',
      }
    }
  }

  await db.query(
    `UPDATE torneos
     SET nombre = ?, deporte = ?, categoria_id = ?, modalidad = ?, sistema = ?,
         fecha_inicio = ?, fecha_fin = ?, estado = ?
     WHERE id = ?`,
    [
      tournament.nombre,
      tournament.deporte,
      tournament.categoria_id,
      tournament.modalidad,
      tournament.sistema,
      tournament.fecha_inicio,
      tournament.fecha_fin,
      tournament.estado,
      id,
    ]
  )
  return exports.getById(id)
}

// Commit the edit and its audit together; neither can succeed on its own.
const updateTournament = exports.update
exports.update = async (id, body, actor) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [[before]] = await conn.query('SELECT * FROM torneos WHERE id=? FOR UPDATE', [id])
    if (!before) throw { status: 404, message: 'Torneo no encontrado' }
    const result = await transaction.run(conn, () => updateTournament(id, body))
    const [[after]] = await conn.query('SELECT * FROM torneos WHERE id=?', [id])
    await require('../audit/edit-audit').record(conn, 'torneo', id, actor, before, after)
    await conn.commit()
    return result
  } catch (e) { await conn.rollback(); throw e }
  finally { conn.release() }
}

exports.setArchived = async (id, archived, expected, actorId) => {
  id = Number(id)
  if (!Number.isSafeInteger(id) || id < 1 || typeof archived !== 'boolean' || typeof expected !== 'boolean') throw { status: 400, message: 'Datos de archivo inválidos. Actualiza el listado.' }
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [[row]] = await conn.query('SELECT id,archivado_at FROM torneos WHERE id=? FOR UPDATE', [id])
    if (!row) throw { status: 404, message: 'Torneo no encontrado' }
    const current = Boolean(row.archivado_at)
    if (current !== archived) {
      if (current !== expected) throw { status: 409, message: 'El archivo cambió desde otra sesión. Actualiza el listado.' }
      await conn.query('UPDATE torneos SET archivado_at = IF(?,CURRENT_TIMESTAMP,NULL) WHERE id=?', [archived,id])
      await conn.query('INSERT INTO auditoria_archivo_torneos (torneo_id,actor_id,archivado) VALUES (?,?,?)', [id,actorId,archived])
    }
    await conn.commit()
    return { id, archivado: archived }
  } catch (e) { await conn.rollback(); throw e }
  finally { conn.release() }
}

exports.remove = async (id, actorId = null) => {
  id = Number(id)
  if (!Number.isSafeInteger(id) || id < 1) throw { status: 400, message: 'Torneo inválido' }
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [[tournament]] = await conn.query('SELECT id,nombre FROM torneos WHERE id=? FOR UPDATE', [
      id,
    ])
    if (!tournament) throw { status: 404, message: 'Torneo no encontrado' }
    const [matches] = await conn.query('SELECT id FROM partidos WHERE torneo_id=? FOR UPDATE', [id])
    // Keep the historical supervision log independently of the deleted matches.
    await conn.query(
      `INSERT INTO auditoria_eliminaciones (entidad,registro_id,actor_id,detalle)
      SELECT 'auditoria_partido',a.partido_id,?,JSON_OBJECT('accion',a.accion,'detalle',a.detalle,'created_by',a.created_by,'created_at',a.created_at)
      FROM auditoria_control_partido a JOIN partidos p ON p.id=a.partido_id WHERE p.torneo_id=?`,
      [actorId, id]
    )
    await conn.query(
      `INSERT INTO auditoria_eliminaciones (entidad,registro_id,actor_id,detalle) VALUES ('torneo',?,?,?)`,
      [
        id,
        actorId,
        JSON.stringify({ nombre: tournament.nombre, partidos: matches.map((m) => m.id) }),
      ]
    )
    await conn.query("DELETE FROM favoritos WHERE tipo='torneo' AND referencia_id=?", [id])
    await conn.query(
      "DELETE f FROM favoritos f JOIN partidos p ON p.id=f.referencia_id WHERE f.tipo='partido' AND p.torneo_id=?",
      [id]
    )
    // Links from other tournaments are detached, never delete those other matches.
    await conn.query(
      'UPDATE partidos p JOIN partidos source ON source.id=p.origen_partido1_id SET p.origen_partido1_id=NULL WHERE source.torneo_id=?',
      [id]
    )
    await conn.query(
      'UPDATE partidos p JOIN partidos source ON source.id=p.origen_partido2_id SET p.origen_partido2_id=NULL WHERE source.torneo_id=?',
      [id]
    )
    await conn.query(
      'UPDATE tickets_soporte t JOIN partidos p ON p.id=t.partido_id SET t.partido_id=NULL WHERE p.torneo_id=?',
      [id]
    )
    for (const table of [
      'fotos_partido',
      'estado_en_vivo_partido',
      'auditoria_control_partido',
      'eventos_partido',
      'sets_partido',
    ]) {
      await conn.query(
        `DELETE child FROM ${table} child JOIN partidos p ON p.id=child.partido_id WHERE p.torneo_id=?`,
        [id]
      )
    }
    await conn.query('DELETE FROM partidos WHERE torneo_id=?', [id])
    await conn.query('DELETE FROM inscripciones WHERE torneo_id=?', [id])
    await conn.query('DELETE FROM torneo_grupo_parejas WHERE torneo_id=?', [id])
    await conn.query('DELETE FROM torneo_grupos WHERE torneo_id=?', [id])
    await conn.query('DELETE FROM torneo_retiros WHERE torneo_id=?', [id])
    await conn.query('DELETE FROM torneo_grupo_historial WHERE torneo_id=?', [id])
    await conn.query('DELETE FROM torneos WHERE id=?', [id])
    await conn.commit()
    return {
      message: 'Torneo y sus datos dependientes eliminados. Jugadores y parejas conservados.',
    }
  } catch (error) {
    await conn.rollback()
    rethrowDeleteConflict(error, 'este torneo')
  } finally {
    conn.release()
  }
}

async function validateTournament({
  nombre,
  deporte,
  categoria_id,
  modalidad,
  sistema,
  fecha_inicio,
  fecha_fin,
  estado,
}) {
  const normalizedName = String(nombre || '').trim()
  const categoryId = categoria_id ? Number(categoria_id) : null
  const normalizedStatus = estado || 'proximo'
  const normalizedModality = modalidad || 'individual'
  const normalizedSystem = sistema || 'por_definir'
  const normalizedStart = normalizeOptionalDate(fecha_inicio, 'inicial')
  const normalizedEnd = normalizeOptionalDate(fecha_fin, 'final')

  if (!normalizedName) throw { status: 400, message: 'El nombre es obligatorio' }
  if (!['tenis', 'padel'].includes(deporte)) {
    throw { status: 400, message: 'Selecciona un deporte válido' }
  }
  if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId < 1)) {
    throw { status: 400, message: 'La categoría seleccionada no es válida' }
  }
  if (!MODALIDADES.includes(normalizedModality)) {
    throw { status: 400, message: 'Selecciona una modalidad válida' }
  }
  if (!SISTEMAS.includes(normalizedSystem)) {
    throw { status: 400, message: 'Selecciona un sistema de competencia válido' }
  }
  if (!ESTADOS.includes(normalizedStatus)) {
    throw { status: 400, message: 'Selecciona un estado válido' }
  }
  if (normalizedStart && normalizedEnd && normalizedEnd < normalizedStart) {
    throw { status: 400, message: 'La fecha final no puede ser anterior a la inicial' }
  }

  if (categoryId !== null) {
    const [categories] = await db.query('SELECT deporte FROM categorias WHERE id = ? LIMIT 1', [
      categoryId,
    ])
    if (!categories.length) throw { status: 400, message: 'La categoría seleccionada no existe' }
    if (![deporte, 'ambos'].includes(categories[0].deporte)) {
      throw { status: 400, message: 'La categoría no corresponde al deporte del torneo' }
    }
  }

  return {
    nombre: normalizedName,
    deporte,
    categoria_id: categoryId,
    modalidad: normalizedModality,
    sistema: normalizedSystem,
    fecha_inicio: normalizedStart,
    fecha_fin: normalizedEnd,
    estado: normalizedStatus,
  }
}

function normalizeOptionalDate(value, label) {
  const date = String(value || '').trim()
  if (!date) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
    throw { status: 400, message: `Selecciona una fecha ${label} válida` }
  }
  return date
}

function formatTournament(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    deporte: row.deporte,
    modalidad: row.modalidad || (row.deporte === 'padel' ? 'dobles' : 'individual'),
    sistema: row.sistema || 'por_definir',
    categoria: row.categoria_id ? { id: row.categoria_id, nombre: row.categoria_nombre } : null,
    fecha_inicio: row.fecha_inicio || null,
    fecha_fin: row.fecha_fin || null,
    estado: row.estado,
    archivado: Boolean(row.archivado_at),
    partidos_count: Number(row.partidos_count || 0),
    inscripciones_count: Number(row.inscripciones_count || 0),
  }
}
