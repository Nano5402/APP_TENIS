// Browser-only fixtures: no real API or database requests.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' })
  try {
    const page = await browser.newPage(), events = [], errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', route => {
      const u = new URL(route.request().url())
      if (!u.pathname.startsWith('/api/')) return u.hostname === '127.0.0.1' ? route.continue() : route.abort()
      if (u.pathname.endsWith('/analytics/view')) { events.push(route.request().postDataJSON()); return route.fulfill({ status: 204 }) }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) })
    })
    await page.goto('http://127.0.0.1:4173/ayuda')
    assert.equal(await page.getByRole('button', { name: 'Permitir estadísticas', exact: true }).count(), 0)
    await page.waitForTimeout(800); assert.equal(events.length, 1)
    assert.equal(events[0].measurement, true); assert.equal(events[0].consent, undefined)
    await page.evaluate(() => { history.pushState({}, '', '/ayuda?private=secret'); dispatchEvent(new PopStateEvent('popstate')) })
    await page.waitForTimeout(800); assert.equal(events.length, 1)
    await page.goto('http://127.0.0.1:4173/sponsors')
    await page.waitForTimeout(800); assert.equal(events.length, 2)
    assert.equal(events[0].visitor, events[1].visitor); assert.equal(events[0].session, events[1].session)
    assert.doesNotMatch(JSON.stringify(events), /private|secret|email|user_id/)
    assert.equal(await page.getByRole('button', { name: 'Preferencias de estadísticas', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Desactivar estadísticas', exact: true }).count(), 0)
    // Previously expressed opt-outs remain respected, even without a visible control.
    await page.evaluate(() => localStorage.setItem('traffic-preference-v1', JSON.stringify({ accept: false, at: Date.now() })))
    await page.reload(); await page.waitForTimeout(800); assert.equal(events.length, 2)
    await page.close()
    const admin = await browser.newPage(), user = { id: 1, rol: 'admin', nombre: 'QA', apellido: 'Prueba', email: 'qa@example.com', numero_documento: '12345678' }
    admin.on('pageerror', e => errors.push(e.message))
    await admin.addInitScript(user => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { isAuthenticated: true, user }, version: 0 })), user)
    let fail = false
    await admin.route('**/*', route => {
      const u = new URL(route.request().url())
      if (!u.pathname.startsWith('/api/')) return u.hostname === '127.0.0.1' ? route.continue() : route.abort()
      if (u.pathname.endsWith('/analytics/view')) throw new Error('Admin must not be counted')
      if (u.pathname.endsWith('/analytics/report')) {
        if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'Fallo simulado' }) })
        if (u.searchParams.get('format') === 'csv') return route.fulfill({ contentType: 'text/csv', body: 'Fecha,Vistas\n2026-10-07,25' })
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { started_at: '2026-10-07T12:00:00Z', totals: { views: 25, sessions: 10, visitors: 8 }, previous: { views: 0, sessions: 0, visitors: 0 }, daily: [{ day: '2026-10-07', views: 25, sessions: 10 }], pages: [{ label: '/match/123', views: 25 }], devices: [{ label: 'mobile', views: 25 }], sources: [{ label: 'search', views: 25 }] } }) })
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: u.pathname.endsWith('/me') ? user : [] }) })
    })
    await admin.goto('http://127.0.0.1:4173/admin/visitas')
    await admin.getByText('Vistas por día', { exact: true }).waitFor()
    for (const width of [320, 390, 1440]) {
      await admin.setViewportSize({ width, height: 900 })
      assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
    }
    const downloaded = admin.waitForEvent('download'); await admin.getByRole('button', { name: 'Exportar CSV' }).click()
    assert.match((await downloaded).suggestedFilename(), /visitas-.*\.csv/)
    fail = true; await admin.getByRole('button', { name: 'Hoy', exact: true }).click(); await admin.getByText('Fallo simulado').waitFor()
    fail = false; await admin.getByRole('button', { name: 'Reintentar' }).click(); await admin.getByText('Vistas por día', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    console.log('PASS analytics: default measurement, deduplication, privacy, opt-out, admin report, CSV, retries and responsive layouts')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
