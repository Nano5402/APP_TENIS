exports.ensureCaddieSchema = async db => {
  await db.query(`CREATE TABLE IF NOT EXISTS caddies (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    revision INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_caddie_nombre (nombre)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  await db.query(`CREATE TABLE IF NOT EXISTS partido_caddies (
    partido_id INT NOT NULL PRIMARY KEY,
    caddie_id INT NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    assigned_by INT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pc_partido FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_pc_author FOREIGN KEY (assigned_by) REFERENCES users(id),
    CONSTRAINT fk_pc_caddie FOREIGN KEY (caddie_id) REFERENCES caddies(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  await db.query(`CREATE TABLE IF NOT EXISTS caddie_valoraciones (
    partido_id INT NOT NULL,
    user_id INT NOT NULL,
    caddie_id INT NOT NULL,
    estrellas TINYINT NOT NULL,
    comentario VARCHAR(1000) NOT NULL DEFAULT '',
    tipo ENUM('juez','jugador') NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (partido_id, user_id),
    KEY ix_cv_caddie (caddie_id, partido_id),
    CONSTRAINT fk_cv_partido FOREIGN KEY (partido_id) REFERENCES partidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_cv_author FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_cv_caddie FOREIGN KEY (caddie_id) REFERENCES caddies(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
}
