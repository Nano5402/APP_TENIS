// Local, mocked-API regression. Never connects to the production database.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    const torneo = { id: 1, nombre: 'Torneo abierto de dobles · 2026', deporte: 'tenis', modalidad: 'dobles', sistema: 'eliminacion_directa', estado: 'en_curso' }
    const categoria = { id: 1, nombre: '4ta', deporte: 'tenis' }
    const team = (id, a, b) => ({ id, nombre: `${a} / ${b}`, jugador1: { id: id * 2, nombre: a, apellido: a }, jugador2: { id: id * 2 + 1, nombre: b, apellido: b } })
    const teams = [team(1, 'Pérez', 'Gómez'), team(2, 'Ruiz', 'López'), team(3, 'Díaz', 'Torres'), team(4, 'León', 'Silva')]
    const common = { torneo, categoria, modalidad: 'dobles', deporte: 'tenis', fase: 'eliminacion', cancha: { nombre: 'Cancha 1' } }
    const matches = [
      { ...common, id: 1, ronda: 'Semifinales', estado: 'finalizado', ganador: 'jugador1', equipo1: teams[0], equipo2: teams[1], sets: [{ numero_set: 1, games_j1: 6, games_j2: 3 }, { numero_set: 2, games_j1: 6, games_j2: 4 }] },
      { ...common, id: 2, ronda: 'Semifinales', estado: 'finalizado', ganador: 'jugador1', equipo1: teams[2], equipo2: teams[3], sets: [{ numero_set: 1, games_j1: 6, games_j2: 4 }, { numero_set: 2, games_j1: 7, games_j2: 6, tiebreak_j1: 7, tiebreak_j2: 5 }] },
      { ...common, id: 3, ronda: 'Final', estado: 'programado', origen_partido1_id: 1, origen_partido2_id: 2, equipo1: teams[0], equipo2: teams[2], sets: [] },
    ]
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), ep = url.pathname.replace(/^\/api/, '')
      if (!url.pathname.startsWith('/api/')) return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
      let data = []
      if (ep === '/torneos/1') data = torneo
      if (ep === '/torneos') data = [torneo]
      if (ep === '/partidos') data = matches
      if (ep === '/categorias') data = [categoria]
      if (ep.endsWith('/retiros')) data = { jugadores: [], parejas: [] }
      if (ep.endsWith('/inscripciones')) data = { categorias: [] }
      if (ep.includes('/posiciones')) data = { categorias: [], grupos: {} }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) })
    })
    await page.goto('http://127.0.0.1:4173/torneo/1?tab=bracket')
    await page.locator('.ucl-node-card').first().waitFor()
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.waitForTimeout(120)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `page overflow ${width}`)
      assert.equal(await page.locator('.ucl-connectors path').count(), 2)
      assert.equal(await page.locator('.ucl-brand-row img').evaluateAll(images => images.every(i => i.complete && i.naturalWidth > 0)), true)
      const columns = await page.locator('.ucl-round-column').evaluateAll(nodes => nodes.map(n => ({ x: n.getBoundingClientRect().x, y: n.getBoundingClientRect().y })))
      assert.equal(columns[0].y, columns[1].y)
      assert.ok(columns[1].x > columns[0].x)
      if (width === 390 || width === 1440) {
        await page.locator('.ucl-bracket-shell').screenshot({ path: path.join(os.tmpdir(), `bracket-page-${width}.png`) })
      }
      console.log(`PASS ${width}px: horizontal rounds, real connectors, logos, no page overflow`)
    }
    const result = await page.evaluate(async matches => {
      const { generateBracketPngBlob, bracketPosterLayout } = await import('/src/utils/bracketImageExporter.js')
      const rounds = [{ label: 'Semifinales', matches: matches.slice(0, 2) }, { label: 'Final', matches: matches.slice(2) }]
      const options = { tournamentName: 'Torneo abierto de dobles · 2026', categoryName: '4ta categoría', rounds }
      const blob = await generateBracketPngBlob(options)
      const bitmap = await createImageBitmap(blob)
      const dims = [bitmap.width, bitmap.height]; bitmap.close()
      const png = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob) })
      const checks = []
      for (const count of [1, 2, 4, 8, 16, 32]) {
        const testRounds = []
        for (let n = count; n >= 1; n = Math.floor(n / 2)) testRounds.push({ label: `Ronda ${n}`, matches: Array.from({ length: n }, (_, i) => ({ id: n * 100 + i })) })
        const layout = bracketPosterLayout(testRounds, [{ id: 99 }])
        checks.push(layout.positions.every(p => p.x >= 0 && p.x + p.w <= layout.size && p.y >= 212 && p.y + p.h < layout.size - 52))
      }
      let rejected = false
      try { await generateBracketPngBlob({ rounds: [] }) } catch { rejected = true }
      return { dims, png, checks, rejected }
    }, matches)
    assert.deepEqual(result.dims, [2160, 2160])
    assert.ok(result.checks.every(Boolean))
    assert.ok(result.rejected)
    require('node:fs').writeFileSync(path.join(os.tmpdir(), 'bracket-export-square.png'), Buffer.from(result.png.split(',')[1], 'base64'))
    assert.deepEqual(errors, [])
    console.log('PASS square PNG 2160×2160, empty error, layouts 1–32 matches per round')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
