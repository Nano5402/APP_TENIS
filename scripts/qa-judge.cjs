// Local-only browser check. All API requests are intercepted with fixtures;
// no production service or database is contacted. Pass Playwright module path.
const { chromium } = require(process.argv[2] || 'playwright')
const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
const sharp = require('../scores-api/node_modules/sharp')
const { createInitialState, applyEvent, serializeState } = require('../scores-api/src/modules/matches/score.engine')

async function checkMatchEditing(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const admin = { id: 99, rol: 'admin', nombre: 'Admin', apellido: 'QA', email: 'qa@example.com', numero_documento: '12345678' }
  const categoria = { id: 1, nombre: 'Cuarta', deporte: 'tenis' }
  const torneo = { id: 1, nombre: 'Torneo QA', deporte: 'tenis', modalidad: 'dobles', sistema: 'grupos_eliminacion', estado: 'activo' }
  const teams = [1, 2, 3, 4].map(id => ({ id, nombre: `Pareja ${id}`, deporte: 'tenis', categoria }))
  const matches = [0, 1].map(i => ({ id: i + 10, torneo, categoria, modalidad: 'dobles', deporte: 'tenis', estado: 'programado', fase: 'grupos', grupo: `GRUPO ${i + 1}`, equipo1: teams[i * 2], equipo2: teams[i * 2 + 1], formato: {}, sets: [] }))
  const distribution = {
    grupos: [1, 2].map(n => ({ nombre: `GRUPO ${n}`, categoria_id: 1, equipo_ids: [n * 2 - 1, n * 2] })),
    parejas: teams.map(t => ({ equipo_id: t.id, categoria_id: 1, grupo: `GRUPO ${Math.ceil(t.id / 2)}` })),
  }
  let writes = 0, failSave = false, failGroups = false
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(u => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { isAuthenticated: true, user: u }, version: 0 })), admin)
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), endpoint = url.pathname.replace(/^\/api/, '')
    if (!url.pathname.startsWith('/api/')) return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { ok: true, data } : { ok: false, message: 'Error simulado QA' }) })
    if (req.method() === 'PUT') {
      assert.match(endpoint, /^\/partidos\/1[01]$/)
      if (failSave) return respond(null, 500)
      const saved = matches.find(m => m.id === Number(endpoint.split('/').at(-1)))
      const body = req.postDataJSON()
      assert.equal(body.grupo, saved.grupo)
      assert.equal(Number(body.equipo1_id), saved.equipo1.id)
      assert.equal(Number(body.equipo2_id), saved.equipo2.id)
      saved.notas = body.notas
      writes++
      return respond(saved)
    }
    assert.equal(req.method(), 'GET')
    if (endpoint.endsWith('/grupos')) {
      await new Promise(resolve => setTimeout(resolve, 350))
      return respond(distribution, failGroups ? 500 : 200)
    }
    return respond(endpoint.endsWith('/me') ? admin : ({ '/partidos': matches, '/equipos': teams, '/torneos': [torneo], '/categorias': [categoria] }[endpoint] || []))
  })
  try {
    await page.goto('http://127.0.0.1:4173/admin/partidos')
    for (const index of [0, 1, 0]) {
      await page.getByRole('button', { name: 'Editar datos del partido', exact: true }).nth(index).click()
      const modal = page.getByRole('dialog', { name: 'Editar partido', exact: true })
      await modal.locator('select[name="grupo"]:not([disabled])').waitFor()
      assert.equal(await modal.locator('[name="grupo"]').inputValue(), matches[index].grupo)
      assert.equal(await modal.locator('[name="equipo1_id"]').inputValue(), String(matches[index].equipo1.id))
      assert.equal(await modal.locator('[name="equipo2_id"]').inputValue(), String(matches[index].equipo2.id))
      await modal.locator('[name="notas"]').fill(`Edición ${writes}`)
      await modal.getByRole('button', { name: 'Guardar cambios' }).click()
      await modal.waitFor({ state: 'detached' })
    }
    assert.equal(writes, 3, 'Three consecutive edits without reloading')
    failSave = true
    await page.getByRole('button', { name: 'Editar datos del partido', exact: true }).first().click()
    const modal = page.getByRole('dialog', { name: 'Editar partido', exact: true })
    await modal.locator('select[name="grupo"]:not([disabled])').waitFor()
    await modal.getByRole('button', { name: 'Guardar cambios' }).click()
    await modal.getByRole('alert').filter({ hasText: 'Error simulado QA' }).waitFor()
    assert.equal(await modal.locator('[name="equipo1_id"]').inputValue(), '1')
    failSave = false
    await modal.getByRole('button', { name: 'Guardar cambios' }).click()
    await modal.waitFor({ state: 'detached' })
    assert.equal(writes, 4)
    failGroups = true
    await page.getByRole('button', { name: 'Editar datos del partido', exact: true }).first().click()
    await modal.getByText(/Error simulado QA/).waitFor()
    assert.equal(await modal.getByRole('button', { name: 'Guardar cambios' }).isDisabled(), true)
    assert.deepEqual(errors, [])
    console.log('PASS: match edit retains groups/teams, consecutive saves, save retry and group-load failure')
  } finally { await page.close() }
}

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' })
  try {
    await checkMatchEditing(browser)
    if (process.env.QA_MATCH_EDIT_ONLY === '1') return
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    const failures = []
    page.on('pageerror', error => failures.push(error.message))
    page.on('dialog', dialog => { if (dialog.type() === 'beforeunload') void dialog.accept() })
    const user = { id: 12, rol: 'juez', nombre: 'Juez', apellido: 'Prueba', email: 'juez-qa@example.com', numero_documento: '12345678' }
    let match = { id: 30, juez_id: 12, modalidad: 'singles', estado: 'en_vivo', jugador1: { nombre: 'Carlos', apellido: 'Rodríguez' }, jugador2: { nombre: 'Andrés', apellido: 'Martínez' }, cancha: { nombre: 'Cancha 1' }, formato: { mejor_de_sets: 3, juegos_por_set: 6 } }
    let state = createInitialState(), events = [], snapshots = [], posts = 0, reads = 0, drop = false, sequence = 0
    const receipts = new Set()
    let paused = false, logoutCalls = 0
    let photo = null, photoWrites = 0, photoStorageBlocked = false
    const photoBytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#15764a' } }).jpeg().toBuffer()
    const control = () => ({ partido: match, marcador: serializeState(state), revision: `${sequence}:${events.length}`, configuration: 'fixture', eventos_recientes: events, en_vivo: { iniciado_at: new Date().toISOString(), pausado_at: paused ? new Date().toISOString() : null, segundos_pausa: 0 } })
    await page.addInitScript((user) => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { isAuthenticated: true, user }, version: 0 })), user)
    const mockRoute = async route => {
      const req = route.request(), url = new URL(req.url())
      if (url.pathname.startsWith('/api/')) {
        const endpoint = url.pathname.replace('/api', '')
        if (endpoint === '/auth/logout') { logoutCalls++; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'Fallo de red simulado' }) }) }
        let data
        if (endpoint.endsWith('/stream')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': fixture\n\n' })
        if (endpoint.endsWith('/foto/estado')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { configured: true, writable: true } }) })
        if (endpoint.endsWith('/foto/imagen')) return route.fulfill({ contentType: 'image/jpeg', body: photoBytes })
        if (endpoint.endsWith('/foto') && req.method() === 'PUT') {
          if (photoStorageBlocked) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'PHOTO_STORAGE_UNCONFIGURED', message: 'Falta configurar MATCH_PHOTOS_DIR en Hostinger.' }) })
          const body = req.postDataBuffer().toString('latin1')
          const field = name => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1] || ''
          assert.equal(field('consentimiento'), 'true')
          assert.equal(field('expected'), photo?.version || '')
          photo = { version: field('version'), momento: field('momento') }; photoWrites++; data = photo
        }
        else if (endpoint.endsWith('/foto')) data = photo
        else if (endpoint === '/partidos/gestion/mis-partidos') data = [match]
        else if (endpoint === '/partidos') data = [{ ...match, estado: url.searchParams.get('estado'), marcador_actual: serializeState(state), fecha_inicio: new Date().toISOString().slice(0,10) }]
        else if (endpoint.endsWith('/control')) { reads++; data = control() }
        else if (endpoint.endsWith('/eventos')) {
          posts++
          const event = req.postDataJSON()
          if (!receipts.has(event.client_action_id)) {
            assert.equal(event.expected_revision, `${sequence}:${events.length}`)
            snapshots.push(structuredClone(state))
            state = applyEvent(state, event)
            events.unshift({ id: ++sequence, secuencia: sequence, ...event })
            receipts.add(event.client_action_id)
          }
          if (drop) { drop = false; return route.abort('failed') }
          await new Promise(resolve => setTimeout(resolve, 200))
          data = control()
        } else if (endpoint.endsWith('/deshacer')) { state = snapshots.pop(); events.shift(); data = control() }
        else if (endpoint.endsWith('/pausa')) { paused = req.postDataJSON().pausado; data = control() }
        else if (endpoint.endsWith('/estadisticas')) data = { estadisticas: { jugador1: { puntos_ganados: 1 }, jugador2: { puntos_ganados: 1 } }, total_sets: 1 }
        else if (endpoint === '/users/me') data = user
        else data = {}
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) })
      }
      if (url.hostname !== '127.0.0.1') return route.abort()
      return route.continue()
    }
    await page.route('**/*', mockRoute)
    const settled = async () => {
      await page.waitForFunction(() => document.querySelector('.judge-feedback')?.textContent.startsWith('Confirmado:'))
      await page.waitForTimeout(280)
    }
    await page.goto('http://127.0.0.1:4173/sponsors')
    await page.waitForURL('**/juez')
    await page.getByRole('button', { name: /Carlos Rodríguez.*Andrés Martínez/ }).click()
    await page.locator('.judge-point').first().waitFor()
    await page.getByText('Marcación activa', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: /^Notificaciones/ }).count(), 0, 'Scoring hides general notifications')
    for (const [width, height] of [[390,844], [360,640], [320,568], [1440,900]]) {
      await page.setViewportSize({ width, height })
      const metrics = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth, viewport: innerHeight, bottom: document.querySelector('.judge-bottom-controls').getBoundingClientRect().bottom }))
      console.log('layout', width, height, metrics)
      assert.ok(metrics.width <= width, 'No horizontal overflow')
      assert.ok(metrics.bottom <= height, 'All primary controls visible without scrolling')
    }
    await page.setViewportSize({ width: 390, height: 844 })
    const initialReads = reads
    assert.equal(await page.getByRole('checkbox', { name: /Registrar motivo/ }).isChecked(), true, 'Point detail defaults on')
    await page.getByRole('checkbox', { name: /Registrar motivo/ }).uncheck()
    await page.locator('.judge-point').first().evaluate(button => { button.click(); button.click() })
    await page.waitForFunction(() => document.querySelector('.judge-points').textContent === '15')
    await settled()
    assert.equal(posts, 1, 'Double tap writes once')
    assert.equal(reads, initialReads, 'Point response does not trigger an extra control read')
    await page.getByRole('button', { name: '1ª falta · sin punto' }).click()
    await page.getByRole('button', { name: 'Marcar doble falta' }).waitFor()
    await settled()
    await page.getByRole('button', { name: 'Let · repetir 2º saque' }).click()
    await settled()
    assert.equal(state.serviceAttempt, 2, 'Let preserves second serve')
    await page.getByRole('button', { name: 'Marcar doble falta' }).click()
    await page.getByRole('button', { name: '1ª falta · sin punto' }).waitFor()
    await settled()
    assert.deepEqual(state.points, [1, 1])
    await page.getByRole('checkbox', { name: /Registrar motivo/ }).check()
    await page.locator('.judge-point').nth(1).click()
    for (const [width, height] of [[320,568], [360,640], [390,844], [844,390], [1440,900]]) {
      await page.setViewportSize({ width, height })
      const modal = await page.locator('dialog[open]').evaluate(el => ({ scroll: el.scrollHeight, client: el.clientHeight, width: el.scrollWidth, clientWidth: el.clientWidth }))
      assert.ok(modal.scroll <= modal.client + 1, `Reason selector fits without vertical scroll at ${width}x${height}`)
      assert.ok(modal.width <= modal.clientWidth + 1, 'Reason selector has no horizontal overflow')
    }
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.getByRole('button', { name: /^Ace/ }).isDisabled(), true)
    await page.getByRole('button', { name: /^Error no forzado/ }).click()
    await page.waitForFunction(() => !document.querySelector('dialog[open]'))
    await settled()
    assert.equal(events[0].motivo, 'error_no_forzado')
    await page.getByRole('button', { name: 'Pausar', exact: true }).click()
    await page.getByRole('button', { name: 'Reanudar', exact: true }).waitFor()
    assert.equal(await page.locator('.judge-point').first().isDisabled(), true)
    await page.getByRole('button', { name: 'Reanudar', exact: true }).click()
    await page.getByRole('button', { name: 'Pausar', exact: true }).waitFor()
    await settled()
    await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
    await page.getByRole('button', { name: 'Deshacer', exact: true }).last().click()
    await page.waitForFunction(() => document.querySelectorAll('.judge-points')[1].textContent === '15')
    await settled()
    await page.getByRole('checkbox', { name: /Registrar motivo/ }).uncheck()
    drop = true
    await page.locator('.judge-point').first().click()
    await page.waitForFunction(() => document.querySelector('.judge-feedback').textContent.includes('pendientes'))
    assert.equal(await page.locator('.judge-point').first().isDisabled(), false)
    const postFailure = posts
    await page.getByRole('button', { name: 'Sincronizar marcador' }).click()
    await page.waitForFunction(() => document.querySelector('.judge-points').textContent === '30')
    await settled()
    assert.equal(posts, postFailure + 1, 'Same UUID retried safely after lost response')
    assert.deepEqual(state.points, [2,1], 'Lost response did not duplicate the point')
    await page.context().setOffline(true)
    await page.locator('.judge-point').nth(1).click()
    await page.waitForTimeout(280)
    await page.locator('.judge-point').nth(1).click()
    await page.waitForFunction(() => document.querySelectorAll('.judge-points')[1].textContent === '40')
    assert.deepEqual(state.points, [2,1], 'Offline points have not reached server')
    const savedQueue = await page.evaluate(() => localStorage.getItem('judge-outbox-v2:12'))
    await page.getByRole('button', { name: 'Abrir menú del juez' }).click()
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await page.getByRole('heading', { name: 'Hay marcaciones sin sincronizar' }).waitFor()
    await page.getByRole('button', { name: 'Volver a la mesa', exact: true }).click()
    assert.equal(logoutCalls, 0, 'Cancelled logout never reaches server')
    assert.equal(await page.evaluate(() => localStorage.getItem('judge-outbox-v2:12')), savedQueue, 'Logout warning preserves pending actions')
    await page.context().setOffline(false)
    await page.reload()
    await settled()
    assert.deepEqual(state.points, [2,3], 'Offline points synchronized in order')
    const secondTab = await page.context().newPage()
    await secondTab.route('**/*', mockRoute)
    await secondTab.goto('http://127.0.0.1:4173/juez')
    await secondTab.getByRole('button', { name: /Carlos Rodríguez.*Andrés Martínez/ }).click()
    await secondTab.locator('.judge-point').first().waitFor()
    assert.equal(await secondTab.locator('.judge-point').first().isDisabled(), true, 'Second tab cannot edit the same outbox')
    await secondTab.close()
    await page.getByRole('button', { name: 'Foto del partido', exact: true }).click()
    const photoDialog = page.locator('dialog[open]')
    await photoDialog.locator('input[type=file]').last().setInputFiles({ name: 'partido.jpg', mimeType: 'image/jpeg', buffer: photoBytes })
    await photoDialog.getByRole('checkbox').check()
    await page.context().setOffline(true)
    await photoDialog.getByRole('button', { name: 'Guardar foto del partido' }).click()
    await photoDialog.getByText('Foto pendiente de envío.', { exact: false }).waitFor()
    console.log('photo draft saved', await page.evaluate(async () => {
      const db = await new Promise(resolve => { const r = indexedDB.open('tenis-match-photos', 1); r.onsuccess = () => resolve(r.result) })
      return new Promise(resolve => { const r = db.transaction('pending').objectStore('pending').getAllKeys(); r.onsuccess = () => { db.close(); resolve(r.result) } })
    }))
    assert.equal(photoWrites, 0)
    await page.screenshot({ path: path.join(os.tmpdir(), 'tenis-photo-mobile.png') })
    await photoDialog.getByRole('button', { name: 'Cerrar fotografía' }).click()
    assert.equal(await page.locator('.judge-point').first().isDisabled(), false, 'Photo never blocks points')
    await page.context().setOffline(false)
    await page.reload()
    await page.getByRole('button', { name: /Carlos Rodríguez.*Andrés Martínez/ }).click()
    await settled()
    for (let attempt = 0; attempt < 60 && photoWrites === 0; attempt++) await page.waitForTimeout(500)
    assert.equal(photoWrites, 1, 'Photo survives reload and sends only once')
    await page.getByRole('button', { name: 'Foto del partido', exact: true }).click()
    await photoDialog.locator('input[type=file]').last().setInputFiles({ name: 'final.jpg', mimeType: 'image/jpeg', buffer: photoBytes })
    await photoDialog.getByRole('combobox').selectOption('final')
    await photoDialog.getByRole('checkbox').check()
    page.once('dialog', d => d.accept())
    await photoDialog.getByRole('button', { name: 'Reemplazar foto del partido' }).click()
    await photoDialog.getByText('Foto guardada en el servidor.', { exact: true }).waitFor()
    assert.equal(photoWrites, 2); assert.equal(photo.momento, 'final')
    await photoDialog.locator('input[type=file]').last().setInputFiles({ name: 'correction.jpg', mimeType: 'image/jpeg', buffer: photoBytes })
    await photoDialog.getByRole('combobox').selectOption('final')
    await photoDialog.getByRole('checkbox').check()
    photoStorageBlocked = true
    page.once('dialog', d => d.accept())
    await photoDialog.getByRole('button', { name: 'Reemplazar foto del partido' }).click()
    await photoDialog.getByText(/Falta configurar MATCH_PHOTOS_DIR/).waitFor()
    assert.equal(photoWrites, 2, 'Configuration failure does not report success')
    await photoDialog.getByRole('link', { name: 'Guardar copia en el dispositivo' }).waitFor()
    photoStorageBlocked = false
    await photoDialog.getByRole('button', { name: 'Reintentar ahora' }).click()
    await photoDialog.getByText('Foto guardada en el servidor.', { exact: true }).waitFor()
    assert.equal(photoWrites, 3, 'Pending photo is recovered after fixing server configuration')
    await photoDialog.getByRole('button', { name: 'Cerrar fotografía' }).click()
    await page.screenshot({ path: path.join(os.tmpdir(), 'tenis-judge-mobile.png') })
    await page.getByRole('button', { name: 'Estadísticas', exact: true }).click()
    await page.getByRole('heading', { name: 'Estadísticas y últimas acciones' }).waitFor()
    await page.getByRole('button', { name: 'Cerrar panel' }).click()
    await page.getByRole('button', { name: 'Abrir menú del juez' }).click()
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await page.getByRole('alert').filter({hasText:'No se pudo cerrar la sesión'}).waitFor()
    assert.equal(logoutCalls, 1)
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('auth-storage-v2')).state.isAuthenticated), true)
    await page.getByRole('button', { name: 'Abrir menú del juez' }).click()
    await page.getByRole('link', { name: 'Mi perfil', exact: true }).click()
    await page.getByRole('heading', { name: 'Mi perfil', exact: true }).waitFor()
    assert.equal(await page.locator('.sponsor-dock').count(), 0)
    assert.equal(await page.getByRole('heading', { name: 'Mis partidos', exact: true }).count(), 0)
    for (const route of ['/pantalla', '/', '/admin', '/settings']) {
      await page.goto(`http://127.0.0.1:4173${route}`)
      await page.waitForURL('**/juez')
    }
    const publicPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
    publicPage.on('pageerror', error => failures.push(error.message))
    await publicPage.route('**/*', mockRoute)
    await publicPage.goto('http://127.0.0.1:4173/pantalla')
    await publicPage.getByRole('heading', { name: 'Jornada de hoy' }).waitFor()
    await publicPage.getByRole('button', { name: 'Ver este partido a detalle' }).first().click()
    await publicPage.getByRole('heading', { name: 'Estadísticas de los jugadores' }).waitFor()
    await publicPage.getByRole('heading', { name: 'Foto oficial del partido' }).waitFor()
    await publicPage.getByRole('table', { name: 'Marcador de la foto' }).waitFor()
    for (const width of [320, 390, 768, 1440]) {
      await publicPage.setViewportSize({ width, height: 900 })
      assert.equal(await publicPage.locator('.match-photocall-card').evaluate(el => el.scrollWidth <= el.clientWidth), true, `Photo frame fits at ${width}`)
    }
    await publicPage.setViewportSize({ width: 390, height: 844 })
    await publicPage.locator('.photocall-logo img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
    await publicPage.locator('.match-photocall-card').screenshot({ path: path.join(os.tmpdir(), 'tenis-photocall-mobile.png') })
    const downloadPromise = publicPage.waitForEvent('download')
    await publicPage.getByRole('button', { name: 'Descargar foto con marco', exact: true }).click()
    const frameDownload = await downloadPromise
    assert.match(frameDownload.suggestedFilename(), /-marco\.png$/)
    const framePath = path.join(os.tmpdir(), 'tenis-frame-export.png')
    await frameDownload.saveAs(framePath)
    const frameMetadata = await sharp(framePath).metadata()
    assert.equal(frameMetadata.format, 'png')
    assert.equal(frameMetadata.width, 1080)
    assert.equal(frameMetadata.height, 1920)
    await publicPage.getByRole('button', { name: 'Ajustar encuadre', exact: true }).click()
    await publicPage.getByRole('slider', { name: 'Acercamiento', exact: true }).fill('1.5')
    await publicPage.getByRole('slider', { name: 'Posición horizontal', exact: true }).fill('35')
    await publicPage.getByRole('slider', { name: 'Posición vertical', exact: true }).fill('65')
    assert.equal(await publicPage.locator('.photocall-photo-img').evaluate(el => el.style.transform), 'scale(1.5)')
    assert.equal(await publicPage.locator('.photocall-photo-img').evaluate(el => el.style.transformOrigin), '35% 65%')
    const croppedDownloadPromise = publicPage.waitForEvent('download')
    await publicPage.getByRole('button', { name: 'Descargar foto con marco', exact: true }).click()
    const croppedDownload = await croppedDownloadPromise
    const croppedPath = path.join(os.tmpdir(), 'tenis-frame-export-cropped.png')
    await croppedDownload.saveAs(croppedPath)
    const croppedMetadata = await sharp(croppedPath).metadata()
    assert.equal(croppedMetadata.width, 1080)
    assert.equal(croppedMetadata.height, 1920)
    await publicPage.getByRole('button', { name: 'Restablecer foto completa', exact: true }).click()
    assert.equal(await publicPage.locator('.photocall-photo-img').evaluate(el => el.style.transform), 'scale(1)')
    await publicPage.setViewportSize({ width: 1440, height: 900 })
    const desktopDownloadPromise = publicPage.waitForEvent('download')
    await publicPage.getByRole('button', { name: 'Descargar foto con marco', exact: true }).click()
    const desktopDownload = await desktopDownloadPromise
    const desktopPath = path.join(os.tmpdir(), 'tenis-frame-export-desktop.png')
    await desktopDownload.saveAs(desktopPath)
    const desktopMetadata = await sharp(desktopPath).metadata()
    assert.equal(desktopMetadata.width, 1080)
    assert.equal(desktopMetadata.height, 1920)
    await publicPage.setViewportSize({ width: 390, height: 844 })
    await publicPage.getByRole('button', { name: 'Ampliar foto', exact: true }).click()
    await publicPage.getByRole('button', { name: 'Reducir foto', exact: true }).waitFor()
    assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await publicPage.screenshot({ path: path.join(os.tmpdir(), 'tenis-screen-mobile.png'), fullPage: true })
    await publicPage.getByRole('button', { name: 'Regresar a partidos' }).click()
    await publicPage.getByRole('heading', { name: 'Jornada de hoy' }).waitFor()
    assert.deepEqual(failures, [])
    // Exercise the real React hooks with delayed responses and an SSE burst.
    const hooksPage = await browser.newPage()
    const adminPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
    adminPage.on('pageerror', error => failures.push(error.message))
    const admin = { ...user, id: 99, rol: 'admin' }
    await adminPage.addInitScript(u => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { isAuthenticated: true, user: u }, version: 0 })), admin)
    await adminPage.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.pathname.startsWith('/api/')) {
        assert.equal(route.request().method(), 'GET', 'Admin smoke test must not mutate data')
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: url.pathname.endsWith('/me') ? admin : [] }) })
      }
      return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
    })
    for (const [route, label] of [['categorias', 'Nueva categoría'], ['equipos', 'Nueva pareja'], ['jugadores', 'Nuevo jugador'], ['torneos', 'Nuevo torneo'], ['partidos', 'Nuevo partido']]) {
      await adminPage.goto(`http://127.0.0.1:4173/admin/${route}`)
      await adminPage.getByRole('button', { name: route === 'torneos' ? 'Crear torneo' : label, exact: true }).first().click()
      const dialog = adminPage.getByRole('dialog', { name: label, exact: true })
      await dialog.waitFor()
      assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true, `Admin modal fits: ${route}`)
      await dialog.getByRole('button', { name: 'Cerrar modal' }).click()
      await dialog.waitFor({ state: 'detached' })
    }
    await adminPage.close()
    await hooksPage.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/qa-hooks') return route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' })
      return url.origin === 'http://127.0.0.1:4173' ? route.continue() : route.abort()
    })
    await hooksPage.goto('http://127.0.0.1:4173/qa-hooks')
    await hooksPage.evaluate(async () => {
      const { default: refresh } = await import('/@react-refresh')
      refresh.injectIntoGlobalHook(window)
      window.$RefreshReg$ = () => {}
      window.$RefreshSig$ = () => type => type
      window.__vite_plugin_react_preamble_installed__ = true
      const reactModule = await import('/node_modules/.vite/deps/react.js')
      const React = reactModule.default || reactModule
      const domModule = await import('/node_modules/.vite/deps/react-dom_client.js')
      const { createRoot } = domModule.default || domModule
      // Vite appends HMR timestamps: mock the exact modules imported by the hooks.
      const hookSource = await (await fetch('/src/hooks/useMatches.js')).text()
      const apiPath = hookSource.match(/from\s+["']([^"']*\/services\/matchService\.js[^"']*)/)[1]
      const realtimeHookPath = hookSource.match(/from\s+["']([^"']*useMatchRealtime\.js[^"']*)/)[1]
      const realtimeSource = await (await fetch(realtimeHookPath)).text()
      const realtimePath = realtimeSource.match(/from\s+["']([^"']*\/services\/matchRealtimeService\.js[^"']*)/)[1]
      const { matchService } = await import(apiPath)
      const { matchRealtimeService } = await import(realtimePath)
      const callbacks = new Set()
      matchRealtimeService.subscribe = cb => { callbacks.add(cb); return () => callbacks.delete(cb) }
      window.listReads = 0
      matchService.getAll = async () => { window.listReads++; return { data: [{ id: 2 }] } }
      const old = new Promise(resolve => { window.finishOldRead = () => resolve({data:{id:1}}) })
      matchService.getById = id => id === 1 ? old : Promise.resolve({data:{id}})
      const { useMatch, useMatches } = await import('/src/hooks/useMatches.js')
      window.notifyBurst = () => { for (let i=0;i<40;i++) callbacks.forEach(cb=>cb({matchId:2})) }
      function Harness() {
        const [id, setId] = React.useState(1)
        window.changeMatch = setId
        useMatches()
        const detail = useMatch(id)
        window.hookMatch = detail.match
        return React.createElement('p', null, detail.match?.id || 'Loading')
      }
      createRoot(document.getElementById('root')).render(React.createElement(Harness))
    })
    await hooksPage.waitForFunction(() => window.listReads === 1 && window.changeMatch)
    await hooksPage.bringToFront()
    await hooksPage.waitForFunction(() => document.visibilityState === 'visible')
    await hooksPage.evaluate(() => window.notifyBurst())
    await hooksPage.waitForFunction(() => window.listReads === 2)
    await hooksPage.waitForTimeout(300)
    assert.equal(await hooksPage.evaluate(() => window.listReads), 2, '40 SSE messages require only one list refresh')
    await hooksPage.evaluate(() => window.changeMatch(2))
    await hooksPage.waitForFunction(() => window.hookMatch?.id === 2)
    await hooksPage.evaluate(() => window.finishOldRead())
    await hooksPage.waitForTimeout(100)
    assert.equal(await hooksPage.evaluate(() => window.hookMatch?.id), 2, 'Old match response cannot overwrite current detail')
    await hooksPage.close()
    assert.deepEqual(failures, [], 'No browser runtime errors')
    console.log('PASS: mobile scoring, offline photo queue/reload, explicit replacement, public photo detail, network recovery and restricted routes')
    console.log('Screenshot:', path.join(os.tmpdir(), 'tenis-judge-mobile.png'))
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
