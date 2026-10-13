// Isolated UI fixtures: never connects to a real API/database.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' })
  try {
    for (const rol of ['admin', 'juez', 'miembro']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page = await context.newPage(), errors = []
      page.on('pageerror', e => errors.push(e.message))
      const user = { id: rol === 'admin' ? 99 : rol === 'juez' ? 3 : 4, rol, nombre: 'QA', apellido: 'Prueba', email: 'test@example.com', numero_documento: '12345678' }
      const list = [{ id: 8, nombre: 'Andrés Caddie', activo: 1, revision: 1 }]
      let own = null, assignment = null, failed = false
      const match = { id: 30, estado: 'finalizado', deporte: 'tenis', modalidad: 'singles', ganador: 'jugador1', fecha_inicio: '2026-10-06', hora_inicio: '10:00:00', juez: { id: 3, nombre: 'QA', apellido: 'Prueba' }, jugador1: { id: 1, nombre: 'Ana', apellido: 'Pérez' }, jugador2: { id: 2, nombre: 'Luis', apellido: 'Díaz' }, sets: [{ games_j1: 6, games_j2: 4 }], cancha: { id: 1, nombre: 'Cancha 1' } }
      const status = () => ({ caddie: assignment, revision: assignment ? 1 : 0, can_assign: rol !== 'miembro', can_rate: Boolean(assignment) && rol !== 'admin', propia: own, can_view_ratings: rol !== 'miembro', valoraciones: rol === 'miembro' ? [] : own ? [own] : [] })
      await page.addInitScript(user => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { isAuthenticated: true, user }, version: 0 })), user)
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()), ep = url.pathname.replace(/^\/api/, '')
        if (!url.pathname.startsWith('/api/')) return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
        let data = []
        if (ep.endsWith('/me')) data = user
        else if (ep === '/partidos/30') data = match
        else if (ep.endsWith('/foto')) data = null
        else if (ep === '/caddies' && req.method() === 'POST') {
          const body = req.postDataJSON(); list.push({ id: 9, nombre: body.nombre, activo: body.activo, revision: 1 }); data = list
        } else if (ep === '/caddies') data = list
        else if (ep === '/caddies/valoraciones') data = { items: [], page: 1, more: false }
        else if (ep === '/caddies/partidos/30/asignacion') {
          assert.equal(req.postDataJSON().expected_revision, 0)
          assignment = { caddie_id: 8, nombre: 'Andrés Caddie', revision: 1 }; data = status()
        } else if (ep === '/caddies/partidos/30/valoracion') {
          const body = req.postDataJSON(); assert.equal(body.caddie_id, 8)
          if (failed) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'Prueba sin conexión' }) })
          own = { estrellas: body.estrellas, comentario: body.comentario, tipo: rol === 'juez' ? 'juez' : 'jugador', revision: (own?.revision || 0) + 1, propia: true }; data = status()
        } else if (ep === '/caddies/partidos/30') data = status()
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) })
      })
      if (rol === 'admin') {
        await page.goto('http://127.0.0.1:4173/admin/caddies')
        await page.getByRole('button', { name: 'Añadir caddie' }).click()
        await page.getByLabel('Nombre', { exact: true }).fill('María Caddie')
        await page.getByRole('button', { name: 'Guardar', exact: true }).click()
        await page.getByRole('button', { name: /María Caddie/ }).waitFor()
        await page.getByRole('button', { name: /María Caddie/ }).click()
        await page.getByRole('checkbox', { name: 'Disponible para nuevas asignaciones' }).uncheck()
        await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
      } else {
        if (rol === 'miembro') assignment = { caddie_id: 8, nombre: 'Andrés Caddie', revision: 1 }
        await page.goto('http://127.0.0.1:4173/match/30')
        const section = page.getByRole('region', { name: 'Caddie del partido' })
        if (rol === 'juez') {
          await section.getByRole('combobox').selectOption('8').catch(async e => { console.error(page.url(), errors, (await page.locator('body').innerText()).slice(0, 2500)); throw e })
          await section.getByRole('button', { name: 'Confirmar caddie' }).click()
          await section.getByText('Caddie confirmado', { exact: true }).waitFor()
        } else assert.equal(await section.getByRole('button', { name: 'Confirmar caddie' }).count(), 0)
        await section.getByRole('button', { name: '5 estrellas', exact: true }).click()
        await section.getByLabel('Comentario opcional').fill('Excelente acompañamiento')
        failed = true
        await section.getByRole('button', { name: 'Enviar valoración' }).click()
        await section.getByText('Prueba sin conexión', { exact: true }).waitFor()
        assert.equal(await section.getByLabel('Comentario opcional').inputValue(), 'Excelente acompañamiento')
        failed = false
        await section.getByRole('button', { name: 'Enviar valoración' }).click()
        await section.getByText('Gracias. Tu valoración quedó guardada').waitFor()
        await page.reload()
        await section.getByRole('button', { name: 'Actualizar valoración' }).waitFor()
        assert.equal(await section.getByRole('button', { name: '5 estrellas', exact: true }).getAttribute('aria-pressed'), 'true')
        if (rol === 'miembro') assert.equal(await section.getByText(/Valoraciones del partido/).count(), 0)
      }
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${rol} fits ${width}`)
      }
      if (rol === 'miembro') {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.getByRole('region', { name: 'Caddie del partido' }).screenshot({ path: path.join(os.tmpdir(), 'caddie-rating-mobile.png') })
      }
      assert.deepEqual(errors, [])
      console.log(`PASS caddies ${rol}: mobile/desktop, scoped actions, persistence and errors`)
      await context.close()
    }
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
