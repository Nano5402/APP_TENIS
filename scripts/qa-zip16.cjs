// Browser regression with intercepted APIs only; never uses the production database.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true })
      page.setDefaultTimeout(10000)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const user = { id: 99, rol: 'admin', nombre: 'QA', email: 'qa@example.com', numero_documento:'12345678' }
      const categoria = { id: 1, nombre: 'Cuarta', deporte: 'tenis' }
      const torneo = { id: 1, nombre: 'Torneo QA', deporte: 'tenis', modalidad: 'dobles', sistema: 'eliminacion_directa', estado: 'en_curso' }
      const teams = [1,2].map(id => ({ id, nombre: `Pareja ${id}`, deporte: 'tenis', categoria,
        jugador1: { id:id * 2, nombre: id === 1 ? 'Andrés' : 'María', apellido: 'Gómez' },
        jugador2: { id:id * 2 + 1, nombre:'Jugador', apellido:'Prueba' } }))
      const match = { id:8, torneo, categoria, modalidad:'dobles', deporte:'tenis', fase:'eliminacion',
        ronda:'Final', estado:'programado', control_version:4, equipo1:teams[0], equipo2:teams[1],
        notas:'Conservar esta nota', sets:[], formato:{ mejor_de_sets:3, juegos_por_set:6, set_decisivo:'match_tiebreak' } }
      const errors = [], writes = []
      page.on('pageerror', e => errors.push(e.message))
      await page.addInitScript(user => {
        if (!sessionStorage.getItem('qa-guest')) localStorage.setItem('auth-storage-v2',
          JSON.stringify({ state:{ isAuthenticated:true,user },version:0 }))
      }, user)
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()), ep = url.pathname.replace(/^\/api/, '')
        if (!url.pathname.startsWith('/api/')) return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
        let data = []
        if (ep.endsWith('/me')) data = user
        if (ep === '/torneos') data = [torneo]
        if (ep === '/torneos/1') data = torneo
        if (ep === '/categorias') data = [categoria]
        if (ep === '/equipos') data = teams
        if (ep === '/partidos') data = [match]
        if (ep.endsWith('/retiros')) data = { jugadores:[], parejas:[] }
        if (ep.endsWith('/inscripciones')) data = { categorias:[{ id:1, nombre:'Cuarta',
          parejas:teams.map(t => ({ ...t, equipo_id:t.id, categoria_id:1, categoria_nombre:'Cuarta' })) }] }
        if (ep.includes('/posiciones')) data = { categorias:[{id:1,nombre:'Cuarta',grupos:[]}],grupos:{} }
        if (ep === '/partidos/gestion/programacion') data = { conflicts:[],warnings:[] }
        if (req.method() !== 'GET' && ep !== '/partidos/gestion/programacion' && ep.startsWith('/partidos')) {
          writes.push({ ep, method:req.method(), body:req.postDataJSON() })
          data = match
        }
        return route.fulfill({ contentType:'application/json',body:JSON.stringify({ok:true,data}) })
      })
      await page.goto('http://127.0.0.1:4173/admin/partidos?torneo=1', {timeout:30000})
      await page.getByRole('button',{name:'Nuevo partido',exact:true}).click()
      const form = page.getByRole('dialog',{name:'Nuevo partido',exact:true})
      await form.getByRole('button', {name:/Cuarta.*En Eliminatoria/}).click()
      if (width === 390) {
        await form.getByTitle('Programar esta llave', {exact:true}).click()
      } else {
        await form.locator('#quick-pair-search').fill('maria')
        await form.getByRole('button', { name:/Pareja 2.*María/ }).click()
      }
      assert.equal(await form.locator('[name="equipo1_id"]').inputValue(),width === 390 ? '1' : '2')
      assert.equal(await form.locator('[name="equipo2_id"]').inputValue(),width === 390 ? '2' : '1')
      await form.getByRole('button',{name:'Continuar a programación',exact:true}).click()
      await form.locator('[name="fecha_inicio"]').fill('2026-12-02')
      await form.locator('[name="hora_inicio"]').fill('14:00')
      await form.getByRole('button',{name:'Revisar partido',exact:true}).click()
      await form.getByRole('button',{name:'Guardar programación',exact:true}).click()
      await form.waitFor({state:'detached'})
      assert.equal(writes.length,1)
      assert.equal(writes[0].method,'PUT')
      assert.equal(writes[0].ep,'/partidos/8')
      assert.equal(writes[0].body.expected_control_version,4)
      assert.equal(Number(writes[0].body.equipo1_id),1)
      assert.equal(Number(writes[0].body.equipo2_id),2)
      assert.equal(writes[0].body.notas,'Conservar esta nota')
      assert.equal(writes[0].body.set_decisivo,'match_tiebreak')
      await page.goto('http://127.0.0.1:4173/torneo/1?tab=bracket')
      const downloadPromise = page.waitForEvent('download')
      await page.getByTitle('Descargar cuadro en imagen PNG').click()
      const download = await downloadPromise
      assert.match(download.suggestedFilename(), /\.png$/)
      assert.equal(await download.failure(), null)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.getByTitle('Ajustar llave manualmente').click()
      const slotDialog = page.getByRole('dialog', {name:'Ajustar llave #8'})
      await slotDialog.getByRole('button', {name:'Guardar cambios',exact:true}).click()
      await slotDialog.waitFor({state:'detached'})
      assert.equal(writes.at(-1).ep,'/partidos/8/llave-eliminatoria')
      assert.equal(writes.at(-1).body.expected_control_version,4)
      await page.getByRole('button', {name:/Armar.*Brackets/}).click()
      const builder = page.getByRole('dialog', {name:'Configurar cuadro eliminatorio'})
      await builder.getByRole('button', {name:'Actualizar cuadro de Cuarta',exact:true}).click()
      await builder.waitFor({state:'detached'})
      assert.equal(writes.at(-1).ep,'/partidos/cuadro-eliminatorio')
      assert.deepEqual(writes.at(-1).body.expected_matches,[{id:8,control_version:4}])
      assert.equal(writes.at(-1).body.llaves_iniciales.length,1)
      assert.deepEqual(errors,[])
      console.log(`PASS ${width}px: schedules existing match without duplicate, preserves notes/format/version, exports PNG, edits slot and submits versioned bracket`)
      // Guests can read the bracket, but never access its editing controls.
      await page.evaluate(() => {
        sessionStorage.setItem('qa-guest','1')
        localStorage.removeItem('auth-storage-v2')
      })
      await page.reload()
      await page.getByTitle('Descargar cuadro en imagen PNG').waitFor()
      assert.equal(await page.getByText('Modo Administrador activo:', {exact:true}).count(),0)
      assert.equal(await page.getByRole('button',{name:/Armar.*Brackets/}).count(),0)
      assert.equal(await page.getByTitle('Ajustar llave manualmente').count(),0)
      await page.close()
    }
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
