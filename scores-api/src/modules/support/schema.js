exports.ensureSupportSchema = async (db) => {
  await db.query(`CREATE TABLE IF NOT EXISTS preferencias_avisos (
    user_id INT PRIMARY KEY, cambios_partidos BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS tickets_soporte (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, partido_id INT NULL,
    request_id VARCHAR(64) NOT NULL, asunto VARCHAR(160) NOT NULL,
    categoria VARCHAR(20) NOT NULL, prioridad VARCHAR(12) NOT NULL,
    mensaje TEXT NOT NULL, estado VARCHAR(20) NOT NULL DEFAULT 'abierto',
    version INT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ticket_request (user_id, request_id), KEY idx_ticket_estado (estado, updated_at),
    FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS ticket_respuestas (
    id INT AUTO_INCREMENT PRIMARY KEY, ticket_id INT NOT NULL, user_id INT NOT NULL,
    mensaje TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets_soporte(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS notificaciones (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL,
    clave VARCHAR(180) NOT NULL, titulo VARCHAR(180) NOT NULL, mensaje VARCHAR(1000) NOT NULL,
    link VARCHAR(180) NOT NULL, leido_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_notificacion_evento (user_id, clave), KEY idx_notificacion_usuario (user_id, id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  const notificationIdType=await require('./legacy-notifications').prepareNotifications(db)
  await db.query(`CREATE TABLE IF NOT EXISTS push_suscripciones (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, endpoint_hash CHAR(64) NOT NULL UNIQUE,
    endpoint VARCHAR(2048) NOT NULL, p256dh VARCHAR(100) NOT NULL, auth VARCHAR(32) NOT NULL,
    session_version INT NOT NULL, expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await db.query(`CREATE TABLE IF NOT EXISTS push_entregas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, notificacion_id ${notificationIdType} NOT NULL, suscripcion_id INT NOT NULL,
    attempts INT NOT NULL DEFAULT 0, done BOOLEAN NOT NULL DEFAULT FALSE, lease CHAR(36) NULL,
    available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_push_delivery (notificacion_id,suscripcion_id), KEY idx_push_pending (done,available_at),
    FOREIGN KEY (notificacion_id) REFERENCES notificaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (suscripcion_id) REFERENCES push_suscripciones(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}
