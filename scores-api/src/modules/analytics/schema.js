exports.ensure = async db => {
  const end = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  await db.query(`CREATE TABLE IF NOT EXISTS analytics_meta (id INT PRIMARY KEY, started_at DATETIME NOT NULL) ${end}`)
  await db.query('INSERT IGNORE INTO analytics_meta VALUES (1, UTC_TIMESTAMP())')
  await db.query(`CREATE TABLE IF NOT EXISTS analytics_events (
    id CHAR(36) PRIMARY KEY, day DATE NOT NULL, channel VARCHAR(10) NOT NULL,
    path VARCHAR(80) NOT NULL, device VARCHAR(10) NOT NULL, source VARCHAR(16) NOT NULL,
    visitor CHAR(64) NOT NULL, session CHAR(64) NOT NULL,
    created_at DATETIME NOT NULL, KEY ix_ae_day (day,channel)
  ) ${end}`)
  await db.query(`CREATE TABLE IF NOT EXISTS analytics_daily (
    day DATE NOT NULL, channel VARCHAR(10) NOT NULL, path VARCHAR(80) NOT NULL,
    device VARCHAR(10) NOT NULL, source VARCHAR(16) NOT NULL, views BIGINT NOT NULL DEFAULT 0,
    sessions BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY(day,channel,path,device,source)
  ) ${end}`)
  await db.query(`CREATE TABLE IF NOT EXISTS analytics_sessions (
    id CHAR(64) PRIMARY KEY, day DATE NOT NULL, KEY ix_as_day(day)
  ) ${end}`)
}
