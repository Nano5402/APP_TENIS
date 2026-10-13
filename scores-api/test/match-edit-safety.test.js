const test = require('node:test')
const assert = require('node:assert/strict')
const guards = require('../src/modules/matches/edit-guards')
const audit = require('../src/modules/audit/edit-audit')
function fixture(state = 'programado', auditFailure = false) {
  let row = {id:1,estado:state,deporte:'tenis',jugador1_id:10,jugador2_id:11,juez_id:7,control_version:4,ganador:state==='finalizado'?'jugador1':null}
  const calls = []; let snapshot
  const query = async (sql, params=[]) => {
    calls.push({sql,params})
    if(sql.includes('GET_LOCK')) return [[{acquired:1}]]
    if(sql.includes('RELEASE_LOCK')) return [[{released:1}]]
    if(sql.startsWith('SELECT * FROM partidos')) return [[{...row}]]
    if(sql.includes('FROM jugadores')) return [[{id:12},{id:11}]]
    if(sql.includes('FROM categorias')) return [[{id:1}]]
    if(sql.startsWith('UPDATE partidos SET nombre_override_j1')) {row={...row,nombre_override_j1:params[0],control_version:row.control_version+1};return [{affectedRows:1}]}
    if(sql.startsWith('INSERT INTO auditoria_ediciones') && auditFailure) throw Error('audit failed')
    return [[]]
  }
  const conn={query,beginTransaction:async()=>{snapshot={...row}},commit:async()=>calls.push({sql:'COMMIT'}),rollback:async()=>{row=snapshot;calls.push({sql:'ROLLBACK'})},release:()=>{}}
  const dbPath=require.resolve('../src/config/db'), svcPath=require.resolve('../src/modules/matches/matches.service')
  require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{query,getConnection:async()=>conn}}
  delete require.cache[svcPath]
  const svc=require(svcPath);svc.getById=async()=>({...row})
  return {svc,calls,row:()=>row}
}
for(const state of ['en_vivo','finalizado','cancelado']) {
  test(`bloquea sustitución directa ${state} antes de escribir`,async()=>{
    const {svc,calls}=fixture(state)
    await assert.rejects(svc.updateParticipants(1,{jugador1_id:12,expected_control_version:4},{id:7,rol:'juez'}),e=>e.status===409)
    assert.ok(!calls.some(c=>/^(UPDATE|INSERT|DELETE)/.test(c.sql)))
  })
}
test('edición general no puede reabrir ni cambiar el origen de un resultado cerrado',()=>{
  for(const next of [{estado:'programado'},{jugador1_id:12},{origen_partido1_id:2}])
    assert.throws(()=>guards.assertIdentity({estado:'finalizado',jugador1_id:10},next),e=>e.status===409)
  assert.doesNotThrow(()=>guards.assertIdentity({estado:'finalizado',jugador1_id:10},{jugador1_id:'10',notas:'Aclaración'}))
})
test('ruta de edición completa también bloquea reasignar un resultado finalizado',async()=>{
  const {svc,calls}=fixture('finalizado')
  await assert.rejects(svc.update(1,{torneo_id:null,deporte:'tenis',modalidad:'individual',categoria_id:1,
    estado:'finalizado',jugador1_id:12,jugador2_id:11,expected_control_version:4},{id:8,rol:'admin'}),e=>e.status===409)
  assert.ok(!calls.some(c=>/^(UPDATE|INSERT|DELETE)/.test(c.sql)))
})
test('dos editores con la misma versión: el segundo no sobrescribe al primero',async()=>{
  const {svc,calls,row}=fixture()
  await svc.updateParticipants(1,{nombre_override_j1:'Primero',expected_control_version:4},{id:8,rol:'admin'})
  await assert.rejects(svc.updateParticipants(1,{nombre_override_j1:'Segundo',expected_control_version:4},{id:9,rol:'admin'}),e=>e.status===409)
  assert.equal(row().nombre_override_j1,'Primero');assert.equal(row().control_version,5)
  assert.equal(calls.filter(c=>c.sql==='COMMIT').length,1)
  const record=calls.find(c=>c.sql.startsWith('INSERT INTO auditoria_ediciones'))
  assert.equal(record.params[2],8)
  assert.deepEqual(JSON.parse(record.params[4]).cambios.nombre_override_j1,{antes:null,despues:'Primero'})
})
test('nombres visibles son auditados sin alterar participantes ni ganador',async()=>{
  const {svc,row}=fixture('finalizado')
  await svc.updateParticipants(1,{nombre_override_j1:'Nombre corregido',expected_control_version:4},{id:7,rol:'juez'})
  assert.equal(row().jugador1_id,10);assert.equal(row().ganador,'jugador1')
  for(const field of ['nombre_override','nombre_override_j1','nombre_override_j2'])
    assert.deepEqual(audit.diff('partido',{[field]:'Antes'},{[field]:'Después'})[field],{antes:'Antes',despues:'Después'})
})
test('fallo de auditoría revierte nombre y versión',async()=>{
  const {svc,row,calls}=fixture('programado',true)
  await assert.rejects(svc.updateParticipants(1,{nombre_override_j1:'Nuevo',expected_control_version:4},{id:7,rol:'juez'}),/audit failed/)
  assert.equal(row().control_version,4);assert.equal(row().nombre_override_j1,undefined)
  assert.ok(!calls.some(c=>c.sql==='COMMIT'))
})
test('versión ausente, inválida o antigua nunca permite guardar',async()=>{
  for(const expected of [undefined,null,'4',-1,3]) {
    const {svc,calls}=fixture()
    await assert.rejects(svc.update(1,{expected_control_version:expected},{id:8,rol:'admin'}),e=>e.status===409)
    assert.ok(!calls.some(c=>/^(UPDATE|INSERT|DELETE)/.test(c.sql)))
  }
})
