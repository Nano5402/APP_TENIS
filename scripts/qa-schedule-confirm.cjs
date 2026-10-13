// Local-only regression: all API calls are intercepted, no database access.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      page.setDefaultTimeout(8000)
      const user = { id: 99, rol: 'admin', nombre: 'QA', email: 'qa@example.com', numero_documento: '12345678' }
      const categoria = { id: 1, nombre: 'Cuarta', deporte: 'tenis' }
      const torneo = { id: 1, nombre: 'Torneo QA', deporte: 'tenis', modalidad: 'dobles', sistema: 'grupos_eliminacion', estado: 'en_curso' }
      const teams = [1, 2].map(id => ({ id, nombre: `Pareja ${id}`, deporte: 'tenis', categoria }))
      let writes = 0, fail = false
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.addInitScript(user => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { isAuthenticated: true, user }, version: 0 })), user)
      await page.route('**/*', route => {
        const req = route.request(), url = new URL(req.url()), ep = url.pathname.replace(/^\/api/, '')
        if (!url.pathname.startsWith('/api/')) return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
        let data = []
        if (ep.endsWith('/me')) data = user
        if (ep === '/torneos') data = [torneo]
        if (ep === '/categorias') data = [categoria]
        if (ep === '/equipos') data = teams
        if (ep.endsWith('/grupos')) data = { grupos: [{ nombre: 'GRUPO 1', categoria_id: 1, equipo_ids: [1, 2] }], parejas: teams.map(t => ({ equipo_id: t.id, categoria_id: 1, grupo: 'GRUPO 1' })) }
        if (ep === '/partidos/gestion/programacion') data = { conflicts: [], warnings: [{ message: 'Descanso corto entre partidos' }] }
        if (ep === '/partidos' && req.method() === 'POST') {
          const body = req.postDataJSON()
          assert.equal(Number(body.torneo_id), 1)
          assert.equal(body.grupo, 'GRUPO 1')
          assert.equal(Number(body.equipo1_id), 1)
          assert.equal(Number(body.equipo2_id), 2)
          if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Error simulado al guardar' }) })
          writes++
          data = { id: 100 }
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) })
      })
      await page.goto('http://127.0.0.1:4173/admin/partidos')
      await page.getByRole('button', { name: 'Nuevo partido', exact: true }).click()
      const form = page.getByRole('dialog', { name: 'Nuevo partido', exact: true })
      await form.locator('[name="torneo_id"]').selectOption('1')
      await form.locator('[name="categoria_id"]').selectOption('1')
      await form.locator('select[name="grupo"]:not([disabled])').selectOption('GRUPO 1')
      await form.locator('[name="equipo1_id"]').selectOption('1')
      await form.locator('[name="equipo2_id"]').selectOption('2')
      const save = form.getByRole('button', { name: 'Crear partido', exact: true })
      const dialog = page.getByRole('dialog', { name: 'Revisa duración y descanso', exact: true })
      await save.click()
      await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
      assert.equal(writes, 0)
      assert.equal(await form.locator('[name="equipo1_id"]').inputValue(), '1')
      await save.click()
      await dialog.waitFor()
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      assert.equal(await form.isVisible(), true)
      fail = true
      await save.click()
      await dialog.getByRole('button', { name: 'Guardar programación', exact: true }).click()
      await form.getByRole('alert').filter({ hasText: 'Error simulado al guardar' }).waitFor()
      fail = false
      await save.click()
      await dialog.getByRole('button', { name: 'Guardar programación', exact: true }).click()
      await form.waitFor({ state: 'detached' })
      assert.equal(writes, 1)
      assert.deepEqual(errors, [])
      console.log(`PASS ${width}px: tournament creation, visible confirmation, cancel, Escape, failure and retry`)
      await page.close()
    }
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
