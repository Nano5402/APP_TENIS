// Local-only browser check. All API requests are intercepted with fixtures;
// no production service or database is contacted. Pass Playwright module path.
const { chromium } = require(process.argv[2] || 'playwright')
const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
const sharp = require('../scores-api/node_modules/sharp')
const { createInitialState, applyEvent, serializeState } = require('../scores-api/src/modules/matches/score.engine')

async function checkAuditHistory(browser) {
  const page = await browser.newPage()
  const user = { id:99, rol:'admin', nombre:'QA', apellido:'Prueba', email:'qa@example.com', numero_documento:'12345678' }
  let fail = false
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(u => localStorage.setItem('auth-storage-v2', JSON.stringify({ state:{isAuthenticated:true,user:u},version:0 })), user)
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), endpoint = url.pathname.replace(/^\/api/, '')
    if (!url.pathname.startsWith('/api/')) return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
    const data = endpoint === '/auditoria' ? { items:[{ key:'0:1',tipo:'retiros',accion:'Retiro',fecha:'2026-10-01T14:00:00Z',autor:'QA Prueba',actor_id:99,entidad:'torneo',registro_id:5,detalle:{motivo:'Motivo de prueba',participante:21} }],siguiente:null } : endpoint.endsWith('/me') ? user : []
    if (endpoint === '/auditoria' && url.searchParams.get('tipo') === 'ediciones') Object.assign(data.items[0], { tipo:'ediciones',accion:'Edición administrativa',detalle:{cambios:{cancha_id:{antes:1,despues:3}}} })
    return route.fulfill({status:fail && endpoint === '/auditoria' ? 503 : 200,contentType:'application/json',body:JSON.stringify({ok:true,data})})
  })
  try {
    await page.goto('http://127.0.0.1:4173/admin/auditoria')
    await page.getByRole('button',{name:'Ver registro'}).waitFor()
    for (const width of [320,390,1440]) {
      await page.setViewportSize({width,height:900})
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1),true)
    }
    await page.getByRole('button',{name:'Ver registro'}).click()
    await page.getByText('Motivo de prueba',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Cerrar ventana'}).click()
    await page.getByLabel('Actividad',{exact:true}).selectOption('retiros')
    await page.getByRole('button',{name:'Ver registro'}).waitFor()
    fail = true
    await page.getByRole('button',{name:'Actualizar',exact:true}).click()
    await page.getByRole('button',{name:'Reintentar'}).waitFor()
    fail = false
    await page.getByRole('button',{name:'Reintentar'}).click()
    await page.getByRole('button',{name:'Ver registro'}).waitFor()
    await page.getByLabel('Actividad',{exact:true}).selectOption('ediciones')
    await page.getByRole('button',{name:'Ver registro'}).click()
    await page.getByText('Antes',{exact:true}).waitFor()
    await page.getByText('Después',{exact:true}).waitFor()
    for (const width of [320,390,1440]) {
      await page.setViewportSize({width,height:900})
      assert.equal(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1),true)
    }
    await page.getByRole('button',{name:'Cerrar ventana'}).click()
    assert.deepEqual(errors,[])
    console.log('Audit history: responsive, detail, filtering and retry OK')
  } finally { await page.close() }
}

async function checkCourtAgenda(browser) {
  const page = await browser.newPage()
  const user = { id: 99, rol: 'admin', nombre: 'QA', apellido: 'Prueba', email: 'qa@example.com', numero_documento: '12345678' }
  const errors = []; let fail = false, enabled = true
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(u => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { isAuthenticated: true, user: u }, version: 0 })), user)
  await page.route('**/*', route => {
    const req = route.request(), url = new URL(req.url()), endpoint = url.pathname.replace(/^\/api/, '')
    if (!url.pathname.startsWith('/api/')) return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
    const respond = (data, status=200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ ok: status===200, data, message: 'Error QA' }) })
    if (endpoint === '/partidos') return respond([1,2].map(id => ({ id, estado: 'programado', hora_inicio: `${id+8}:00:00`, cancha: id===1 ? { id:1,nombre:'Cancha 1' } : null, jugador1:{nombre:'Ana',apellido:'Prueba'}, jugador2:{nombre:'Luisa',apellido:'Prueba'} })), fail ? 503 : 200)
    if (endpoint === '/notificaciones/preferencias') { if (req.method()==='PUT') enabled=req.postDataJSON().cambios_partidos; return respond({ cambios_partidos:enabled }) }
    if (endpoint === '/notificaciones') return respond({items:[],pendientes:0})
    return respond(endpoint.endsWith('/me') ? user : [])
  })
  try {
    await page.goto('http://127.0.0.1:4173/admin/agenda')
    await page.getByText('2 encuentros', {exact:false}).waitFor()
    for (const width of [320,390,1440]) {
      await page.setViewportSize({ width, height:900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1), true)
      assert.equal(await page.locator('article:visible').count(), 2)
    }
    await page.getByLabel('Cancha de la agenda').selectOption('none')
    assert.equal(await page.locator('article:visible').count(), 1)
    fail=true
    await page.getByRole('button',{name:'Actualizar',exact:true}).click()
    await page.getByRole('alert').waitFor()
    assert.equal(await page.locator('article:visible').count(), 0)
    fail=false
    await page.getByRole('button',{name:'Actualizar',exact:true}).click()
    await page.locator('article:visible').waitFor()
    await page.getByRole('button',{name:'Notificaciones',exact:true}).click()
    const toggle = page.getByRole('checkbox',{name:/Avisarme de cambios/})
    await toggle.click()
    await page.waitForFunction(() => { const el=document.querySelector('input[type=checkbox]'); return el && !el.disabled && !el.checked })
    assert.equal(enabled,false)
    assert.deepEqual(errors,[])
    console.log('PASS: agenda 320/390/1440px, court filter, error/retry and notification preference')
  } finally { await page.close() }
}

async function checkCombinedActivity(browser) {
  for (const rol of ['juez', 'juez_director']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const user = { id: 99, rol, nombre: 'QA', apellido: 'Prueba', email: 'qa@example.com', numero_documento: '12345678' }
    const errors=[]
    page.on('pageerror', e => errors.push(e.message))
    await page.addInitScript(u => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { isAuthenticated:true,user:u },version:0 })),user)
    await page.route('**/*', route => {
      const url=new URL(route.request().url()), endpoint=url.pathname.replace(/^\/api/,'')
      if (!url.pathname.startsWith('/api/')) return url.hostname==='127.0.0.1' ? route.continue() : route.abort()
      const data=endpoint.endsWith('/me') ? user : endpoint==='/partidos/mios' ? { jugador:{id:9},historial:[],proximos:[],en_vivo:[] } : endpoint==='/notificaciones' ? {items:[],pendientes:0} : []
      return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,data})})
    })
    try {
      await page.goto('http://127.0.0.1:4173/mi-actividad')
      await page.getByRole('heading',{name:'Tu próximo partido'}).waitFor()
      assert.match(page.url(),/mi-actividad$/)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1),true)
      if (rol==='juez_director') {
        await page.goto('http://127.0.0.1:4173/director/agenda')
        await page.getByRole('heading',{name:'Agenda por cancha'}).waitFor()
      }
      assert.deepEqual(errors,[])
    } finally { await page.close() }
  }
  console.log('PASS: judge/player activity and director agenda access on mobile')
}

async function checkBracket(browser) {
  const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  const tournament={id:1,nombre:'Torneo de prueba',deporte:'tenis',modalidad:'dobles',estado:'en_curso',sistema:'grupos_eliminacion'}
  const matches=[{id:1,ronda:'Semifinales',estado:'finalizado',ganador:'jugador1',equipo1:{id:1,nombre:'ANA / LUISA'},equipo2:{id:2,nombre:'MARÍA / LUZ'},sets:[{numero_set:1,games_j1:6,games_j2:3}]},{id:2,ronda:'Final',estado:'programado',origen_partido1:{id:1},equipo1:{id:1,nombre:'ANA / LUISA'}},{id:3,ronda:'Final',estado:'programado',categoria:{id:2,nombre:'Tercera'}}].map(m=>({fase:'eliminacion',modalidad:'dobles',categoria:{id:1,nombre:'Quinta'},...m}))
  await page.route('**/*',route=>{
    const url=new URL(route.request().url()),endpoint=url.pathname.replace(/^\/api/,'')
    if(!url.pathname.startsWith('/api/')) return url.hostname==='127.0.0.1'?route.continue():route.abort()
    const data=endpoint==='/torneos/1'?tournament:endpoint==='/partidos'?matches:endpoint.endsWith('/retiros')?{jugadores:[],parejas:[]}:[]
    return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,data})})
  })
  try {
    await page.goto('http://127.0.0.1:4173/torneo/1?tab=bracket')
    await page.getByRole('heading',{name:'Camino a la final'}).waitFor()
    await page.getByLabel('Categoría del cuadro').selectOption('1')
    for(const width of [320,390,1440]) {
      await page.setViewportSize({width,height:900})
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
    }
    await page.setViewportSize({width:390,height:844})
    await page.getByRole('button',{name:'Ronda siguiente'}).click()
    await page.getByText('Participante por confirmar',{exact:true}).filter({visible:true}).waitFor()
    assert.equal(await page.getByLabel('Ronda del cuadro').inputValue(),'Final')
    await page.getByLabel('Categoría del cuadro').selectOption('2')
    assert.equal(await page.locator('article:visible').count(),1)
    assert.equal(await page.getByText('Revisar',{exact:false}).count(),0)
    assert.deepEqual(errors,[])
    await page.screenshot({path:path.join(os.tmpdir(),'tenis-bracket-mobile.png'),fullPage:true})
    console.log('PASS: public bracket categories, mobile round navigation and 320/390/1440px layout')
  } finally {await page.close()}
}

async function checkTournamentArchive(browser) {
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[]
  const user={id:99,rol:'admin',nombre:'QA',apellido:'Prueba',email:'qa@example.com',numero_documento:'12345678'}
  const t={id:1,nombre:'Torneo Archivo QA',deporte:'tenis',modalidad:'dobles',sistema:'grupos_eliminacion',estado:'en_curso',partidos_count:8,inscripciones_count:16,archivado:false}
  let writes=0, fail=true
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(u=>localStorage.setItem('auth-storage-v2',JSON.stringify({state:{isAuthenticated:true,user:u},version:0})),user)
  await page.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url()),endpoint=url.pathname.replace(/^\/api/,'')
    if(!url.pathname.startsWith('/api/')) return url.hostname==='127.0.0.1'?route.continue():route.abort()
    const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({ok:status===200,data,message:'Error de archivo QA'})})
    assert.notEqual(req.method(),'DELETE')
    if(endpoint==='/torneos/1/archivo') {
      if(fail) return respond(null,500)
      t.archivado=req.postDataJSON().archivado;writes++
      return respond({id:1,archivado:t.archivado})
    }
    return respond(endpoint.endsWith('/me')?user:endpoint==='/torneos'?[t]:endpoint==='/notificaciones'?{items:[],pendientes:0}:[])
  })
  try {
    await page.goto('http://127.0.0.1:4173/admin/torneos')
    await page.getByRole('heading',{name:t.nombre,exact:true}).waitFor()
    await page.getByRole('button',{name:'Archivar torneo',exact:true}).click()
    await page.getByRole('button',{name:'Archivar sin borrar',exact:true}).click()
    await page.getByText('Error de archivo QA',{exact:true}).waitFor()
    assert.equal(t.archivado,false)
    fail=false
    await page.getByRole('button',{name:'Archivar torneo',exact:true}).click()
    await page.getByRole('button',{name:'Archivar sin borrar',exact:true}).click()
    await page.getByRole('heading',{name:t.nombre,exact:true}).waitFor({state:'detached'})
    await page.getByLabel('Archivo de torneos').selectOption('archivados')
    await page.getByRole('heading',{name:t.nombre,exact:true}).waitFor()
    for(const width of [320,390,1440]) {await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)}
    await page.getByRole('button',{name:'Restaurar torneo',exact:true}).click()
    await page.getByRole('dialog').getByRole('button',{name:'Restaurar torneo',exact:true}).click()
    await page.getByRole('heading',{name:t.nombre,exact:true}).waitFor({state:'detached'})
    await page.getByLabel('Archivo de torneos').selectOption('activos')
    await page.getByRole('heading',{name:t.nombre,exact:true}).waitFor()
    assert.equal(writes,2);assert.equal(t.estado,'en_curso');assert.equal(t.partidos_count,8)
    assert.deepEqual(errors,[])
    console.log('PASS: tournament archive/restore, failed-save retry, unchanged history and mobile layout')
  } finally {await page.close()}
}

async function checkBulkResults(browser) {
  const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[], calls=[]
  const user={id:99,rol:'admin',nombre:'QA',apellido:'Prueba',email:'qa@example.com',numero_documento:'12345678'}
  let matches=[10,11,12,13].map(id=>({id,deporte:'tenis',modalidad:'individual',estado:'programado',jugador1:{id:1,nombre:'Ana',apellido:`Prueba ${id}`},jugador2:{id:2,nombre:'Luisa',apellido:'Prueba'},sets:[],formato:{}}))
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(u=>localStorage.setItem('auth-storage-v2',JSON.stringify({state:{isAuthenticated:true,user:u},version:0})),user)
  await page.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url()),endpoint=url.pathname.replace(/^\/api/,'')
    if(!url.pathname.startsWith('/api/')) return url.hostname==='127.0.0.1'?route.continue():route.abort()
    const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({ok:status===200,data,message:'Tiene dependencias'})})
    if(req.method()==='DELETE') {
      const id=Number(endpoint.split('/').at(-1));calls.push(id)
      if(id===11)return respond(null,409)
      if(id===12)return respond(null,503)
      matches=matches.filter(m=>m.id!==id);return respond({ok:true})
    }
    return respond(endpoint.endsWith('/me')?user:endpoint==='/partidos'?matches:endpoint==='/notificaciones'?{items:[],pendientes:0}:[])
  })
  try {
    await page.goto('http://127.0.0.1:4173/admin/partidos')
    await page.getByText('Selección múltiple · 0 seleccionados',{exact:true}).click()
    await page.getByRole('button',{name:'Seleccionar visibles (4)',exact:true}).click()
    await page.getByRole('button',{name:'Revisar eliminación (4)',exact:true}).click()
    const dialog=page.getByRole('dialog',{name:'Vista previa de eliminación'})
    assert.equal(calls.length,0)
    assert.equal(await dialog.getByRole('button',{name:'Eliminar 4 registros',exact:true}).isDisabled(),true)
    for(const width of [320,390,1440]) {await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(-12).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,60)})))))}
    await dialog.getByLabel('Confirmar eliminación múltiple').fill('ELIMINAR')
    await dialog.getByRole('button',{name:'Eliminar 4 registros',exact:true}).click()
    await dialog.waitFor({state:'detached'})
    const result=page.getByRole('region',{name:'Resultado del lote'})
    await result.getByText('1 eliminados · 1 no eliminados · 1 por verificar · 1 sin procesar',{exact:true}).waitFor()
    assert.deepEqual(calls,[10,11,12])
    assert.equal(await page.getByRole('dialog').count(),0)
    await page.getByText('Selección múltiple · 2 seleccionados',{exact:true}).waitFor()
    assert.deepEqual(errors,[])
    console.log('PASS: bulk preview, explicit confirmation, partial failures, uncertain response stops batch and pending selection retained')
  } finally {await page.close()}
}

async function checkMatchEditing(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const admin = { id: 99, rol: 'admin', nombre: 'Admin', apellido: 'QA', email: 'qa@example.com', numero_documento: '12345678' }
  const categoria = { id: 1, nombre: 'Cuarta', deporte: 'tenis' }
  const torneo = { id: 1, nombre: 'Torneo QA', deporte: 'tenis', modalidad: 'dobles', sistema: 'grupos_eliminacion', estado: 'activo' }
  const teams = [1, 2, 3, 4].map(id => ({ id, nombre: `Pareja ${id}`, deporte: 'tenis', categoria }))
  const matches = [0, 1].map(i => ({ id: i + 10, control_version: 0, torneo, categoria, modalidad: 'dobles', deporte: 'tenis', estado: 'programado', fase: 'grupos', grupo: `GRUPO ${i + 1}`, equipo1: teams[i * 2], equipo2: teams[i * 2 + 1], formato: {}, sets: [] }))
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
      assert.ok(Number.isSafeInteger(body.expected_control_version))
      if (body.expected_control_version !== saved.control_version) return respond(null, 409)
      assert.equal(body.grupo, saved.grupo)
      assert.equal(Number(body.equipo1_id), saved.equipo1.id)
      assert.equal(Number(body.equipo2_id), saved.equipo2.id)
      saved.notas = body.notas
      saved.control_version++
      writes++
      return respond(saved)
    }
    if (endpoint === '/partidos/gestion/programacion') return respond({ conflicts: [], warnings: [] })
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
    await page.getByRole('button', { name: 'Editar datos del partido', exact: true }).first().click()
    await modal.locator('select[name="grupo"]:not([disabled])').waitFor()
    await modal.locator('[name="notas"]').fill('Borrador que no debe perderse')
    matches[0].control_version++ // Another administrator saved after this form was opened.
    await modal.getByRole('button', { name: 'Guardar cambios' }).click()
    await modal.getByRole('alert').filter({ hasText: 'Error simulado QA' }).waitFor()
    assert.equal(await modal.locator('[name="notas"]').inputValue(), 'Borrador que no debe perderse')
    assert.equal(writes, 4)
    await modal.getByRole('button', { name: 'Cerrar modal', exact: true }).click()
    await modal.waitFor({ state: 'detached' })
    failGroups = true
    await page.getByRole('button', { name: 'Editar datos del partido', exact: true }).first().click()
    await modal.getByText(/Error simulado QA/).waitFor()
    assert.equal(await modal.getByRole('button', { name: 'Guardar cambios' }).isDisabled(), true)
    assert.deepEqual(errors, [])
    console.log('PASS: match edit retains groups/teams, consecutive saves, save retry and group-load failure')
  } finally { await page.close() }
}

async function checkTournamentRetirements(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const admin = { id: 99, rol: 'admin', nombre: 'Admin', apellido: 'QA', email: 'qa@example.com', numero_documento: '12345678' }
  const tournament = { id: 1, nombre: 'Torneo QA', modalidad: 'dobles', estado: 'en_curso', sistema: 'grupos_eliminacion', deporte: 'tenis' }
  let retired = false, version = 0, writes = 0
  const participants = [
    { tipo: 'pareja', participante_id: 1, nombre: 'GÓMEZ / PÉREZ' },
    ...Array.from({ length: 148 }, (_, i) => ({ tipo: 'pareja', participante_id: i + 2, nombre: `Pareja QA ${i + 2}`, grupo: i < 128 ? 'GRUPO 1' : null })),
    ...Array.from({ length: 265 }, (_, i) => ({ tipo: 'jugador', participante_id: i + 1, nombre: `Jugador QA ${i + 1}` })),
  ]
  const audit = []
  const routeHandler = async route => {
    const req = route.request(), url = new URL(req.url()), endpoint = url.pathname.replace(/^\/api/, '')
    if (!url.pathname.startsWith('/api/')) return url.hostname === '127.0.0.1' ? route.continue() : route.abort()
    const respond = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) })
    if (req.method() === 'PUT') {
      assert.equal(endpoint, '/torneos/1/retiros')
      const body = req.postDataJSON()
      assert.equal(body.version, version)
      assert.equal(body.motivo, 'Motivo privado QA')
      retired = body.retirado; version++; writes++
      audit.unshift({ ...body, id: version, actor_id: 99, created_at: new Date().toISOString() })
      return respond({ message: retired ? 'Retiro registrado' : 'Participación reactivada' })
    }
    if (endpoint.endsWith('/me')) return respond(admin)
    if (endpoint === '/torneos/1') return respond(tournament)
    if (endpoint.endsWith('/retiros/participantes')) return respond(participants)
    if (endpoint.endsWith('/retiros/auditoria')) return respond(audit)
    if (endpoint.endsWith('/retiros')) return respond({ jugadores: [], parejas: retired ? [1] : [], estados: version ? [{ ...participants[0], retirado: retired, version }] : [] })
    return respond([])
  }
  await page.addInitScript(u => localStorage.setItem('auth-storage-v2', JSON.stringify({ state: { isAuthenticated: true, user: u }, version: 0 })), admin)
  await page.route('**/*', routeHandler)
  try {
    await page.goto('http://127.0.0.1:4173/torneo/1')
    await page.getByRole('button', { name: 'Participación', exact: true }).click()
    await page.getByRole('button', { name: 'Todos (149)', exact: true }).waitFor()
    await page.getByRole('button', { name: 'En grupos (128)', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Sin grupo (21)', exact: true }).click()
    await page.getByText('21 mostradas', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Jugadores (265)', exact: true }).click()
    await page.getByRole('button', { name: 'Todos (265)', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: /^Sin grupo \(/ }).count(), 0)
    assert.equal(await page.locator('#quick-participant-select option').count(), 266)
    await page.getByRole('button', { name: 'Parejas (149)', exact: true }).click()
    assert.equal(await page.locator('#quick-participant-select option').count(), 150)
    await page.getByRole('button', { name: 'Retirar del torneo', exact: true }).first().click()
    await page.getByRole('dialog').getByRole('textbox').fill('Motivo privado QA')
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar Retiro', exact: true }).click()
    await page.getByRole('button', { name: 'Reactivar en torneo', exact: true }).first().waitFor()
    assert.equal(writes, 1)
    await page.getByRole('button', { name: 'Auditoría de Retiros' }).click()
    await page.getByRole('dialog').getByText('"Motivo privado QA"', { exact: true }).waitFor()
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Participation fits at ${width}px`)
    }
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Reactivar en torneo', exact: true }).first().click()
    await page.getByRole('dialog').getByRole('textbox').fill('Motivo privado QA')
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar Reactivación', exact: true }).click()
    await page.getByRole('button', { name: 'Retirar del torneo', exact: true }).first().waitFor()
    assert.equal(writes, 2)
    assert.deepEqual(errors, [])
    console.log('PASS: tournament retirement, private audit, reactivation and 320/390/1440px layout')
  } finally { await page.close() }
}

;(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' })
  try {
    await checkAuditHistory(browser)
    await checkCourtAgenda(browser)
    await checkBracket(browser)
    await checkTournamentArchive(browser)
    await checkBulkResults(browser)
    await checkCombinedActivity(browser)
    await checkMatchEditing(browser)
    await checkTournamentRetirements(browser)
    if (process.env.QA_MATCH_EDIT_ONLY === '1') return
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    const failures = []
    page.on('pageerror', error => failures.push(error.message))
    page.on('dialog', dialog => { if (dialog.type() === 'beforeunload') void dialog.accept() })
    const user = { id: 12, rol: 'juez', nombre: 'Juez', apellido: 'Prueba', email: 'juez-qa@example.com', numero_documento: '12345678' }
    let match = { id: 30, juez_id: 12, control_version: 0, modalidad: 'singles', estado: 'en_vivo', jugador1: { nombre: 'Carlos', apellido: 'Rodríguez' }, jugador2: { nombre: 'Andrés', apellido: 'Martínez' }, cancha: { id: 1, nombre: 'Cancha 1' }, formato: { mejor_de_sets: 3, juegos_por_set: 6 } }
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
          photo = { version: field('version'), momento: field('momento'), encuadre: JSON.parse(field('encuadre') || 'null') }; photoWrites++; data = photo
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
        else if (endpoint === '/sedes') data = [{ id: 1, nombre: 'Club Unión' }]
        else if (endpoint === '/sedes/1/canchas') data = [{ id: 1, nombre: 'Cancha 1', deporte: 'tenis', activa: true }, { id: 2, nombre: 'Cancha 2', deporte: 'tenis', activa: true }]
        else if (endpoint.endsWith('/reasignar-cancha')) {
          assert.equal(req.postDataJSON().expected_control_version, match.control_version)
          match = { ...match, control_version: match.control_version + 1, cancha: { id: 2, nombre: 'Cancha 2' } }; data = match
        }
        else if (endpoint.endsWith('/estadisticas')) data = { estadisticas: { jugador1: { puntos_ganados: 1 }, jugador2: { puntos_ganados: 1 } }, total_sets: 1 }
        else if (endpoint === '/users/me') data = user
        else data = {}
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) })
      }
      if (url.hostname !== '127.0.0.1') return route.abort()
      if (req.resourceType() === 'document') {
        const response = await route.fetch()
        const { imgSrc } = require('../scores-api/src/config/securityHeaders').contentSecurityPolicy.directives
        // Vite uses a separate mocked API origin; production serves /api on self.
        return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': `img-src ${imgSrc.join(' ')} http://localhost:3001 http://127.0.0.1:3001` } })
      }
      return route.continue()
    }
    await page.route('**/*', mockRoute)
    const settled = async () => {
      await page.waitForFunction(() => document.querySelector('.judge-feedback')?.textContent.startsWith('Confirmado:'))
      await page.waitForTimeout(280)
    }
    await page.goto('http://127.0.0.1:4173/sponsors')
    await page.getByRole('heading', { name: 'Marcas que juegan el torneo con nosotros.', exact: true }).waitFor()
    assert.equal(new URL(page.url()).pathname, '/sponsors')
    await page.goto('http://127.0.0.1:4173/juez')
    const statusFilters = page.getByRole('group', { name: 'Estado de los partidos' })
    await statusFilters.waitFor()
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Judge list overflow at ${width}px`)
      assert.equal(await statusFilters.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true)
      const boxes = await statusFilters.getByRole('button').evaluateAll(buttons => buttons.map(b => ({ top: b.getBoundingClientRect().top, height: b.getBoundingClientRect().height })))
      assert.equal(new Set(boxes.map(b => Math.round(b.top))).size, width < 640 ? 2 : 1)
      assert.ok(boxes.every(b => b.height >= 44))
      for (const label of ['Finalizados', 'Cancelados', 'Todos', 'Programados']) {
        const button = statusFilters.getByRole('button', { name: new RegExp(label) })
        await button.click()
        assert.equal(await button.getAttribute('aria-pressed'), 'true')
      }
    }
    console.log('PASS: judge status filters wrap without overflow at 320/390/768/1440px and remain interactive')
    for (const mode of ['Individual', 'Dobles']) {
      const writesBefore = posts
      await page.getByRole('button', { name: `Práctica ${mode}`, exact: true }).click()
      await page.locator('.judge-point').first().click()
      const detail = page.locator('.reason-tiro_ganador')
      if (await detail.isVisible()) await detail.click()
      await page.getByRole('button', { name: /^Pausar$/ }).click()
      await page.getByRole('button', { name: /^Reanudar$/ }).click()
      assert.equal(await page.locator('.judge-point').first().isEnabled(), true)
      await page.getByRole('button', { name: 'Salir de práctica', exact: true }).first().click()
      await page.getByRole('dialog').getByRole('button', { name: 'Salir de práctica', exact: true }).click()
      await page.getByRole('button', { name: 'Práctica Individual', exact: true }).waitFor()
      assert.equal(posts, writesBefore, 'Practice must not send scoring events')
    }
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
    await page.getByRole('button', { name: 'Confirmar o cambiar cancha', exact: true }).click()
    const courtDialog = page.getByRole('dialog', { name: /cancha/ })
    await courtDialog.getByRole('button', { name: /Cancha 2/ }).click()
    await courtDialog.getByRole('button', { name: 'Confirmar cancha', exact: true }).click()
    await courtDialog.waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Confirmar o cambiar cancha', exact: true }).getByText('Cancha 2', { exact: true }).waitFor()
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
    await photoDialog.getByLabel('Acercamiento', { exact: true }).fill('1.15')
    await photoDialog.getByLabel('Horizontal', { exact: true }).fill('45')
    await photoDialog.getByLabel('Vertical', { exact: true }).fill('60')
    assert.equal(await photoDialog.getByAltText('Vista previa de la foto del partido').evaluate(el => el.style.transform), 'scale(1.15)')
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
    assert.deepEqual(photo.encuadre, { zoom: 1.15, x: 45, y: 60 }, 'Framing survives offline storage and reload')
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
    for (const route of ['/pantalla', '/', '/admin']) {
      await page.goto(`http://127.0.0.1:4173${route}`)
      await page.waitForURL('**/juez')
    }
    const publicPage = await browser.newPage({ viewport: { width: 390, height: 844 } })
    publicPage.on('pageerror', error => failures.push(error.message))
    await publicPage.route('**/*', mockRoute)
    await publicPage.route('**/api/jugadores/77', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: {
      id: 77, nombre: 'Jugador', apellido: 'QA', estadisticas: [1, 2].map(id => ({
        categoria: { id, nombre: `Categoría ${id}` }, ranking: 1, puntos: 1,
        partidos_jugados: 1, victorias: 1, derrotas: 0, sets_ganados: 2, sets_perdidos: 0,
        games_ganados: 12, games_perdidos: 4, porcentaje_sets: 1, porcentaje_games: .75,
      }))
    } }) }))
    await publicPage.goto('http://127.0.0.1:4173/player/77')
    await publicPage.locator('#player-category').waitFor()
    assert.equal(await publicPage.locator('#player-category').inputValue(), 'todas')
    await publicPage.locator('#player-category').selectOption('1')
    assert.equal(await publicPage.locator('#player-category').inputValue(), '1')
    await publicPage.goto('http://127.0.0.1:4173/pantalla')
    await publicPage.getByRole('heading', { name: 'Jornada de hoy' }).waitFor()
    await publicPage.getByRole('button', { name: 'Ver este partido a detalle' }).first().click()
    await publicPage.getByRole('heading', { name: 'Estadísticas de los jugadores' }).waitFor()
    await publicPage.getByRole('heading', { name: 'Foto oficial del partido' }).waitFor()
    const preview = publicPage.locator('.photocall-photo-img')
    await preview.scrollIntoViewIfNeeded()
    await preview.evaluate(image => image.decode())
    assert.equal(new URL(await preview.getAttribute('src')).searchParams.has('miniatura'), false, 'Collapsed preview uses full resolution without a click')
    assert.equal(await preview.evaluate(image => image.naturalWidth), 1200)
    await publicPage.getByRole('button', { name: 'Ampliar foto', exact: true }).click()
    await publicPage.getByRole('button', { name: 'Reducir foto', exact: true }).click()
    assert.equal(new URL(await preview.getAttribute('src')).searchParams.has('miniatura'), false, 'Collapsing does not revert to thumbnail')
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
    for (const kind of ['wo', 'double', 'retirement']) {
      await publicPage.route('**/api/partidos/*/estadisticas*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: {
        estadisticas: { jugador1: { puntos_ganados: kind === 'retirement' ? 3 : 0 }, jugador2: { puntos_ganados: 0 } },
        walkover: { es_retiro: kind === 'retirement', doble: kind === 'double', ganador: kind === 'double' ? null : 'jugador1',
          marcador_oficial: kind === 'double' ? null : kind === 'wo' ? '6/0 6/0' : '3/1', sets: kind === 'double' ? [] : [{ games_j1: 6, games_j2: 0 }] }
      } }) }))
      await publicPage.getByRole('button', { name: 'Ver este partido a detalle' }).first().click()
      await publicPage.getByText(kind === 'double' ? '0 para ambos' : '1 al ganador · 0 al rival', { exact: true }).waitFor()
      for (const width of [320, 1440]) {
        await publicPage.setViewportSize({ width, height: 900 })
        assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      }
      await publicPage.getByRole('button', { name: 'Regresar a partidos' }).click()
    }
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
