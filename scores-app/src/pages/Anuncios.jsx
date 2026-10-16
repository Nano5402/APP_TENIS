import { useEffect, useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Megaphone,
  Search,
  X,
  Calendar,
  User,
  ExternalLink,
  Share2,
  Maximize2,
  ShieldCheck,
  Check,
  Sparkles,
} from 'lucide-react'
import { newsService } from '../services/newsService'
import { getMediaUrl } from '../utils/getMediaUrl'
import { formatDate, formatRelative } from '../utils/formatDate'
import useAuthStore from '../store/useAuthStore'
import useUIStore from '../store/useUIStore'
import { useLoginRequired } from '../hooks/useLoginRequired'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/common/EmptyState'
import Tabs from '../components/ui/Tabs'
import Button from '../components/ui/Button'

const TIPOS_INFO = {
  noticia: { label: 'Noticia', badge: 'badge-atp' },
  evento: { label: 'Evento', badge: 'badge-padel' },
  resultado: { label: 'Resultado', badge: 'badge-brand' },
  aviso: { label: 'Aviso oficial', badge: 'badge-live' },
}

const TABS = [
  { value: 'todos', label: 'Todos' },
  { value: 'noticia', label: 'Noticias' },
  { value: 'evento', label: 'Eventos' },
  { value: 'resultado', label: 'Resultados' },
  { value: 'aviso', label: 'Avisos' },
]

export default function Anuncios() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('todos')
  const [query, setQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)
  const [copied, setCopied] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const { user, isAuthenticated } = useAuthStore()
  const { addToast } = useUIStore()
  const requireLogin = useLoginRequired()
  const isAdmin = user?.rol === 'admin'

  const loadAnnouncements = () => {
    setLoading(true)
    setError('')
    newsService
      .getAll()
      .then((res) => {
        const data = Array.isArray(res?.data) ? res.data : []
        setItems(data)

        // Si viene un id en la URL y está autenticado, seleccionarlo automáticamente
        const paramId = searchParams.get('id')
        if (paramId) {
          if (!isAuthenticated) {
            requireLogin('Para ver el afiche y el detalle de este aviso debes iniciar sesión con tu cuenta.')
            return
          }
          const found = data.find((item) => String(item.id) === String(paramId))
          if (found) setSelectedItem(found)
        }
      })
      .catch((err) => {
        console.error('Error al cargar anuncios:', err)
        setError('No fue posible cargar los avisos del club. Intenta nuevamente.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadAnnouncements()
  }, [isAuthenticated])

  // Filtrado reactivo por categoría y búsqueda de texto
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      const matchesTab = activeTab === 'todos' || item.tipo === activeTab
      if (!matchesTab) return false
      if (!q) return true
      const searchContent = `${item.titulo} ${item.contenido} ${item.tipo} ${item.autor_nombre || ''}`.toLowerCase()
      return searchContent.includes(q)
    })
  }, [items, activeTab, query])

  const handleOpenDetail = (item) => {
    if (!requireLogin('Para ver el afiche y el detalle completo de este aviso debes iniciar sesión con tu cuenta.')) {
      return
    }
    setSelectedItem(item)
    setSearchParams((prev) => {
      prev.set('id', item.id)
      return prev
    })
  }

  const handleCloseDetail = () => {
    setSelectedItem(null)
    setSearchParams((prev) => {
      prev.delete('id')
      return prev
    })
  }

  const handleShare = async (item) => {
    const shareUrl = `${window.location.origin}/anuncios?id=${item.id}`
    try {
      if (!navigator?.clipboard?.writeText) throw new Error('Portapapeles no disponible')
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      addToast({ type: 'success', title: 'Enlace copiado al portapapeles' })
      setTimeout(() => setCopied(false), 2500)
    } catch {
      addToast({ type: 'error', title: 'No se pudo copiar el enlace', message: 'Abre el aviso y copia su dirección desde el navegador.' })
    }
  }

  return (
    <div className='space-y-6 animate-fade-in'>
      {/* Cabecera Principal */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5 border-[var(--border-color)]'>
        <div className='flex items-center gap-3.5'>
          <div
            className='w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm'
            style={{
              backgroundColor: 'var(--color-brand-dim)',
              color: 'var(--color-brand)',
            }}
          >
            <Megaphone className='w-6 h-6' />
          </div>
          <div>
            <h1 className='text-2xl font-black tracking-tight' style={{ color: 'var(--text-primary)' }}>
              Avisos del Club
            </h1>
            <p className='text-xs sm:text-sm mt-0.5' style={{ color: 'var(--text-muted)' }}>
              Comunicaciones oficiales, torneos, eventos y noticias para socios y jugadores
            </p>
          </div>
        </div>

        {isAdmin && (
          <Link
            to='/admin/anuncios'
            className='btn-secondary text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 self-start sm:self-auto shrink-0 shadow-sm font-semibold'
          >
            <ShieldCheck className='w-4 h-4 text-emerald-500' />
            <span>Gestionar avisos</span>
          </Link>
        )}
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className='space-y-3.5'>
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3'>
          <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

          <div className='relative sm:w-64 shrink-0'>
            <Search className='w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none' />
            <input
              type='text'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Buscar avisos o noticias...'
              className='form-input pl-9 pr-8 py-2 text-xs w-full rounded-xl bg-[var(--bg-card)]'
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className='absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5'
              >
                <X className='w-3.5 h-3.5' />
              </button>
            )}
          </div>
        </div>

        {/* Resumen de resultados cuando hay filtros */}
        {(query || activeTab !== 'todos') && (
          <div className='flex items-center justify-between text-xs px-1 text-[var(--text-muted)]'>
            <span>
              Mostrando {filteredItems.length} resultado{filteredItems.length !== 1 ? 's' : ''}
              {query && ` para "${query}"`}
            </span>
            <button
              onClick={() => {
                setQuery('')
                setActiveTab('todos')
              }}
              className='underline hover:text-[var(--color-brand)] transition-colors'
            >
              Restablecer filtros
            </button>
          </div>
        )}
      </div>

      {/* Estados de Carga / Error / Vacío */}
      {loading ? (
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <div key={i} className='card p-5 space-y-3 animate-pulse'>
                <div className='skeleton h-48 rounded-xl w-full' />
                <div className='skeleton h-4 w-1/4 rounded' />
                <div className='skeleton h-6 w-3/4 rounded' />
                <div className='skeleton h-4 w-full rounded' />
                <div className='skeleton h-4 w-2/3 rounded' />
              </div>
            ))}
        </div>
      ) : error ? (
        <div className='card p-6 text-center space-y-3 max-w-md mx-auto'>
          <p className='text-sm text-rose-400'>{error}</p>
          <Button onClick={loadAnnouncements} variant='secondary' size='sm'>
            Reintentar
          </Button>
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={query || activeTab !== 'todos' ? 'No se encontraron avisos' : 'No hay publicaciones activas'}
          description={
            query || activeTab !== 'todos'
              ? 'Intenta con otros términos de búsqueda o cambia la categoría seleccionada.'
              : 'El club no tiene avisos o noticias vigentes en este momento. Vuelve pronto.'
          }
          action={
            (query || activeTab !== 'todos') && (
              <Button
                variant='secondary'
                size='sm'
                onClick={() => {
                  setQuery('')
                  setActiveTab('todos')
                }}
              >
                Ver todos los avisos
              </Button>
            )
          }
        />
      ) : (
        /* Cuadrícula de Avisos */
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5'>
          {filteredItems.map((item) => {
            const info = TIPOS_INFO[item.tipo] || TIPOS_INFO.noticia
            const mediaUrl = item.imagen_url ? getMediaUrl(item.imagen_url) : null

            return (
              <article
                key={item.id}
                onClick={() => handleOpenDetail(item)}
                className='card card-hover p-4 sm:p-5 flex flex-col justify-between group cursor-pointer transition-all duration-200 border border-[var(--border-color)] hover:border-[var(--color-brand)]/50'
              >
                <div className='space-y-3.5'>
                  {/* Imagen / Afiche */}
                  {mediaUrl && (
                    <div className='relative rounded-xl overflow-hidden bg-black/20 aspect-video flex items-center justify-center border border-[var(--border-color)]'>
                      <img
                        src={mediaUrl}
                        alt={item.titulo}
                        loading='lazy'
                        decoding='async'
                        className='w-full h-full object-cover transition-transform duration-300 group-hover:scale-105'
                      />
                      <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2.5'>
                        <span className='text-[11px] font-semibold text-white/90 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1.5'>
                          <Maximize2 className='w-3 h-3' />
                          <span>Ver afiche completo</span>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Metadatos superiores */}
                  <div className='flex items-center justify-between gap-2 flex-wrap'>
                    <span className={info.badge}>{info.label}</span>
                    <span className='text-xs text-[var(--text-muted)] font-medium'>
                      {formatRelative(item.created_at)}
                    </span>
                  </div>

                  {/* Título y Contenido */}
                  <div>
                    <h2 className='text-base sm:text-lg font-bold leading-snug group-hover:text-[var(--color-brand)] transition-colors line-clamp-2'>
                      {item.titulo}
                    </h2>
                    <p className='text-xs sm:text-sm text-[var(--text-secondary)] mt-2 line-clamp-3 leading-relaxed whitespace-pre-line'>
                      {item.contenido}
                    </p>
                  </div>
                </div>

                {/* Pie de tarjeta */}
                <div className='pt-4 mt-4 border-t border-[var(--border-color)] flex items-center justify-between text-xs text-[var(--text-muted)]'>
                  <div className='flex items-center gap-1.5 truncate'>
                    <User className='w-3.5 h-3.5 shrink-0' />
                    <span className='truncate'>{item.autor_nombre || 'Comité de Tenis'}</span>
                  </div>
                  <span className='text-[var(--color-brand)] font-semibold text-xs group-hover:underline'>
                    Leer completo →
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Modal Detallado de Lectura y Afiche */}
      {selectedItem && (
        <Modal
          isOpen={Boolean(selectedItem)}
          onClose={handleCloseDetail}
          title={selectedItem.titulo}
          subtitle={`${TIPOS_INFO[selectedItem.tipo]?.label || 'Aviso'} · ${formatDate(selectedItem.created_at)}`}
          icon={Megaphone}
          maxWidth='max-w-2xl'
          footer={
            <div className='flex items-center justify-between w-full'>
              <button
                type='button'
                onClick={() => handleShare(selectedItem)}
                className='btn-ghost text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5'
              >
                {copied ? <Check className='w-4 h-4 text-emerald-400' /> : <Share2 className='w-4 h-4' />}
                <span>{copied ? '¡Copiado!' : 'Compartir'}</span>
              </button>
              <div className='flex items-center gap-2'>
                {isAdmin && (
                  <Link
                    to='/admin/anuncios'
                    className='btn-secondary text-xs px-3 py-1.5 rounded-xl'
                  >
                    Editar en administración
                  </Link>
                )}
                <Button size='sm' onClick={handleCloseDetail}>
                  Cerrar
                </Button>
              </div>
            </div>
          }
        >
          <div className='space-y-4'>
            {/* Afiche / Imagen completa */}
            {selectedItem.imagen_url && (
              <div className='rounded-2xl overflow-hidden border border-[var(--border-color)] bg-black/40 text-center relative group'>
                <img
                  src={getMediaUrl(selectedItem.imagen_url)}
                  alt={selectedItem.titulo}
                  className='max-h-[60vh] w-auto mx-auto object-contain rounded-xl'
                />
                <div className='p-2 bg-black/50 backdrop-blur-sm border-t border-white/10 flex items-center justify-between text-xs text-zinc-300'>
                  <span>Afiche oficial del anuncio</span>
                  <a
                    href={getMediaUrl(selectedItem.imagen_url)}
                    target='_blank'
                    rel='noreferrer'
                    className='underline hover:text-white flex items-center gap-1 text-[11px]'
                  >
                    <span>Abrir tamaño original</span>
                    <ExternalLink className='w-3 h-3' />
                  </a>
                </div>
              </div>
            )}

            {/* Metadatos */}
            <div className='flex items-center justify-between gap-2 p-3 rounded-xl bg-[var(--bg-hover)] text-xs text-[var(--text-muted)]'>
              <div className='flex items-center gap-2'>
                <span className={TIPOS_INFO[selectedItem.tipo]?.badge || 'badge'}>
                  {TIPOS_INFO[selectedItem.tipo]?.label || selectedItem.tipo}
                </span>
                <span className='flex items-center gap-1'>
                  <Calendar className='w-3.5 h-3.5' />
                  {formatDate(selectedItem.created_at)}
                </span>
              </div>
              <div className='flex items-center gap-1 font-medium text-[var(--text-secondary)]'>
                <User className='w-3.5 h-3.5' />
                <span>{selectedItem.autor_nombre || 'Comité de Tenis'}</span>
              </div>
            </div>

            {/* Texto Completo */}
            <div className='p-1 text-sm sm:text-base leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-words font-normal'>
              {selectedItem.contenido}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
