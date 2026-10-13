import BulkDelete from '../../components/ui/BulkDelete'
import { useEffect, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import {
  ArrowRight,
  CalendarDays,
  Network,
  Pencil,
  Plus,
  Trash2,
  Trophy,
  UsersRound,
  X,
  Search,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { tournamentService } from '../../services/tournamentService'
import { confirm } from '../../utils/confirm'
import useUIStore from '../../store/useUIStore'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'
import { formatDate } from '../../utils/formatDate'

const ESTADOS = [
  { value: 'proximo', label: 'Próximo' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'cancelado', label: 'Cancelado' },
]
const STATUS_TABS = [
  { value: 'todos', label: 'Todos' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'proximo', label: 'Próximos' },
  { value: 'finalizado', label: 'Finalizados' },
]
const ESTADO_BADGE = {
  proximo: 'badge-brand',
  en_curso: 'badge-live',
  finalizado: 'badge-atp',
  cancelado: 'badge',
}
const SISTEMAS = [
  {
    value: 'por_definir',
    label: 'Por definir',
    description:
      'Puedes crear y programar el torneo ahora, y elegir el sistema cuando esté confirmado.',
  },
  {
    value: 'eliminacion_directa',
    label: 'Eliminación directa',
    description: 'Quien pierde sale; ideal para un cuadro rápido y fácil de seguir.',
  },
  {
    value: 'todos_contra_todos',
    label: 'Todos contra todos',
    description: 'Cada participante juega varias veces y se ordena por resultados.',
  },
  {
    value: 'grupos_eliminacion',
    label: 'Grupos + fase final',
    description: 'Primero grupos y luego llaves; útil cuando hay más participantes.',
  },
]

export default function GestionTorneos() {
  const [torneos, setTorneos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState('todos')
  const [deporteFilter, setDeporteFilter] = useState('todos')
  const [archiveFilter, setArchiveFilter] = useState('activos')
  const [archiveBusy, setArchiveBusy] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [archiveFeedback, setArchiveFeedback] = useState(null)
  const { addToast } = useUIStore()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm()

  const selectedSystem = watch('sistema') || 'por_definir'
  const systemInfo = SISTEMAS.find((system) => system.value === selectedSystem)

  const filtered = useMemo(() => {
    return torneos.filter((t) => {
      if (archiveFilter !== 'todos' && Boolean(t.archivado) !== (archiveFilter === 'archivados')) return false
      if (statusTab !== 'todos' && t.estado !== statusTab) return false
      if (deporteFilter !== 'todos' && t.deporte !== deporteFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase().trim()
        const nombre = (t.nombre || '').toLowerCase()
        const cat = (t.categoria?.nombre || '').toLowerCase()
        if (!nombre.includes(q) && !cat.includes(q)) return false
      }
      return true
    })
  }, [torneos, statusTab, deporteFilter, search, archiveFilter])

  const fetchAll = () => {
    setLoading(true)
    tournamentService
      .getAll({ archivo: 'todos' })
      .then((tournaments) => { setTorneos(tournaments.data || []); setLoadError('') })
      .catch(() => setLoadError('No se pudieron actualizar los torneos. Reintenta antes de realizar cambios.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const toggleArchive = async (tournament) => {
    if (archiveBusy !== null || loading || loadError) return
    const archived = Boolean(tournament.archivado)
    if (!(await confirm({ title: archived ? 'Restaurar torneo' : 'Archivar torneo', message: archived ? `«${tournament.nombre}» volverá al listado habitual. Su estado deportivo y resultados no cambiarán.` : `«${tournament.nombre}» pasará a Archivados. Conserva sus ${tournament.partidos_count} partidos, inscripciones, resultados y jugadores. Esto NO cancela ni pausa los partidos que sigan pendientes o en vivo.`, confirmLabel: archived ? 'Restaurar torneo' : 'Archivar sin borrar' }))) return
    setArchiveBusy(tournament.id)
    setArchiveFeedback(null)
    try {
      await tournamentService.setArchived(tournament.id, !archived, archived)
      setTorneos(list => list.map(t => t.id === tournament.id ? { ...t, archivado: !archived } : t))
      addToast({type:'success',title: archived ? 'Torneo restaurado' : 'Torneo archivado sin borrar datos'})
      setArchiveFeedback({ message: archived ? 'Torneo restaurado. Historial conservado.' : 'Torneo archivado sin borrar datos. Puedes restaurarlo desde Archivados.' })
    } catch(e) { setArchiveFeedback({ error:true, message:e.message || 'No se pudo guardar. Actualiza y reintenta.' }) }
    finally { setArchiveBusy(null) }
  }

  const openCreate = () => {
    reset({
      nombre: '',
      deporte: 'tenis',
      categoria_id: null,
      modalidad: 'individual',
      sistema: 'por_definir',
      estado: 'proximo',
      fecha_inicio: '',
      fecha_fin: '',
    })
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (torneo) => {
    setEditing(torneo)
    reset({
      nombre: torneo.nombre,
      deporte: torneo.deporte,
      categoria_id: null,
      modalidad: torneo.modalidad,
      sistema: torneo.sistema,
      fecha_inicio: torneo.fecha_inicio?.split('T')[0] || '',
      fecha_fin: torneo.fecha_fin?.split('T')[0] || '',
      estado: torneo.estado,
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
  }

  const onSubmit = async (data) => {
    try {
      if (editing) {
        await tournamentService.update(editing.id, data)
        addToast({ type: 'success', title: 'Torneo actualizado' })
      } else {
        await tournamentService.create(data)
        addToast({
          type: 'success',
          title: 'Torneo creado',
          message: 'Ya puedes asignarle partidos desde el módulo de Partidos.',
        })
      }
      closeForm()
      fetchAll()
    } catch (error) {
      addToast({ type: 'error', title: 'No se pudo guardar', message: error.message })
    }
  }

  const handleDelete = async (torneo) => {
    const ok = await confirm({
      title: 'Eliminar torneo',
      message: `Se eliminará el torneo "${torneo.nombre}" con sus partidos, resultados, inscripciones y grupos. Los jugadores, las parejas y la auditoría se conservan.`,
      confirmLabel: 'Eliminar torneo y dependencias',
      danger: true,
      requireText: torneo.nombre,
    })
    if (!ok) return
    try {
      await tournamentService.remove(torneo.id)
      addToast({ type: 'success', title: 'Torneo eliminado' })
      fetchAll()
    } catch (error) {
      addToast({ type: 'error', title: 'No se pudo eliminar', message: error.message })
    }
  }

  return (
    <div className='space-y-6 animate-fade-up'>
      <header className='flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4'>
        <div>
          <p
            className='text-xs font-bold uppercase tracking-[0.16em]'
            style={{ color: 'var(--color-brand)' }}
          >
            Organización deportiva
          </p>
          <h1 className='text-2xl font-black mt-1' style={{ color: 'var(--text-primary)' }}>
            Torneos
          </h1>
          <p className='text-sm mt-1 max-w-xl' style={{ color: 'var(--text-muted)' }}>
            Crea una competencia para todas las categorías. La categoría se elige al programar cada
            partido.
          </p>
        </div>
        <Button onClick={openCreate} leftIcon={<Plus className='w-4 h-4' />}>
          Crear torneo
        </Button>
      </header>

      <section className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
        <GuideStep number='1' title='Crea el torneo' text='Define solo sus datos esenciales.' />
        <GuideStep
          number='2'
          title='Prepara participantes'
          text='Jugadores en individual; parejas en dobles.'
        />
        <GuideStep number='3' title='Programa partidos' text='Elige el torneo y arma sus cruces.' />
      </section>

      {/* Modal Torneo */}
      <Modal
        isOpen={showForm}
        onClose={closeForm}
        title={editing ? 'Editar torneo' : 'Nuevo torneo'}
        subtitle={
          editing
            ? `${editing.nombre} · Modifica las fechas, modalidad o sistema de competición`
            : 'Crea un torneo oficial para gestionar cruces, grupos y marcadores'
        }
        icon={editing ? Pencil : Trophy}
        busy={isSubmitting}
        onSubmit={handleSubmit(onSubmit)}
        footer={
          <>
            <Button
              type='button'
              variant='secondary'
              onClick={closeForm}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type='submit' loading={isSubmitting}>
              {editing ? 'Guardar cambios' : 'Crear torneo'}
            </Button>
          </>
        }
      >
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            <div className='sm:col-span-2'>
              <Input
                label='Nombre del torneo *'
                placeholder='Ej.: Copa Club Unión 2026'
                error={errors.nombre?.message}
                {...register('nombre', { required: 'Escribe el nombre del torneo' })}
              />
            </div>

            <Field label='Deporte *' error={errors.deporte?.message}>
              <select
                className='form-input'
                {...register('deporte', { required: 'Selecciona el deporte' })}
              >
                <option value='tenis'>Tenis</option>
                <option value='padel'>Pádel</option>
              </select>
            </Field>

            <div
              className='rounded-xl p-3 text-sm'
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}
            >
              <span className='font-semibold'>Categorías:</span> todas. Se asignan individualmente
              al crear cada partido.
            </div>

            <Field label='Modalidad *'>
              <select className='form-input' {...register('modalidad', { required: true })}>
                <option value='individual'>Individual · 1 vs 1</option>
                <option value='dobles'>Dobles · pareja vs pareja</option>
              </select>
            </Field>

            <Field label='Sistema de competencia *'>
              <select className='form-input' {...register('sistema', { required: true })}>
                {SISTEMAS.map((system) => (
                  <option key={system.value} value={system.value}>
                    {system.label}
                  </option>
                ))}
              </select>
            </Field>

            <div
              className='sm:col-span-2 rounded-xl p-3 flex gap-3'
              style={{ backgroundColor: 'var(--color-brand-dim)' }}
            >
              <Network
                className='w-5 h-5 shrink-0 mt-0.5'
                style={{ color: 'var(--color-brand)' }}
              />
              <div>
                <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
                  {systemInfo?.label}
                </p>
                <p className='text-xs mt-0.5' style={{ color: 'var(--text-muted)' }}>
                  {systemInfo?.description}
                </p>
              </div>
            </div>

            <Input label='Fecha de inicio' type='date' {...register('fecha_inicio')} />
            <Input label='Fecha de finalización' type='date' {...register('fecha_fin')} />

            <Field label='Estado'>
              <select className='form-input' {...register('estado')}>
                {ESTADOS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </Field>

        </div>
      </Modal>

      {/* Barra de búsqueda y filtros */}
      <div className='card p-4 space-y-3'>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          <div className='relative'>
            <Search
              className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none'
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type='text'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Buscar torneo por nombre o categoría...'
              className='form-input pl-9 text-xs sm:text-sm'
            />
            {search && (
              <button
                type='button'
                onClick={() => setSearch('')}
                className='absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              >
                <X className='w-3.5 h-3.5' />
              </button>
            )}
          </div>
          <div>
            <select
              value={deporteFilter}
              onChange={(e) => setDeporteFilter(e.target.value)}
              className='form-input text-xs sm:text-sm'
            >
              <option value='todos'>Todos los deportes (Tenis y Pádel)</option>
              <option value='tenis'>Solo Tenis</option>
              <option value='padel'>Solo Pádel</option>
            </select>
          </div>
        </div>

        <div className='flex items-center justify-between text-xs text-[var(--text-muted)] pt-1'>
          <span>
            Mostrando <strong className='text-[var(--text-primary)]'>{filtered.length}</strong> de {torneos.length} torneos
          </span>
          {(search || statusTab !== 'todos' || deporteFilter !== 'todos') && (
            <button
              type='button'
              onClick={() => {
                setSearch('')
                setStatusTab('todos')
                setDeporteFilter('todos')
              }}
              className='text-[var(--color-brand)] hover:underline font-medium'
            >
              Restablecer filtros
            </button>
          )}
        </div>
      </div>

      <Tabs tabs={STATUS_TABS} activeTab={statusTab} onChange={setStatusTab} />
      <div className='card p-4 flex flex-wrap gap-3 items-center justify-between'>
        <label className='text-sm font-semibold'>Mostrar<select aria-label='Archivo de torneos' className='form-input mt-1 w-full' value={archiveFilter} onChange={e => setArchiveFilter(e.target.value)}><option value='activos'>Sin archivar</option><option value='archivados'>Archivados</option><option value='todos'>Todos, incluidos archivados</option></select></label>
        <p className='text-xs text-[var(--text-secondary)] max-w-md'>Archivar organiza el listado; no elimina información ni cambia el estado deportivo.</p>
      </div>
      {loadError && <p role='alert' className='card p-4 text-sm text-red-600'>{loadError} <button className='underline' onClick={fetchAll}>Reintentar</button></p>}
      {archiveFeedback && <p role={archiveFeedback.error ? 'alert' : 'status'} className={`card p-4 text-sm ${archiveFeedback.error ? 'text-red-600' : 'text-[var(--color-brand)]'}`}>{archiveFeedback.message}</p>}

      {!loadError && <section className='space-y-3'>
        <BulkDelete
          records={filtered}
          remove={tournamentService.remove}
          onComplete={fetchAll}
          disabled={loading || archiveBusy !== null}
          warning='Se eliminarán los torneos seleccionados con sus partidos, resultados, fotos registradas, inscripciones y grupos. Se conservan jugadores, parejas y el historial de auditoría.'
          label={(r) => r.nombre}
        />

        {loading ? (
          Array.from({ length: 3 }, (_, index) => (
            <div key={index} className='skeleton h-36 rounded-2xl' />
          ))
        ) : filtered.length === 0 ? (
          <div className='card p-10 text-center'>
            <Trophy className='w-10 h-10 mx-auto mb-3' style={{ color: 'var(--text-muted)' }} />
            <p className='font-semibold' style={{ color: 'var(--text-primary)' }}>
              No se encontraron torneos
            </p>
            <p className='text-sm mt-1 mb-4' style={{ color: 'var(--text-muted)' }}>
              {torneos.length === 0
                ? 'Crea el primero para comenzar a organizar sus partidos.'
                : 'Intenta ajustar los filtros de búsqueda o estado.'}
            </p>
            {torneos.length === 0 && (
              <Button onClick={openCreate} leftIcon={<Plus className='w-4 h-4' />}>
                Crear torneo
              </Button>
            )}
          </div>
        ) : (
          filtered.map((tournament) => (
            <article key={tournament.id} className='card p-4 sm:p-5'>
              <div className='flex flex-col lg:flex-row lg:items-center gap-4'>
                <div
                  className='w-12 h-12 rounded-2xl flex items-center justify-center shrink-0'
                  style={{ backgroundColor: 'var(--color-brand-dim)', color: 'var(--color-brand)' }}
                >
                  <Trophy className='w-6 h-6' />
                </div>
                <div className='flex-1 min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <h2 className='font-bold text-base' style={{ color: 'var(--text-primary)' }}>
                      {tournament.nombre}
                    </h2>
                    {tournament.archivado && <span className='badge'>Archivado · historial conservado</span>}
                    <span className={ESTADO_BADGE[tournament.estado] || 'badge'}>
                      {ESTADOS.find((status) => status.value === tournament.estado)?.label}
                    </span>
                  </div>
                  <div
                    className='flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs'
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span className='inline-flex items-center gap-1.5'>
                      <UsersRound className='w-3.5 h-3.5' />
                      {tournament.modalidad === 'dobles' ? 'Dobles' : 'Individual'} ·{' '}
                      {tournament.deporte === 'padel' ? 'Pádel' : 'Tenis'}
                    </span>
                    <span className='inline-flex items-center gap-1.5'>
                      <Network className='w-3.5 h-3.5' />
                      {SISTEMAS.find((system) => system.value === tournament.sistema)?.label}
                    </span>
                    <span>{tournament.categoria?.nombre || 'Todas las categorías'}</span>
                    {(tournament.fecha_inicio || tournament.fecha_fin) && (
                      <span className='inline-flex items-center gap-1.5'>
                        <CalendarDays className='w-3.5 h-3.5' />
                        {formatPeriod(tournament)}
                      </span>
                    )}
                  </div>
                </div>
                <div className='flex flex-wrap items-center gap-2 shrink-0'>
                  <button type='button' className='btn-secondary px-3 py-2 text-xs' disabled={archiveBusy !== null || loading} onClick={() => toggleArchive(tournament)}>{archiveBusy === tournament.id ? 'Guardando…' : tournament.archivado ? 'Restaurar torneo' : 'Archivar torneo'}</button>
                  <Link to={`/torneo/${tournament.id}`} className='btn-secondary px-3 py-2 text-xs'>
                    Detalle e inscripciones
                  </Link>
                  <span
                    className='text-xs font-semibold px-3'
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {tournament.partidos_count} partido{tournament.partidos_count !== 1 ? 's' : ''}
                  </span>
                  <Link
                    to={`/admin/partidos?torneo=${tournament.id}`}
                    className='btn-secondary px-3 py-2 flex items-center gap-1.5 text-xs'
                  >
                    Partidos <ArrowRight className='w-3.5 h-3.5' />
                  </Link>
                  {!tournament.archivado && <Link
                    to={`/admin/partidos?torneo=${tournament.id}&crear=1`}
                    className='btn-secondary px-3 py-2 flex items-center gap-1.5 text-xs'
                    title='Programar un nuevo partido en este torneo'
                  >
                    <Plus className='w-3.5 h-3.5 text-[var(--color-brand)]' />
                    <span>Crear partido</span>
                  </Link>}
                  <button
                    onClick={() => openEdit(tournament)}
                    className='btn-ghost p-2'
                    aria-label='Editar torneo'
                  >
                    <Pencil className='w-4 h-4' />
                  </button>
                  <button
                    onClick={() => handleDelete(tournament)}
                    className='btn-ghost p-2'
                    style={{ color: '#ef4444' }}
                    aria-label='Eliminar torneo'
                  >
                    <Trash2 className='w-4 h-4' />
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>}
    </div>
  )
}

function GuideStep({ number, title, text }) {
  return (
    <div className='card p-4 flex gap-3'>
      <span
        className='w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0'
        style={{ backgroundColor: 'var(--color-brand-dim)', color: 'var(--color-brand)' }}
      >
        {number}
      </span>
      <div>
        <p className='text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
          {title}
        </p>
        <p className='text-xs mt-0.5' style={{ color: 'var(--text-muted)' }}>
          {text}
        </p>
      </div>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <label className='form-group'>
      <span className='form-label'>{label}</span>
      {children}
      {error && <span className='form-error'>{error}</span>}
    </label>
  )
}

function formatPeriod(tournament) {
  if (tournament.fecha_inicio && tournament.fecha_fin) {
    return `${formatDate(tournament.fecha_inicio)} → ${formatDate(tournament.fecha_fin)}`
  }
  return tournament.fecha_inicio
    ? `Desde ${formatDate(tournament.fecha_inicio)}`
    : `Hasta ${formatDate(tournament.fecha_fin)}`
}
