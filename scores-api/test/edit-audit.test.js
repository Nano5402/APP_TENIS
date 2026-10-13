const test = require('node:test')
const assert = require('node:assert/strict')
const audit = require('../src/modules/audit/edit-audit')
test('guarda solo diferencias permitidas, sin credenciales ni metadatos internos', async () => {
  const calls = []
  await audit.record({query:async(...args)=>calls.push(args)}, 'partido', 5, {id:7},
    {cancha_id:1,control_version:3,password:'viejo'}, {cancha_id:2,control_version:4,password:'nuevo'})
  assert.deepEqual(calls[0][1].slice(0,4), ['partido',5,7,'Edición administrativa'])
  assert.deepEqual(JSON.parse(calls[0][1][4]), {cambios:{cancha_id:{antes:1,despues:2}}})
})
test('no audita reintentos sin cambios ni fechas equivalentes', async () => {
  await audit.record({query:async()=>assert.fail('No debe insertar')}, 'torneo', 1, 7,
    {nombre:'Abierto',fecha_inicio:new Date('2026-10-01T00:00:00Z')}, {nombre:'Abierto',fecha_inicio:'2026-10-01'})
})
test('distribución normaliza orden pero detecta parejas movidas', () => {
  const groups = [{categoria_id:1,nombre:'GRUPO A'},{categoria_id:1,nombre:'GRUPO B'}]
  const pairs = [{categoria_id:1,grupo:'GRUPO A',equipo_id:2},{categoria_id:1,grupo:'GRUPO A',equipo_id:1}]
  const first = audit.groupsSnapshot(groups,pairs)
  assert.deepEqual(first,audit.groupsSnapshot([...groups].reverse(),[...pairs].reverse()))
  assert.ok(audit.diff('grupos',first,audit.groupsSnapshot(groups,[{...pairs[0],grupo:'GRUPO B'},pairs[1]])).distribucion)
})
test('un fallo de persistencia no se oculta', async () => {
  await assert.rejects(audit.record({query:async()=>{throw Error('audit failed')}},'torneo',1,7,{nombre:'A'},{nombre:'B'}),/audit failed/)
})
function tournamentFixture(fail=false) {
  let row = {id:1,nombre:'Anterior',deporte:'tenis',modalidad:'dobles',sistema:'grupos_eliminacion',categoria_id:null,estado:'proximo',fecha_inicio:null,fecha_fin:null}
  const calls = []
  const conn = { beginTransaction:async()=>calls.push('begin'), commit:async()=>calls.push('commit'), rollback:async()=>calls.push('rollback'), release:()=>calls.push('release'), query:async(sql,params)=>{
    calls.push({sql,params})
    if (/INSERT INTO auditoria_ediciones/.test(sql)) { if(fail) throw Error('audit failed'); return [{affectedRows:1}] }
    if (/UPDATE torneos/.test(sql)) { row={...row,nombre:params[0]}; return [{affectedRows:1}] }
    if (/COUNT\(\*\) AS total/.test(sql)) return [[{total:0}]]
    return [[{...row}]]
  }}
  const path=require.resolve('../src/config/db'), servicePath=require.resolve('../src/modules/torneos/torneos.service')
  require.cache[path]={id:path,filename:path,loaded:true,exports:{getConnection:async()=>conn,query:async()=>assert.fail('Query fuera de transacción')}}
  delete require.cache[servicePath]
  return { service:require(servicePath), calls, body:{...row,nombre:'Nuevo'} }
}
test('edición de torneo y auditoría usan misma conexión y se confirman juntas', async () => {
  const {service,calls,body}=tournamentFixture()
  await service.update(1,body,9)
  const entry=calls.find(c=>c.sql?.startsWith('INSERT INTO auditoria_ediciones'))
  assert.deepEqual(JSON.parse(entry.params[4]).cambios.nombre,{antes:'Anterior',despues:'Nuevo'})
  assert.equal(entry.params[2],9); assert.ok(calls.includes('commit')); assert.ok(!calls.includes('rollback'))
})
test('edición de torneo se revierte si falla auditoría', async () => {
  const {service,calls,body}=tournamentFixture(true)
  await assert.rejects(service.update(1,body,9),/audit failed/)
  assert.ok(calls.includes('rollback')); assert.ok(!calls.includes('commit')); assert.ok(calls.includes('release'))
})
