const test=require('node:test'), assert=require('node:assert/strict')
const model=import('../../scores-app/src/utils/bulkActions.js')
const records=[1,2,3].map(id=>({id,name:`Registro ${id}`}))
test('lote conserva éxito y fallo por registro sin detenerse por dependencia',async()=>{
  const {runDeletionBatch}=await model
  const result=await runDeletionBatch(records,async(id,options)=>{assert.equal(options.suppressDeleteAlert,true);if(id===2)throw{status:409,message:'Tiene dependencias'}})
  assert.deepEqual(result.map(r=>r.status),['success','failed','success'])
})
test('red incierta detiene el lote y no lo informa como eliminado',async()=>{
  const {runDeletionBatch}=await model
  const calls=[]
  const result=await runDeletionBatch(records,async id=>{calls.push(id);throw Error('network')})
  assert.deepEqual(calls,[1]);assert.deepEqual(result.map(r=>r.status),['unknown','pending','pending'])
})
test('detener deja terminar solicitud actual y no envía la siguiente',async()=>{
  const {runDeletionBatch}=await model
  let stop=false
  const result=await runDeletionBatch(records,async()=>{stop=true},{stopped:()=>stop})
  assert.deepEqual(result.map(r=>r.status),['success','pending','pending'])
})
test('pérdida de permiso detiene solicitudes restantes',async()=>{
  const {runDeletionBatch}=await model
  const result=await runDeletionBatch(records,async()=>{throw{status:403,message:'Sin permiso'}})
  assert.deepEqual(result.map(r=>r.status),['failed','pending','pending'])
})
