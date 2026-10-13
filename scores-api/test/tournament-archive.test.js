const test = require('node:test')
const assert = require('node:assert/strict')
function fixture(archived=false, failAudit=false) {
  const calls=[]
  const conn={beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release'),query:async(sql,params)=>{
    calls.push({sql,params})
    if(sql.startsWith('SELECT id,archivado_at')) return [[{id:1,archivado_at:archived?'2026-10-01':null}]]
    if(sql.startsWith('INSERT') && failAudit) throw Error('audit unavailable')
    return [{affectedRows:1}]
  }}
  const path=require.resolve('../src/config/db'), servicePath=require.resolve('../src/modules/torneos/torneos.service')
  require.cache[path]={id:path,filename:path,loaded:true,exports:{getConnection:async()=>conn,query:async(sql,params)=>{calls.push({sql,params});return [[]]}}}
  delete require.cache[servicePath]
  return {service:require(servicePath),calls}
}
test('archivar registra auditoría sin modificar partidos ni estado deportivo',async()=>{
  const {service,calls}=fixture()
  assert.deepEqual(await service.setArchived(1,true,false,7),{id:1,archivado:true})
  const writes=calls.filter(c=>c.sql && /^(UPDATE|INSERT|DELETE)/.test(c.sql))
  assert.equal(writes.length,2)
  assert.match(writes[0].sql,/UPDATE torneos SET archivado_at/)
  assert.deepEqual(writes[1].params,[1,7,true])
  assert.ok(calls.includes('commit'))
})
test('restaurar elimina solo la marca de archivo',async()=>{
  const {service,calls}=fixture(true)
  await service.setArchived(1,false,true,7)
  assert.deepEqual(calls.find(c=>c.sql?.startsWith('UPDATE')).params,[false,1])
})
test('reintentar archivo ya aplicado es idempotente',async()=>{
  const {service,calls}=fixture(true)
  await service.setArchived(1,true,false,7)
  assert.equal(calls.filter(c=>c.sql?.startsWith('INSERT')).length,0)
})
test('fallo de auditoría revierte el cambio',async()=>{
  const {service,calls}=fixture(false,true)
  await assert.rejects(service.setArchived(1,true,false,7),/audit unavailable/)
  assert.ok(calls.includes('rollback'));assert.ok(!calls.includes('commit'));assert.ok(calls.includes('release'))
})
test('filtros separan archivados y activos',async()=>{
  const {service,calls}=fixture()
  await service.getAll({});await service.getAll({archivo:'archivados'});await service.getAll({archivo:'todos'})
  const queries=calls.filter(c=>c.sql).map(c=>c.sql)
  assert.match(queries[0],/AND t.archivado_at IS NULL/)
  assert.match(queries[1],/AND t.archivado_at IS NOT NULL/)
  assert.doesNotMatch(queries[2],/AND t.archivado_at/)
  await assert.rejects(service.getAll({archivo:'anything'}),e=>e.status===400)
})
test('rechaza datos inválidos antes de abrir transacción',async()=>{
  const {service,calls}=fixture()
  await assert.rejects(service.setArchived(1,'true',false,7),e=>e.status===400)
  assert.equal(calls.length,0)
})
