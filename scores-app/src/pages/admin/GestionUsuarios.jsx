import { useState, useEffect } from 'react'
import { AlertCircle, Check, Gavel, Pencil, Plus, Search, Shield, User, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { userService } from '../../services/userService'
import useAuthStore from '../../store/useAuthStore'
import useUIStore from '../../store/useUIStore'
import { confirm } from '../../utils/confirm'
import { formatDate } from '../../utils/formatDate'
import Button from '../../components/ui/Button'
import Avatar from '../../components/ui/Avatar'
import UserEditor from '../../components/admin/UserEditor'
import MemberPlayerFields from '../../components/admin/MemberPlayerFields'

export default function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState('activos')
  const [editor, setEditor] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editingUsuarioId, setEditingUsuarioId] = useState(null)
  const [usuarioDraft, setUsuarioDraft] = useState('')
  const [savingUsuario, setSavingUsuario] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [playerLink, setPlayerLink] = useState({ modo: 'ninguno', deporte: 'tenis' })
  const { user: me } = useAuthStore()
  const { addToast } = useUIStore()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { rol: 'miembro' } })
  const creatingMember = watch('rol') === 'miembro'

  const fetchAll = () => {
    setLoading(true)
    userService
      .getAll({ estado: 'todos' })
      .then((r) => setUsuarios(r.data || []))
      .catch(() => addToast({ type: 'error', title: 'Error al cargar usuarios' }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const createUser = async (data) => {
    setCreateError(null)
    try {
      if (playerLink.modo === 'existente' && !playerLink.id) throw new Error('Selecciona el jugador que corresponde a esta cuenta')
      await userService.create({ ...data, usuario: data.usuario?.trim() || undefined, jugador: playerLink })
      addToast({ type: 'success', title: 'Usuario creado correctamente' })
      reset({ rol: 'miembro' })
      setPlayerLink({ modo: 'ninguno', deporte: 'tenis' })
      setShowCreate(false)
      fetchAll()
    } catch (err) {
      const msg = err.message || 'No se pudo crear el usuario'
      setCreateError(msg)
      addToast({ type: 'error', title: 'No se pudo crear', message: msg })
    }
  }

  const startEditUsuario = (usuario) => {
    setEditingUsuarioId(usuario.id)
    setUsuarioDraft(usuario.usuario || '')
  }

  const saveUsuario = async (usuario) => {
    setSavingUsuario(true)
    try {
      await userService.updateUsuario(usuario.id, usuarioDraft.trim())
      addToast({ type: 'success', title: 'Usuario de acceso actualizado' })
      setEditingUsuarioId(null)
      fetchAll()
    } catch (err) {
      addToast({ type: 'error', title: 'No se pudo guardar', message: err.message })
    } finally {
      setSavingUsuario(false)
    }
  }

  const changeRol = async (usuario, newRol) => {
    if (actionBusy) return
    if (usuario.id === me?.id) {
      addToast({ type: 'error', title: 'No puedes cambiarte el rol a ti mismo' })
      return
    }
    if (newRol === usuario.rol) return
    const descriptions = {
      admin: 'Tendrá acceso completo al panel de administración.',
      juez_director: 'Podrá supervisar todas las canchas, reasignar jueces, bajar partidos y sustituir participantes.',
      juez: 'Podrá crear y controlar los partidos que tenga asignados.',
      miembro: 'Solo tendrá acceso a las funciones generales para miembros.',
    }
    const ok = await confirm({
      title: 'Cambiar rol de usuario',
      message: `${usuario.nombre} ${usuario.apellido} pasará a tener el rol "${newRol === 'juez_director' ? 'Juez Director' : newRol}". ${descriptions[newRol]}`,
      confirmLabel: 'Confirmar cambio',
      danger: newRol === 'admin',
    })
    if (!ok) return
    setActionBusy(true)
    try {
      await userService.updateRole(usuario.id, newRol)
      addToast({ type: 'success', title: 'Rol actualizado' })
      fetchAll()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err.message })
    } finally {
      setActionBusy(false)
    }
  }

  const changeAccess = async (u, remove = false) => {
    if (actionBusy) return
    const ok = await confirm({
      title: remove ? 'Eliminar usuario definitivamente' : u.activo ? 'Desactivar usuario' : 'Reactivar usuario',
      message: remove
        ? `Se eliminará la cuenta de ${u.nombre} ${u.apellido}. Si tiene historial vinculado, la eliminación se bloqueará y te explicaremos el motivo. Puedes desactivarla sin perder sus registros.`
        : u.activo ? 'Esta cuenta no podrá acceder y sus sesiones se invalidarán. Los partidos, jugadores y el historial se conservan.' : 'Esta cuenta podrá volver a iniciar sesión con sus credenciales.',
      danger: remove || u.activo,
      requireText: remove ? `${u.nombre} ${u.apellido}` : undefined,
      confirmLabel: remove ? 'Eliminar cuenta' : u.activo ? 'Desactivar' : 'Reactivar',
    })
    if (!ok) return
    setActionBusy(true)
    try {
      if (remove) await userService.remove(u.id)
      else await userService.setActive(u.id, !u.activo)
      addToast({ type: 'success', title: remove ? 'Usuario eliminado' : 'Estado actualizado' })
      fetchAll()
    } catch (err) {
      if (!remove || !err.status) addToast({ type: 'error', title: 'No se pudo completar la operación', message: err.message || 'Comprueba tu conexión y reintenta.' })
    } finally { setActionBusy(false) }
  }

  const filtered = usuarios.filter((u) => (estado === 'todos' || Boolean(u.activo) === (estado === 'activos')) &&
    `${u.nombre} ${u.apellido} ${u.email} ${u.numero_documento} ${u.usuario || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  const admins = filtered.filter((u) => u.rol === 'admin').length
  const directores = filtered.filter((u) => u.rol === 'juez_director').length
  const jueces = filtered.filter((u) => u.rol === 'juez').length
  const miembros = filtered.filter((u) => u.rol === 'miembro').length

  return (
    <div className='space-y-5 animate-fade-up'>
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h1 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
            Usuarios / Miembros
          </h1>
          <p className='text-sm mt-0.5' style={{ color: 'var(--text-muted)' }}>
            {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} registrado
            {usuarios.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          type='button'
          size='sm'
          leftIcon={showCreate ? <X className='w-4 h-4' /> : <Plus className='w-4 h-4' />}
          onClick={() => {
            setCreateError(null)
            setShowCreate((current) => !current)
          }}
        >
          {showCreate ? 'Cancelar' : 'Nuevo usuario'}
        </Button>
      </div>

      {showCreate && (
        <form className='card p-4 space-y-4' onSubmit={handleSubmit(createUser)}>
          <div>
            <h2 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
              Crear acceso
            </h2>
            <p className='text-xs mt-1' style={{ color: 'var(--text-muted)' }}>
              Los administradores crean las cuentas; no hay registro público para miembros.
            </p>
          </div>

          {createError && (
            <div className='p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm flex items-start gap-2.5'>
              <AlertCircle className='w-4 h-4 mt-0.5 shrink-0' />
              <span>{createError}</span>
            </div>
          )}
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <label className='form-group'>
              <span className='form-label'>Nombres</span>
              <input
                className={`form-input ${errors.nombre ? 'error' : ''}`}
                {...register('nombre', { required: true, minLength: 2 })}
              />
            </label>
            <label className='form-group'>
              <span className='form-label'>Apellidos</span>
              <input
                className={`form-input ${errors.apellido ? 'error' : ''}`}
                {...register('apellido', { required: true, minLength: 2 })}
              />
            </label>
            <label className='form-group'>
              <span className='form-label'>Documento{creatingMember ? ' (opcional)' : ''}</span>
              <input
                inputMode='numeric'
                className={`form-input ${errors.numero_documento ? 'error' : ''}`}
                {...register('numero_documento', {
                  required: !creatingMember,
                  minLength: 5,
                  maxLength: 20,
                  pattern: /^\d+$/,
                })}
              />
            </label>
            <label className='form-group'>
              <span className='form-label'>Correo{creatingMember ? ' (opcional)' : ''}</span>
              <input
                type='email'
                className={`form-input ${errors.email ? 'error' : ''}`}
                {...register('email', { required: !creatingMember })}
              />
            </label>
            <label className='form-group'>
              <span className='form-label'>Celular (opcional)</span>
              <input type='tel' className='form-input' placeholder='3001234567' {...register('telefono', { maxLength: 20 })} />
            </label>
            <label className='form-group'>
              <span className='form-label'>{creatingMember ? 'Usuario de acceso' : 'Usuario de acceso (opcional)'}</span>
              <input
                autoComplete='off'
                placeholder='ej. juan.perez'
                className={`form-input ${errors.usuario ? 'error' : ''}`}
                {...register('usuario', {
                  required: creatingMember ? 'Asigna un usuario de acceso' : false,
                  minLength: { value: 3, message: 'Mínimo 3 caracteres' },
                  maxLength: { value: 50, message: 'Máximo 50 caracteres' },
                  pattern: {
                    value: /^[a-zA-Z0-9._-]+$/,
                    message: 'Solo letras, números, punto, guion y guion bajo',
                  },
                })}
              />
              {errors.usuario && <span className='form-error'>{errors.usuario.message}</span>}
              <span className='text-[11px]' style={{ color: 'var(--text-muted)' }}>
                Debe ser único. La persona ingresará con este usuario y su contraseña; no necesita correo, cédula ni celular.
              </span>
            </label>
            <label className='form-group'>
              <span className='form-label'>Contraseña temporal</span>
              <input
                type='password'
                className={`form-input ${errors.password ? 'error' : ''}`}
                placeholder='8+ caracteres, mayúscula y número'
                {...register('password', {
                  required: true,
                  minLength: 8,
                  pattern: /^(?=.*[A-Z])(?=.*\d).+$/,
                })}
              />
            </label>
            <label className='form-group'>
              <span className='form-label'>Rol</span>
              <select className='form-input' {...register('rol')}>
                <option value='miembro'>Miembro</option>
                <option value='juez'>Juez de partido</option>
                <option value='juez_director'>Juez Director</option>
                <option value='admin'>Administrador</option>
              </select>
            </label>
          </div>
          <MemberPlayerFields value={playerLink} onChange={setPlayerLink} nombre={watch('nombre')} apellido={watch('apellido')} onSelectPlayer={(p) => { setValue('nombre', p.nombre, { shouldValidate: true }); setValue('apellido', p.apellido, { shouldValidate: true }) }} />
          <div className='flex justify-end'>
            <Button type='submit' loading={isSubmitting}>
              Crear usuario
            </Button>
          </div>
        </form>
      )}

      {/* Stats rápidas */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        <div className='card p-4 flex items-center gap-3'>
          <div
            className='w-10 h-10 rounded-lg flex items-center justify-center'
            style={{ backgroundColor: 'rgba(234,88,12,0.12)' }}
          >
            <Shield className='w-5 h-5' style={{ color: 'var(--color-brand)' }} />
          </div>
          <div>
            <p className='text-2xl font-black' style={{ color: 'var(--text-primary)' }}>
              {admins}
            </p>
            <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
              Administradores
            </p>
          </div>
        </div>
        <div className='card p-4 flex items-center gap-3'>
          <div
            className='w-10 h-10 rounded-lg flex items-center justify-center'
            style={{ backgroundColor: 'rgba(234,179,8,0.15)' }}
          >
            <Shield className='w-5 h-5 text-amber-500' />
          </div>
          <div>
            <p className='text-2xl font-black' style={{ color: 'var(--text-primary)' }}>
              {directores}
            </p>
            <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
              Directores
            </p>
          </div>
        </div>
        <div className='card p-4 flex items-center gap-3'>
          <div
            className='w-10 h-10 rounded-lg flex items-center justify-center'
            style={{ backgroundColor: 'rgba(23,107,58,0.12)' }}
          >
            <Gavel className='w-5 h-5' style={{ color: 'var(--color-brand)' }} />
          </div>
          <div>
            <p className='text-2xl font-black' style={{ color: 'var(--text-primary)' }}>
              {jueces}
            </p>
            <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
              Jueces
            </p>
          </div>
        </div>
        <div className='card p-4 flex items-center gap-3'>
          <div
            className='w-10 h-10 rounded-lg flex items-center justify-center'
            style={{ backgroundColor: 'rgba(59,130,246,0.12)' }}
          >
            <User className='w-5 h-5' style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <p className='text-2xl font-black' style={{ color: 'var(--text-primary)' }}>
              {miembros}
            </p>
            <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
              Miembros
            </p>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className='relative'>
        <Search
          className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none'
          style={{ color: 'var(--text-muted)' }}
        />
        <input
          className='form-input pl-10'
          placeholder='Buscar por nombre, email o documento...'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Lista */}
      <label className='flex items-center gap-3 text-sm'>Estado de las cuentas
        <select className='form-input w-auto' value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value='activos'>Activas</option><option value='inactivos'>Inactivas</option><option value='todos'>Todas</option>
        </select>
      </label>
      <div className='card overflow-hidden'>
        {loading ? (
          Array(4)
            .fill(0)
            .map((_, i) => <div key={i} className='skeleton h-16 m-3 rounded-lg' />)
        ) : filtered.length === 0 ? (
          <p className='text-center py-12 text-sm' style={{ color: 'var(--text-muted)' }}>
            No se encontraron usuarios
          </p>
        ) : (
          filtered.map((u, i) => (
            <div
              key={u.id}
              className='flex flex-wrap items-center gap-3 px-4 py-3'
              style={{
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border-color)' : 'none',
              }}
            >
              {/* Avatar */}
              <Avatar
                src={u.avatar}
                name={`${u.nombre || ''} ${u.apellido || ''}`}
                size='sm'
                className={u.id === me?.id ? 'ring-2 ring-[var(--color-brand)]' : ''}
              />

              {/* Info */}
              <div className='flex-1 min-w-0 basis-40'>
                <div className='flex items-center gap-2'>
                  <p
                    className='text-sm font-semibold truncate'
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {u.nombre} {u.apellido}
                    {u.id === me?.id && (
                      <span
                        className='ml-2 text-xs font-normal'
                        style={{ color: 'var(--text-muted)' }}
                      >
                        (tú)
                      </span>
                    )}
                  </p>
                </div>
                <p className='text-xs truncate' style={{ color: 'var(--text-muted)' }}>
                  {u.numero_documento ? `CC: ${u.numero_documento}` : 'Sin cédula'} · {u.email || 'Sin correo'}
                </p>
                <p className='text-xs' style={{ color: 'var(--text-muted)' }}>Celular: {u.telefono || 'Sin registrar'}</p>
                {u.rol === 'miembro' && !u.usuario && <p className='text-xs text-amber-600'>Asigna un usuario en «Editar datos» para habilitar ese acceso.</p>}
                {['miembro', 'juez', 'juez_director', 'admin'].includes(u.rol) &&
                  (editingUsuarioId === u.id ? (
                    <div className='flex items-center gap-1 mt-0.5'>
                      <input
                        value={usuarioDraft}
                        onChange={(e) => setUsuarioDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveUsuario(u)}
                        placeholder='usuario de acceso'
                        autoFocus
                        className='form-input py-1 text-xs'
                      />
                      <button
                        type='button'
                        onClick={() => saveUsuario(u)}
                        disabled={savingUsuario}
                        className='p-1'
                        aria-label='Guardar usuario'
                      >
                        <Check className='w-3.5 h-3.5' style={{ color: 'var(--color-brand)' }} />
                      </button>
                      <button
                        type='button'
                        onClick={() => setEditingUsuarioId(null)}
                        className='p-1'
                        aria-label='Cancelar'
                      >
                        <X className='w-3.5 h-3.5' style={{ color: 'var(--text-muted)' }} />
                      </button>
                    </div>
                  ) : (
                    <p
                      className='text-[11px] flex items-center gap-1 mt-0.5'
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Usuario: {u.usuario || <span className='italic'>sin definir</span>}
                      <button
                        type='button'
                        onClick={() => startEditUsuario(u)}
                        className='p-0.5 opacity-60 hover:opacity-100'
                        aria-label='Editar usuario de acceso'
                      >
                        <Pencil className='w-3 h-3' />
                      </button>
                    </p>
                  ))}
                <p className='text-[10px]' style={{ color: 'var(--text-muted)' }}>
                  {u.activo ? 'Cuenta activa · ' : 'Cuenta inactiva · '}
                  Registrado {formatDate(u.created_at)}
                </p>
                {u.jugador && (
                  <p className='text-[10px] font-medium' style={{ color: 'var(--color-brand)' }}>
                    Jugador: {u.jugador.nombre} {u.jugador.apellido}
                  </p>
                )}
              </div>

              {/* Rol */}
              <div className='flex items-center gap-2 shrink-0'>
                <select
                  value={u.rol}
                  onChange={(event) => changeRol(u, event.target.value)}
                  disabled={u.id === me?.id || actionBusy}
                  aria-label={`Rol de ${u.nombre} ${u.apellido}`}
                  className='form-input py-1.5 text-xs w-32 disabled:opacity-50'
                  title={
                    u.id === me?.id
                      ? 'No puedes cambiarte el rol'
                      : 'Cambiar rol'
                  }
                >
                  <option value='miembro'>Miembro</option>
                  <option value='juez'>Juez</option>
                  <option value='juez_director'>Juez Director</option>
                  <option value='admin'>Admin</option>
                </select>
              </div>
              <div className='w-full flex flex-wrap gap-2 pt-2' aria-label={`Acciones de ${u.nombre} ${u.apellido}`}>
                <Button size='sm' variant='secondary' disabled={actionBusy} onClick={() => setEditor({ user: u, mode: 'edit' })}>Editar datos</Button>
                <Button size='sm' variant='secondary' disabled={actionBusy} onClick={() => setEditor({ user: u, mode: 'password' })}>Restablecer contraseña</Button>
                <Button size='sm' variant='secondary' disabled={actionBusy} onClick={() => setEditor({ user: u, mode: 'photo' })}>Foto de perfil</Button>
                <Button size='sm' variant='secondary' disabled={actionBusy || u.id === me?.id} onClick={() => changeAccess(u)}>{u.activo ? 'Desactivar' : 'Reactivar'}</Button>
                <Button size='sm' variant='danger' disabled={actionBusy || u.id === me?.id} onClick={() => changeAccess(u, true)}>Eliminar</Button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className='text-xs text-center' style={{ color: 'var(--text-muted)' }}>
        Desactivar conserva el historial. Eliminar es definitivo y solo se permite sin registros vinculados. Restablecer una contraseña cierra las sesiones de esa cuenta.
      </p>
      {editor && <UserEditor {...editor} onClose={() => setEditor(null)} onSaved={() => { addToast({ type: 'success', title: 'Cambios guardados' }); fetchAll() }} />}
    </div>
  )
}
