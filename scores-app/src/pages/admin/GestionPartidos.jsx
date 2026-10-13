import BulkDelete from '../../components/ui/BulkDelete'
import { useState, useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Plus, Pencil, Trash2, X, Radio, Gavel, SlidersHorizontal, MapPin, Search, Trophy } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { matchService } from '../../services/matchService'
import MatchAuditButton from '../../components/match/MatchAuditButton'
import { playerService } from '../../services/playerService'
import { teamService } from '../../services/teamService'
import { userService } from '../../services/userService'
import { sedeService } from '../../services/sedeService'
import { tournamentService } from '../../services/tournamentService'
import { categoriaService } from '../../services/categoriaService'
import { confirm } from '../../utils/confirm'
import useUIStore from '../../store/useUIStore'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'
import LiveBadge from '../../components/match/LiveBadge'
import { formatClockTime, formatDate } from '../../utils/formatDate'
import { getMatchupLabel, getParticipantName } from '../../utils/matchParticipants'

const ESTADOS = [
  { value: 'programado', label: 'Programado' },
  { value: 'en_vivo', label: 'En vivo' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'cancelado', label: 'Cancelado' },
]
const FILTER_TABS = [
  { value: 'todos', label: 'Todos' },
  { value: 'en_vivo', label: 'En vivo' },
  { value: 'programado', label: 'Programados' },
  { value: 'finalizado', label: 'Finalizados' },
  { value: 'cancelado', label: 'Cancelados' },
]
const MAX_SETS = 127

export default function GestionPartidos() {
  const [partidos, setPartidos] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [equipos, setEquipos] = useState([])
  const [jueces, setJueces] = useState([])
  const [canchas, setCanchas] = useState([])
  const [torneos, setTorneos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showMarcador, setShowMarcador] = useState(null)
  const [editing, setEditing] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [filterTab, setFilterTab] = useState('todos')
  const [searchParams, setSearchParams] = useSearchParams()
  const [filterTorneo, setFilterTorneo] = useState(() => searchParams.get('torneo') || 'todos')
  const [filterDeporte, setFilterDeporte] = useState('todos')
  const [search, setSearch] = useState('')
  const [setNumbers, setSetNumbers] = useState([1, 2, 3])
  const { addToast } = useUIStore()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ shouldUnregister: false })
  const {
    register: regM,
    handleSubmit: handleM,
    reset: resetM,
    unregister: unregisterM,
    formState: { isSubmitting: isSubmittingM },
  } = useForm()

  const selectedTournamentId = String(watch('torneo_id') || '')
  const [retirements, setRetirements] = useState(null)
  const [retirementError, setRetirementError] = useState('')
  useEffect(() => {
    let active = true
    setRetirements(null); setRetirementError('')
    if (showForm && selectedTournamentId) tournamentService.getRetirements(selectedTournamentId)
      .then(r => { if (active) setRetirements({ ...r.data, torneo: selectedTournamentId }) })
      .catch(e => { if (active) setRetirementError(e.message || 'No se pudo verificar la participación') })
    return () => { active = false }
  }, [showForm, selectedTournamentId])
  const availableParticipant = (value, type) => {
    if (!selectedTournamentId) return true
    if (!retirements || retirements.torneo !== selectedTournamentId) return false
    if (!retirements[type]?.includes(Number(value))) return true
    const key = type === 'parejas' ? 'equipo' : 'jugador'
    return String(editing?.torneo?.id) === selectedTournamentId &&
      [editing?.[`${key}1`]?.id, editing?.[`${key}2`]?.id].some(id => Number(id) === Number(value))
  }
  const selectedTournament = torneos.find(
    (tournament) => String(tournament.id) === selectedTournamentId
  )
  const selectedDeporte = selectedTournament?.deporte || watch('deporte') || 'tenis'
  const selectedCategoryId = String(
    selectedTournament?.categoria?.id || watch('categoria_id') || ''
  )
  const selectedModality = selectedTournament?.modalidad || watch('modalidad') || 'individual'
  const [distribution, setDistribution] = useState(null),
    [groupError, setGroupError] = useState('')
  useEffect(() => {
    let active = true
    setDistribution(null)
    setGroupError('')
    if (
      showForm && selectedTournamentId &&
      selectedTournament?.sistema === 'grupos_eliminacion' &&
      selectedModality === 'dobles'
    ) {
      tournamentService
        .getGroups(selectedTournamentId)
        .then((r) => {
          if (!active) return
          setDistribution(r.data)
        })
        .catch((e) => {
          if (active) setGroupError(e.message || 'No se pudieron cargar los grupos')
        })
    } else {
      setDistribution(null)
    }
    return () => {
      active = false
    }
  }, [showForm, selectedTournamentId, selectedTournament?.sistema, selectedModality])
  const selectedGroup = watch('grupo') || ''
  const useGroups =
    selectedTournament?.sistema === 'grupos_eliminacion' && selectedModality === 'dobles'
  const selectedPhase = watch('fase') || 'grupos'
  const participant1Mode = watch('participante1_tipo') || 'fijo'
  const participant2Mode = watch('participante2_tipo') || 'fijo'
  const sourceMatches = partidos.filter(
    (partido) =>
      !(useGroups && selectedPhase === 'grupos') &&
      selectedTournamentId &&
      String(partido.torneo?.id || '') === selectedTournamentId &&
      String(partido.categoria?.id || '') === selectedCategoryId &&
      (!editing || partido.id < editing.id)
  )
  const categoriasDisponibles = categorias.filter(
    (categoria) => categoria.deporte === selectedDeporte || categoria.deporte === 'ambos'
  )
  const jugadoresDisponibles = useMemo(() => {
    const list = jugadores.filter(
      (jugador) => jugador.deporte === selectedDeporte || jugador.deporte === 'ambos'
    )
    return list.filter(p => availableParticipant(p.id, 'jugadores'))
  }, [jugadores, selectedDeporte, editing, retirements, selectedTournamentId])

  const equiposDisponibles = useMemo(() => {
    const list = equipos.filter(
      (equipo) =>
        equipo.deporte === selectedDeporte &&
        (useGroups
          ? distribution?.parejas.some(
              (p) =>
                Number(p.equipo_id) === Number(equipo.id) &&
                String(p.categoria_id) === selectedCategoryId &&
                (selectedPhase !== 'grupos' || p.grupo === selectedGroup)
            )
          : String(equipo.categoria?.id || '') === selectedCategoryId)
    )
    return list.filter(p => availableParticipant(p.id, 'parejas'))
  }, [equipos, selectedDeporte, useGroups, distribution, selectedCategoryId, selectedPhase, selectedGroup, editing, retirements, selectedTournamentId])
  const [marcadorParticipante1, marcadorParticipante2] = getParticipantNames(showMarcador)

  const fetchAll = () => {
    setLoading(true)
    return Promise.all([
      matchService.getAll(),
      playerService.getAll(),
      teamService.getAll(),
      userService.getAll(),
      sedeService.getAll(),
      tournamentService.getAll({ archivo: 'todos' }),
      categoriaService.getAll(),
    ])
      .then(async ([p, j, e, u, locations, tournaments, categories]) => {
        setPartidos(p.data || [])
        setJugadores(j.data || [])
        setEquipos(e.data || [])
        setJueces(
          (u.data || []).filter((usuario) =>
            ['juez', 'juez_director', 'admin'].includes(usuario.rol)
          )
        )
        setTorneos(
          (tournaments.data || []).filter((tournament) => tournament.estado !== 'cancelado')
        )
        setCategorias(categories.data || [])
        const courtResponses = await Promise.all(
          (locations.data || []).map(async (location) => {
            const response = await sedeService.getCanchasBySede(location.id)
            return (response.data || []).map((court) => ({
              ...court,
              sede_nombre: location.nombre,
            }))
          })
        )
        setCanchas(courtResponses.flat())
      })
      .catch(() => addToast({ type: 'error', title: 'Error al cargar datos' }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchAll()
  }, [])

  useEffect(() => {
    const t = searchParams.get('torneo')
    setFilterTorneo(t || 'todos')
    if (searchParams.get('crear') === '1') {
      openCreate()
      const next = new URLSearchParams(searchParams)
      next.delete('crear')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams])

  const openCreate = () => {
    setSubmitError('')
    const selectedTorneo = searchParams.get('torneo') || filterTorneo
    const defaultTorneo = /^\d+$/.test(selectedTorneo) ? selectedTorneo : ''
    reset({
      torneo_id: defaultTorneo,
      deporte: 'tenis',
      modalidad: 'individual',
      categoria_id: '',
      estado: 'programado',
      participante1_tipo: 'fijo',
      participante2_tipo: 'fijo',
      fase: 'grupos',
      grupo: '',
      ronda: '',
      juez_id: '',
      cancha_id: '',
      mejor_de_sets: '3',
      juegos_por_set: '6',
      diferencia_juegos: '2',
      modo_game: 'ventaja',
      set_decisivo: 'set_completo',
      tiebreak_en: '6',
      tiebreak_puntos: '7',
      match_tiebreak_puntos: '10',
      servidor_inicial: 'jugador1',
    })
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (partido) => {
    setSubmitError('')
    setEditing(partido)
    const tId = partido.torneo?.id ? String(partido.torneo.id) : ''
    reset({
      torneo_id: tId,
      deporte: partido.deporte || 'tenis',
      modalidad:
        partido.modalidad || (partido.equipo1?.id || partido.equipo2?.id ? 'dobles' : 'individual'),
      categoria_id: partido.categoria?.id ? String(partido.categoria.id) : '',
      estado: partido.estado,
      fecha_inicio: partido.fecha_inicio ? partido.fecha_inicio.slice(0, 10) : '',
      hora_inicio: partido.hora_inicio ? partido.hora_inicio.slice(0, 5) : '',
      fase: partido.fase || 'grupos',
      grupo: partido.grupo || '',
      ronda: partido.ronda || '',
      jugador1_id: partido.jugador1?.id ? String(partido.jugador1.id) : '',
      jugador2_id: partido.jugador2?.id ? String(partido.jugador2.id) : '',
      equipo1_id: partido.equipo1?.id ? String(partido.equipo1.id) : '',
      equipo2_id: partido.equipo2?.id ? String(partido.equipo2.id) : '',
      participante1_tipo: partido.origen_partido1 ? 'ganador' : 'fijo',
      participante2_tipo: partido.origen_partido2 ? 'ganador' : 'fijo',
      origen_partido1_id: partido.origen_partido1?.id ? String(partido.origen_partido1.id) : '',
      origen_partido2_id: partido.origen_partido2?.id ? String(partido.origen_partido2.id) : '',
      notas: partido.notas || '',
      juez_id: partido.juez?.id ? String(partido.juez.id) : '',
      cancha_id: partido.cancha?.id ? String(partido.cancha.id) : '',
      mejor_de_sets: String(partido.formato?.mejor_de_sets || 3),
      juegos_por_set: String(partido.formato?.juegos_por_set || 6),
      diferencia_juegos: String(partido.formato?.diferencia_juegos || 2),
      modo_game: partido.formato?.modo_game || 'ventaja',
      set_decisivo: partido.formato?.set_decisivo || 'set_completo',
      tiebreak_en: String(partido.formato?.tiebreak_en ?? 6),
      tiebreak_puntos: String(partido.formato?.tiebreak_puntos || 7),
      match_tiebreak_puntos: String(partido.formato?.match_tiebreak_puntos || 10),
      servidor_inicial: partido.formato?.servidor_inicial || 'jugador1',
    })
    setShowForm(true)
  }

  const openMarcador = (partido) => {
    setShowMarcador(partido)
    setShowForm(false)
    const highestExistingSet = Math.max(3, ...(partido.sets?.map((set) => set.numero_set) || []))
    setSetNumbers(Array.from({ length: highestExistingSet }, (_, index) => index + 1))
    const setsData = {}
    partido.sets?.forEach((s) => {
      setsData[`set_${s.numero_set}_j1`] = s.games_j1
      setsData[`set_${s.numero_set}_j2`] = s.games_j2
      setsData[`set_${s.numero_set}_completado`] = s.completado ? 'true' : false
    })
    resetM({ estado: partido.estado, ganador: partido.ganador || '', ...setsData })
  }

  const onSubmit = async (data) => {
    setSubmitError('')
    try {
      if (useGroups) {
        if (!distribution || groupError) throw new Error(groupError || 'Espera a que se carguen los grupos antes de guardar.')
        if (selectedPhase === 'grupos' && !distribution.grupos.some(g => String(g.categoria_id) === selectedCategoryId && g.nombre === data.grupo)) {
          throw new Error('Selecciona un grupo válido de esta categoría.')
        }
      }
      for (const side of [1, 2]) {
        if (data[`participante${side}_tipo`] === 'ganador') continue
        const options = selectedModality === 'dobles' ? equiposDisponibles : jugadoresDisponibles
        const id = data[`${selectedModality === 'dobles' ? 'equipo' : 'jugador'}${side}_id`]
        if (!options.some(option => String(option.id) === String(id))) {
          throw new Error(`El participante ${side} no pertenece a la selección actual. Revisa categoría y grupo.`)
        }
      }
      const payload = {
        torneo_id: data.torneo_id || null,
        deporte: selectedDeporte,
        modalidad: selectedModality,
        categoria_id: selectedCategoryId,
        estado: data.estado,
        fecha_inicio: data.fecha_inicio,
        hora_inicio: data.hora_inicio,
        fase: data.fase,
        grupo: data.grupo,
        ronda: data.ronda,
        jugador1_id: data.jugador1_id,
        jugador2_id: data.jugador2_id,
        equipo1_id: data.equipo1_id,
        equipo2_id: data.equipo2_id,
        origen_partido1_id: data.participante1_tipo === 'ganador' ? data.origen_partido1_id : null,
        origen_partido2_id: data.participante2_tipo === 'ganador' ? data.origen_partido2_id : null,
        notas: data.notas,
        juez_id: data.juez_id || null,
        cancha_id: data.cancha_id || null,
        mejor_de_sets: data.mejor_de_sets,
        juegos_por_set: data.juegos_por_set,
        diferencia_juegos: data.diferencia_juegos,
        modo_game: data.modo_game,
        set_decisivo: data.set_decisivo,
        tiebreak_en: data.tiebreak_en,
        tiebreak_puntos: data.tiebreak_puntos,
        match_tiebreak_puntos: data.match_tiebreak_puntos,
        servidor_inicial: data.servidor_inicial,
      }
      if (selectedModality === 'dobles') {
        delete payload.jugador1_id
        delete payload.jugador2_id
      } else {
        delete payload.equipo1_id
        delete payload.equipo2_id
      }
      // Save rechecks on the server under a scheduling lock; this preview is not authoritative.
      const review = await matchService.checkSchedule({ ...payload, id: editing?.id || null })
      const checks = review.data || {}
      if (checks.conflicts?.length) throw new Error(checks.conflicts.map(c => c.message).join('\n'))
      if (checks.warnings?.length && !(await confirm({
        title: 'Revisa duración y descanso',
        message: `${checks.warnings.map(w => w.message).join('\n')}\nReferencia orientativa: 2 horas entre inicios, no una duración obligatoria. ¿Guardar esta programación?`,
        confirmLabel: 'Guardar programación',
      }))) return
      if (editing) {
        await matchService.update(editing.id, { ...payload, expected_control_version: editing.control_version })
        addToast({ type: 'success', title: 'Partido actualizado' })
      } else {
        await matchService.create(payload)
        addToast({ type: 'success', title: 'Partido creado' })
      }
      setShowForm(false)
      await fetchAll()
    } catch (err) {
      setSubmitError(err.message || 'No se pudo guardar el partido. Tus datos se conservan; vuelve a intentarlo.')
      addToast({ type: 'error', title: 'Error', message: err.message })
    }
  }

  const onMarcador = async (data) => {
    try {
      const sets = []
      for (const i of setNumbers) {
        const rawJ1 = data[`set_${i}_j1`]
        const rawJ2 = data[`set_${i}_j2`]
        const isBlank = rawJ1 === '' && rawJ2 === ''
        if (isBlank) continue
        if (rawJ1 === '' || rawJ2 === '') {
          throw new Error(`Completa ambos puntajes del set ${i}`)
        }
        sets.push({
          numero_set: i,
          games_j1: Number.parseInt(rawJ1, 10),
          games_j2: Number.parseInt(rawJ2, 10),
          completado: data[`set_${i}_completado`] === 'true',
        })
      }
      if (!sets.length) throw new Error('Ingresa al menos un set')
      await matchService.updateMarcador(showMarcador.id, {
        estado: data.estado,
        ganador: data.ganador || null,
        sets,
      })
      addToast({ type: 'success', title: 'Marcador actualizado' })
      setShowMarcador(null)
      fetchAll()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err.message })
    }
  }

  const addSet = () => {
    setSetNumbers((current) =>
      current.length < MAX_SETS ? [...current, current.length + 1] : current
    )
  }

  const removeLastSet = () => {
    if (setNumbers.length <= 3) return

    const lastSet = setNumbers[setNumbers.length - 1]
    unregisterM([`set_${lastSet}_j1`, `set_${lastSet}_j2`, `set_${lastSet}_completado`])
    setSetNumbers((current) => current.slice(0, -1))
  }

  const handleDelete = async (partido) => {
    const ok = await confirm({
      title: 'Eliminar partido',
      message:
        'Esta acción eliminará permanentemente el partido junto con su marcador. No se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    try {
      await matchService.remove(partido.id)
      addToast({ type: 'success', title: 'Partido eliminado' })
      fetchAll()
    } catch (err) {
      addToast({ type: 'error', title: 'Error', message: err.message })
    }
  }

  const filtered = useMemo(() => {
    return partidos.filter((p) => {
      if (searchParams.get('partido') && String(p.id) !== searchParams.get('partido')) return false
      if (filterTab !== 'todos' && p.estado !== filterTab) return false
      if (filterTorneo === 'sin_torneo') {
        if (p.torneo?.id) return false
      } else if (filterTorneo !== 'todos' && String(p.torneo?.id) !== String(filterTorneo)) {
        return false
      }
      if (filterDeporte !== 'todos' && p.deporte !== filterDeporte) return false
      if (search.trim()) {
        const q = search.toLowerCase().trim()
        const p1 = (getParticipantName(p, 1) || '').toLowerCase()
        const p2 = (getParticipantName(p, 2) || '').toLowerCase()
        const torneoNombre = (p.torneo?.nombre || '').toLowerCase()
        const cancha = (p.cancha?.nombre || '').toLowerCase()
        const juez = (p.juez ? `${p.juez.nombre} ${p.juez.apellido}` : '').toLowerCase()
        if (
          !p1.includes(q) &&
          !p2.includes(q) &&
          !torneoNombre.includes(q) &&
          !cancha.includes(q) &&
          !juez.includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [partidos, filterTab, filterTorneo, filterDeporte, search, searchParams])

  return (
    <div className='space-y-6 animate-fade-up'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
            Partidos
          </h1>
          <p className='text-sm mt-0.5' style={{ color: 'var(--text-muted)' }}>
            {partidos.length} partido{partidos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openCreate} leftIcon={<Plus className='w-4 h-4' />}>
          Nuevo partido
        </Button>
      </div>

      {/* Modal nuevo/editar */}
      {searchParams.get('partido') && <div className='card p-3 text-sm flex flex-wrap gap-3 items-center justify-between'>
        <span>Revisando partido #{searchParams.get('partido')}</span>
        <button type='button' className='btn-secondary px-3 py-2' onClick={() => setSearchParams(prev => {
          const next = new URLSearchParams(prev); next.delete('partido'); return next
        })}>Ver los demás partidos</button>
      </div>}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Editar partido' : 'Nuevo partido'}
        subtitle={
          editing
            ? (editing.torneo?.nombre ? `${editing.torneo.nombre} · Modifica los datos del encuentro` : 'Partido libre · Modifica los datos del encuentro')
            : 'Programa un nuevo partido libre o asociado a un torneo'
        }
        icon={editing ? Pencil : Plus}
        maxWidth='max-w-3xl'
        busy={isSubmitting}
        onSubmit={handleSubmit(onSubmit)}
        footer={
          <>
            <Button
              type='button'
              variant='secondary'
              onClick={() => setShowForm(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type='submit' loading={isSubmitting} disabled={useGroups && (!distribution || !!groupError)}>
              {editing ? 'Guardar cambios' : 'Crear partido'}
            </Button>
          </>
        }
      >
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              {submitError && <p role='alert' className='form-error sm:col-span-2'>{submitError}</p>}
              <div className='form-group sm:col-span-2'>
                <label className='form-label'>Torneo (opcional)</label>
                <select
                  className='form-input'
                  {...register('torneo_id', {
                    onChange: () => {
                      if (!editing) {
                        setValue('categoria_id', '')
                        setValue('deporte', 'tenis')
                        setValue('modalidad', 'individual')
                        setValue('participante1_tipo', 'fijo')
                        setValue('participante2_tipo', 'fijo')
                      }
                    },
                  })}
                >
                <option value=''>Partido libre (sin torneo)</option>
                {torneos.filter(t => !t.archivado || Number(editing?.torneo?.id) === Number(t.id)).map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.nombre} ·{' '}
                    {tournament.modalidad === 'dobles' ? 'Dobles' : 'Individual'} ·{' '}
                    {tournament.categoria?.nombre || 'Todas las categorías'}
                  </option>
                ))}
              </select>
              {errors.torneo_id && <p className='form-error'>{errors.torneo_id.message}</p>}
              {retirementError && <p role='alert' className='form-error'>{retirementError}. Cierra y vuelve a abrir el formulario para reintentar.</p>}
            </div>

            <div className='form-group'>
              <label className='form-label'>Estado</label>
              <select className='form-input' {...register('estado')}>
                {ESTADOS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>

            {!selectedTournament && (
              <>
                <div className='form-group'>
                  <label className='form-label'>Deporte *</label>
                  <select
                    className='form-input'
                    {...register('deporte', { required: 'Requerido' })}
                  >
                    <option value='tenis'>Tenis</option>
                    <option value='padel'>Pádel</option>
                  </select>
                </div>
                <div className='form-group'>
                  <label className='form-label'>Modalidad *</label>
                  <select
                    className='form-input'
                    {...register('modalidad', { required: 'Requerido' })}
                  >
                    <option value='individual'>Individual</option>
                    <option value='dobles'>Dobles</option>
                  </select>
                </div>
                <div className='form-group'>
                  <label className='form-label'>Categoría *</label>
                  <select
                    className='form-input'
                    {...register('categoria_id', { required: 'Selecciona la categoría' })}
                  >
                    <option value=''>Seleccionar categoría</option>
                    {categoriasDisponibles.map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
                        {categoria.nombre}
                      </option>
                    ))}
                  </select>
                  {errors.categoria_id && (
                    <p className='form-error'>{errors.categoria_id.message}</p>
                  )}
                </div>
              </>
            )}

            {selectedTournament && (
              <div
                className='rounded-xl p-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1'
                style={{ backgroundColor: 'var(--color-brand-dim)', color: 'var(--text-primary)' }}
              >
                <span className='font-semibold'>
                  {selectedDeporte === 'padel' ? 'Pádel' : 'Tenis'}
                </span>
                <span>·</span>
                <span>{selectedTournament.categoria?.nombre || 'Todas las categorías'}</span>
                <span>·</span>
                <span>{selectedModality === 'dobles' ? 'Parejas' : 'Individual'}</span>
              </div>
            )}

            {selectedTournament && !selectedTournament.categoria && (
              <div className='form-group'>
                <label className='form-label'>Categoría del partido *</label>
                <select
                  className='form-input'
                  {...register('categoria_id', { required: 'Selecciona la categoría del partido' })}
                >
                  <option value=''>Seleccionar categoría</option>
                  {categoriasDisponibles.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nombre}
                    </option>
                  ))}
                </select>
                {errors.categoria_id && <p className='form-error'>{errors.categoria_id.message}</p>}
              </div>
            )}

            {selectedTournament?.sistema === 'grupos_eliminacion' && (
              <div className='form-group'>
                <label className='form-label'>Fase *</label>
                <select className='form-input' {...register('fase')}>
                  <option value='grupos'>Fase de grupos</option>
                  <option value='eliminacion'>Fase eliminatoria</option>
                </select>
              </div>
            )}

            {selectedTournament?.sistema === 'grupos_eliminacion' && selectedPhase === 'grupos' && (
              <div>
                <label className='form-label'>Grupo *</label>
                {useGroups ? (
                  <>
                    <FormSelect
                      control={control}
                      name='grupo'
                      rules={{ required: 'Selecciona un grupo' }}
                      disabled={!distribution}
                      className='form-input'
                    >
                      <option value=''>{!distribution && !groupError ? 'Cargando grupos…' : 'Selecciona un grupo…'}</option>
                      {(distribution?.grupos || [])
                        .filter((g) => String(g.categoria_id) === selectedCategoryId)
                        .map((g) => (
                          <option key={g.nombre} value={g.nombre}>
                            {g.nombre} · {g.equipo_ids.length} parejas
                          </option>
                        ))}
                    </FormSelect>
                    {errors.grupo && <p className='form-error'>{errors.grupo.message}</p>}
                    <p className='text-xs mt-1'>
                      {groupError || 'Solo podrás seleccionar parejas de esta categoría y grupo.'}{' '}
                      <Link className='underline' to={'/torneo/' + selectedTournamentId}>
                        Organizar grupos
                      </Link>
                    </p>
                  </>
                ) : (
                  <Input maxLength={20} {...register('grupo')} />
                )}
              </div>
            )}

            {selectedTournament && selectedTournament.sistema !== 'todos_contra_todos' && (
              <Input
                label='Ronda (opcional)'
                placeholder={
                  selectedTournament.sistema === 'eliminacion_directa' ||
                  selectedPhase === 'eliminacion'
                    ? 'Ej.: Cuartos de final'
                    : 'Ej.: Fecha 1'
                }
                maxLength={50}
                {...register('ronda')}
              />
            )}

            <Input label='Fecha' type='date' {...register('fecha_inicio')} />
            <Input label='Hora' type='time' {...register('hora_inicio')} />

            <div className='form-group'>
              <label className='form-label'>Juez asignado</label>
              <select className='form-input' {...register('juez_id')}>
                <option value=''>Sin asignar</option>
                {jueces.map((juez) => (
                  <option key={juez.id} value={juez.id}>
                    {juez.nombre} {juez.apellido}{' '}
                    {juez.rol === 'juez_director'
                      ? '(director)'
                      : juez.rol === 'admin'
                        ? '(admin)'
                        : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className='form-group'>
              <label className='form-label'>Cancha (opcional)</label>
              <select className='form-input' {...register('cancha_id')}>
                <option value=''>Sin asignar</option>
                {canchas
                  .filter((court) => court.deporte === selectedDeporte || court.deporte === 'ambos')
                  .map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.nombre} · {court.sede_nombre}
                    </option>
                  ))}
              </select>
            </div>

            <div
              className='sm:col-span-2 rounded-xl p-4 space-y-3'
              style={{ backgroundColor: 'var(--bg-hover)' }}
            >
              <div className='flex items-center gap-2'>
                <SlidersHorizontal className='w-4 h-4' style={{ color: 'var(--color-brand)' }} />
                <div>
                  <p className='form-label m-0'>Formato de puntuación</p>
                  <p className='text-[11px] mt-0.5' style={{ color: 'var(--text-muted)' }}>
                    Configurable por partido. El control del juez aplicará estas reglas.
                  </p>
                </div>
              </div>

              <div className='flex gap-2'>
                <button
                  type='button'
                  onClick={() => {
                    setValue('set_decisivo', 'match_tiebreak')
                    setValue('tiebreak_en', '6')
                    setValue('tiebreak_puntos', '7')
                    setValue('match_tiebreak_puntos', '10')
                  }}
                  className='flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all'
                  style={{
                    backgroundColor:
                      watch('set_decisivo') === 'match_tiebreak'
                        ? 'var(--color-brand-dim)'
                        : 'var(--bg-primary)',
                    color:
                      watch('set_decisivo') === 'match_tiebreak'
                        ? 'var(--color-brand)'
                        : 'var(--text-muted)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  Normal (3er set = Supertiebreak)
                </button>
                <button
                  type='button'
                  onClick={() => {
                    setValue('set_decisivo', 'set_completo')
                    setValue('tiebreak_en', '6')
                    setValue('tiebreak_puntos', '7')
                    setValue('match_tiebreak_puntos', '10')
                  }}
                  className='flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all'
                  style={{
                    backgroundColor:
                      watch('set_decisivo') === 'set_completo'
                        ? 'var(--color-brand-dim)'
                        : 'var(--bg-primary)',
                    color:
                      watch('set_decisivo') === 'set_completo'
                        ? 'var(--color-brand)'
                        : 'var(--text-muted)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  Super Game (3er set completo)
                </button>
              </div>

              <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
                <label className='form-group'>
                  <span className='form-label'>Mejor de</span>
                  <select className='form-input' {...register('mejor_de_sets')}>
                    <option value='1'>1 set</option>
                    <option value='3'>3 sets</option>
                    <option value='5'>5 sets</option>
                  </select>
                </label>
                <label className='form-group'>
                  <span className='form-label'>Juegos por set</span>
                  <input
                    type='number'
                    min='1'
                    max='12'
                    className='form-input'
                    {...register('juegos_por_set')}
                  />
                </label>
                <label className='form-group'>
                  <span className='form-label'>Diferencia de juegos</span>
                  <input
                    type='number'
                    min='1'
                    max='6'
                    className='form-input'
                    {...register('diferencia_juegos')}
                  />
                </label>
                <label className='form-group'>
                  <span className='form-label'>Games</span>
                  <select className='form-input' {...register('modo_game')}>
                    <option value='ventaja'>Con ventaja</option>
                    <option value='sin_ventaja'>Punto decisivo</option>
                  </select>
                </label>
                <label className='form-group'>
                  <span className='form-label'>Set decisivo</span>
                  <select className='form-input' {...register('set_decisivo')}>
                    <option value='set_completo'>Set completo</option>
                    <option value='match_tiebreak'>Match tiebreak</option>
                  </select>
                </label>
                <label className='form-group'>
                  <span className='form-label'>Tiebreak en</span>
                  <input
                    type='number'
                    min='0'
                    max='12'
                    className='form-input'
                    {...register('tiebreak_en')}
                  />
                  <span className='text-[11px]' style={{ color: 'var(--text-muted)' }}>
                    Usa 0 para jugar sin tiebreak.
                  </span>
                </label>
                <label className='form-group'>
                  <span className='form-label'>Tiebreak a</span>
                  <input
                    type='number'
                    min='5'
                    max='99'
                    className='form-input'
                    {...register('tiebreak_puntos')}
                  />
                </label>
                <label className='form-group'>
                  <span className='form-label'>Match tiebreak a</span>
                  <input
                    type='number'
                    min='5'
                    max='99'
                    className='form-input'
                    {...register('match_tiebreak_puntos')}
                  />
                </label>
                <label className='form-group'>
                  <span className='form-label'>Primer servidor</span>
                  <select className='form-input' {...register('servidor_inicial')}>
                    <option value='jugador1'>Participante 1</option>
                    <option value='jugador2'>Participante 2</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Participantes según la modalidad definida por el torneo */}
            {selectedModality === 'individual' ? (
              <>
                <ParticipantSelector
                  label='Participante 1'
                  mode={participant1Mode}
                  modeField='participante1_tipo'
                  fixedField='jugador1_id'
                  sourceField='origen_partido1_id'
                  fixedLabel='Jugador'
                  fixedOptions={jugadoresDisponibles.map((jugador) => ({
                    id: jugador.id,
                    label: `${jugador.nombre} ${jugador.apellido}`,
                  }))}
                  sourceMatches={sourceMatches}
                  control={control}
                  error={errors.jugador1_id || errors.origen_partido1_id}
                />
                <ParticipantSelector
                  label='Participante 2'
                  mode={participant2Mode}
                  modeField='participante2_tipo'
                  fixedField='jugador2_id'
                  sourceField='origen_partido2_id'
                  fixedLabel='Jugador'
                  fixedOptions={jugadoresDisponibles.map((jugador) => ({
                    id: jugador.id,
                    label: `${jugador.nombre} ${jugador.apellido}`,
                  }))}
                  sourceMatches={sourceMatches}
                  control={control}
                  error={errors.jugador2_id || errors.origen_partido2_id}
                />
              </>
            ) : (
              <>
                <ParticipantSelector
                  label='Participante 1'
                  mode={participant1Mode}
                  modeField='participante1_tipo'
                  fixedField='equipo1_id'
                  sourceField='origen_partido1_id'
                  fixedLabel='Pareja'
                  fixedOptions={equiposDisponibles.map((equipo) => ({
                    id: equipo.id,
                    label: equipo.nombre,
                  }))}
                  sourceMatches={sourceMatches}
                  control={control}
                  disabled={useGroups && !distribution}
                  error={errors.equipo1_id || errors.origen_partido1_id}
                />
                <ParticipantSelector
                  label='Participante 2'
                  mode={participant2Mode}
                  modeField='participante2_tipo'
                  fixedField='equipo2_id'
                  sourceField='origen_partido2_id'
                  fixedLabel='Pareja'
                  fixedOptions={equiposDisponibles.map((equipo) => ({
                    id: equipo.id,
                    label: equipo.nombre,
                  }))}
                  sourceMatches={sourceMatches}
                  control={control}
                  disabled={useGroups && !distribution}
                  error={errors.equipo2_id || errors.origen_partido2_id}
                />
              </>
            )}

            <div className='sm:col-span-2 form-group'>
              <label className='form-label'>Observaciones</label>
              <textarea
                className='form-input resize-none'
                rows={3}
                placeholder='Ej.: partido suspendido por lluvia, retiro por lesión...'
                {...register('notas')}
              />
            </div>
        </div>
      </Modal>

      {/* Modal Editor de marcador */}
      <Modal
        isOpen={Boolean(showMarcador)}
        onClose={() => setShowMarcador(null)}
        title='Editar marcador manual'
        subtitle={`${marcadorParticipante1} vs ${marcadorParticipante2}`}
        icon={Radio}
        iconColor='var(--club-clay)'
        iconBg='rgba(234, 88, 12, 0.15)'
        maxWidth='max-w-xl'
        busy={isSubmittingM}
        onSubmit={handleM(onMarcador)}
        footer={
          <>
            <Button
              type='button'
              variant='secondary'
              onClick={() => setShowMarcador(null)}
              disabled={isSubmittingM}
            >
              Cancelar
            </Button>
            <Button type='submit' loading={isSubmittingM}>
              Guardar marcador
            </Button>
          </>
        }
      >
        <div className='space-y-4'>
            <div className='grid grid-cols-2 gap-4'>
              <div className='form-group'>
                <label className='form-label'>Estado</label>
                <select className='form-input' {...regM('estado')}>
                  {ESTADOS.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className='form-group'>
                <label className='form-label'>Ganador</label>
                <select className='form-input' {...regM('ganador')}>
                  <option value=''>Sin ganador</option>
                  <option value='jugador1'>{marcadorParticipante1}</option>
                  <option value='jugador2'>{marcadorParticipante2}</option>
                </select>
              </div>
            </div>

            {/* Sets */}
            <div>
              <p className='form-label mb-1'>Puntos por set</p>
              <p className='text-xs mb-3' style={{ color: 'var(--text-muted)' }}>
                Ingresa los games de cada jugador o equipo. Los tres primeros sets son fijos; los
                sets adicionales se pueden agregar o quitar.
              </p>
              <div className='space-y-2'>
                {setNumbers.map((num) => (
                  <div key={num} className='flex items-center gap-3'>
                    <span
                      className='text-xs font-medium w-12 shrink-0'
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Set {num}
                    </span>
                    <input
                      type='number'
                      min='0'
                      max='99'
                      placeholder={num > 2 ? '/' : '0'}
                      className='form-input w-20 text-center'
                      aria-label={`${marcadorParticipante1}, set ${num}`}
                      {...regM(`set_${num}_j1`)}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>–</span>
                    <input
                      type='number'
                      min='0'
                      max='99'
                      placeholder={num > 2 ? '/' : '0'}
                      className='form-input w-20 text-center'
                      aria-label={`${marcadorParticipante2}, set ${num}`}
                      {...regM(`set_${num}_j2`)}
                    />
                    <div className='form-group flex-row items-center gap-2 m-0'>
                      <input
                        type='checkbox'
                        id={`comp_${num}`}
                        value='true'
                        className='rounded'
                        {...regM(`set_${num}_completado`)}
                      />
                      <label
                        htmlFor={`comp_${num}`}
                        className='text-xs cursor-pointer'
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Completado
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              <div className='flex flex-wrap gap-2 mt-3'>
                <button
                  type='button'
                  onClick={addSet}
                  disabled={setNumbers.length >= MAX_SETS}
                  className='btn-secondary text-sm'
                >
                  <Plus className='w-4 h-4' /> Agregar set
                </button>
                {setNumbers.length > 3 && (
                  <button
                    type='button'
                    onClick={removeLastSet}
                    className='btn-secondary text-sm'
                    style={{ color: '#dc2626' }}
                  >
                    <Trash2 className='w-4 h-4' /> Quitar último set
                  </button>
                )}
              </div>
            </div>
        </div>
      </Modal>

      {/* Filtros y Búsqueda */}
      <div className='card p-4 space-y-3'>
        {filterTorneo !== 'todos' && (
          <div
            className='flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold'
            style={{ backgroundColor: 'var(--color-brand-dim)', color: 'var(--color-brand)' }}
          >
            <span className='flex items-center gap-1.5'>
              <Trophy className='w-4 h-4' />
              Filtrando por torneo: {torneos.find((t) => String(t.id) === String(filterTorneo))?.nombre || `#${filterTorneo}`}
            </span>
            <button
              type='button'
              onClick={() => {
                setFilterTorneo('todos')
                setSearchParams({}, { replace: true })
              }}
              className='hover:underline flex items-center gap-1 font-bold'
            >
              <X className='w-3.5 h-3.5' /> Mostrar todos los torneos
            </button>
          </div>
        )}

        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
          {/* Buscador */}
          <div className='relative'>
            <Search
              className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none'
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type='text'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Buscar por jugador, pareja, torneo o cancha...'
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

          {/* Filtro por Torneo */}
          <div>
            <select
              value={filterTorneo}
              onChange={(e) => {
                setFilterTorneo(e.target.value)
                if (e.target.value === 'todos') {
                  setSearchParams({}, { replace: true })
                } else {
                  setSearchParams({ torneo: e.target.value }, { replace: true })
                }
              }}
              className='form-input text-xs sm:text-sm'
            >
              <option value='todos'>Todos los torneos ({torneos.length})</option>
              <option value='sin_torneo'>Partidos libres (sin torneo)</option>
              {torneos.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Deporte */}
          <div>
            <select
              value={filterDeporte}
              onChange={(e) => setFilterDeporte(e.target.value)}
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
            Mostrando <strong className='text-[var(--text-primary)]'>{filtered.length}</strong> de {partidos.length} partidos
          </span>
          {(search || filterTorneo !== 'todos' || filterDeporte !== 'todos' || filterTab !== 'todos') && (
            <button
              type='button'
              onClick={() => {
                setSearch('')
                setFilterTorneo('todos')
                setFilterDeporte('todos')
                setFilterTab('todos')
                setSearchParams({}, { replace: true })
              }}
              className='text-[var(--color-brand)] hover:underline font-medium'
            >
              Restablecer filtros
            </button>
          )}
        </div>
      </div>

      {/* Filtros por Estado */}
      <Link to='/admin/agenda' className='btn-secondary inline-flex px-4 py-2'>Ver agenda por cancha</Link>
      <Tabs tabs={FILTER_TABS} activeTab={filterTab} onChange={setFilterTab} className='flex-wrap' />

      <BulkDelete
        records={filtered}
        remove={matchService.remove}
        onComplete={fetchAll}
        disabled={loading}
        warning='Se eliminarán los partidos seleccionados y sus resultados, no sus jugadores ni parejas. Los cruces dependientes se validan individualmente.'
        label={(r) => `#${r.id} · ${getParticipantName(r, 1)} / ${getParticipantName(r, 2)}`}
      />

      {/* Lista */}
      <div className='card overflow-hidden'>
        {loading ? (
          Array(4)
            .fill(0)
            .map((_, i) => <div key={i} className='skeleton h-16 m-3 rounded-lg' />)
        ) : filtered.length === 0 ? (
          <p className='text-center py-12 text-sm' style={{ color: 'var(--text-muted)' }}>
            No hay partidos en esta categoría
          </p>
        ) : (
          filtered.map((p, i) => {
            const p1 = getParticipantName(p, 1)
            const p2 = getParticipantName(p, 2)

            return (
              <div
                key={p.id}
                className='list-row'
                style={{
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <p
                      className='text-sm font-semibold truncate'
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {p1 || '?'} <span style={{ color: 'var(--text-muted)' }}>vs</span> {p2 || '?'}
                    </p>
                    {p.estado === 'en_vivo' && <LiveBadge />}
                  </div>
                  <p className='text-xs mt-0.5' style={{ color: 'var(--text-muted)' }}>
                    {p.torneo?.nombre || 'Sin torneo'} · {p.categoria?.nombre || 'Sin categoría'}
                    {p.grupo && ` · ${p.grupo}`}
                    {p.ronda && ` · ${p.ronda}`}
                    {(p.fecha_inicio || p.hora_inicio) &&
                      ` · ${[
                        p.fecha_inicio && formatDate(p.fecha_inicio),
                        formatClockTime(p.hora_inicio),
                      ]
                        .filter(Boolean)
                        .join(' ')}`}
                  </p>
                  {p.juez && (
                    <p
                      className='text-[11px] mt-1 flex items-center gap-1'
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Gavel className='w-3 h-3' /> Juez: {p.juez.nombre} {p.juez.apellido}
                    </p>
                  )}
                  {p.cancha && (
                    <p
                      className='text-[11px] mt-1 flex items-center gap-1'
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <MapPin className='w-3 h-3' /> {p.cancha.nombre}
                    </p>
                  )}
                </div>
                <div className='flex items-center gap-1 shrink-0'>
                  {p.estado !== 'cancelado' && (
                    <>
                      <Link
                        to={`/juez/partido/${p.id}`}
                        className='btn-secondary px-3 py-2 flex items-center gap-1.5 text-xs'
                        style={{ color: 'var(--color-brand)' }}
                        title='Control punto a punto'
                      >
                        <Gavel className='w-4 h-4' />
                        <span className='hidden lg:inline'>Control</span>
                      </Link>
                      <button
                        onClick={() => openMarcador(p)}
                        className='btn-secondary px-3 py-2 flex items-center gap-1.5 text-xs'
                        style={{ color: 'var(--club-clay)' }}
                        title='Editar marcador manualmente'
                      >
                        <Radio className='w-4 h-4' />
                        <span className='hidden lg:inline'>Manual</span>
                      </button>
                    </>
                  )}
                  <MatchAuditButton match={p} />
                  <button
                    onClick={() => openEdit(p)}
                    className='btn-ghost p-2'
                    title='Editar datos del partido'
                    aria-label='Editar datos del partido'
                  >
                    <Pencil className='w-4 h-4' />
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    className='btn-ghost p-2'
                    style={{ color: '#ef4444' }}
                    title='Eliminar partido'
                    aria-label='Eliminar partido'
                  >
                    <Trash2 className='w-4 h-4' />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function getParticipantNames(partido) {
  if (!partido) return ['Participante 1', 'Participante 2']
  return [getParticipantName(partido, 1), getParticipantName(partido, 2)]
}

// Controlled selects retain reset values while their asynchronous options arrive.
function FormSelect({ control, name, rules, children, ...props }) {
  return <Controller control={control} name={name} rules={rules} render={({ field }) => (
    <select {...props} {...field} value={field.value ?? ''}>{children}</select>
  )} />
}

function ParticipantSelector({
  label,
  mode,
  modeField,
  fixedField,
  sourceField,
  fixedLabel,
  fixedOptions,
  sourceMatches,
  control,
  disabled = false,
  error,
}) {
  return (
    <div className='form-group'>
      <label className='form-label'>{label}</label>
      <FormSelect className='form-input' control={control} name={modeField}>
        <option value='fijo'>{fixedLabel} definido</option>
        <option value='ganador' disabled={!sourceMatches.length}>
          Ganador de otro partido
        </option>
      </FormSelect>

      {mode === 'ganador' ? (
        <>
          <FormSelect
            key={sourceField}
            control={control}
            name={sourceField}
            className='form-input'
            rules={{ required: 'Selecciona el partido de origen' }}
          >
            <option value=''>Seleccionar partido</option>
            {sourceMatches.map((match) => (
              <option key={match.id} value={match.id}>
                Gdor: {getMatchupLabel(match)}
              </option>
            ))}
          </FormSelect>
          {sourceMatches.length === 0 && (
            <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
              Primero crea otro partido de la misma categoría.
            </p>
          )}
        </>
      ) : (
        <FormSelect
          key={fixedField}
          control={control}
          name={fixedField}
          disabled={disabled}
          className='form-input'
          rules={{ required: `Selecciona un ${fixedLabel.toLowerCase()}` }}
        >
          <option value=''>Seleccionar</option>
          {fixedOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </FormSelect>
      )}
      {error && <p className='form-error'>{error.message}</p>}
    </div>
  )
}
