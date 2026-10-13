const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { authorize, validate, normalize, createPhotoService, publicError } = require('../src/modules/matches/match-photo.service')

const input = () => ({ version: randomUUID(), expected: '', momento: 'inicio', consentimiento: 'true' })
const source = () => sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#36a761' } }).jpeg().withMetadata({ exif: { IFD0: { Artist: 'Private metadata' } } }).toBuffer()
test('photo access only assigned judge or admin; no permission merely from creation', () => {
  authorize({ juez_id: 3 }, { id: 3, rol: 'juez' })
  authorize({ juez_id: 3 }, { id: 2, rol: 'admin' })
  assert.throws(() => authorize({ juez_id: 3, created_by: 2 }, { id: 2, rol: 'juez' }), e => e.status === 403)
  assert.throws(() => authorize({ juez_id: 3 }, { id: 3, rol: 'jugador' }), e => e.status === 403)
  assert.throws(() => authorize(null, { rol: 'admin' }), e => e.status === 404)
})
test('photo inputs require UUID, moment and explicit publication confirmation', () => {
  validate(input())
  for (const override of [{ version: '../secret' }, { expected: '../../a' }, { momento: 'dos' }, { consentimiento: 'false' }]) {
    assert.throws(() => validate({ ...input(), ...override }), e => e.status === 400)
  }
})

test('photo framing accepts bounded coordinates and rejects corrupt or unsafe values', () => {
  validate({ ...input(), encuadre: JSON.stringify({ zoom: 1.2, x: 40, y: 60 }) })
  for (const encuadre of ['oops', '{}', 'null', { zoom: 3, x: 50, y: 50 }, { zoom: 1, x: -1, y: 50 }, { zoom: '1', x: 50, y: 50 }]) {
    assert.throws(() => validate({ ...input(), encuadre }), e => e.status === 400)
  }
})

test('photo framing persists without cropping original pixels and survives retries', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tenis-photo-frame-'))
  try {
    const fake = fixture(), service = createPhotoService(fake.db, directory), actor = { id: 3, rol: 'juez' }
    const encuadre = { zoom: 1.3, x: 45, y: 60 }, item = { ...input(), encuadre: JSON.stringify(encuadre) }
    const result = await service.save(1, actor, item, await source())
    assert.deepEqual(result.encuadre, encuadre)
    assert.equal((await sharp(await fs.readFile(service.file(item.version))).metadata()).width, 1600)
    assert.deepEqual((await service.save(1, actor, item, await source())).encuadre, encuadre)
    await assert.rejects(service.save(1, actor, { ...item, encuadre: '{"zoom":1,"x":50,"y":50}' }, await source()), e => e.status === 409)
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
test('decode real image, resize and strip metadata; reject forged content', async () => {
  const { full, thumb } = await normalize(await source())
  const meta = await sharp(full).metadata()
  assert.equal(meta.width, 1600); assert.equal(meta.format, 'webp'); assert.equal(meta.exif, undefined)
  assert.equal((await sharp(thumb).metadata()).width, 480)
  await assert.rejects(normalize(Buffer.from('<script>alert(1)</script>')), e => e.status === 400)
})
function fixture() {
  let row, writes = 0
  const db = {
    async query(sql, args) {
      if (sql.startsWith('SELECT id')) return [[{ id: 1, juez_id: 3 }]]
      if (sql.startsWith('SELECT')) return [row ? [{ ...row }] : []]
      if (sql.startsWith('INSERT')) { writes++; row = { partido_id: args[0], version: args[1], momento: args[2], created_by: args[3], encuadre: args[5], updated_at: 'now' }; return [{}] }
      throw new Error(sql)
    },
    async getConnection() { return { query: db.query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} } },
  }
  return { db, writes: () => writes }
}
test('one photo per match, idempotent replay and explicit version-checked replacement', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tenis-photo-test-'))
  try {
    const fake = fixture(), service = createPhotoService(fake.db, directory), actor = { id: 3, rol: 'juez' }
    const first = input(), image = await source()
    await service.save(1, actor, first, image)
    await service.save(1, actor, first, image)
    assert.equal(fake.writes(), 1)
    await assert.rejects(service.save(1, actor, input(), image), e => e.status === 409)
    const replacement = { ...input(), expected: first.version, momento: 'final' }
    await service.save(1, actor, replacement, image)
    assert.equal(fake.writes(), 2)
    assert.equal((await service.get(1)).version, replacement.version)
    await assert.rejects(fs.stat(service.file(first.version)), e => e.code === 'ENOENT')
    assert.deepEqual((await fs.readdir(directory)).sort(), [`${replacement.version}-thumb.webp`, `${replacement.version}.webp`].sort())
    assert.throws(() => service.file('../secret'), e => e.status === 400)
    await assert.rejects(service.save(1, actor, first, image), e => e.status === 409)
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
test('missing persistent directory fails closed, without silently writing inside deployment', async () => {
  const { db } = fixture()
  await assert.rejects(createPhotoService(db, '').check(1, { rol: 'admin' }), e => e.status === 503 && e.code === 'PHOTO_STORAGE_UNCONFIGURED')
  await assert.rejects(createPhotoService(db, 'uploads').check(1, { rol: 'admin' }), e => e.status === 503)
})
test('storage errors explain configuration, permissions and capacity without leaking paths', () => {
  for (const [code, expected] of [['EACCES', 'PHOTO_STORAGE_PERMISSIONS'], ['ENOSPC', 'PHOTO_STORAGE_FULL'], ['ENOENT', 'PHOTO_STORAGE_UNAVAILABLE'], ['ER_NO_SUCH_TABLE', 'PHOTO_SCHEMA_NOT_READY']]) {
    const result = publicError(Object.assign(new Error('/home/private-account/secret'), { code }))
    assert.equal(result.status, 503); assert.equal(result.code, expected)
    assert.ok(!result.message.includes('/home/'))
  }
})
test('read-only storage diagnosis supports a missing child directory', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tenis-photo-status-'))
  try {
    const service = createPhotoService(fixture().db, path.join(directory, 'matches'))
    assert.deepEqual(await service.status(1, { rol: 'admin' }), { configured: true, writable: true })
    assert.deepEqual(await fs.readdir(directory), [])
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
test('lost commit response retains files and replay confirms without duplicate write', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tenis-photo-commit-'))
  try {
    const fake = fixture(), originalConnection = fake.db.getConnection
    let failCommit = true
    fake.db.getConnection = async () => ({ ...await originalConnection(), commit: async () => {
      if (failCommit) { failCommit = false; throw new Error('Lost connection after commit') }
    } })
    const service = createPhotoService(fake.db, directory), actor = { id: 3, rol: 'juez' }, item = input(), image = await source()
    await assert.rejects(service.save(1, actor, item, image))
    assert.ok((await fs.stat(service.file(item.version))).size > 0)
    assert.equal((await service.save(1, actor, item, image)).version, item.version)
    assert.equal(fake.writes(), 1)
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
