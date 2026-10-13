const db = require('./db')

const columnExists = async (tableName, columnName) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  )
  return Number(rows[0].total) > 0
}

const getColumn = async (tableName, columnName) => {
  const [rows] = await db.query(
    `SELECT DATA_TYPE AS dataType, IS_NULLABLE AS isNullable
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  )
  return rows[0] || null
}

const getColumnType = async (tableName, columnName) => {
  const [rows] = await db.query(
    `SELECT COLUMN_TYPE AS columnType
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  )
  return rows[0]?.columnType || null
}

const columnIndexExists = async (tableName, columnName) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  )
  return Number(rows[0].total) > 0
}

const uniqueColumnIndexExists = async (tableName, columnName) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
       AND NON_UNIQUE = 0`,
    [tableName, columnName]
  )
  return Number(rows[0].total) > 0
}

const columnForeignKeyExists = async (tableName, columnName) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [tableName, columnName]
  )
  return Number(rows[0].total) > 0
}

exports.ensureSchema = async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS torneo_retiros (
    torneo_id BIGINT NOT NULL, tipo VARCHAR(10) NOT NULL, participante_id BIGINT NOT NULL,
    retirado BOOLEAN NOT NULL DEFAULT TRUE, version INT NOT NULL DEFAULT 1,
    PRIMARY KEY (torneo_id,tipo,participante_id)
  ) ENGINE=InnoDB`)
  // No cascading FK: the audit survives tournament deletion.
  await db.query(`CREATE TABLE IF NOT EXISTS auditoria_retiros (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, torneo_id BIGINT NOT NULL,
    tipo VARCHAR(10) NOT NULL, participante_id BIGINT NOT NULL, actor_id BIGINT NOT NULL,
    retirado BOOLEAN NOT NULL, motivo VARCHAR(500) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_retiros_torneo (torneo_id,id)
  ) ENGINE=InnoDB`)
  // No foreign keys: deletion history survives the original entity and account.
  await db.query(`CREATE TABLE IF NOT EXISTS auditoria_eliminaciones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entidad VARCHAR(40) NOT NULL, registro_id BIGINT NOT NULL, actor_id BIGINT NULL,
    detalle JSON NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_eliminacion (entidad,registro_id)
  ) ENGINE=InnoDB`)
  // Independent audit: retain history even after the entity or account is deleted.
  await db.query(`CREATE TABLE IF NOT EXISTS auditoria_ediciones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entidad VARCHAR(40) NOT NULL, registro_id BIGINT NOT NULL, actor_id BIGINT NULL,
    accion VARCHAR(80) NOT NULL, detalle JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_edicion_registro (entidad,registro_id), KEY idx_edicion_fecha (created_at,id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  // Independent tournament membership: never infer or populate it from old matches.
  await db.query(`CREATE TABLE IF NOT EXISTS torneo_grupos (
    torneo_id INT NOT NULL, categoria_id INT NOT NULL, nombre VARCHAR(20) NOT NULL,
    PRIMARY KEY (torneo_id,categoria_id,nombre)
  ) ENGINE=InnoDB`)
  await db.query(`CREATE TABLE IF NOT EXISTS torneo_grupo_parejas (
    torneo_id INT NOT NULL, equipo_id INT NOT NULL, categoria_id INT NOT NULL, grupo VARCHAR(20) NOT NULL,
    PRIMARY KEY (torneo_id,equipo_id), KEY idx_grupo (torneo_id,categoria_id,grupo)
  ) ENGINE=InnoDB`)
  // Immutable membership evidence for results after a tournament withdrawal.
  // Separate from the current group roster; reactivation must not erase it.
  await db.query(`CREATE TABLE IF NOT EXISTS torneo_grupo_historial (
    torneo_id INT NOT NULL, equipo_id INT NOT NULL, categoria_id INT NOT NULL,
    grupo VARCHAR(20) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (torneo_id,equipo_id,categoria_id,grupo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  // Almacenamiento persistente de fotos de perfil y multimedia frente a despliegues efímeros
  await db.query(`CREATE TABLE IF NOT EXISTS media_storage (
    path VARCHAR(255) NOT NULL PRIMARY KEY,
    mime_type VARCHAR(100) NOT NULL,
    data MEDIUMBLOB NOT NULL,
    size INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  await db.query(`CREATE TABLE IF NOT EXISTS anuncios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    contenido TEXT NOT NULL,
    imagen_url VARCHAR(255) NULL,
    tipo ENUM('noticia','evento','resultado','aviso') NOT NULL DEFAULT 'noticia',
    publicado TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_anuncios_tipo_publicado (tipo, publicado),
    KEY idx_anuncios_created_at (created_at DESC)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  // Nullable identities preserve unknown data; never invent documents/emails.
  if ((await getColumn('users', 'numero_documento'))?.isNullable === 'NO') {
    await db.query('ALTER TABLE users MODIFY numero_documento VARCHAR(20) NULL')
  }
  if ((await getColumn('users', 'email'))?.isNullable === 'NO') {
    await db.query('ALTER TABLE users MODIFY email VARCHAR(150) NULL')
  }
  if (!(await columnExists('users', 'telefono_acceso'))) {
    await db.query('ALTER TABLE users ADD COLUMN telefono_acceso VARCHAR(10) NULL')
  }
  if (!(await uniqueColumnIndexExists('users', 'telefono_acceso'))) {
    const { normalizePhone } = require('../utils/memberIdentity')
    const [members] = await db.query(
      "SELECT id, telefono FROM users WHERE rol IN ('miembro', 'admin')"
    )
    const phones = new Map()
    for (const member of members) {
      try {
        const key = normalizePhone(member.telefono)
        if (key) phones.set(key, [...(phones.get(key) || []), member.id])
      } catch {
        /* Existing invalid contact data must not prevent startup. */
      }
    }
    // No se cruza aquí con documento/usuario: esos choques se bloquean al
    // crear/editar y se resuelven desde Administración sin adivinar cuentas.
    for (const [key, ids] of phones) {
      // Shared numbers require an admin to resolve them; never pick an account.
      if (ids.length === 1)
        await db.query('UPDATE users SET telefono_acceso = ? WHERE id = ?', [key, ids[0]])
    }
    await db.query('ALTER TABLE users ADD UNIQUE KEY uq_users_telefono_acceso (telefono_acceso)')
  }
  // Cuentas creadas antes de habilitar el acceso por celular para admin:
  // inicializa números históricos válidos y no repetidos sin tocar los ya asignados.
  try {
    const { normalizePhone: normalizeAdminPhone } = require('../utils/memberIdentity')
    const [admins] = await db.query(
      "SELECT id, telefono, telefono_acceso FROM users WHERE rol = 'admin' AND telefono_acceso IS NULL AND telefono IS NOT NULL"
    )
    for (const admin of admins) {
      let key = null
      try {
        key = normalizeAdminPhone(admin.telefono)
      } catch {
        continue
      }
      if (!key) continue
      try {
        await db.query('UPDATE users SET telefono_acceso = ? WHERE id = ?', [key, admin.id])
      } catch (err) {
        // Duplicado con otra cuenta: se deja en NULL para resolución manual.
        if (err.code !== 'ER_DUP_ENTRY') throw err
      }
    }
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err
  }
  if (!(await columnExists('users', 'session_version'))) {
    await db.query('ALTER TABLE users ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 0')
  }
  const roleType = await getColumnType('users', 'rol')
  if (roleType && !roleType.includes("'juez_director'")) {
    await db.query(
      "ALTER TABLE users MODIFY rol ENUM('admin','juez_director','juez','miembro') NOT NULL DEFAULT 'miembro'"
    )
  }

  if (!(await columnExists('users', 'avatar'))) {
    await db.query('ALTER TABLE users ADD COLUMN avatar VARCHAR(255) NULL AFTER telefono')
  }
  if (!(await columnExists('users', 'usuario'))) {
    await db.query('ALTER TABLE users ADD COLUMN usuario VARCHAR(50) NULL AFTER numero_documento')
  }
  if (!(await uniqueColumnIndexExists('users', 'usuario'))) {
    const [duplicates] = await db.query(
      `SELECT usuario
       FROM users
       WHERE usuario IS NOT NULL
       GROUP BY usuario
       HAVING COUNT(*) > 1
       LIMIT 1`
    )
    if (duplicates.length) {
      throw new Error('Hay usuarios con el mismo alias; corrige los duplicados antes de continuar')
    }
    await db.query('ALTER TABLE users ADD UNIQUE KEY uq_users_usuario (usuario)')
  }
  if (!(await columnExists('jugadores', 'user_id'))) {
    await db.query('ALTER TABLE jugadores ADD COLUMN user_id INT NULL AFTER id')
  }
  if (!(await columnExists('jugadores', 'foto'))) {
    await db.query('ALTER TABLE jugadores ADD COLUMN foto VARCHAR(255) NULL AFTER deporte')
  }
  if (!(await columnForeignKeyExists('jugadores', 'user_id'))) {
    await db.query(
      `ALTER TABLE jugadores
       ADD CONSTRAINT fk_jugadores_user
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`
    )
  }
  if (!(await uniqueColumnIndexExists('jugadores', 'user_id'))) {
    const [duplicates] = await db.query(
      `SELECT user_id
       FROM jugadores
       WHERE user_id IS NOT NULL
       GROUP BY user_id
       HAVING COUNT(*) > 1
       LIMIT 1`
    )
    if (duplicates.length) {
      throw new Error(
        'Hay cuentas vinculadas a más de un jugador; corrige los duplicados antes de continuar'
      )
    }
    await db.query('ALTER TABLE jugadores ADD UNIQUE KEY uq_jugadores_user_id (user_id)')
  }

  const tournamentStart = await getColumn('torneos', 'fecha_inicio')
  const tournamentEnd = await getColumn('torneos', 'fecha_fin')
  if (tournamentStart?.isNullable === 'NO') {
    await db.query('ALTER TABLE torneos MODIFY fecha_inicio DATE NULL')
  }
  if (tournamentEnd?.isNullable === 'NO') {
    await db.query('ALTER TABLE torneos MODIFY fecha_fin DATE NULL')
  }
  if (!(await columnExists('torneos', 'categoria_id'))) {
    await db.query('ALTER TABLE torneos ADD COLUMN categoria_id INT NULL AFTER deporte')
  }
  const tournamentCategoryColumn = await getColumn('torneos', 'categoria_id')
  if (tournamentCategoryColumn?.isNullable === 'NO') {
    await db.query('ALTER TABLE torneos MODIFY categoria_id INT NULL')
  }
  if (!(await columnExists('torneos', 'modalidad'))) {
    await db.query(
      "ALTER TABLE torneos ADD COLUMN modalidad ENUM('individual','dobles') NOT NULL DEFAULT 'individual' AFTER categoria_id"
    )
    await db.query("UPDATE torneos SET modalidad = 'dobles' WHERE deporte = 'padel'")
  }
  if (!(await columnExists('torneos', 'sistema'))) {
    await db.query(
      "ALTER TABLE torneos ADD COLUMN sistema ENUM('por_definir','eliminacion_directa','todos_contra_todos','grupos_eliminacion') NOT NULL DEFAULT 'por_definir' AFTER modalidad"
    )
  }
  const tournamentSystemType = await getColumnType('torneos', 'sistema')
  if (!(await columnExists('torneos', 'archivado_at'))) {
    await db.query('ALTER TABLE torneos ADD COLUMN archivado_at DATETIME NULL')
  }
  await db.query(`CREATE TABLE IF NOT EXISTS auditoria_archivo_torneos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, torneo_id INT NOT NULL,
    actor_id INT NOT NULL, archivado BOOLEAN NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_archivo_torneo (torneo_id,id)
  ) ENGINE=InnoDB`)
  if (tournamentSystemType && !tournamentSystemType.includes("'por_definir'")) {
    await db.query(
      "ALTER TABLE torneos MODIFY sistema ENUM('por_definir','eliminacion_directa','todos_contra_todos','grupos_eliminacion') NOT NULL DEFAULT 'por_definir'"
    )
  }
  if (!(await columnIndexExists('torneos', 'categoria_id'))) {
    await db.query('CREATE INDEX idx_torneos_categoria ON torneos (categoria_id)')
  }
  if (!(await columnForeignKeyExists('torneos', 'categoria_id'))) {
    await db.query(
      `ALTER TABLE torneos
       ADD CONSTRAINT fk_torneos_categoria
       FOREIGN KEY (categoria_id) REFERENCES categorias(id)`
    )
  }

  if (!(await columnExists('equipos_padel', 'deporte'))) {
    await db.query(
      "ALTER TABLE equipos_padel ADD COLUMN deporte ENUM('tenis','padel') NOT NULL DEFAULT 'padel' AFTER nombre"
    )
  }

  if (!(await columnExists('partidos', 'torneo_id'))) {
    await db.query('ALTER TABLE partidos ADD COLUMN torneo_id INT NULL AFTER id')
  }

  if (!(await columnExists('partidos', 'hora_inicio'))) {
    await db.query('ALTER TABLE partidos ADD COLUMN hora_inicio TIME NULL AFTER fecha_inicio')
  }
  if (!(await columnExists('partidos', 'fase'))) {
    await db.query(
      "ALTER TABLE partidos ADD COLUMN fase ENUM('liga','grupos','eliminacion') NULL AFTER hora_inicio"
    )
  }
  if (!(await columnExists('partidos', 'grupo'))) {
    await db.query('ALTER TABLE partidos ADD COLUMN grupo VARCHAR(20) NULL AFTER fase')
  }
  if (!(await columnExists('partidos', 'ronda'))) {
    await db.query('ALTER TABLE partidos ADD COLUMN ronda VARCHAR(50) NULL AFTER grupo')
  }

  const matchStart = await getColumn('partidos', 'fecha_inicio')
  if (['timestamp', 'datetime'].includes(matchStart?.dataType)) {
    await db.query(
      `UPDATE partidos
       SET hora_inicio = TIME(fecha_inicio)
       WHERE fecha_inicio IS NOT NULL
         AND hora_inicio IS NULL`
    )
  }
  if (matchStart && (matchStart.dataType !== 'date' || matchStart.isNullable === 'NO')) {
    await db.query('ALTER TABLE partidos MODIFY fecha_inicio DATE NULL')
  }

  if (!(await columnExists('partidos', 'categoria_id'))) {
    await db.query('ALTER TABLE partidos ADD COLUMN categoria_id INT NULL AFTER deporte')
  }
  if (!(await columnExists('partidos', 'notas'))) {
    await db.query('ALTER TABLE partidos ADD COLUMN notas TEXT NULL AFTER fecha_inicio')
  }
  if (!(await columnExists('partidos', 'origen_partido1_id'))) {
    await db.query('ALTER TABLE partidos ADD COLUMN origen_partido1_id INT NULL AFTER equipo2_id')
  }
  if (!(await columnExists('partidos', 'origen_partido2_id'))) {
    await db.query(
      'ALTER TABLE partidos ADD COLUMN origen_partido2_id INT NULL AFTER origen_partido1_id'
    )
  }
  if (!(await columnExists('partidos', 'juez_id'))) {
    await db.query('ALTER TABLE partidos ADD COLUMN juez_id INT NULL AFTER origen_partido2_id')
  }
  if (!(await columnExists('partidos', 'cancha_id'))) {
    await db.query('ALTER TABLE partidos ADD COLUMN cancha_id INT NULL AFTER juez_id')
  }
  if (!(await columnExists('partidos', 'mejor_de_sets'))) {
    await db.query(
      'ALTER TABLE partidos ADD COLUMN mejor_de_sets TINYINT NOT NULL DEFAULT 3 AFTER cancha_id'
    )
  }
  if (!(await columnExists('partidos', 'juegos_por_set'))) {
    await db.query(
      'ALTER TABLE partidos ADD COLUMN juegos_por_set TINYINT NOT NULL DEFAULT 6 AFTER mejor_de_sets'
    )
  }
  if (!(await columnExists('partidos', 'diferencia_juegos'))) {
    await db.query(
      'ALTER TABLE partidos ADD COLUMN diferencia_juegos TINYINT NOT NULL DEFAULT 2 AFTER juegos_por_set'
    )
  }
  if (!(await columnExists('partidos', 'modo_game'))) {
    await db.query(
      "ALTER TABLE partidos ADD COLUMN modo_game ENUM('ventaja','sin_ventaja') NOT NULL DEFAULT 'ventaja' AFTER mejor_de_sets"
    )
  }
  if (!(await columnExists('partidos', 'set_decisivo'))) {
    await db.query(
      "ALTER TABLE partidos ADD COLUMN set_decisivo ENUM('set_completo','match_tiebreak') NOT NULL DEFAULT 'set_completo' AFTER modo_game"
    )
  }
  if (!(await columnExists('partidos', 'tiebreak_en'))) {
    await db.query(
      'ALTER TABLE partidos ADD COLUMN tiebreak_en TINYINT NOT NULL DEFAULT 6 AFTER set_decisivo'
    )
  }
  if (!(await columnExists('partidos', 'tiebreak_puntos'))) {
    await db.query(
      'ALTER TABLE partidos ADD COLUMN tiebreak_puntos TINYINT NOT NULL DEFAULT 7 AFTER tiebreak_en'
    )
  }
  if (!(await columnExists('partidos', 'match_tiebreak_puntos'))) {
    await db.query(
      'ALTER TABLE partidos ADD COLUMN match_tiebreak_puntos TINYINT NOT NULL DEFAULT 10 AFTER tiebreak_puntos'
    )
  }
  if (!(await columnExists('partidos', 'servidor_inicial'))) {
    await db.query(
      "ALTER TABLE partidos ADD COLUMN servidor_inicial ENUM('jugador1','jugador2') NOT NULL DEFAULT 'jugador1' AFTER match_tiebreak_puntos"
    )
  }

  const hasLegacyTournamentRelation = await columnExists('partidos', 'torneo_id')
  const hasLegacyTournamentCategory = await columnExists('torneos', 'categoria_id')
  const tournamentJoin =
    hasLegacyTournamentRelation && hasLegacyTournamentCategory
      ? 'LEFT JOIN torneos t ON t.id = p.torneo_id'
      : ''
  const tournamentCategory =
    hasLegacyTournamentRelation && hasLegacyTournamentCategory ? 't.categoria_id,' : ''

  await db.query(`
      UPDATE partidos p
      ${tournamentJoin}
      LEFT JOIN jugadores j1 ON j1.id = p.jugador1_id
      LEFT JOIN jugadores j2 ON j2.id = p.jugador2_id
      LEFT JOIN equipos_padel e1 ON e1.id = p.equipo1_id
      LEFT JOIN equipos_padel e2 ON e2.id = p.equipo2_id
      SET p.categoria_id = COALESCE(
        p.categoria_id,
        ${tournamentCategory}
        j1.categoria_id,
        j2.categoria_id,
        e1.categoria_id,
        e2.categoria_id
      )
      WHERE p.categoria_id IS NULL
    `)

  if (!(await columnIndexExists('partidos', 'categoria_id'))) {
    await db.query('CREATE INDEX idx_partidos_categoria ON partidos (categoria_id)')
  }

  if (!(await columnIndexExists('partidos', 'torneo_id'))) {
    await db.query('CREATE INDEX idx_partidos_torneo ON partidos (torneo_id)')
  }
  if (!(await columnForeignKeyExists('partidos', 'torneo_id'))) {
    await db.query(
      `ALTER TABLE partidos
       ADD CONSTRAINT fk_partidos_torneo
       FOREIGN KEY (torneo_id) REFERENCES torneos(id)`
    )
  }

  if (!(await columnForeignKeyExists('partidos', 'categoria_id'))) {
    await db.query(
      `ALTER TABLE partidos
       ADD CONSTRAINT fk_partidos_categoria
       FOREIGN KEY (categoria_id) REFERENCES categorias(id)`
    )
  }

  if (!(await columnIndexExists('partidos', 'origen_partido1_id'))) {
    await db.query('CREATE INDEX idx_partidos_origen1 ON partidos (origen_partido1_id)')
  }
  if (!(await columnIndexExists('partidos', 'origen_partido2_id'))) {
    await db.query('CREATE INDEX idx_partidos_origen2 ON partidos (origen_partido2_id)')
  }
  if (!(await columnForeignKeyExists('partidos', 'origen_partido1_id'))) {
    await db.query(
      `ALTER TABLE partidos
       ADD CONSTRAINT fk_partidos_origen1
       FOREIGN KEY (origen_partido1_id) REFERENCES partidos(id) ON DELETE SET NULL`
    )
  }
  if (!(await columnForeignKeyExists('partidos', 'origen_partido2_id'))) {
    await db.query(
      `ALTER TABLE partidos
       ADD CONSTRAINT fk_partidos_origen2
       FOREIGN KEY (origen_partido2_id) REFERENCES partidos(id) ON DELETE SET NULL`
    )
  }
  if (!(await columnIndexExists('partidos', 'juez_id'))) {
    await db.query('CREATE INDEX idx_partidos_juez ON partidos (juez_id)')
  }
  if (!(await columnForeignKeyExists('partidos', 'juez_id'))) {
    await db.query(
      `ALTER TABLE partidos
       ADD CONSTRAINT fk_partidos_juez
       FOREIGN KEY (juez_id) REFERENCES users(id) ON DELETE SET NULL`
    )
  }
  if (!(await columnIndexExists('partidos', 'cancha_id'))) {
    await db.query('CREATE INDEX idx_partidos_cancha ON partidos (cancha_id)')
  }
  if (!(await columnForeignKeyExists('partidos', 'cancha_id'))) {
    await db.query(
      `ALTER TABLE partidos
       ADD CONSTRAINT fk_partidos_cancha
       FOREIGN KEY (cancha_id) REFERENCES canchas(id) ON DELETE SET NULL`
    )
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS eventos_partido (
      id               BIGINT NOT NULL AUTO_INCREMENT,
      partido_id       INT NOT NULL,
      secuencia        INT NOT NULL,
      tipo             ENUM('punto','primera_falta','let') NOT NULL,
      ganador          ENUM('jugador1','jugador2') NULL,
      motivo           VARCHAR(40) NULL,
      servidor         ENUM('jugador1','jugador2') NOT NULL,
      numero_servicio  TINYINT NOT NULL DEFAULT 1,
      marcador_antes   JSON NOT NULL,
      marcador_despues JSON NOT NULL,
      created_by       INT NOT NULL,
      created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      anulado_at       TIMESTAMP NULL,
      anulado_por      INT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_evento_secuencia (partido_id, secuencia),
      KEY idx_eventos_partido_activos (partido_id, anulado_at, secuencia),
      KEY idx_eventos_created_by (created_by),
      CONSTRAINT fk_eventos_partido
        FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE CASCADE,
      CONSTRAINT fk_eventos_created_by FOREIGN KEY (created_by) REFERENCES users(id),
      CONSTRAINT fk_eventos_anulado_por FOREIGN KEY (anulado_por) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  const eventType = await getColumnType('eventos_partido', 'tipo')
  if (eventType && !eventType.includes("'correccion'")) {
    await db.query(
      "ALTER TABLE eventos_partido MODIFY tipo ENUM('punto','primera_falta','let','cambio_servidor','correccion') NOT NULL"
    )
  }

  if (!(await columnExists('partidos', 'control_version'))) {
    await db.query(
      'ALTER TABLE partidos ADD COLUMN control_version INT UNSIGNED NOT NULL DEFAULT 0'
    )
  }
  await db.query(`CREATE TABLE IF NOT EXISTS auditoria_control_partido (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    partido_id INT NOT NULL,
    created_by INT NOT NULL,
    accion VARCHAR(40) NOT NULL,
    detalle JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_auditoria_partido (partido_id, created_at),
    CONSTRAINT fk_auditoria_partido FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_auditoria_usuario FOREIGN KEY (created_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  await db.query(`
    CREATE TABLE IF NOT EXISTS estado_en_vivo_partido (
      partido_id       INT NOT NULL,
      iniciado_at      DATETIME NULL,
      pausado_at       DATETIME NULL,
      segundos_pausa   INT NOT NULL DEFAULT 0,
      finalizado_at    DATETIME NULL,
      updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (partido_id),
      CONSTRAINT fk_estado_en_vivo_partido
        FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  if (!(await columnExists('partidos', 'nombre_override'))) {
    await db.query('ALTER TABLE partidos ADD COLUMN nombre_override VARCHAR(100) NULL AFTER notas')
  }
  if (!(await columnExists('partidos', 'nombre_override_j1'))) {
    await db.query(
      'ALTER TABLE partidos ADD COLUMN nombre_override_j1 VARCHAR(100) NULL AFTER nombre_override'
    )
  }
  if (!(await columnExists('partidos', 'nombre_override_j2'))) {
    await db.query(
      'ALTER TABLE partidos ADD COLUMN nombre_override_j2 VARCHAR(100) NULL AFTER nombre_override_j1'
    )
  }

  // Additive delivery key: a retried point cannot be counted twice.
  if (!(await columnExists('eventos_partido', 'client_action_id'))) {
    await db.query(
      'ALTER TABLE eventos_partido ADD COLUMN client_action_id CHAR(36) NULL, ADD UNIQUE KEY uq_event_client_action (client_action_id)'
    )
  }

  // Never run historical data-cleanup jobs during application startup.
  await db.query(`CREATE TABLE IF NOT EXISTS fotos_partido (
    partido_id INT NOT NULL PRIMARY KEY,
    version CHAR(36) NOT NULL UNIQUE,
    momento ENUM('inicio', 'final') NOT NULL,
    created_by INT NOT NULL,
    bytes INT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_foto_partido FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  if (!(await columnExists('fotos_partido', 'encuadre'))) {
    await db.query('ALTER TABLE fotos_partido ADD COLUMN encuadre JSON NULL')
  }

  if (!(await columnExists('anuncios', 'imagen_url'))) {
    await db.query('ALTER TABLE anuncios ADD COLUMN imagen_url VARCHAR(255) NULL')
  }
  await require('../modules/support/schema').ensureSupportSchema(db)
  await require('../modules/caddies/schema').ensureCaddieSchema(db)
  console.log('✅  Esquema de partidos y jueces actualizado')
}
