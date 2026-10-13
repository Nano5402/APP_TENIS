const db = require('../../config/db')
const bcrypt = require('bcryptjs')
const { validateIdentifierCrossing } = require('../../utils/loginIdentifiers')
const { identity, assertPhoneAvailable } = require('../../utils/memberIdentity')

const BASE_FIELDS =
  'u.id, u.numero_documento, u.nombre, u.apellido, u.email, u.telefono, u.telefono_acceso, u.avatar, u.rol, u.activo, u.created_at'

const normalizeUsuario = (value) => {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, 50) : null
}

// Tolerancia mientras la columna `users.usuario` termina de migrarse tras un
// despliegue: se detecta una vez y, si aún no existe, se opera sin ella.
let usuarioColumnReady = false
const hasUsuarioColumn = async () => {
  if (usuarioColumnReady) return true
  try {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'usuario'`
    )
    usuarioColumnReady = Number(rows[0].total) > 0
  } catch {
    usuarioColumnReady = false
  }
  return usuarioColumnReady
}

const userWithPlayer = (withUsuario) => `
  SELECT ${withUsuario ? `${BASE_FIELDS}, u.usuario` : BASE_FIELDS},
         j.id AS jugador_id,
         j.nombre AS jugador_nombre,
         j.apellido AS jugador_apellido,
         j.foto AS jugador_foto
  FROM users u
  LEFT JOIN jugadores j ON j.user_id = u.id
`

exports.getAll = async ({ estado = 'activos' } = {}) => {
  if (!['activos', 'inactivos', 'todos'].includes(estado)) throw { status: 400, message: 'Filtro de estado inválido' }
  const [rows] = await db.query(
    `${userWithPlayer(await hasUsuarioColumn())} ${estado === 'todos' ? '' : `WHERE u.activo = ${estado === 'activos' ? 'TRUE' : 'FALSE'}`} ORDER BY u.created_at DESC`
  )
  return rows.map(formatUser)
}

exports.getById = async (id) => {
  const [rows] = await db.query(`${userWithPlayer(await hasUsuarioColumn())} WHERE u.id = ? LIMIT 1`, [
    id,
  ])
  if (!rows.length) throw { status: 404, message: 'Usuario no encontrado' }
  return formatUser(rows[0])
}

const createAccount = async ({
  numero_documento,
  usuario,
  nombre,
  apellido,
  email,
  password,
  telefono,
  rol = 'miembro',
}, executor = db, aliasReady) => {
  if (!['admin', 'juez_director', 'juez', 'miembro'].includes(rol)) {
    throw { status: 400, message: 'Rol inválido' }
  }
  const details = identity({ numero_documento, email, telefono, usuario }, rol)
  numero_documento = details.document
  email = details.email
  await assertPhoneAvailable(executor, details.phoneKey)

  const aliasSupported = aliasReady ?? await hasUsuarioColumn()
  const alias = aliasSupported ? normalizeUsuario(usuario) : null
  if (!aliasSupported && usuario) throw { status: 503, message: 'El acceso por usuario se está preparando. Reintenta en unos minutos.' }
  if (aliasSupported) await validateIdentifierCrossing(executor, { documento: numero_documento, usuario: alias, telefono_acceso: details.phoneKey })

  if (numero_documento) {
    const [dupDoc] = await executor.query('SELECT id FROM users WHERE numero_documento = ? LIMIT 1', [numero_documento])
    if (dupDoc.length) throw { status: 409, message: 'Ese documento ya está registrado en otra cuenta' }
  }
  if (email) {
    const [dupMail] = await executor.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email])
    if (dupMail.length) throw { status: 409, message: 'Ese correo ya está registrado en otra cuenta' }
  }
  if (alias) {
    const [dupAlias] = await executor.query('SELECT id FROM users WHERE usuario = ? LIMIT 1', [alias])
    if (dupAlias.length) {
      throw { status: 409, message: 'Ese usuario ya está en uso por otra cuenta' }
    }
  }

  const hashedPassword = await bcrypt.hash(password, 12)
  const columns = ['numero_documento', 'nombre', 'apellido', 'email', 'password', 'telefono', 'rol', 'telefono_acceso']
  const values = [
    numero_documento,
    nombre.trim(),
    apellido.trim(),
    email,
    hashedPassword,
    telefono?.trim() || null,
    rol,
    details.phoneKey,
  ]
  if (aliasSupported) {
    columns.splice(1, 0, 'usuario')
    values.splice(1, 0, alias)
  }

  let result
  try { [result] = await executor.query(
    `INSERT INTO users (${columns.join(', ')}, activo)
     VALUES (${columns.map(() => '?').join(', ')}, TRUE)`,
    values
  ) } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw { status: 409, message: 'El celular de acceso, documento, correo o usuario ya está registrado en otra cuenta' }
    throw err
  }

  return result.insertId
}

exports.create = async (data) => {
  const player = data.jugador
  if (!player || player.modo === 'ninguno') return exports.getById(await createAccount(data))
  if (!['existente', 'nuevo'].includes(player.modo)) throw { status: 400, message: 'Selecciona cómo vincular el jugador' }
  const aliasReady = await hasUsuarioColumn()
  const conn = await db.getConnection()
  let userId
  try {
    await conn.beginTransaction()
    const link = await require('./userPlayer').preparePlayer(conn, player, data)
    userId = await createAccount(data, conn, aliasReady)
    await link(userId)
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') throw { status: 409, message: 'El usuario o jugador ya está vinculado. Actualiza la lista y revisa los datos.' }
    throw err
  } finally { conn.release() }
  return exports.getById(userId)
}

exports.linkPlayer = async (id, playerId) => {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw { status: 400, message: 'Cuenta inválida' }
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [[account]] = await conn.query('SELECT id FROM users WHERE id=? FOR UPDATE', [id])
    if (!account) throw { status: 404, message: 'Cuenta no encontrada' }
    const [linked] = await conn.query('SELECT id FROM jugadores WHERE user_id=? FOR UPDATE', [id])
    if (linked.length) {
      if (linked.length !== 1 || Number(linked[0].id) !== Number(playerId)) throw { status: 409, message: 'Esta cuenta ya tiene una ficha vinculada. No se reemplaza su historial.' }
    } else {
      const link = await require('./userPlayer').preparePlayer(conn, { modo: 'existente', id: playerId }, account)
      await link(id)
    }
    await conn.commit()
  } catch (e) { await conn.rollback(); throw e }
  finally { conn.release() }
  return exports.getById(id)
}

exports.updateUsuario = async (id, usuario) => {
  if (!(await hasUsuarioColumn())) {
    throw {
      status: 503,
      message: 'La función de usuario de acceso aún no está disponible. Reinténtalo en unos minutos.',
    }
  }

  const [existing] = await db.query('SELECT id, rol, numero_documento, email, telefono, usuario FROM users WHERE id = ?', [id])
  if (!existing.length) throw { status: 404, message: 'Usuario no encontrado' }

  const alias = normalizeUsuario(usuario)
  if (existing[0].rol === 'miembro' && !alias && !existing[0].numero_documento) {
    identity({ ...existing[0], usuario: alias }, 'miembro')
  }
  await validateIdentifierCrossing(db, { usuario: alias, id })
  if (alias) {
    const [dup] = await db.query('SELECT id FROM users WHERE usuario = ? AND id != ? LIMIT 1', [
      alias,
      id,
    ])
    if (dup.length) {
      throw { status: 409, message: 'Ese usuario ya está en uso por otra cuenta' }
    }
  }

  await db.query('UPDATE users SET usuario = ?, updated_at = NOW() WHERE id = ?', [alias, id])
  return exports.getById(id)
}

exports.getJudges = async () => {
  const [rows] = await db.query(
    `SELECT u.id, u.nombre, u.apellido, u.rol, u.usuario
     FROM users u
     WHERE u.activo = TRUE AND u.rol IN ('juez', 'juez_director', 'admin')
     ORDER BY u.nombre ASC, u.apellido ASC`
  )
  return rows
}

exports.updateRole = async (id, rol, requesterId) => {
  await require('./users.admin.service').updateRole(id, requesterId, rol)
  return exports.getById(id)
}

exports.updateMe = async (id, { nombre, apellido, telefono, email, numero_documento }) => {
  const [existing] = await db.query('SELECT id, rol, numero_documento, email, telefono, usuario FROM users WHERE id = ?', [id])
  if (!existing.length) throw { status: 404, message: 'Usuario no encontrado' }
  const current = existing[0]
  // El documento solo puede registrarse la primera vez desde el propio perfil
  // (diálogo de datos pendientes). Si ya existe, solo el admin puede corregirlo.
  const wantsDoc = numero_documento !== undefined
  const newDocRaw = wantsDoc ? String(numero_documento ?? '').trim() : ''
  if (current.numero_documento && wantsDoc && newDocRaw && newDocRaw !== String(current.numero_documento)) {
    throw { status: 400, message: 'Tu documento ya está registrado. Pide al administrador si necesitas corregirlo.' }
  }
  const effectiveDoc = current.numero_documento || newDocRaw || null
  const details = identity({ ...current, numero_documento: effectiveDoc, email: email === undefined ? current.email : email, telefono: telefono === undefined ? current.telefono : telefono }, current.rol)
  // Solo se valida el celular nuevo (assert cubre duplicado y cruce con
  // documento/usuario ajenos). No se re-validan documento/usuario propios,
  // que no cambian aquí, para no bloquear el perfil por choques históricos
  // que solo un admin puede resolver.
  await assertPhoneAvailable(db, details.phoneKey, id)

  if (details.email) {
    const [dup] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [details.email, id])
    if (dup.length) throw { status: 409, message: 'Ese correo ya está en uso por otra cuenta' }
  }

  // El documento es nuevo (antes NULL): evita duplicados y cruces con
  // usuario/celular de acceso de otras cuentas, que romperían el ingreso.
  if (!current.numero_documento && details.document) {
    const [dupDoc] = await db.query('SELECT id FROM users WHERE numero_documento = ? AND id != ? LIMIT 1', [details.document, id])
    if (dupDoc.length) throw { status: 409, message: 'Ese documento ya está registrado en otra cuenta' }
    await validateIdentifierCrossing(db, { documento: details.document, usuario: current.usuario || null, telefono_acceso: details.phoneKey, id })
  }

  await db.query(
    `UPDATE users
     SET nombre = COALESCE(?, nombre),
         apellido = COALESCE(?, apellido),
         telefono = ?,
         email = ?,
         telefono_acceso = ?,
         numero_documento = COALESCE(?, numero_documento),
         updated_at = NOW()
     WHERE id = ?`,
    [nombre || null, apellido || null, details.phone, details.email, details.phoneKey, details.document, id]
  )

  return exports.getById(id)
}

exports.changePassword = async (id, currentPassword, newPassword) => {
  if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword) > 72 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    throw { status: 400, message: 'Ingresa tu contraseña actual y una nueva de al menos 8 caracteres, una mayúscula y un número (máximo 72 bytes).' }
  }
  if (currentPassword === newPassword) throw { status: 400, message: 'La nueva contraseña debe ser diferente.' }
  const [rows] = await db.query('SELECT password FROM users WHERE id = ?', [id])
  if (!rows.length) throw { status: 404, message: 'Usuario no encontrado' }

  const match = await bcrypt.compare(currentPassword, rows[0].password)
  if (!match) throw { status: 400, message: 'La contraseña actual es incorrecta' }

  const hashed = await bcrypt.hash(newPassword, 12)
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [updated] = await conn.query('UPDATE users SET password = ?, session_version = session_version + 1, updated_at = NOW() WHERE id = ? AND password = ?', [hashed, id, rows[0].password])
    if (!updated.affectedRows) throw { status: 409, message: 'La contraseña cambió durante la operación. Vuelve a ingresar.' }
    await conn.query('UPDATE password_resets SET used = TRUE WHERE user_id = ? AND used = FALSE', [id])
    await conn.commit()
  } catch (err) { await conn.rollback(); throw err }
  finally { conn.release() }

  return { message: 'Contraseña actualizada correctamente' }
}

exports.updateAvatar = async (id, avatarPath) => {
  const [existing] = await db.query('SELECT id FROM users WHERE id = ?', [id])
  if (!existing.length) throw { status: 404, message: 'Usuario no encontrado' }

  await db.query('UPDATE users u LEFT JOIN jugadores j ON j.user_id = u.id SET u.avatar = ?, u.updated_at = NOW(), j.foto = ? WHERE u.id = ?', [avatarPath, avatarPath, id])
  return exports.getById(id)
}

function formatUser(row) {
  const avatar = row.avatar || row.jugador_foto || null
  return {
    id: row.id,
    numero_documento: row.numero_documento,
    usuario: row.usuario || null,
    nombre: row.nombre,
    apellido: row.apellido,
    email: row.email,
    telefono: row.telefono || null,
    acceso_celular: Boolean(row.telefono_acceso),
    avatar,
    rol: row.rol,
    activo: Boolean(row.activo),
    created_at: row.created_at,
    jugador: row.jugador_id
      ? {
          id: row.jugador_id,
          nombre: row.jugador_nombre,
          apellido: row.jugador_apellido,
          foto: row.jugador_foto || avatar,
        }
      : null,
  }
}
