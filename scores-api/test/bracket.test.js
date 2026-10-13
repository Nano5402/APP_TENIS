const test = require('node:test')
const assert = require('node:assert/strict')
const model = import('../../scores-app/src/utils/tournamentBracket.js')
const match = (id, extra={})=>({id,estado:'programado',fase:'eliminacion',categoria:{id:1,nombre:'Quinta'},...extra})
test('cuadro separa categorías por ID y excluye fase de grupos',async()=>{
  const {buildBracket}=await model
  const result=buildBracket([match(1),match(2,{fase:'grupos'}),match(3,{categoria:{id:2,nombre:'Quinta'}})],'grupos_eliminacion','1')
  assert.deepEqual(result.rounds.flatMap(r=>r.matches.map(m=>m.id)),[1])
})
test('rondas conocidas ordenadas; vacías y personalizadas no se inventan',async()=>{
  const {buildBracket}=await model
  const result=buildBracket([match(1,{ronda:'Final'}),match(2,{ronda:'Cuartos de final'}),match(3,{ronda:'SEMIFINALES'}),match(4)],'eliminacion_directa','1')
  assert.deepEqual(result.rounds.map(r=>r.label),['Cuartos de final','Semifinales','Final','Sin ronda registrada'])
})
test('un hueco nunca implica pase libre; origen pendiente no confirma clasificado',async()=>{
  const {buildBracket,bracketSlot}=await model
  const a=match(1), b=match(2,{origen_partido1:{id:1}}), bracket=buildBracket([a,b],'eliminacion_directa','1')
  assert.equal(bracketSlot(b,1,bracket).pending,true)
  assert.deepEqual(bracketSlot(b,2,bracket),{pending:true,source:null,invalid:false})
})
test('resultado corregido no sustituye visualmente jugadores de rondas ya iniciadas',async()=>{
  const {buildBracket,bracketSlot}=await model
  const a=match(1,{estado:'finalizado',ganador:'jugador2',jugador1:{id:4},jugador2:{id:5}})
  const b=match(2,{estado:'en_vivo',origen_partido1:{id:1},jugador1:{id:4}})
  assert.deepEqual(bracketSlot(b,1,buildBracket([a,b],'eliminacion_directa','1')),{pending:false,source:1,invalid:true})
})
test('reconoce ganador confirmado de dobles',async()=>{
  const {buildBracket,bracketSlot}=await model
  const a=match(1,{estado:'finalizado',ganador:'jugador1',equipo1:{id:12}}), b=match(2,{origen_partido1:{id:1},equipo1:{id:12}})
  assert.equal(bracketSlot(b,1,buildBracket([a,b],'eliminacion_directa','1')).pending,false)
})
test('ciclos y referencias externas se aíslan sin bloquear el cuadro',async()=>{
  const {buildBracket}=await model
  const result=buildBracket([match(1,{origen_partido1:{id:2}}),match(2,{origen_partido1:{id:1}}),match(3,{origen_partido1:{id:999}})],'eliminacion_directa','1')
  assert.equal(result.invalidEdges.size,3)
  assert.equal(result.rounds[0].matches.length,3)
})
