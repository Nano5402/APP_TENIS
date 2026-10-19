// Browser-only checks of the ZIP integration: no real API or database writes.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const role of [null, 'miembro', 'juez', 'admin']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      const user = role ? { id: 10, rol: role, nombre: 'Prueba', apellido: 'QA', email: 'qa@example.com', numero_documento: '12345678' } : null
      if (user) await page.addInitScript(user => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { user, isAuthenticated: true }, version: 0 })), user)
      let failTournaments = true
      await page.route('**/*', route => {
        const url = new URL(route.request().url()), ep = url.pathname.replace(/^\/api/, '')
        if (!url.pathname.startsWith('/api/')) return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
        let data = []
        if (ep.endsWith('/me')) data = user
        if (ep === '/partidos/mios') data = { jugador: { id: 1 }, en_vivo: [], proximos: [], historial: [] }
        if (ep === '/torneos') {
          if (failTournaments) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable' }) })
          data = [{ id: 1, nombre: 'Abierto QA', modalidad: 'dobles', estado: 'en_curso', categoria: { id: 1, nombre: 'Cuarta' } }, { id: 2, nombre: 'Finalizado QA', modalidad: 'dobles', estado: 'finalizado', categoria: { id: 2, nombre: 'Quinta' } }]
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) })
      })
      await page.goto('http://127.0.0.1:4173/reglamento')
      await page.getByRole('heading', { level: 1, name: /Reglamento Oficial/ }).waitFor()
      assert.match(await page.getByRole('link', { name: 'Abrir PDF' }).getAttribute('href'), /\.pdf$/)
      const pdf = await page.request.get('http://127.0.0.1:4173/docs/reglamento-oficial-torneo-dobles-2026-vertical.pdf')
      assert.equal(pdf.status(), 200)
      assert.equal((await pdf.body()).subarray(0, 4).toString(), '%PDF')
      await page.locator('.reglamento-sheet img').evaluateAll(images => Promise.all(images.map(img => img.decode())))
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        for (const dark of [false, true]) {
          await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark)
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${role}: regulation fits ${width}`)
        }
      }
      if (user) {
        await page.goto('http://127.0.0.1:4173/mi-actividad')
        await page.getByRole('heading', { name: 'Mi balance' }).waitFor()
        await page.getByRole('button', { name: /Grupos del torneo/ }).click()
        const modal = page.getByRole('dialog', { name: 'Grupos del torneo', exact: true })
        await modal.getByRole('alert').waitFor()
        failTournaments = false
        await modal.getByRole('button', { name: 'Reintentar torneos' }).click()
        await modal.getByRole('heading', { name: 'Abierto QA' }).waitFor()
        await modal.getByRole('combobox', { name: 'Filtrar por categoría' }).selectOption('2')
        assert.equal(await modal.getByRole('heading', { name: 'Abierto QA' }).count(), 0)
        await modal.getByText('Dobles · Finalizado', { exact: true }).waitFor()
        await modal.getByPlaceholder('Buscar torneo o categoría...').fill('No existe')
        await modal.getByText('No se encontraron torneos', { exact: true }).waitFor()
        await modal.getByPlaceholder('Buscar torneo o categoría...').fill('')
        for (const width of [320, 390, 1440]) {
          await page.setViewportSize({ width, height: 900 })
          assert.equal(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true)
        }
        await modal.getByRole('button', { name: 'Ver grupos y posiciones' }).click()
        await page.waitForURL('**/torneo/2?tab=standings')
      }
      assert.deepEqual(errors, [])
      await page.close()
      console.log(`PASS ZIP15: ${role || 'guest'}, regulation/PDF, responsive themes, tournament picker and recovery`)
    }
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
