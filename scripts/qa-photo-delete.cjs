// Local browser fixtures only; never accesses the production API.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const rol of ['admin', 'juez', 'juez_director', 'miembro', null]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      const user = rol ? { id: 3, rol, nombre: 'QA', apellido: 'Prueba', email: 'qa@example.com', numero_documento: '12345678' } : null
      if (user) await page.addInitScript(user => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { isAuthenticated: true, user }, version: 0 })), user)
      let photo = { version: '11111111-1111-4111-8111-111111111111', momento: 'inicio' }, mode = 503, deletes = 0
      await page.route('**/*', route => {
        const req = route.request(), u = new URL(req.url()), ep = u.pathname.replace(/^\/api/, '')
        if (!u.pathname.startsWith('/api/')) return u.hostname === '127.0.0.1' ? route.continue() : route.abort()
        let data = []
        if (ep.endsWith('/me')) data = user
        if (ep === '/partidos/30') data = { id: 30, estado: 'finalizado', deporte: 'tenis', modalidad: 'singles', jugador1: { nombre: 'Ana' }, jugador2: { nombre: 'Luis' }, sets: [] }
        if (ep.endsWith('/foto')) {
          if (req.method() === 'DELETE') {
            deletes++
            assert.equal(req.postDataJSON().expected, photo.version)
            if (mode !== 200) return route.fulfill({ status: mode, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'Error simulado: vuelve a intentar' }) })
            photo = null
          }
          data = photo
        }
        if (ep.endsWith('/imagen')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"><rect width="100" height="150" fill="green"/></svg>' })
        if (ep.endsWith('/estado')) data = { configured: true, writable: true }
        if (ep.startsWith('/caddies/partidos/')) data = { can_assign: false, can_rate: false, valoraciones: [] }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) })
      })
      await page.goto('http://127.0.0.1:4173/match/30')
      const card = page.getByRole('region', { name: 'Foto del partido', exact: true })
      await card.waitFor()
      const remove = card.getByRole('button', { name: 'Eliminar foto', exact: true })
      if (rol === 'admin') {
        await remove.click()
        await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click()
        assert.equal(deletes, 0)
        for (const status of [503, 409, 200]) {
          mode = status
          await remove.click()
          await page.getByRole('dialog').getByRole('button', { name: 'Eliminar foto', exact: true }).click()
          if (status !== 200) {
            await card.getByRole('alert').waitFor()
            await remove.waitFor()
          } else await card.waitFor({ state: 'detached' })
        }
        assert.equal(deletes, 3)
      } else assert.equal(await remove.count(), 0)
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
      }
      assert.deepEqual(errors, [])
      await page.close()
      console.log(`PASS photo deletion: ${rol || 'guest'}, permissions, confirmation, retry and layout`)
    }
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
