const fs = require('node:fs/promises')
const { constants } = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const fail = (status, message, code) => Object.assign(new Error(message), { status, code })

function publicError(error) {
  if (['EACCES', 'EPERM', 'EROFS'].includes(error.code)) return fail(503, 'Hostinger no permite escribir en la carpeta de fotos. Un administrador debe revisar los permisos de MATCH_PHOTOS_DIR.', 'PHOTO_STORAGE_PERMISSIONS')
  if (['ENOSPC', 'EDQUOT'].includes(error.code)) return fail(503, 'El almacenamiento del servidor está lleno. La foto sigue pendiente en tu dispositivo.', 'PHOTO_STORAGE_FULL')
  if (['ENOENT', 'ENOTDIR'].includes(error.code)) return fail(503, 'La carpeta de fotos del servidor no está disponible. Revisa MATCH_PHOTOS_DIR en Hostinger.', 'PHOTO_STORAGE_UNAVAILABLE')
  if (error.code === 'ER_NO_SUCH_TABLE') return fail(503, 'Falta preparar la tabla de fotografías en el servidor. Un administrador debe revisar el despliegue.', 'PHOTO_SCHEMA_NOT_READY')
  return error
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function authorize(match, user) {
  if (!match) throw fail(404, 'Partido no encontrado')
  if (user.rol !== 'admin' && user.rol !== 'juez_director' && !(user.rol === 'juez' && Number(match.juez_id) === Number(user.id))) {
    throw fail(403, 'Solo el juez asignado, juez director o un administrador puede guardar la foto de este partido')
  }
}

function validate(input) {
  if (!uuid.test(input.version || '') || (input.expected && !uuid.test(input.expected))) throw fail(400, 'Identificador de fotografía inválido')
  if (!['inicio', 'final'].includes(input.momento)) throw fail(400, 'Selecciona si la foto es del inicio o del final')
  if (input.consentimiento !== 'true') throw fail(400, 'Confirma la autorización para publicar la fotografía')
  framing(input.encuadre)
}

function framing(value) {
  if (value == null || value === '') return { zoom: 1, x: 50, y: 50 }
  let frame
  try { frame = typeof value === 'string' ? JSON.parse(value) : value } catch { throw fail(400, 'Encuadre inválido') }
  if (!frame || Array.isArray(frame) || typeof frame !== 'object' ||
    !['zoom', 'x', 'y'].every(key => typeof frame[key] === 'number' && Number.isFinite(frame[key])) ||
    frame.zoom < 1 || frame.zoom > 2.5 || frame.x < 0 || frame.x > 100 || frame.y < 0 || frame.y > 100) throw fail(400, 'Encuadre inválido')
  return { zoom: frame.zoom, x: frame.x, y: frame.y }
}

async function normalize(buffer) {
  try {
    const image = sharp(buffer, { limitInputPixels: 24000000, animated: false, failOn: 'warning' })
    const metadata = await image.metadata()
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('format')
    // Re-encoding without withMetadata strips EXIF, including GPS.
    const full = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer()
    const thumb = await sharp(full).resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toBuffer()
    return { full, thumb }
  } catch { throw fail(400, 'Imagen inválida. Usa una foto JPEG, PNG o WebP de hasta 24 megapíxeles.') }
}

function createPhotoService(db, directory = process.env.MATCH_PHOTOS_DIR) {
  function root() {
    if (!directory || !path.isAbsolute(directory)) throw fail(503, 'Falta configurar MATCH_PHOTOS_DIR en Hostinger y volver a desplegar la aplicación. La foto no se ha perdido.', 'PHOTO_STORAGE_UNCONFIGURED')
    return path.resolve(directory)
  }
  function file(version, thumb = false) {
    if (!uuid.test(version)) throw fail(400, 'Identificador inválido')
    return path.join(root(), `${version}${thumb ? '-thumb' : ''}.webp`)
  }
  const metadata = row => row ? { version: row.version, momento: row.momento, updated_at: row.updated_at, encuadre: row.encuadre == null ? null : framing(row.encuadre) } : null
  async function get(id) {
    const [matches] = await db.query('SELECT id FROM partidos WHERE id = ?', [id])
    if (!matches.length) throw fail(404, 'Partido no encontrado')
    const [rows] = await db.query('SELECT version, momento, updated_at, encuadre FROM fotos_partido WHERE partido_id = ?', [id])
    return metadata(rows[0])
  }
  async function check(id, user) {
    root()
    const [rows] = await db.query('SELECT id, juez_id FROM partidos WHERE id = ?', [id])
    authorize(rows[0], user)
  }
  async function status(id, user) {
    await check(id, user)
    // Read-only diagnostic; a missing child directory can be created on upload.
    let candidate = root()
    for (;;) {
      try {
        const stat = await fs.stat(candidate)
        if (!stat.isDirectory()) throw Object.assign(new Error('Not a directory'), { code: 'ENOTDIR' })
        await fs.access(candidate, constants.W_OK)
        return { configured: true, writable: true }
      } catch (error) {
        const parent = path.dirname(candidate)
        if (error.code !== 'ENOENT' || parent === candidate) throw publicError(error)
        candidate = parent
      }
    }
  }
  async function save(id, user, input, buffer) {
    validate(input)
    if (!buffer) throw fail(400, 'Selecciona una fotografía')
    await check(id, user)
    const images = await normalize(buffer)
    const conn = await db.getConnection()
    let written = false, committed = false, commitAttempted = false, previous
    try {
      await conn.beginTransaction()
      const [matches] = await conn.query('SELECT id, juez_id FROM partidos WHERE id = ? FOR UPDATE', [id])
      authorize(matches[0], user)
      const [rows] = await conn.query('SELECT * FROM fotos_partido WHERE partido_id = ? FOR UPDATE', [id])
      previous = rows[0]
      if (previous?.version === input.version) {
        if (Number(previous.created_by) !== Number(user.id) || previous.momento !== input.momento || JSON.stringify(framing(previous.encuadre)) !== JSON.stringify(framing(input.encuadre))) throw fail(409, 'La fotografía fue modificada por otro usuario')
        await conn.commit(); committed = true
        return metadata(previous)
      }
      if ((previous?.version || '') !== (input.expected || '')) throw fail(409, 'Ya existe una foto diferente. Revisa la foto actual antes de reemplazarla.')
      await fs.mkdir(root(), { recursive: true, mode: 0o700 })
      await fs.writeFile(file(input.version), images.full, { flag: 'wx', mode: 0o600 })
      written = true
      await fs.writeFile(file(input.version, true), images.thumb, { flag: 'wx', mode: 0o600 })
      await conn.query(`INSERT INTO fotos_partido (partido_id, version, momento, created_by, bytes, encuadre, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE version = VALUES(version), momento = VALUES(momento), created_by = VALUES(created_by), bytes = VALUES(bytes), encuadre = VALUES(encuadre), updated_at = CURRENT_TIMESTAMP`,
      [id, input.version, input.momento, user.id, images.full.length, JSON.stringify(framing(input.encuadre))])
      commitAttempted = true
      await conn.commit(); committed = true
    } catch (error) {
      await conn.rollback().catch(() => {})
      // A lost COMMIT response is ambiguous. Keep the files for a safe retry.
      if (written && !committed && !commitAttempted) {
        await fs.unlink(file(input.version)).catch(() => {})
        await fs.unlink(file(input.version, true)).catch(() => {})
      }
      if (error.code === 'EEXIST') throw fail(409, 'Una carga anterior quedó interrumpida. Descarta la pendiente y vuelve a seleccionar la foto.')
      throw publicError(error)
    } finally { conn.release() }
    // Replacement is explicit; old files can also remain in provider backups.
    if (previous) {
      await fs.unlink(file(previous.version)).catch(() => {})
      await fs.unlink(file(previous.version, true)).catch(() => {})
    }
    return get(id)
  }
  async function remove(id, user, expected) {
    if (user?.rol !== 'admin') throw fail(403, 'Solo los administradores pueden eliminar fotos')
    if (typeof expected !== 'string' || !uuid.test(expected)) throw fail(400, 'Identificador de fotografía inválido')
    root()
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      const [matches] = await conn.query('SELECT id, juez_id FROM partidos WHERE id = ? FOR UPDATE', [id])
      if (!matches.length) throw fail(404, 'Partido no encontrado')
      const [rows] = await conn.query('SELECT * FROM fotos_partido WHERE partido_id = ? FOR UPDATE', [id])
      if (rows[0] && rows[0].version !== expected) throw fail(409, 'La foto cambió. Revisa la foto actual antes de eliminarla.')
      if (rows[0]) {
        await conn.query('DELETE FROM fotos_partido WHERE partido_id = ? AND version = ?', [id, expected])
        await conn.query('INSERT INTO auditoria_control_partido (partido_id, created_by, accion, detalle) VALUES (?, ?, ?, ?)',
          [id, user.id, 'eliminar_foto', JSON.stringify({ version: expected, momento: rows[0].momento })])
      }
      await conn.commit()
    } catch (error) {
      await conn.rollback().catch(() => {})
      throw error
    } finally { conn.release() }
    // Never remove files before a confirmed commit. Missing metadata already blocks public access.
    for (const thumbnail of [false, true]) {
      await fs.unlink(file(expected, thumbnail)).catch(error => {
        if (error.code !== 'ENOENT') console.warn('Photo cleanup failed:', error.code)
      })
    }
    return null
  }
  async function updateFraming(id, user, expected, rawEncuadre, expectedFraming) {
    if (user?.rol !== 'admin') throw fail(403, 'Solo los administradores pueden fijar el encuadre oficial de las fotografías')
    if (typeof expected !== 'string' || !uuid.test(expected)) throw fail(400, 'Identificador de fotografía inválido')
    if (!rawEncuadre || expectedFraming === undefined) throw fail(400, 'Envía el encuadre y su valor anterior')
    const cleanEncuadre = framing(rawEncuadre)
    const previousFraming = framing(expectedFraming)
    const conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      const [matches] = await conn.query('SELECT id FROM partidos WHERE id = ? FOR UPDATE', [id])
      if (!matches.length) throw fail(404, 'Partido no encontrado')
      const [rows] = await conn.query('SELECT * FROM fotos_partido WHERE partido_id = ? FOR UPDATE', [id])
      if (!rows[0]) throw fail(404, 'Este partido no tiene fotografía publicada')
      if (rows[0].version !== expected) throw fail(409, 'La fotografía cambió. Recarga la foto antes de guardar el encuadre.')
      const currentFraming = framing(rows[0].encuadre)
      // Replays after a lost response are safe and do not duplicate the audit.
      if (JSON.stringify(currentFraming) === JSON.stringify(cleanEncuadre)) {
        await conn.commit()
        return metadata(rows[0])
      }
      if (JSON.stringify(currentFraming) !== JSON.stringify(previousFraming)) throw fail(409, 'Otro administrador cambió el encuadre. Revisa el actual antes de guardar.')
      await conn.query(
        'UPDATE fotos_partido SET encuadre = ?, updated_at = CURRENT_TIMESTAMP WHERE partido_id = ? AND version = ?',
        [JSON.stringify(cleanEncuadre), id, expected]
      )
      await conn.query(
        'INSERT INTO auditoria_control_partido (partido_id, created_by, accion, detalle) VALUES (?, ?, ?, ?)',
        [id, user.id, 'encuadre_foto', JSON.stringify({ version: expected, encuadre: cleanEncuadre })]
      )
      await conn.commit()
    } catch (error) {
      await conn.rollback().catch(() => {})
      throw publicError(error)
    } finally { conn.release() }
    return get(id)
  }
  return { get, check, save, file, status, remove, updateFraming }
}

module.exports = { createPhotoService, authorize, validate, normalize, publicError, framing }
