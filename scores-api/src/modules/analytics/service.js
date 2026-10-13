const { createHmac } = require('node:crypto')
const fail = message => { throw { status: 400, message } }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const paths = /^(\/|\/(live|tennis|padel|sponsors|anuncios|ayuda|pantalla)|\/(match|torneo|player|team)\/[1-9]\d{0,9})$/
const dayOf = date => new Date(date.getTime() - 5 * 3600000).toISOString().slice(0, 10)
const shift = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
function validate(body) {
  // Accept the previous opt-in client during rolling deployments; never infer consent.
  if (!body || body.consent === false || (body.measurement !== true && body.consent !== true) || !uuid.test(body.id) || !uuid.test(body.visitor) || !uuid.test(body.session)) fail('Evento inválido')
  if (!paths.test(body.path) || !['mobile', 'tablet', 'desktop'].includes(body.device) || !['direct', 'search', 'social', 'referral', 'internal'].includes(body.source)) fail('Evento inválido')
  return { ...body, channel: body.path === '/pantalla' ? 'display' : 'public' }
}
function range(query, now = new Date()) {
  const today = dayOf(now), from = query.from || shift(today, -29), to = query.to || today
  for (const date of [from, to]) if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail('Fecha inválida')
  if (from > to || to > today || from < shift(today, -730)) fail('Selecciona un período de hasta 24 meses, sin fechas futuras')
  const channel = query.channel || 'public'
  if (!['public', 'display'].includes(channel)) fail('Filtro inválido')
  return { from, to, channel, today }
}
exports.createService = (db, secret) => {
  const hash = (kind, value) => createHmac('sha256', secret).update(`analytics:${kind}:${value}`).digest('hex')
  async function record(body, now = new Date()) {
    const e = validate(body), day = dayOf(now), conn = await db.getConnection()
    try {
      await conn.beginTransaction()
      const [insert] = await conn.query('INSERT IGNORE INTO analytics_events (id,day,channel,path,device,source,visitor,session,created_at) VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP())', [e.id, day, e.channel, e.path, e.device, e.source, hash('visitor', e.visitor), hash(e.channel, e.session)])
      if (insert.affectedRows) {
        const [session] = await conn.query('INSERT IGNORE INTO analytics_sessions (id,day) VALUES (?,?)', [hash(e.channel, e.session), day])
        await conn.query(`INSERT INTO analytics_daily (day,channel,path,device,source,views,sessions) VALUES (?,?,?,?,?,1,?)
          ON DUPLICATE KEY UPDATE views=views+1,sessions=sessions+VALUES(sessions)`, [day, e.channel, e.path, e.device, e.source, session.affectedRows ? 1 : 0])
      }
      await conn.commit()
    } catch (e) { await conn.rollback().catch(() => {}); throw e } finally { conn.release() }
  }
  async function report(query, now = new Date()) {
    const r = range(query, now), args = [r.from, r.to, r.channel]
    const where = 'day BETWEEN ? AND ? AND channel=?'
    const [[meta]] = await db.query('SELECT started_at FROM analytics_meta WHERE id=1')
    const [daily] = await db.query(`SELECT DATE_FORMAT(day,'%Y-%m-%d') AS day,SUM(views) AS views,SUM(sessions) AS sessions FROM analytics_daily WHERE ${where} GROUP BY day ORDER BY day`, args)
    const breakdown = async field => (await db.query(`SELECT ${field} AS label,SUM(views) AS views FROM analytics_daily WHERE ${where} GROUP BY ${field} ORDER BY views DESC,${field} LIMIT 50`, args))[0]
    const [pages, devices, sources] = await Promise.all(['path', 'device', 'source'].map(breakdown))
    const unique = async (from, to) => {
      if (from < shift(r.today, -89)) return null
      const [[row]] = await db.query('SELECT COUNT(DISTINCT visitor) AS total FROM analytics_events WHERE day BETWEEN ? AND ? AND channel=?', [from, to, r.channel])
      return Number(row.total)
    }
    const length = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1
    const previousFrom = shift(r.from, -length), previousTo = shift(r.from, -1)
    const [[previous]] = await db.query(`SELECT COALESCE(SUM(views),0) AS views,COALESCE(SUM(sessions),0) AS sessions FROM analytics_daily WHERE ${where}`, [previousFrom, previousTo, r.channel])
    return { ...r, started_at: meta?.started_at || null, daily, pages, devices, sources,
      totals: { views: daily.reduce((n, d) => n + Number(d.views), 0), sessions: daily.reduce((n, d) => n + Number(d.sessions), 0), visitors: await unique(r.from, r.to) },
      previous: { from: previousFrom, to: previousTo, views: Number(previous.views), sessions: Number(previous.sessions), visitors: await unique(previousFrom, previousTo) } }
  }
  async function cleanup(now = new Date()) {
    const today = dayOf(now)
    let pending = false
    // Bounded batches, no relation to sporting or account records.
    for (let i = 0; i < 4; i++) {
      const [events] = await db.query('DELETE FROM analytics_events WHERE day < ? LIMIT 5000', [shift(today, -89)])
      const [sessions] = await db.query('DELETE FROM analytics_sessions WHERE day < ? LIMIT 5000', [shift(today, -89)])
      const [daily] = await db.query('DELETE FROM analytics_daily WHERE day < ? LIMIT 5000', [shift(today, -730)])
      pending = [events, sessions, daily].some(r => r.affectedRows === 5000)
    }
    return pending
  }
  return { record, report, cleanup }
}
exports.validate = validate
exports.range = range
exports.dayOf = dayOf
exports.csv = data => {
  const lines = [['Sección', 'Fecha / categoría', 'Vistas', 'Sesiones iniciadas', 'Visitantes estimados'], ['Registro habilitado', String(data.started_at || ''), '', '', ''], ['Total', `${data.from} / ${data.to}`, data.totals.views, data.totals.sessions, data.totals.visitors ?? 'No disponible'], ['Período anterior', `${data.previous.from} / ${data.previous.to}`, data.previous.views, data.previous.sessions, data.previous.visitors ?? 'No disponible'], ...data.daily.map(d => ['Diario', d.day, d.views, d.sessions, '']), ...['pages', 'devices', 'sources'].flatMap(k => data[k].map(d => [k, d.label, d.views, '', '']))]
  return '\uFEFF' + lines.map(row => row.map(v => `"${String(v ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`).join(',')).join('\r\n')
}
