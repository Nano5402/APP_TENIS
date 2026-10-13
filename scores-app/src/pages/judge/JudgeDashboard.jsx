import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock3,
  MapPin,
  Pencil,
  Play,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { categoriaService } from '../../services/categoriaService'
import { matchService } from '../../services/matchService'
import { playerService } from '../../services/playerService'
import { sedeService } from '../../services/sedeService'
import { tournamentService } from '../../services/tournamentService'
import useAuthStore from '../../store/useAuthStore'
import useUIStore from '../../store/useUIStore'
import { formatClockTime, formatDate } from '../../utils/formatDate'
import { getParticipantName } from '../../utils/matchParticipants'

const EMPTY_FORM = {
  torneo_id: '',
  categoria_id: '',
  jugador1_id: '',
  jugador2_id: '',
  fecha_inicio: '',
  hora_inicio: '',
  notas: '',
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
}

export default function JudgeDashboard() {
  const [partidos, setPartidos] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [categorias, setCategorias] = useState([])
  const [canchas, setCanchas] = useState([])
  const [torneos, setTorneos] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const { user } = useAuthStore()
  const { addToast } = useUIStore()

  const load = () => {
    setLoading(true)
    Promise.all([
      matchService.getManaged(),
      playerService.getAll(),
      categoriaService.getAll(),
      sedeService.getAll(),
      tournamentService.getAll(),
    ])
      .then(async ([matches, players, categories, locations, tournaments]) => {
        setPartidos(matches.data || [])
        setJugadores(players.data || [])
        setCategorias(categories.data || [])
        setTorneos(
          (tournaments.data || []).filter(
            (tournament) =>
              tournament.modalidad === 'individual' && tournament.estado !== 'cancelado'
          )
        )
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
      .catch((error) =>
        addToast({
          type: 'error',
          title: 'No se pudieron cargar los partidos',
          message: error.message,
        })
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const ordered = useMemo(
    () =>
      [...partidos].sort((a, b) => {
        const priority = { en_vivo: 0, programado: 1, finalizado: 2, cancelado: 3 }
        return (priority[a.estado] ?? 9) - (priority[b.estado] ?? 9)
      }),
    [partidos]
  )

  const selectedTournament = torneos.find(
    (tournament) => String(tournament.id) === String(form.torneo_id)
  )
  const selectedSport = selectedTournament?.deporte || 'tenis'
  const categoriasDisponibles = categorias.filter(
    (category) => category.deporte === selectedSport || category.deporte === 'ambos'
  )
  const jugadoresDisponibles = jugadores.filter(
    (player) => player.deporte === selectedSport || player.deporte === 'ambos'
  )

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (match) => {
    setEditing(match)
    setForm({
      torneo_id: String(match.torneo?.id || ''),
      categoria_id: String(match.categoria?.id || ''),
      jugador1_id: String(match.jugador1?.id || ''),
      jugador2_id: String(match.jugador2?.id || ''),
      fecha_inicio: match.fecha_inicio?.slice(0, 10) || '',
      hora_inicio: match.hora_inicio?.slice(0, 5) || '',
      notas: match.notas || '',
      cancha_id: String(match.cancha?.id || ''),
      mejor_de_sets: String(match.formato?.mejor_de_sets || 3),
      juegos_por_set: String(match.formato?.juegos_por_set || 6),
      diferencia_juegos: String(match.formato?.diferencia_juegos || 2),
      modo_game: match.formato?.modo_game || 'ventaja',
      set_decisivo: match.formato?.set_decisivo || 'set_completo',
      tiebreak_en: String(match.formato?.tiebreak_en ?? 6),
      tiebreak_puntos: String(match.formato?.tiebreak_puntos || 7),
      match_tiebreak_puntos: String(match.formato?.match_tiebreak_puntos || 10),
      servidor_inicial: match.formato?.servidor_inicial || 'jugador1',
    })
    setShowForm(true)
  }

  const updateField = (event) => {
    const { name, value } = event.target
    if (name === 'torneo_id') {
      const tournament = torneos.find((item) => String(item.id) === value)
      setForm((current) => ({
        ...current,
        torneo_id: value,
        categoria_id: tournament?.categoria?.id ? String(tournament.categoria.id) : '',
        jugador1_id: '',
        jugador2_id: '',
      }))
      return
    }
    setForm((current) => ({ ...current, [name]: value }))
  }

  const save = async (event) => {
    event.preventDefault()
    if (
      !form.torneo_id ||
      !form.categoria_id ||
      (!editing?.origen_partido1 && !form.jugador1_id) ||
      (!editing?.origen_partido2 && !form.jugador2_id)
    ) {
      addToast({ type: 'error', title: 'Completa torneo, categoría y participantes' })
      return
    }
    if (form.jugador1_id && form.jugador1_id === form.jugador2_id) {
      addToast({ type: 'error', title: 'Selecciona jugadores diferentes' })
      return
    }

    setSaving(true)
    const payload = {
      estado: editing?.estado || 'programado',
      ...form,
      juez_id: editing?.juez?.id || user?.id,
      origen_partido1_id: editing?.origen_partido1?.id || null,
      origen_partido2_id: editing?.origen_partido2?.id || null,
    }
    try {
      if (editing) await matchService.update(editing.id, { ...payload, expected_control_version: editing.control_version })
      else await matchService.create(payload)
      addToast({ type: 'success', title: editing ? 'Partido actualizado' : 'Partido creado' })
      setShowForm(false)
      load()
    } catch (error) {
      addToast({ type: 'error', title: 'No se pudo guardar', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='space-y-5 animate-fade-up'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p
            className='text-xs font-bold uppercase tracking-[0.16em]'
            style={{ color: 'var(--color-brand)' }}
          >
            Mesa de control
          </p>
          <h1 className='text-2xl font-black mt-1' style={{ color: 'var(--text-primary)' }}>
            Mis partidos
          </h1>
          <p className='text-sm mt-1' style={{ color: 'var(--text-muted)' }}>
            Crea el encuentro y lleva cada punto desde la cancha.
          </p>
        </div>
        <Button onClick={openCreate} size='sm' leftIcon={<Plus className='w-4 h-4' />}>
          Nuevo
        </Button>
      </div>

      {showForm && (
        <form onSubmit={save} className='card p-4 sm:p-5 space-y-4'>
          <div className='flex justify-between items-center'>
            <div>
              <h2 className='font-bold' style={{ color: 'var(--text-primary)' }}>
                {editing ? 'Editar partido' : 'Crear partido'}
              </h2>
              <p className='text-xs mt-1' style={{ color: 'var(--text-muted)' }}>
                El formato queda guardado para que el tanteo se calcule automáticamente.
              </p>
            </div>
            <button type='button' className='btn-ghost p-2' onClick={() => setShowForm(false)}>
              <X className='w-4 h-4' />
            </button>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            <Field label='Torneo'>
              <select
                className='form-input'
                name='torneo_id'
                value={form.torneo_id}
                onChange={updateField}
              >
                <option value=''>Seleccionar</option>
                {torneos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </Field>
            <Field label='Categoría del partido'>
              <select
                className='form-input'
                name='categoria_id'
                value={form.categoria_id}
                onChange={updateField}
              >
                <option value=''>Seleccionar</option>
                {categoriasDisponibles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </Field>

            <PlayerField
              label='Jugador 1'
              name='jugador1_id'
              value={form.jugador1_id}
              players={jugadoresDisponibles}
              source={editing?.origen_partido1}
              onChange={updateField}
            />
            <PlayerField
              label='Jugador 2'
              name='jugador2_id'
              value={form.jugador2_id}
              players={jugadoresDisponibles}
              source={editing?.origen_partido2}
              onChange={updateField}
            />
            <Field label='Fecha (opcional)'>
              <input
                type='date'
                className='form-input'
                name='fecha_inicio'
                value={form.fecha_inicio}
                onChange={updateField}
              />
            </Field>
            <Field label='Hora (opcional)'>
              <input
                type='time'
                className='form-input'
                name='hora_inicio'
                value={form.hora_inicio}
                onChange={updateField}
              />
            </Field>
            <Field label='Cancha (opcional)'>
              <select
                className='form-input'
                name='cancha_id'
                value={form.cancha_id}
                onChange={updateField}
              >
                <option value=''>Sin asignar</option>
                {canchas
                  .filter((court) => [selectedSport, 'ambos'].includes(court.deporte))
                  .map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.nombre} · {court.sede_nombre}
                    </option>
                  ))}
              </select>
            </Field>
          </div>

          <div className='rounded-xl p-4 space-y-3' style={{ backgroundColor: 'var(--bg-hover)' }}>
            <div className='flex items-center gap-2'>
              <SlidersHorizontal className='w-4 h-4' style={{ color: 'var(--color-brand)' }} />
              <h3 className='text-sm font-bold' style={{ color: 'var(--text-primary)' }}>
                Formato del partido
              </h3>
            </div>

            <div className='flex gap-2'>
              <button
                type='button'
                onClick={() => setForm((current) => ({ ...current, set_decisivo: 'match_tiebreak', tiebreak_en: '6', tiebreak_puntos: '7', match_tiebreak_puntos: '10' }))}
                className='flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all'
                style={{
                  backgroundColor: form.set_decisivo === 'match_tiebreak' ? 'var(--color-brand-dim)' : 'var(--bg-primary)',
                  color: form.set_decisivo === 'match_tiebreak' ? 'var(--color-brand)' : 'var(--text-muted)',
                  border: '1px solid var(--border-color)',
                }}
              >
                Normal (3er set = Supertiebreak)
              </button>
              <button
                type='button'
                onClick={() => setForm((current) => ({ ...current, set_decisivo: 'set_completo', tiebreak_en: '6', tiebreak_puntos: '7', match_tiebreak_puntos: '10' }))}
                className='flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all'
                style={{
                  backgroundColor: form.set_decisivo === 'set_completo' ? 'var(--color-brand-dim)' : 'var(--bg-primary)',
                  color: form.set_decisivo === 'set_completo' ? 'var(--color-brand)' : 'var(--text-muted)',
                  border: '1px solid var(--border-color)',
                }}
              >
                Super Game (3er set completo)
              </button>
            </div>

            <div className='grid grid-cols-2 sm:grid-cols-3 gap-3'>
              <Field label='Mejor de'>
                <select
                  className='form-input'
                  name='mejor_de_sets'
                  value={form.mejor_de_sets}
                  onChange={updateField}
                >
                  <option value='1'>1 set</option>
                  <option value='3'>3 sets</option>
                  <option value='5'>5 sets</option>
                </select>
              </Field>
              <Field label='Juegos por set'>
                <input
                  type='number'
                  min='1'
                  max='12'
                  className='form-input'
                  name='juegos_por_set'
                  value={form.juegos_por_set}
                  onChange={updateField}
                />
              </Field>
              <Field label='Diferencia de juegos'>
                <input
                  type='number'
                  min='1'
                  max='6'
                  className='form-input'
                  name='diferencia_juegos'
                  value={form.diferencia_juegos}
                  onChange={updateField}
                />
              </Field>
              <Field label='Games'>
                <select
                  className='form-input'
                  name='modo_game'
                  value={form.modo_game}
                  onChange={updateField}
                >
                  <option value='ventaja'>Con ventaja</option>
                  <option value='sin_ventaja'>Punto decisivo</option>
                </select>
              </Field>
              <Field label='Set decisivo'>
                <select
                  className='form-input'
                  name='set_decisivo'
                  value={form.set_decisivo}
                  onChange={updateField}
                >
                  <option value='set_completo'>Set completo</option>
                  <option value='match_tiebreak'>Match tiebreak</option>
                </select>
              </Field>
              <Field label='Tiebreak al llegar a'>
                <input
                  type='number'
                  min='0'
                  max='12'
                  className='form-input'
                  name='tiebreak_en'
                  value={form.tiebreak_en}
                  onChange={updateField}
                />
                <p className='mt-1 text-[11px]' style={{ color: 'var(--text-muted)' }}>
                  Usa 0 para jugar sin tiebreak.
                </p>
              </Field>
              <Field label='Tiebreak a puntos'>
                <input
                  type='number'
                  min='5'
                  max='99'
                  className='form-input'
                  name='tiebreak_puntos'
                  value={form.tiebreak_puntos}
                  onChange={updateField}
                />
              </Field>
              <Field label='Match tiebreak a'>
                <input
                  type='number'
                  min='5'
                  max='99'
                  className='form-input'
                  name='match_tiebreak_puntos'
                  value={form.match_tiebreak_puntos}
                  onChange={updateField}
                />
              </Field>
              <Field label='Primer servidor'>
                <select
                  className='form-input'
                  name='servidor_inicial'
                  value={form.servidor_inicial}
                  onChange={updateField}
                >
                  <option value='jugador1'>Jugador 1</option>
                  <option value='jugador2'>Jugador 2</option>
                </select>
              </Field>
            </div>
          </div>

          <Field label='Observaciones'>
            <textarea
              className='form-input resize-none'
              rows='2'
              name='notas'
              value={form.notas}
              onChange={updateField}
              placeholder='Suspensión, retiro, condiciones de cancha…'
            />
          </Field>
          <Button type='submit' loading={saving} fullWidth>
            {editing ? 'Guardar cambios' : 'Crear partido'}
          </Button>
        </form>
      )}

      <div className='space-y-3'>
        {loading ? (
          Array.from({ length: 3 }, (_, index) => (
            <div key={index} className='skeleton h-28 rounded-2xl' />
          ))
        ) : ordered.length === 0 ? (
          <div className='card p-10 text-center'>
            <CalendarDays className='w-9 h-9 mx-auto mb-3' style={{ color: 'var(--text-muted)' }} />
            <p className='font-semibold' style={{ color: 'var(--text-primary)' }}>
              Aún no tienes partidos
            </p>
            <p className='text-sm mt-1' style={{ color: 'var(--text-muted)' }}>
              Crea el primero para comenzar.
            </p>
          </div>
        ) : (
          ordered.map((match) => (
            <article
              key={match.id}
              className='card p-4 flex flex-col sm:flex-row sm:items-center gap-4'
            >
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2 mb-1'>
                  <Status estado={match.estado} />
                  <span className='text-xs font-semibold' style={{ color: 'var(--text-muted)' }}>
                    {match.categoria?.nombre}
                  </span>
                </div>
                <h2 className='font-extrabold text-base' style={{ color: 'var(--text-primary)' }}>
                  {getParticipantName(match, 1) || 'Por definir'}
                  <span className='font-normal mx-2' style={{ color: 'var(--text-muted)' }}>
                    vs
                  </span>
                  {getParticipantName(match, 2) || 'Por definir'}
                </h2>
                {(match.fecha_inicio || match.hora_inicio) && (
                  <p
                    className='text-xs mt-2 flex items-center gap-2'
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {match.fecha_inicio && (
                      <>
                        <CalendarDays className='w-3.5 h-3.5' />
                        {formatDate(match.fecha_inicio)}
                      </>
                    )}
                    {match.hora_inicio && (
                      <>
                        <Clock3 className='w-3.5 h-3.5 ml-1' />
                        {formatClockTime(match.hora_inicio)}
                      </>
                    )}
                  </p>
                )}
                {match.cancha?.nombre && (
                  <p
                    className='text-xs mt-1 flex items-center gap-1.5'
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <MapPin className='w-3.5 h-3.5' /> {match.cancha.nombre}
                  </p>
                )}
              </div>
              <div className='flex gap-2'>
                {match.estado === 'programado' && (
                  <button
                    className='btn-secondary px-3 py-2'
                    onClick={() => openEdit(match)}
                    aria-label='Editar partido'
                  >
                    <Pencil className='w-4 h-4' />
                  </button>
                )}
                {match.estado !== 'cancelado' && (
                  <Link
                    to={`/juez/partido/${match.id}`}
                    className='btn-primary flex-1 sm:flex-none justify-center px-4 py-2.5'
                  >
                    <Play className='w-4 h-4' />{' '}
                    {match.estado === 'finalizado' ? 'Ver resumen' : 'Abrir control'}
                  </Link>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className='form-group'>
      <span className='form-label'>{label}</span>
      {children}
    </label>
  )
}

function PlayerField({ label, name, value, players, source, onChange }) {
  if (source) {
    return (
      <Field label={label}>
        <div className='form-input opacity-75'>
          Ganador: {source.participante1 || '?'} / {source.participante2 || '?'}
        </div>
      </Field>
    )
  }
  return (
    <Field label={label}>
      <select className='form-input' name={name} value={value} onChange={onChange}>
        <option value=''>Seleccionar</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {player.nombre} {player.apellido}
          </option>
        ))}
      </select>
    </Field>
  )
}

function Status({ estado }) {
  const labels = {
    en_vivo: 'En vivo',
    programado: 'Programado',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado',
  }
  return (
    <span className={estado === 'en_vivo' ? 'badge-live' : 'badge-atp'}>
      {labels[estado] || estado}
    </span>
  )
}
