const test = require('node:test')
const assert = require('node:assert/strict')
const helmet = require('helmet')
const options = require('../src/config/securityHeaders')

test('CSP permits local photo blobs without weakening scripts or remote image restrictions', () => {
  const headers = new Map()
  helmet(options)({}, { setHeader: (key, value) => headers.set(key, value), removeHeader: key => headers.delete(key) }, () => {})
  const policy = headers.get('Content-Security-Policy')
  assert.match(policy, /(?:^|;)img-src 'self' data: blob:(?:;|$)/)
  assert.match(policy, /(?:^|;)script-src 'self'(?:;|$)/)
  assert.match(policy, /(?:^|;)object-src 'none'(?:;|$)/)
  assert.match(policy, /(?:^|;)default-src 'self'(?:;|$)/)
})
