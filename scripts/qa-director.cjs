// Local browser fixtures only. Never contacts production or a real database.
const { chromium } = require(process.argv[2] || 'playwright')
const assert = require('node:assert/strict')
const { createInitialState, serializeState } = require('../scores-api/src/modules/matches/score.engine')
const { configurationOf } = require('../scores-api/src/modules/matches/eventDelivery')
const base = 'http://127.0.0.1:4175'
const category = { id: 1, nombre: 'Tercera', deporte: 'tenis' }
const match = { id: 10, estado: 'en_vivo', deporte: 'tenis', modalidad: 'individual', control_version: 0, jugador1: { id: 1, nombre: 'Ana', apellido: 'García' }, jugador2: { id: 2, nombre: 'Sara', apellido: 'López' }, juez: { id: 3, nombre: 'Juez', apellido: 'Actual' }, cancha: { id: 1, nombre: 'Cancha 1' }, categoria: category, formato: { mejor_de_sets: 3 }, sets: [{ numero_set: 1, games_j1: 3, games_j2: 2, completado: false }], en_vivo: { iniciado_at: '2026-09-10T12:00:00Z', pausado_at: '2026-09-10T12:10:00Z' } }
const doubles = { ...match, id: 11, modalidad: 'dobles', estado: 'programado', en_vivo: null, equipo1: { id: 20, nombre: 'García / López' }, equipo2: { id: 21, nombre: 'Pérez / Díaz' } }
const replacement = { id: 22, nombre: 'Suárez / León', categoria: category, jugador1: { nombre: 'Daniel', apellido: 'Suárez' }, jugador2: { nombre: 'Mario', apellido: 'León' } }

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 850 } })
      const page = await context.newPage()
      const errors = [], writes = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.addInitScript(() => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { isAuthenticated: true, user: { id: 99, rol: 'juez_director', email: 'qa@example.test', numero_documento: '12345678', nombre: 'Directora', apellido: 'Prueba' } }, version: 0 })))
      await page.route('**/*', async (route) => {
        const request = route.request(), url = new URL(request.url())
        if (url.pathname.startsWith('/api/')) {
          const endpoint = url.pathname.replace('/api', '')
          if (endpoint.endsWith('/stream')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': fixture\n\n' })
          let data = []
          if (request.method() === 'PUT') {
            const body = request.postDataJSON()
            writes.push({ endpoint, body })
            assert.equal(body.expected_control_version, 0)
            data = endpoint.includes('/11/') ? doubles : match
          } else if (endpoint === '/partidos' || endpoint === '/partidos/gestion/mis-partidos') data = [match, doubles, { ...match, id: 12, estado: 'finalizado' }, { ...match, id: 13, estado: 'cancelado' }]
          else if (endpoint.endsWith('/control')) data = { partido: match, marcador: serializeState(createInitialState()), revision: '5:5', configuration: configurationOf({}), en_vivo: match.en_vivo, eventos_recientes: [] }
          else if (endpoint === '/users/jueces') data = [{ id: 3, nombre: 'Juez', apellido: 'Actual', rol: 'juez' }, { id: 8, nombre: 'Jueza', apellido: 'Nueva', rol: 'juez' }]
          else if (endpoint === '/categorias') data = [category]
          else if (endpoint === '/equipos') data = [replacement]
          else if (endpoint === '/users/me') data = { id: 99, rol: 'juez_director', email: 'qa@example.test', numero_documento: '12345678', nombre: 'Directora' }
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) })
        }
        if (url.origin === base) return route.continue()
        return route.abort()
      })
      await page.goto(`${base}/director`)
      await page.getByRole('heading', { name: 'Supervisión de partidos' }).waitFor()
      await page.getByRole('button', { name: 'Cambiar juez', exact: true }).first().click()
      let dialog = page.getByRole('dialog')
      await dialog.getByText('Jueza Nueva', { exact: true }).click()
      await dialog.getByRole('button', { name: 'Confirmar Reasignación' }).click()
      await dialog.waitFor({ state: 'detached' })
      assert.equal(writes.at(-1).body.juez_id, 8)
      await page.getByRole('button', { name: 'Sustituir', exact: true }).filter({ visible: true }).nth(1).click()
      dialog = page.getByRole('dialog')
      await dialog.getByRole('heading', { name: 'Sustituir Pareja' }).waitFor()
      await dialog.getByPlaceholder('Ej. Gómez, Martínez…').fill('Daniel')
      await dialog.getByRole('button', { name: /Suárez \/ León/ }).click()
      await dialog.getByRole('button', { name: 'Confirmar Sustitución' }).click()
      await dialog.waitFor({ state: 'detached' })
      assert.equal(writes.at(-1).endpoint, '/partidos/11/sustitucion')
      assert.equal(writes.at(-1).body.participante_id, 22)
      await page.getByRole('button', { name: 'Marcador', exact: true }).first().click()
      dialog = page.getByRole('dialog')
      await dialog.getByLabel('Motivo de la corrección').fill('Error de transcripción en los games')
      await dialog.getByRole('checkbox', { name: /Confirmo que el game/ }).check()
      await dialog.getByRole('button', { name: 'Guardar Corrección' }).click()
      await dialog.waitFor({ state: 'detached' })
      assert.equal(writes.at(-1).endpoint, '/partidos/10/correccion')
      assert.equal(writes.at(-1).body.expected_revision, '5:5')
      assert.equal(writes.at(-1).body.sets[0].games_j1, 3)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      assert.equal(await page.locator('[aria-label="Patrocinadores"]').count(), 0)
      await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), `director-${width}.png`), fullPage: true })
      assert.deepEqual(errors, [])
      console.log(`Director ${width}px: reasignación, dobles, corrección y layout OK`)
      await context.close()
    }
  } finally { await browser.close() }
})().catch((error) => { console.error(error); process.exitCode = 1 })
