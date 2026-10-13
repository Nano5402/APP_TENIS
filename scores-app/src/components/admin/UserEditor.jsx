import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { userService } from '../../services/userService'
import useAuthStore from '../../store/useAuthStore'
import Button from '../ui/Button'
import Avatar from '../ui/Avatar'
import { Link } from 'react-router-dom'
import LinkPlayer from './LinkPlayer'

export default function UserEditor({ user, mode, onClose, onSaved }) {
  const [draft, setDraft] = useState(user)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [file, setFile] = useState(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useDialogFocus(true, onClose, busy)
  const reset = mode === 'password'
  const photo = mode === 'photo'
  const member = user.rol === 'miembro'
  const save = async (event) => {
    event.preventDefault()
    if (busy) return
    if (reset && password !== repeat) { setError('Las contraseñas no coinciden'); return }
    setBusy(true); setError('')
    try {
      if (photo) {
        if (!file && !removePhoto) { setError('Selecciona una foto o elige quitar la actual'); return }
        const result = removePhoto ? await userService.adminDeleteAvatar(user.id) : await userService.adminUploadAvatar(user.id, file)
        if (Number(useAuthStore.getState().user?.id) === Number(user.id)) useAuthStore.getState().updateUser({ avatar: result.data?.avatar || null })
      }
      else if (reset) await userService.resetPassword(user.id, password)
      else {
        await userService.update(user.id, draft)
        if (Number(useAuthStore.getState().user?.id) === Number(user.id)) {
          useAuthStore.getState().updateUser(draft)
        }
      }
      onSaved(); onClose()
    } catch (err) { setError(err.message || 'No se pudo guardar. Reintenta.') }
    finally { setBusy(false) }
  }
  const fields = [
    ['nombre', 'Nombres', 'text', 2, 100], ['apellido', 'Apellidos', 'text', 2, 100],
    ['numero_documento', 'Documento', 'text', 5, 20], ['email', 'Correo electrónico', 'email', 3, 150],
    ['telefono', member ? 'Celular (opcional)' : 'Teléfono (opcional)', 'tel', 0, 20], ['usuario', member ? 'Usuario de acceso' : 'Usuario de acceso (opcional)', 'text', 3, 50],
  ]
  return createPortal(
    <div className='fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-3'>
      <section ref={ref} tabIndex={-1} role='dialog' aria-modal='true' aria-labelledby='user-editor-title' className='card w-full max-w-xl max-h-[90dvh] overflow-y-auto p-5'>
        <h2 id='user-editor-title' className='text-lg font-bold'>{photo ? 'Foto de perfil' : reset ? 'Restablecer contraseña' : 'Editar datos del usuario'}</h2>
        <p className='text-sm mt-1 mb-4' style={{ color: 'var(--text-muted)' }}>{user.nombre} {user.apellido}</p>
        <form onSubmit={save} className='space-y-4'>
          {error && <p role='alert' className='rounded-lg p-3 bg-red-500/10 text-red-500 text-sm'>{error}</p>}
          {photo ? <div className='space-y-3'>
            <Avatar src={user.avatar || user.jugador?.foto} name={`${user.nombre} ${user.apellido}`} size='lg' />
            <label className='form-group'><span className='form-label'>Seleccionar foto (JPG, PNG o WebP)</span><input type='file' accept='image/jpeg,image/png,image/webp' onChange={(e) => { setFile(e.target.files?.[0] || null); setRemovePhoto(false) }} /></label>
            {(user.avatar || user.jugador?.foto) && <label className='flex items-center gap-2 text-sm'><input type='checkbox' checked={removePhoto} onChange={(e) => { setRemovePhoto(e.target.checked); setFile(null) }} />Quitar foto actual</label>}
          </div> : reset ? <>
            <p className='text-sm'>Se cerrarán las sesiones actuales de esta cuenta. Comunica la nueva contraseña a su titular por un medio seguro.</p>
            <label className='form-group'><span className='form-label'>Nueva contraseña</span><input className='form-input' type='password' autoComplete='new-password' minLength={8} maxLength={72} pattern='(?=.*[A-Z])(?=.*[0-9]).+' required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <p className='text-xs' style={{ color: 'var(--text-muted)' }}>Mínimo 8 caracteres, una mayúscula y un número.</p>
            <label className='form-group'><span className='form-label'>Repetir contraseña</span><input className='form-input' type='password' autoComplete='new-password' required value={repeat} onChange={(e) => setRepeat(e.target.value)} /></label>
          </> : <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            {fields.map(([key, label, type, min, max]) => <label className='form-group' key={key}>
              <span className='form-label'>{label}{member && ['email', 'numero_documento'].includes(key) ? ' (opcional)' : ''}</span>
              <input className='form-input' type={type} minLength={min} maxLength={max} required={key === 'telefono' ? false : key === 'usuario' ? member && !draft.numero_documento && !draft.telefono : ![...(member ? ['email', 'numero_documento'] : [])].includes(key)} value={draft[key] || ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
            </label>)}
          </div>}
          <div className='flex justify-end gap-3'><Button type='button' variant='secondary' disabled={busy} onClick={onClose}>Cancelar</Button><Button type='submit' loading={busy}>Guardar cambios</Button></div>
        </form>
        {!photo && !reset && !busy && <LinkPlayer user={user} onSaved={() => { onSaved(); onClose() }} />}
        {!busy && <Link className='block mt-4 text-sm underline' to='/admin/partidos'>Administrar partidos (todos)</Link>}
      </section>
    </div>, document.body
  )
}
