const test = require('node:test')
const assert = require('node:assert/strict')

const dbPath = require.resolve('../src/config/db')
const servicePath = require.resolve('../src/modules/users/users.service')

const loadService = (fakeDb) => {
  delete require.cache[servicePath]
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: fakeDb,
  }
  return require(servicePath)
}

test('vincula ficha a una cuenta existente sin alterar el rol', async () => {
  let committed=false, writes=[]
  const conn={beginTransaction:async()=>{},commit:async()=>{committed=true},rollback:async()=>{},release(){},query:async(sql,params)=>{
    if(sql.startsWith('SELECT id FROM users')) return [[{id:7}]]
    if(sql.includes('WHERE user_id=')) return [[]]
    if(sql.includes('SELECT id, activo')) return [[{id:9,activo:1,user_id:null}]]
    if(sql.startsWith('UPDATE jugadores')) {writes.push([sql,params]); return [{affectedRows:1}]}
    throw Error(sql)
  }}
  const service=loadService({getConnection:async()=>conn,query:async()=>[[{id:7,rol:'juez',jugador_id:9}]]})
  await service.linkPlayer(7,9)
  assert.equal(committed,true)
  assert.equal(writes.length,1)
  assert.deepEqual(writes[0][1],[7,9])
})
test('no reemplaza la ficha histórica de una cuenta', async () => {
  let rolled=false
  const service=loadService({getConnection:async()=>({beginTransaction:async()=>{},rollback:async()=>{rolled=true},release(){},query:async sql=>sql.includes('FROM users')?[[{id:7}]]:[[{id:9}]]})})
  await assert.rejects(service.linkPlayer(7,10), e=>e.status===409)
  assert.equal(rolled,true)
})
test('no permite apropiarse de una ficha vinculada a otra cuenta', async () => {
  const service=loadService({getConnection:async()=>({beginTransaction:async()=>{},rollback:async()=>{},release(){},query:async sql=>sql.includes('FROM users')?[[{id:7}]]:sql.includes('WHERE user_id=')?[[]]:[[{id:9,activo:1,user_id:8}]]})})
  await assert.rejects(service.linkPlayer(7,9), e=>e.status===409)
})

test('crea miembro con solo nombres, celular y contraseña sin cédula/correo', async () => {
  let insert
  const service = loadService({ async query(sql, params) {
    if (sql.includes('information_schema')) return [[{ total: 1 }]]
    if (sql.startsWith('INSERT')) { insert = { sql, params }; return [{ insertId: 30 }] }
    if (sql.includes('FROM users u')) return [[{ id: 30, nombre: 'Ana', apellido: 'Prueba', rol: 'miembro', activo: 1 }]]
    return [[]]
  } })
  await service.create({ nombre: 'Ana', apellido: 'Prueba', telefono: '+57 3001234567', password: 'Secret123' })
  assert.match(insert.sql, /telefono_acceso/)
  assert.equal(insert.params[0], null)
  assert.equal(insert.params[4], null)
  assert.equal(insert.params.at(-1), '3001234567')
})

test('getById devuelve avatar y jugador vinculado sin exponer contraseña', async () => {
  const fakeDb = {
    async query() {
      return [[{
        id: 4,
        numero_documento: '12345',
        nombre: 'Laura',
        apellido: 'Díaz',
        email: 'laura@example.com',
        telefono: null,
        avatar: '/uploads/avatars/laura.jpg',
        rol: 'miembro',
        activo: 1,
        jugador_id: 8,
        jugador_nombre: 'Laura',
        jugador_apellido: 'Díaz',
        jugador_foto: '/uploads/players/laura.jpg',
      }]]
    },
  }

  const user = await loadService(fakeDb).getById(4)

  assert.equal(user.avatar, '/uploads/avatars/laura.jpg')
  assert.equal(Object.hasOwn(user, 'password'), false)
  assert.deepEqual(user.jugador, {
    id: 8,
    nombre: 'Laura',
    apellido: 'Díaz',
    foto: '/uploads/players/laura.jpg',
  })
})

test('updateAvatar permite establecer y retirar la foto', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/SELECT id FROM users/.test(sql)) return [[{ id: 4 }]]
      if (/UPDATE users SET avatar/.test(sql)) return [{ affectedRows: 1 }]
      return [[{
        id: 4,
        numero_documento: '12345',
        nombre: 'Laura',
        apellido: 'Díaz',
        email: 'laura@example.com',
        avatar: null,
        rol: 'miembro',
        activo: 1,
      }]]
    },
  }

  await loadService(fakeDb).updateAvatar(4, null)

    const update = calls.find((call) => /UPDATE users u LEFT JOIN jugadores/.test(call.sql))
    assert.deepEqual(update.params, [null, null, 4])
})

test('crear usuario guarda el alias y valida que no esté repetido', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/information_schema\.COLUMNS/.test(sql)) return [[{ total: 1 }]]
      if (/SELECT id FROM users WHERE numero_documento = \? LIMIT 1/.test(sql)) return [[]]
      if (/SELECT id FROM users WHERE email = \? LIMIT 1/.test(sql)) return [[]]
      if (/SELECT id FROM users WHERE usuario = \? LIMIT 1/.test(sql)) return [[]]
      if (/SELECT id FROM users WHERE id != \? AND/.test(sql)) return [[]]
      if (/AND id != \?/.test(sql)) return [[]]
      if (/INSERT INTO users/.test(sql)) return [{ insertId: 11 }]
      return [[{
        id: 11,
        numero_documento: '99887766',
        usuario: 'juan.perez',
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'juan@example.com',
        rol: 'juez',
        activo: 1,
      }]]
    },
  }

  const user = await loadService(fakeDb).create({
    numero_documento: '99887766',
    usuario: '  juan.perez  ',
    nombre: 'Juan',
    apellido: 'Pérez',
    email: 'JUAN@example.com',
    password: 'Secret123',
    rol: 'juez',
  })

  assert.equal(user.usuario, 'juan.perez')
  const insert = calls.find((call) => /INSERT INTO users/.test(call.sql))
  assert.match(insert.sql, /\(numero_documento, usuario, nombre/)
  assert.equal(insert.params[1], 'juan.perez')
})

test('crear usuario rechaza un alias ya usado por otra cuenta', async () => {
  const fakeDb = {
    async query(sql) {
      if (/information_schema\.COLUMNS/.test(sql)) return [[{ total: 1 }]]
      if (/SELECT id FROM users WHERE numero_documento = \? LIMIT 1/.test(sql)) return [[]]
      if (/SELECT id FROM users WHERE email = \? LIMIT 1/.test(sql)) return [[]]
      if (/SELECT id FROM users WHERE usuario = \? LIMIT 1/.test(sql)) return [[{ id: 3 }]]
      return [[]]
    },
  }

  await assert.rejects(
    loadService(fakeDb).create({
      numero_documento: '99887766',
      usuario: 'juan.perez',
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan@example.com',
      password: 'Secret123',
      rol: 'juez',
    }),
    (error) => error.status === 409 && /usuario ya está en uso/.test(error.message)
  )
})

test('crear cuenta por documento sin alias funciona aunque la columna usuario aún no exista', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/information_schema\.COLUMNS/.test(sql)) return [[{ total: 0 }]]
      if (/SELECT id FROM users WHERE numero_documento = \? LIMIT 1/.test(sql)) return [[]]
      if (/SELECT id FROM users WHERE email = \? LIMIT 1/.test(sql)) return [[]]
      if (/INSERT INTO users/.test(sql)) return [{ insertId: 12 }]
      return [[{ id: 12, numero_documento: '5', nombre: 'A', apellido: 'B', email: 'a@b.com', rol: 'miembro', activo: 1 }]]
    },
  }

  await loadService(fakeDb).create({
    numero_documento: '55554444',
    nombre: 'Ana',
    apellido: 'Ruiz',
    email: 'ana@example.com',
    password: 'Secret123',
  })

  const insert = calls.find((call) => /INSERT INTO users/.test(call.sql))
  assert.doesNotMatch(insert.sql, /usuario/)
  assert.equal(calls.some((call) => /SELECT id FROM users WHERE usuario = \?/.test(call.sql)), false)
})

test('updateUsuario permite fijar y retirar el alias', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (/information_schema\.COLUMNS/.test(sql)) return [[{ total: 1 }]]
      if (/SELECT id FROM users WHERE id = \?/.test(sql)) return [[{ id: 7 }]]
      if (/SELECT id FROM users WHERE id != \? AND/.test(sql)) return [[]]
      if (/SELECT id FROM users WHERE usuario = \? AND id != \?/.test(sql)) return [[]]
      if (/SELECT id FROM users WHERE numero_documento = \? AND id != \?/.test(sql)) return [[]]
      if (/UPDATE users SET usuario/.test(sql)) return [{ affectedRows: 1 }]
      return [[{ id: 7, numero_documento: '1', nombre: 'J', apellido: 'P', email: 'j@e.com', rol: 'juez', activo: 1 }]]
    },
  }

  const service = loadService(fakeDb)
  await service.updateUsuario(7, 'nuevo.alias')
  await service.updateUsuario(7, '')

  const updates = calls.filter((call) => /UPDATE users SET usuario/.test(call.sql))
  assert.deepEqual(updates.map((call) => call.params[0]), ['nuevo.alias', null])
})

for (const field of ['usuario', 'numero_documento']) {
  test(`crear cuenta rechaza conflicto cruzado de ${field}`, async () => {
    const service = loadService({ async query(sql) {
      if (/information_schema/.test(sql)) return [[{ total: 1 }]]
      if (/AND id !=/.test(sql) && sql.includes(field === 'usuario' ? 'WHERE numero_documento' : 'WHERE usuario')) return [[{ id: 9 }]]
      if (/INSERT/.test(sql)) assert.fail('No debe guardar una cuenta en conflicto')
      return [[]]
    } })
    await assert.rejects(service.create({ numero_documento: '12345', usuario: '54321', nombre: 'A', apellido: 'B', email: 'a@b.com', password: 'Secret123' }), error => error.status === 409 && /coincide/.test(error.message))
  })
}

test('editar alias rechaza documento de otra cuenta', async () => {
  const service = loadService({ async query(sql, params) {
    if (/information_schema/.test(sql)) return [[{ total: 1 }]]
    if (/WHERE id =/.test(sql)) return [[{ id: 7 }]]
    if (/WHERE numero_documento/.test(sql)) {
      assert.deepEqual(params, ['12345', 7])
      return [[{ id: 9 }]]
    }
    assert.fail('No debe actualizar un alias en conflicto')
  } })
  await assert.rejects(service.updateUsuario(7, '12345'), error => error.status === 409)
})
test('no permite quitar el único usuario de acceso de un miembro sin otros datos', async () => {
  const service = loadService({ async query(sql) {
    if (sql.includes('information_schema')) return [[{ total: 1 }]]
    if (sql.startsWith('SELECT id, rol')) return [[{ id: 7, rol: 'miembro', usuario: 'ana.garcia', numero_documento: null, email: null, telefono: null }]]
    assert.fail('No debe escribir ni dejar la cuenta sin acceso')
  } })
  await assert.rejects(service.updateUsuario(7, ''), { status: 400 })
})

test('crear cuenta rechaza documento duplicado con mensaje específico', async () => {
  const service = loadService({ async query(sql) {
    if (/information_schema/.test(sql)) return [[{ total: 1 }]]
    if (/SELECT id FROM users WHERE numero_documento = \? LIMIT 1/.test(sql)) return [[{ id: 9 }]]
    if (/INSERT/.test(sql)) assert.fail('No debe guardar documento duplicado')
    return [[]]
  } })
  await assert.rejects(
    service.create({ numero_documento: '12345', nombre: 'A', apellido: 'Beca', email: 'nuevo@test.com', password: 'Secret123' }),
    (error) => error.status === 409 && /documento ya está registrado/.test(error.message)
  )
})

test('crear cuenta rechaza correo duplicado con mensaje específico', async () => {
  const service = loadService({ async query(sql) {
    if (/information_schema/.test(sql)) return [[{ total: 1 }]]
    if (/SELECT id FROM users WHERE email = \? LIMIT 1/.test(sql)) return [[{ id: 9 }]]
    if (/INSERT/.test(sql)) assert.fail('No debe guardar correo duplicado')
    return [[]]
  } })
  await assert.rejects(
    service.create({ numero_documento: '99999', nombre: 'A', apellido: 'Beca', email: 'duplicado@test.com', password: 'Secret123' }),
    (error) => error.status === 409 && /correo ya está registrado/.test(error.message)
  )
})

test('crear cuenta rechaza celular que coincide con documento de otra cuenta', async () => {
  const service = loadService({ async query(sql) {
    if (/information_schema/.test(sql)) return [[{ total: 1 }]]
    if (/numero_documento = \? OR usuario = \?/.test(sql)) return [[{ id: 9 }]]
    if (/INSERT/.test(sql)) assert.fail('No debe guardar celular en conflicto cruzado')
    return [[]]
  } })
  await assert.rejects(
    service.create({ nombre: 'A', apellido: 'Beca', telefono: '3001234567', password: 'Secret123' }),
    (error) => error.status === 409 && /coincide/.test(error.message)
  )
})

test('updateMe normaliza el correo antes de comprobar duplicados', async () => {
  const calls = []
  const service = loadService({ async query(sql, params) {
    calls.push({ sql, params })
    if (/information_schema/.test(sql)) return [[{ total: 1 }]]
    if (/SELECT id, rol, numero_documento/.test(sql)) return [[{ id: 7, rol: 'miembro', numero_documento: null, email: 'viejo@test.com', telefono: null, usuario: 'ana.garcia' }]]
    if (/SELECT id FROM users WHERE email = \? AND id != \?/.test(sql)) {
      assert.deepEqual(params, ['nuevo@test.com', 7])
      return [[{ id: 9 }]]
    }
    return [[]]
  } })
  await assert.rejects(service.updateMe(7, { email: 'NUEVO@test.com' }), (error) => error.status === 409 && /correo ya está en uso/.test(error.message))
})

test('updateMe permite registrar el documento solo la primera vez', async () => {
  const service = loadService({ async query(sql) {
    if (/information_schema/.test(sql)) return [[{ total: 1 }]]
    if (/SELECT id, rol, numero_documento/.test(sql)) return [[{ id: 7, rol: 'miembro', numero_documento: null, email: null, telefono: null, usuario: 'ana.garcia' }]]
    if (/SELECT id FROM users WHERE numero_documento/.test(sql)) return [[]]
    if (/UPDATE users/.test(sql)) return [{ affectedRows: 1 }]
    if (/FROM users u/.test(sql)) return [[{ id: 7, numero_documento: '55554444', nombre: 'A', apellido: 'B', email: null, rol: 'miembro', activo: 1 }]]
    return [[]]
  } })
  const updated = await service.updateMe(7, { numero_documento: '55554444' })
  assert.equal(updated.numero_documento, '55554444')
})

test('updateMe bloquea cambiar un documento ya registrado', async () => {
  const service = loadService({ async query(sql) {
    if (/information_schema/.test(sql)) return [[{ total: 1 }]]
    if (/SELECT id, rol, numero_documento/.test(sql)) return [[{ id: 7, rol: 'miembro', numero_documento: '11111', email: null, telefono: null, usuario: 'ana.garcia' }]]
    return [[]]
  } })
  await assert.rejects(service.updateMe(7, { numero_documento: '22222' }), (error) => error.status === 400 && /ya está registrado/.test(error.message))
})

test('updateMe rechaza documento duplicado de otra cuenta', async () => {
  const service = loadService({ async query(sql) {
    if (/information_schema/.test(sql)) return [[{ total: 1 }]]
    if (/SELECT id, rol, numero_documento/.test(sql)) return [[{ id: 7, rol: 'miembro', numero_documento: null, email: null, telefono: null, usuario: 'ana.garcia' }]]
    if (/SELECT id FROM users WHERE numero_documento/.test(sql)) return [[{ id: 9 }]]
    return [[]]
  } })
  await assert.rejects(service.updateMe(7, { numero_documento: '55554444' }), (error) => error.status === 409 && /documento ya está registrado/.test(error.message))
})
