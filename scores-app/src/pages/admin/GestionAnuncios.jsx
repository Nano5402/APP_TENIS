import { useState, useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  Megaphone,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Upload,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { newsService } from '../../services/newsService'
import useUIStore from '../../store/useUIStore'
import { confirm } from '../../utils/confirm'
import { getMediaUrl } from '../../utils/getMediaUrl'
import { formatRelative, formatDate } from '../../utils/formatDate'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import Modal from '../../components/ui/Modal'
import EmptyState from '../../components/common/EmptyState'

const TIPOS = [
  { value: 'noticia', label: 'Noticia' },
  { value: 'evento', label: 'Evento' },
  { value: 'resultado', label: 'Resultado' },
  { value: 'aviso', label: 'Aviso oficial' },
]

const TIPO_BADGE = {
  noticia: 'badge-atp',
  evento: 'badge-padel',
  resultado: 'badge-brand',
  aviso: 'badge-live',
}

const FILTER_TABS = [
  { value: 'todos', label: 'Todos' },
  { value: 'noticia', label: 'Noticias' },
  { value: 'evento', label: 'Eventos' },
  { value: 'resultado', label: 'Resultados' },
  { value: 'aviso', label: 'Avisos' },
]

const STATUS_TABS = [
  { value: 'todos', label: 'Todos' },
  { value: 'publicado', label: 'Publicados' },
  { value: 'borrador', label: 'Borradores' },
]

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

export default function GestionAnuncios() {
  const [anuncios, setAnuncios] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [removeExistingImage, setRemoveExistingImage] = useState(false)
  const [filterTab, setFilterTab] = useState('todos')
  const [statusTab, setStatusTab] = useState('todos')
  const [searchQuery, setSearchQuery] = useState('')
  const [imageError, setImageError] = useState('')
  const fileInputRef = useRef(null)
  const publishing = useRef(new Set())

  const { addToast } = useUIStore()

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      titulo: '',
      contenido: '',
      tipo: 'noticia',
      publicado: true,
    },
  })

  const fetchAll = () => {
    setLoading(true)
    newsService
      .getAll({ all: 'true' })
      .then((r) => setAnuncios(Array.isArray(r.data) ? r.data : []))
      .catch(() => addToast({ type: 'error', title: 'Error al cargar anuncios' }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAll()
  }, [])

  // Limpiar previews cuando se desmonte o cambie el modal
  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview)
      }
    }
  }, [imagePreview])

  const openCreate = () => {
    setImageFile(null)
    setImagePreview(null)
    setRemoveExistingImage(false)
    setImageError('')
    reset({
      titulo: '',
      contenido: '',
      tipo: 'noticia',
      publicado: true,
    })
    setEditing(null)
    setShowModal(true)
  }

  const openEdit = (anuncio) => {
    setImageFile(null)
    setImagePreview(null)
    setRemoveExistingImage(false)
    setImageError('')
    setEditing(anuncio)
    reset({
      titulo: anuncio.titulo || '',
      contenido: anuncio.contenido || '',
      tipo: anuncio.tipo || 'noticia',
      publicado: Boolean(anuncio.publicado),
    })
    setShowModal(true)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    setImageError('')
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageError('Solo se admiten imágenes en formato JPG, PNG o WebP.')
      return
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setImageError('La imagen excede el tamaño máximo permitido de 2 MB.')
      return
    }

    setImageFile(file)
    setRemoveExistingImage(false)
    if (imagePreview && imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview)
    }
    setImagePreview(URL.createObjectURL(file))
  }

  const handleClearSelectedImage = () => {
    setImageFile(null)
    if (imagePreview && imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview)
    }
    setImagePreview(null)
    setImageError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleToggleRemoveExisting = () => {
    setRemoveExistingImage((prev) => !prev)
    if (imageFile) handleClearSelectedImage()
  }

  const handleTogglePublicado = async (anuncio) => {
    if (publishing.current.has(anuncio.id)) return
    publishing.current.add(anuncio.id)
    try {
      await newsService.togglePublicado(anuncio.id, !anuncio.publicado)
      const nuevoEstado = !anuncio.publicado
      addToast({
        type: 'success',
        title: nuevoEstado ? 'Anuncio publicado' : 'Anuncio pasado a borrador',
      })
      setAnuncios((prev) =>
        prev.map((a) => (a.id === anuncio.id ? { ...a, publicado: nuevoEstado ? 1 : 0 } : a))
      )
    } catch (err) {
      addToast({ type: 'error', title: 'Error al cambiar visibilidad', message: err.message })
    } finally {
      publishing.current.delete(anuncio.id)
    }
  }

  const onSubmit = async (data) => {
    if (imageError) return

    try {
      const payload = new FormData()
      payload.append('titulo', data.titulo.trim())
      payload.append('contenido', data.contenido.trim())
      payload.append('tipo', data.tipo)
      payload.append('publicado', data.publicado ? 'true' : 'false')

      if (imageFile) {
        payload.append('imagen', imageFile)
      }
      if (removeExistingImage) {
        payload.append('remove_image', 'true')
      }

      if (editing) {
        await newsService.update(editing.id, payload)
        addToast({ type: 'success', title: 'Anuncio actualizado con éxito' })
      } else {
        await newsService.create(payload)
        addToast({ type: 'success', title: 'Anuncio creado con éxito' })
      }

      setShowModal(false)
      fetchAll()
    } catch (err) {
      console.error('Error al guardar anuncio:', err)
      addToast({
        type: 'error',
        title: 'No se pudo guardar el anuncio',
        message: err.message || 'Verifica los campos ingresados e intenta nuevamente.',
      })
    }
  }

  const handleDelete = async (anuncio) => {
    const ok = await confirm({
      title: 'Eliminar anuncio',
      message: `Esta acción eliminará permanentemente "${anuncio.titulo}". Esta operación no se puede deshacer.`,
      confirmLabel: 'Eliminar permanentemente',
      danger: true,
    })
    if (!ok) return

    try {
      await newsService.remove(anuncio.id)
      addToast({ type: 'success', title: 'Anuncio eliminado correctamente' })
      setAnuncios((prev) => prev.filter((a) => a.id !== anuncio.id))
    } catch (err) {
      addToast({ type: 'error', title: 'Error al eliminar', message: err.message })
    }
  }

  // Filtrado compuesto
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return anuncios.filter((a) => {
      // Filtro tipo
      if (filterTab !== 'todos' && a.tipo !== filterTab) return false
      // Filtro estado
      if (statusTab === 'publicado' && !a.publicado) return false
      if (statusTab === 'borrador' && Boolean(a.publicado)) return false
      // Búsqueda
      if (!q) return true
      return `${a.titulo} ${a.contenido} ${a.autor_nombre || ''}`.toLowerCase().includes(q)
    })
  }, [anuncios, filterTab, statusTab, searchQuery])

  return (
    <div className='space-y-6 animate-fade-up'>
      {/* Cabecera Administrativa */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5 border-[var(--border-color)]'>
        <div className='flex items-center gap-3'>
          <div
            className='w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm'
            style={{
              backgroundColor: 'var(--color-brand-dim)',
              color: 'var(--color-brand)',
            }}
          >
            <Megaphone className='w-5 h-5' />
          </div>
          <div>
            <h1 className='text-xl sm:text-2xl font-bold' style={{ color: 'var(--text-primary)' }}>
              Gestión de Anuncios
            </h1>
            <p className='text-xs mt-0.5' style={{ color: 'var(--text-muted)' }}>
              {anuncios.length} publicación{anuncios.length !== 1 ? 'es' : ''} registrada{anuncios.length !== 1 ? 's' : ''} en total
            </p>
          </div>
        </div>
        <Button onClick={openCreate} leftIcon={<Plus className='w-4 h-4' />}>
          Nuevo anuncio
        </Button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className='space-y-3'>
        <div className='flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3'>
          <Tabs tabs={FILTER_TABS} activeTab={filterTab} onChange={setFilterTab} />

          <div className='relative md:w-64 shrink-0'>
            <Search className='w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none' />
            <input
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Buscar por título o texto...'
              className='form-input pl-9 pr-8 py-2 text-xs w-full rounded-xl bg-[var(--bg-card)]'
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className='absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5'
              >
                <X className='w-3.5 h-3.5' />
              </button>
            )}
          </div>
        </div>

        {/* Subfiltro de estado (Publicados vs Borradores) */}
        <div className='flex items-center gap-2 pt-1'>
          <span className='text-xs font-semibold text-[var(--text-muted)] mr-1'>Estado:</span>
          {STATUS_TABS.map((st) => (
            <button
              key={st.value}
              onClick={() => setStatusTab(st.value)}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                statusTab === st.value
                  ? 'bg-[var(--color-brand)] text-white dark:text-[#123c2a] font-bold shadow-sm'
                  : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Publicaciones */}
      <div className='space-y-3'>
        {loading ? (
          Array(3)
            .fill(0)
            .map((_, i) => (
              <div key={i} className='card p-4 flex gap-4 animate-pulse'>
                <div className='skeleton w-24 h-24 rounded-xl shrink-0' />
                <div className='flex-1 space-y-2.5'>
                  <div className='skeleton h-4 w-1/4 rounded' />
                  <div className='skeleton h-5 w-3/4 rounded' />
                  <div className='skeleton h-4 w-full rounded' />
                </div>
              </div>
            ))
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title='No hay anuncios con estos filtros'
            description={
              searchQuery || filterTab !== 'todos' || statusTab !== 'todos'
                ? 'Intenta restablecer los filtros para ver todos los anuncios.'
                : 'Aún no se ha publicado ningún aviso en el club.'
            }
            action={
              (searchQuery || filterTab !== 'todos' || statusTab !== 'todos') && (
                <Button
                  variant='secondary'
                  size='sm'
                  onClick={() => {
                    setFilterTab('todos')
                    setStatusTab('todos')
                    setSearchQuery('')
                  }}
                >
                  Restablecer filtros
                </Button>
              )
            }
          />
        ) : (
          filtered.map((a) => {
            const isPublicado = Boolean(a.publicado)
            const mediaUrl = a.imagen_url ? getMediaUrl(a.imagen_url) : null

            return (
              <div
                key={a.id}
                className='card p-4 transition-all border border-[var(--border-color)] hover:border-[var(--border-hover)]'
              >
                <div className='flex flex-col sm:flex-row items-start sm:items-center gap-4'>
                  {/* Thumbnail de Imagen */}
                  {mediaUrl ? (
                    <div className='w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-black/30 shrink-0 border border-[var(--border-color)] relative group'>
                      <img
                        src={mediaUrl}
                        alt={a.titulo}
                        className='w-full h-full object-cover'
                      />
                    </div>
                  ) : (
                    <div className='w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-[var(--bg-hover)] border border-[var(--border-color)] flex flex-col items-center justify-center text-[var(--text-muted)] shrink-0'>
                      <ImageIcon className='w-6 h-6 opacity-40' />
                      <span className='text-[10px] mt-1'>Sin afiche</span>
                    </div>
                  )}

                  {/* Información Principal */}
                  <div className='flex-1 min-w-0 space-y-1.5'>
                    <div className='flex items-center gap-2 flex-wrap'>
                      <span className={TIPO_BADGE[a.tipo] || 'badge'}>
                        {TIPOS.find((t) => t.value === a.tipo)?.label || a.tipo}
                      </span>

                      {/* Badge de Publicación */}
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
                          isPublicado
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {isPublicado ? (
                          <>
                            <CheckCircle2 className='w-3 h-3' />
                            <span>Publicado</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className='w-3 h-3' />
                            <span>Borrador (Oculto)</span>
                          </>
                        )}
                      </span>

                      <span className='text-xs text-[var(--text-muted)]'>
                        {formatRelative(a.created_at)}
                      </span>
                    </div>

                    <h3 className='text-sm sm:text-base font-bold text-[var(--text-primary)] leading-snug'>
                      {a.titulo}
                    </h3>

                    <p className='text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed'>
                      {a.contenido}
                    </p>

                    {a.autor_nombre && (
                      <p className='text-[11px] text-[var(--text-muted)]'>
                        Por: <span className='text-[var(--text-secondary)] font-medium'>{a.autor_nombre}</span>
                      </p>
                    )}
                  </div>

                  {/* Acciones Rápidas */}
                  <div className='flex items-center gap-1 self-end sm:self-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto justify-end border-[var(--border-color)]'>
                    {/* Toggle Publicar / Ocultar */}
                    <button
                      onClick={() => handleTogglePublicado(a)}
                      title={isPublicado ? 'Cambiar a borrador (ocultar de la app)' : 'Publicar anuncio ahora'}
                      className={`btn-ghost p-2 rounded-xl text-xs flex items-center gap-1.5 font-medium transition-colors ${
                        isPublicado
                          ? 'text-[var(--text-muted)] hover:text-amber-500'
                          : 'text-amber-500 hover:text-emerald-500'
                      }`}
                    >
                      {isPublicado ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
                      <span className='hidden lg:inline'>
                        {isPublicado ? 'Ocultar' : 'Publicar'}
                      </span>
                    </button>

                    {/* Editar */}
                    <button
                      onClick={() => openEdit(a)}
                      title='Editar publicación'
                      className='btn-ghost p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    >
                      <Pencil className='w-4 h-4' />
                    </button>

                    {/* Eliminar */}
                    <button
                      onClick={() => handleDelete(a)}
                      title='Eliminar publicación'
                      className='btn-ghost p-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10'
                    >
                      <Trash2 className='w-4 h-4' />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modal de Crear / Editar Anuncio */}
      {showModal && (
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editing ? 'Editar anuncio' : 'Nuevo anuncio oficial'}
          subtitle={
            editing
              ? 'Modifica los datos, estado o afiche de la publicación'
              : 'Publica información relevante, torneos o comunicados para el club'
          }
          icon={Megaphone}
          maxWidth='max-w-xl'
          onSubmit={handleSubmit(onSubmit)}
          footer={
            <div className='flex items-center justify-end gap-3 w-full'>
              <Button
                type='button'
                variant='secondary'
                onClick={() => setShowModal(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type='submit' loading={isSubmitting}>
                {editing ? 'Guardar cambios' : 'Crear anuncio'}
              </Button>
            </div>
          }
        >
          <div className='space-y-4'>
            {/* Título y Tipo */}
            <div className='grid grid-cols-1 sm:grid-cols-3 gap-3.5'>
              <div className='sm:col-span-2 form-group'>
                <label className='form-label font-semibold text-xs'>Título de la publicación *</label>
                <input
                  className={`form-input ${errors.titulo ? 'error' : ''}`}
                  placeholder='Ej. Apertura del Torneo Máster 2026'
                  maxLength={255}
                  {...register('titulo', {
                    required: 'El título es obligatorio',
                    maxLength: { value: 255, message: 'Máximo 255 caracteres' },
                  })}
                />
                {errors.titulo && <p className='form-error text-xs mt-1'>{errors.titulo.message}</p>}
              </div>

              <div className='form-group'>
                <label className='form-label font-semibold text-xs'>Tipo de aviso</label>
                <select className='form-input' {...register('tipo')}>
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Contenido / Descripción */}
            <div className='form-group'>
              <div className='flex items-center justify-between mb-1'>
                <label className='form-label font-semibold text-xs'>Contenido completo *</label>
                <span className='text-[11px] text-[var(--text-muted)]'>
                  {watch('contenido')?.length || 0} / 15.000
                </span>
              </div>
              <textarea
                className={`form-input resize-y min-h-[120px] ${errors.contenido ? 'error' : ''}`}
                rows={5}
                placeholder='Escribe el detalle del anuncio, fechas, horarios, condiciones o indicaciones...'
                maxLength={15000}
                {...register('contenido', {
                  required: 'El contenido es obligatorio',
                  maxLength: { value: 15000, message: 'Máximo 15000 caracteres' },
                })}
              />
              {errors.contenido && (
                <p className='form-error text-xs mt-1'>{errors.contenido.message}</p>
              )}
            </div>

            {/* Sección de Imagen / Afiche */}
            <div className='p-4 rounded-xl bg-[var(--bg-hover)] border border-[var(--border-color)] space-y-3'>
              <div className='flex items-center justify-between'>
                <label className='text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5'>
                  <ImageIcon className='w-4 h-4 text-[var(--color-brand)]' />
                  <span>Afiche o imagen opcional</span>
                </label>
                <span className='text-[11px] text-[var(--text-muted)]'>Máximo 2 MB · JPG, PNG, WebP</span>
              </div>

              {/* Si ya tiene imagen previa en modo edición */}
              {editing?.imagen_url && !removeExistingImage && !imageFile && (
                <div className='flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]'>
                  <div className='flex items-center gap-3 min-w-0'>
                    <img
                      src={getMediaUrl(editing.imagen_url)}
                      alt='Actual'
                      className='w-12 h-12 object-cover rounded-lg shrink-0'
                    />
                    <div className='min-w-0'>
                      <p className='text-xs font-semibold text-[var(--text-primary)] truncate'>
                        Afiche actual guardado
                      </p>
                      <p className='text-[10px] text-[var(--text-muted)]'>Se mantendrá a menos que lo cambies</p>
                    </div>
                  </div>
                  <button
                    type='button'
                    onClick={handleToggleRemoveExisting}
                    className='text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded hover:bg-rose-500/10 transition-colors'
                  >
                    Eliminar afiche
                  </button>
                </div>
              )}

              {/* Si el usuario marcó para eliminar la imagen actual */}
              {removeExistingImage && (
                <div className='p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-xs text-rose-300'>
                  <span>Se eliminará el afiche actual al guardar.</span>
                  <button
                    type='button'
                    onClick={handleToggleRemoveExisting}
                    className='underline hover:text-white font-medium'
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Preview de la nueva imagen seleccionada */}
              {imagePreview && (
                <div className='relative rounded-xl overflow-hidden bg-black/40 border border-[var(--border-color)] max-h-48 flex items-center justify-center p-2'>
                  <img
                    src={imagePreview}
                    alt='Previsualización'
                    className='max-h-44 object-contain rounded-lg'
                  />
                  <button
                    type='button'
                    onClick={handleClearSelectedImage}
                    className='absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-rose-600 transition-colors'
                    title='Descartar imagen seleccionada'
                  >
                    <X className='w-4 h-4' />
                  </button>
                </div>
              )}

              {/* Input para seleccionar archivo */}
              {!imagePreview && (
                <div>
                  <input
                    ref={fileInputRef}
                    type='file'
                    id='anuncio-file-input'
                    accept='image/jpeg,image/png,image/webp'
                    className='hidden'
                    onChange={handleFileChange}
                  />
                  <label
                    htmlFor='anuncio-file-input'
                    className='border-2 border-dashed border-[var(--border-color)] hover:border-[var(--color-brand)]/50 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:bg-[var(--bg-card)] transition-all'
                  >
                    <Upload className='w-5 h-5 text-[var(--color-brand)]' />
                    <span className='text-xs font-semibold text-[var(--text-primary)]'>
                      {editing?.imagen_url && !removeExistingImage ? 'Reemplazar afiche' : 'Subir afiche o imagen'}
                    </span>
                    <span className='text-[10px] text-[var(--text-muted)]'>
                      Haz clic para seleccionar desde tu dispositivo
                    </span>
                  </label>
                </div>
              )}

              {imageError && (
                <p className='text-xs text-rose-400 flex items-center gap-1.5'>
                  <AlertCircle className='w-3.5 h-3.5 shrink-0' />
                  <span>{imageError}</span>
                </p>
              )}
            </div>

            {/* Estado de Publicación */}
            <div className='p-3.5 rounded-xl bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-between'>
              <div>
                <p className='text-xs font-semibold text-[var(--text-primary)]'>Estado de visibilidad</p>
                <p className='text-[11px] text-[var(--text-muted)]'>
                  {watch('publicado')
                    ? 'Visible inmediatamente para todos los socios en la app y el inicio.'
                    : 'Guardado como borrador (solo administradores pueden verlo).'}
                </p>
              </div>
              <label className='relative inline-flex items-center cursor-pointer'>
                <input
                  type='checkbox'
                  className='sr-only peer'
                  {...register('publicado')}
                />
                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-brand)]"></div>
              </label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
