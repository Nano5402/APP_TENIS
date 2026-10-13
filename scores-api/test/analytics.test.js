const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createService, validate, range, dayOf, csv } = require('../src/modules/analytics/service')
const event = () => ({ id: randomUUID(), visitor: randomUUID(), session: randomUUID(), consent: true, path: '/match/12', device: 'mobile', source: 'direct' })
const now = new Date('2026-10-07T12:00:00Z')
test('analytics accepts only public paths and minimal allowed fields', () => {
  assert.equal(validate(event()).channel, 'public')
  assert.equal(validate({ ...event(), consent: undefined, measurement: true }).channel, 'public')
  assert.equal(validate({ ...event(), path: '/pantalla' }).channel, 'display')
  for (const override of [{ consent: false }, { path: '/admin' }, { path: '/juez' }, { path: '/match/12?token=secret' }, { path: '/profile' }, { id: 'bad' }, { source: 'private.host' }, { device: 'email@example.com' }]) {
    assert.throws(() => validate({ ...event(), ...override }), e => e.status === 400)
  }
})
test('analytics validates dates, Bogotá day and two-year retention boundary', () => {
  assert.equal(dayOf(new Date('2026-10-07T02:00:00Z')), '2026-10-06')
  assert.deepEqual(range({}, now), { from: '2026-09-08', to: '2026-10-07', channel: 'public', today: '2026-10-07' })
  for (const query of [{ from: '2026-02-30' }, { from: '2027-01-01' }, { from: '2020-01-01' }, { channel: 'all OR 1=1' }, { to: '2026-10-08' }]) assert.throws(() => range(query, now), e => e.status === 400)
})
function fixture() {
  const calls = [], ids = new Set(), sessions = new Set()
  const query = async (sql, args = []) => {
    calls.push({ sql, args })
    if (sql.startsWith('INSERT IGNORE INTO analytics_events')) { const old = ids.has(args[0]); ids.add(args[0]); return [{ affectedRows: old ? 0 : 1 }] }
    if (sql.startsWith('INSERT IGNORE INTO analytics_sessions')) { const old = sessions.has(args[0]); sessions.add(args[0]); return [{ affectedRows: old ? 0 : 1 }] }
    if (/^(INSERT|DELETE)/.test(sql)) return [{ affectedRows: 1 }]
    if (sql.includes('analytics_meta')) return [[{ started_at: '2026-10-07T12:00:00Z' }]]
    if (sql.includes('GROUP BY day')) return [[{ day: '2026-10-07', views: '2', sessions: '1' }]]
    if (sql.includes('COUNT(DISTINCT visitor)')) return [[{ total: 1 }]]
    if (sql.includes('COALESCE')) return [[{ views: '0', sessions: '0' }]]
    return [[{ label: '/match/12', views: 2 }]]
  }
  const db = { query, getConnection: async () => ({ query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} }) }
  return { calls, service: createService(db, 'only-a-test-secret') }
}
test('analytics duplicates do not inflate views; identifiers are hashed and session starts once', async () => {
  const f = fixture(), e = event()
  await f.service.record(e, now); await f.service.record(e, now)
  await f.service.record({ ...e, id: randomUUID(), path: '/live' }, now)
  const writes = f.calls.filter(c => c.sql.startsWith('INSERT INTO analytics_daily'))
  assert.equal(writes.length, 2); assert.equal(writes[0].args.at(-1), 1); assert.equal(writes[1].args.at(-1), 0)
  const stored = f.calls.find(c => c.sql.includes('analytics_events')).args
  assert.notEqual(stored[6], e.visitor); assert.equal(stored[6].length, 64)
  assert.ok(!stored.includes(e.session)); assert.equal(stored[1], '2026-10-07')
})
test('analytics reports numbers, previous period and no invented old unique counts', async () => {
  const f = fixture()
  const r = await f.service.report({}, now)
  assert.deepEqual(r.totals, { views: 2, sessions: 1, visitors: 1 })
  const old = await f.service.report({ from: '2026-01-01' }, now)
  assert.equal(old.totals.visitors, null)
  assert.ok(csv(r).includes('Visitantes estimados'))
  r.pages = [{ label: '=HYPERLINK("evil")', views: 2 }]
  assert.ok(csv(r).includes("'=HYPERLINK"))
})
test('analytics retention deletes only bounded analytics batches', async () => {
  const f = fixture(); await f.service.cleanup(now)
  assert.equal(f.calls.length, 12)
  assert.ok(f.calls.every(c => /^DELETE FROM analytics_/.test(c.sql) && /LIMIT 5000/.test(c.sql)))
  assert.equal(f.calls[0].args[0], '2026-07-10')
})
