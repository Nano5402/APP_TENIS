import BulkDelete from '../../components/ui/BulkDelete'
import { useState, useEffect, useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Radio,
  Gavel,
  SlidersHorizontal,
  MapPin,
  Search,
  Trophy,
  GitBranch,
  Sparkles,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { matchService } from '../../services/matchService'
import MatchAuditButton from '../../components/match/MatchAuditButton'
import MatchPlanner from '../../components/match/MatchPlanner'
import MatchWizardSummary from '../../components/match/MatchWizardSummary'
import TournamentBracket from '../../components/tournament/TournamentBracket'
import {
  findBracketMatchupForTeam,
  getCategoryBracketMatches,
  resolveEffectiveParticipant,
  roundInfo,
} from '../../utils/tournamentBracket'
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
import ModalMarcadorManual from '../../components/match/ModalMarcadorManual'
import ParticipantSelector, { FormSelect } from '../../components/match/ParticipantSelector'
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
const searchable = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
const matchesSearch = (value, query) =>
  searchable(query)
    .split(/\s+/)
    .every((word) => searchable(value).includes(word))
const teamSearch = (team) =>
  [
    team.nombre,
    team.jugador1?.nombre,
    team.jugador1?.apellido,
    team.jugador2?.nombre,
    team.jugador2?.apellido,
  ]
    .filter(Boolean)
    .join(' ')

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
  const [wizardStep, setWizardStep] = useState(0)
  const [showMarcador, setShowMarcador] = useState(null)
  const [editing, setEditing] = useState(null)
  const [linkedBracketMatchId, setLinkedBracketMatchId] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [registrationRetry, setRegistrationRetry] = useState(0)
  const [filterTab, setFilterTab] = useState('todos')
  const [searchParams, setSearchParams] = useSearchParams()
  const [filterTorneo, setFilterTorneo] = useState(() => searchParams.get('torneo') || 'todos')
  const [filterDeporte, setFilterDeporte] = useState('todos')
  const [search, setSearch] = useState('')
  const [setNumbers, setSetNumbers] = useState([1, 2, 3])
  const [showBracketsView, setShowBracketsView] = useState(
    () => searchParams.get('brackets') === '1'
  )
  const [autoOpenBracketBuilder, setAutoOpenBracketBuilder] = useState(
    () => searchParams.get('armar') === '1'
  )
  const [bracketTorneoId, setBracketTorneoId] = useState('')
  const [tournamentStandings, setTournamentStandings] = useState(null)
  const { addToast } = useUIStore()

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({ shouldUnregister: false })
  useEffect(() => {
    if (showForm) setWizardStep(0)
  }, [showForm])
  useEffect(() => {
    if (!showForm) return
    const heading = document.getElementById(`match-step-${wizardStep}`)
    heading?.focus({ preventScroll: true })
    const scroller = heading?.closest('.custom-scrollbar')
    if (scroller) scroller.scrollTop = 0
  }, [wizardStep, showForm])
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
    setRetirements(null)
    setRetirementError('')
    if (showForm && selectedTournamentId)
      tournamentService
        .getRetirements(selectedTournamentId)
        .then((r) => {
          if (active) setRetirements({ ...r.data, torneo: selectedTournamentId })
        })
        .catch((e) => {
          if (active) setRetirementError(e.message || 'No se pudo verificar la participación')
        })
    return () => {
      active = false
    }
  }, [showForm, selectedTournamentId, registrationRetry])
  const availableParticipant = (value, type) => {
    if (!selectedTournamentId) return true
    if (!retirements || retirements.torneo !== selectedTournamentId) return false
    if (!retirements[type]?.includes(Number(value))) return true
    const key = type === 'parejas' ? 'equipo' : 'jugador'
    return (
      String(editing?.torneo?.id) === selectedTournamentId &&
      [editing?.[`${key}1`]?.id, editing?.[`${key}2`]?.id].some(
        (id) => Number(id) === Number(value)
      )
    )
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
      showForm &&
      selectedTournamentId &&
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
  }, [
    showForm,
    selectedTournamentId,
    selectedTournament?.sistema,
    selectedModality,
    registrationRetry,
  ])
  const selectedGroup = watch('grupo') || ''
  const useGroups =
    selectedTournament?.sistema === 'grupos_eliminacion' && selectedModality === 'dobles'
  const selectedPhase = watch('fase') || 'grupos'
  const [registrations, setRegistrations] = useState(null)
  const [registrationError, setRegistrationError] = useState('')
  useEffect(() => {
    let active = true
    setRegistrations(null)
    setRegistrationError('')
    setTournamentStandings(null)
    if (showForm && selectedTournamentId) {
      tournamentService
        .getStandings(selectedTournamentId, true)
        .then((r) => {
          if (active && r?.data) setTournamentStandings(r.data)
        })
        .catch(() => {})
    }
    if (showForm && selectedTournamentId && selectedModality === 'dobles') {
      tournamentService
        .getInscripciones(selectedTournamentId)
        .then((r) => {
          if (active)
            setRegistrations({
              torneo: selectedTournamentId,
              pairs: (r.data.categorias || []).flatMap((c) => c.parejas || []),
            })
        })
        .catch(() => {
          if (active) setRegistrationError('No se pudieron cargar las parejas inscritas.')
        })
    }
    return () => {
      active = false
    }
  }, [showForm, editing, selectedTournamentId, selectedModality, registrationRetry])
  const quickChoices =
    registrations?.torneo === selectedTournamentId
      ? registrations.pairs.flatMap((pair) => {
          if (!availableParticipant(pair.equipo_id, 'parejas')) return []
          if (
            selectedTournament?.categoria?.id &&
            Number(pair.categoria_id) !== Number(selectedTournament.categoria.id)
          )
            return []
          const assignments = useGroups
            ? (distribution?.parejas || []).filter(
                (p) => Number(p.equipo_id) === Number(pair.equipo_id)
              )
            : []
          return (
            assignments.length ? assignments : [{ categoria_id: pair.categoria_id, grupo: '' }]
          ).map((assignment) => ({ ...pair, ...assignment }))
        })
      : []

  const applyMatchScoringToForm = (matchObj) => {
    const fmt = matchObj?.formato || matchObj || {}
    const targetRound = matchObj?.ronda || getValues('ronda') || ''
    const isSuperGameRound = ['Semifinales', 'Final', 'Tercer puesto'].includes(targetRound)
    setValue('mejor_de_sets', String(fmt.mejor_de_sets || 3))
    setValue('juegos_por_set', String(fmt.juegos_por_set || 6))
    setValue('diferencia_juegos', String(fmt.diferencia_juegos || 2))
    setValue('modo_game', fmt.modo_game || 'ventaja')
    setValue('set_decisivo', fmt.set_decisivo || (isSuperGameRound ? 'set_completo' : 'match_tiebreak'))
    setValue('tiebreak_en', String(fmt.tiebreak_en ?? 6))
    setValue('tiebreak_puntos', String(fmt.tiebreak_puntos || 7))
    setValue('match_tiebreak_puntos', String(fmt.match_tiebreak_puntos || 10))
    setValue('servidor_inicial', fmt.servidor_inicial || 'jugador1')
  }

  const chooseQuickPair = (pair, precomputedBracket = null) => {
    // Reset previous participant ids
    for (const field of [
      'equipo1_id',
      'equipo2_id',
      'jugador1_id',
      'jugador2_id',
      'origen_partido1_id',
      'origen_partido2_id',
    ])
      setValue(field, '')

    const currentRound = watch('ronda') || ''
    const isEliminationMode =
      selectedPhase === 'eliminacion' ||
      selectedTournament?.sistema === 'eliminacion_directa'

    const bracketMatchup = isEliminationMode
      ? precomputedBracket ||
        findBracketMatchupForTeam({
          teamId: pair.equipo_id,
          categoryId: pair.categoria_id,
          matches: partidos,
          tournamentId: selectedTournamentId,
          system: selectedTournament?.sistema,
          targetRound: currentRound,
        })
      : null

    setValue('categoria_id', String(pair.categoria_id), { shouldValidate: true })
    setValue('participante1_tipo', 'fijo')
    setValue('equipo1_id', String(pair.equipo_id), { shouldValidate: true })

    if (isEliminationMode && bracketMatchup?.hasCategoryBracket && bracketMatchup?.inBracket) {
      // Esta categoría ya tiene su cuadro eliminatorio (ej. 5ta):
      // Cambiamos automáticamente a fase eliminatoria y ponemos el único rival contemplado en el bracket
      const targetRound = bracketMatchup.ronda || currentRound || 'Cuartos de final'
      setValue('fase', 'eliminacion', { shouldValidate: true })
      setValue('grupo', '')
      setValue('ronda', targetRound, {
        shouldValidate: true,
      })
      setLinkedBracketMatchId(bracketMatchup.matchId || null)

      if (['Semifinales', 'Final', 'Tercer puesto'].includes(targetRound)) {
        setValue('set_decisivo', 'set_completo', { shouldValidate: true })
      } else if (!bracketMatchup.match?.set_decisivo && !bracketMatchup.match?.formato?.set_decisivo) {
        setValue('set_decisivo', 'match_tiebreak', { shouldValidate: true })
      }

      if (bracketMatchup.opponentType === 'fijo' && bracketMatchup.opponentTeamId) {
        setValue('participante2_tipo', 'fijo')
        setValue('origen_partido2_id', '')
        setValue('equipo2_id', String(bracketMatchup.opponentTeamId), { shouldValidate: true })
      } else if (
        bracketMatchup.opponentType === 'ganador' &&
        bracketMatchup.opponentSourceMatchId
      ) {
        setValue('participante2_tipo', 'ganador')
        setValue('equipo2_id', '')
        setValue('origen_partido2_id', String(bracketMatchup.opponentSourceMatchId), {
          shouldValidate: true,
        })
      } else {
        setValue('participante2_tipo', 'por_definir')
        setValue('equipo2_id', '')
        setValue('origen_partido2_id', '')
      }

      const existingM = bracketMatchup.match
      if (existingM) {
        if (existingM.fecha_inicio && !getValues('fecha_inicio')) {
          setValue('fecha_inicio', existingM.fecha_inicio.slice(0, 10))
        }
        if (existingM.hora_inicio && !getValues('hora_inicio')) {
          setValue('hora_inicio', existingM.hora_inicio.slice(0, 5))
        }
        if (existingM.cancha?.id && !getValues('cancha_id')) {
          setValue('cancha_id', String(existingM.cancha.id))
        }
        if (existingM.juez?.id && !getValues('juez_id')) {
          setValue('juez_id', String(existingM.juez.id))
        }
        if (existingM.notas && !getValues('notas')) {
          setValue('notas', existingM.notas)
        }
        applyMatchScoringToForm(existingM)
      }
    } else {
      // Modo Fase de Grupos (o categoría en eliminación sin bracket armado aún)
      setLinkedBracketMatchId(null)
      const nextPhase =
        selectedTournament?.sistema === 'eliminacion_directa' ? 'eliminacion' : selectedPhase || 'grupos'
      setValue('fase', nextPhase, { shouldValidate: true })
      if (nextPhase === 'grupos') {
        setValue('grupo', pair.grupo || '', { shouldValidate: true })
        setValue('ronda', '')
      } else {
        setValue('grupo', '')
      }
      setValue('participante2_tipo', 'fijo')
    }
  }

  const handleCategorySelectInWizard = (nextCatId) => {
    const normalizedCat = nextCatId ? String(nextCatId) : ''
    setValue('categoria_id', normalizedCat, { shouldValidate: true })

    // Si la pareja seleccionada pertenece a otra categoría, limpiar selección
    const currentEq1 = watch('equipo1_id')
    if (currentEq1) {
      const currentPair = quickChoices.find((p) => String(p.equipo_id) === String(currentEq1))
      if (!normalizedCat || String(currentPair?.categoria_id) !== normalizedCat) {
        setLinkedBracketMatchId(null)
        setValue('equipo1_id', '')
        setValue('equipo2_id', '')
        setValue('origen_partido1_id', '')
        setValue('origen_partido2_id', '')
        setValue('participante1_tipo', 'fijo')
        setValue('participante2_tipo', 'fijo')
      }
    }

    if (normalizedCat) {
      const elimMatches = getCategoryBracketMatches(
        partidos,
        selectedTournamentId,
        normalizedCat,
        selectedTournament?.sistema
      )
      if (selectedPhase === 'eliminacion' || selectedTournament?.sistema === 'eliminacion_directa') {
        setValue('fase', 'eliminacion', { shouldValidate: true })
        setValue('grupo', '')
        const currentRound = watch('ronda') || ''
        if (currentRound) {
          const rKey = roundInfo(currentRound).key
          const existsInCat = elimMatches.some((m) => roundInfo(m.ronda).key === rKey)
          if (!existsInCat) {
            setValue('ronda', '', { shouldValidate: true })
          }
        }
      } else {
        setValue('fase', 'grupos', { shouldValidate: true })
        setValue('ronda', '')
      }
    }
  }

  const handleRoundSelectInWizard = (nextRound) => {
    const normalizedRound = nextRound || ''
    setValue('ronda', normalizedRound, { shouldValidate: true })
    if (['Semifinales', 'Final', 'Tercer puesto'].includes(normalizedRound)) {
      setValue('set_decisivo', 'set_completo', { shouldValidate: true })
    } else {
      setValue('set_decisivo', 'match_tiebreak', { shouldValidate: true })
    }

    const currentEq1 = watch('equipo1_id')
    if (currentEq1 && selectedCategoryId) {
      const pairObj = quickChoices.find(
        (p) =>
          String(p.equipo_id) === String(currentEq1) &&
          String(p.categoria_id) === String(selectedCategoryId)
      )
      const matchup = findBracketMatchupForTeam({
        teamId: currentEq1,
        categoryId: selectedCategoryId,
        matches: partidos,
        tournamentId: selectedTournamentId,
        system: selectedTournament?.sistema,
        targetRound: normalizedRound,
      })
      if (matchup?.hasCategoryBracket) {
        if (matchup.inBracket && matchup.inSelectedRound && pairObj) {
          chooseQuickPair(pairObj, matchup)
        } else {
          // La pareja que estaba seleccionada no participa en esta ronda: limpiar para mostrar solo los de esta ronda
          setLinkedBracketMatchId(null)
          setValue('equipo1_id', '')
          setValue('equipo2_id', '')
          setValue('origen_partido1_id', '')
          setValue('origen_partido2_id', '')
          setValue('participante1_tipo', 'fijo')
          setValue('participante2_tipo', 'fijo')
        }
      }
    }
  }

  const selectBracketMatch = (match, s1, s2) => {
if (isSubmitting || !match) return
    const catId = String(match.categoria?.id ?? match.categoria_id ?? '')
    setLinkedBracketMatchId(Number(match.id))
    setValue('categoria_id', catId, { shouldValidate: true })
    setValue('fase', 'eliminacion', { shouldValidate: true })
    setValue('grupo', '')
    const targetRound = match.ronda || 'Cuartos de final'
    setValue('ronda', targetRound, { shouldValidate: true })
    const isSuperGame = ['Semifinales', 'Final', 'Tercer puesto'].includes(targetRound)
    const defaultDeciding = isSuperGame ? 'set_completo' : 'match_tiebreak'
    setValue('set_decisivo', match.formato?.set_decisivo || match.set_decisivo || defaultDeciding, { shouldValidate: true })

    if (s1?.type === 'fijo' && s1.id) {
      setValue('participante1_tipo', 'fijo')
      setValue('equipo1_id', String(s1.id), { shouldValidate: true })
      setValue('origen_partido1_id', '')
    } else if (s1?.type === 'ganador' && s1.sourceMatchId) {
      setValue('participante1_tipo', 'ganador')
      setValue('equipo1_id', '')
      setValue('origen_partido1_id', String(s1.sourceMatchId), { shouldValidate: true })
    } else {
      setValue('participante1_tipo', 'por_definir')
      setValue('equipo1_id', '')
      setValue('origen_partido1_id', '')
    }

    if (s2?.type === 'fijo' && s2.id) {
      setValue('participante2_tipo', 'fijo')
      setValue('equipo2_id', String(s2.id), { shouldValidate: true })
      setValue('origen_partido2_id', '')
    } else if (s2?.type === 'ganador' && s2.sourceMatchId) {
      setValue('participante2_tipo', 'ganador')
      setValue('equipo2_id', '')
      setValue('origen_partido2_id', String(s2.sourceMatchId), { shouldValidate: true })
    } else {
      setValue('participante2_tipo', 'por_definir')
      setValue('equipo2_id', '')
      setValue('origen_partido2_id', '')
    }

if (match.fecha_inicio) setValue('fecha_inicio', match.fecha_inicio.slice(0, 10))
    if (match.hora_inicio) setValue('hora_inicio', match.hora_inicio.slice(0, 5))
    if (match.cancha?.id) setValue('cancha_id', String(match.cancha.id))
    if (match.juez?.id) setValue('juez_id', String(match.juez.id))
    if (match.notas) setValue('notas', match.notas)
    applyMatchScoringToForm(match)
  }

  const participant1Mode = watch('participante1_tipo') || 'fijo'
  const participant2Mode = watch('participante2_tipo') || 'fijo'
  const sourceMatches = partidos.filter(
    (partido) =>
      !(useGroups && selectedPhase === 'grupos') &&
      selectedTournamentId &&
      String(partido.torneo?.id || '') === selectedTournamentId &&
      (!selectedCategoryId || String(partido.categoria?.id || '') === selectedCategoryId) &&
      (!editing || Number(partido.id) !== Number(editing.id))
  )
  const categoriasDisponibles = categorias.filter(
    (categoria) => categoria.deporte === selectedDeporte || categoria.deporte === 'ambos'
  )
  const jugadoresDisponibles = useMemo(() => {
    const list = jugadores.filter(
      (jugador) => jugador.deporte === selectedDeporte || jugador.deporte === 'ambos'
    )
    return list.filter((p) => availableParticipant(p.id, 'jugadores'))
  }, [jugadores, selectedDeporte, editing, retirements, selectedTournamentId])

  const equiposDisponibles = useMemo(() => {
    const registeredIdsInCategory = new Set(
      (registrations?.pairs || [])
        .filter((p) => String(p.categoria_id) === String(selectedCategoryId))
        .map((p) => Number(p.equipo_id))
    )
    if (editing && String(editing.categoria?.id || '') === String(selectedCategoryId)) {
      if (editing.equipo1?.id) registeredIdsInCategory.add(Number(editing.equipo1.id))
      if (editing.equipo2?.id) registeredIdsInCategory.add(Number(editing.equipo2.id))
    }
    const list = equipos.filter(
      (equipo) =>
        equipo.deporte === selectedDeporte &&
        (useGroups
          ? (selectedPhase !== 'grupos' && registeredIdsInCategory.has(Number(equipo.id))) ||
            distribution?.parejas.some(
              (p) =>
                Number(p.equipo_id) === Number(equipo.id) &&
                String(p.categoria_id) === selectedCategoryId &&
                (selectedPhase !== 'grupos' || p.grupo === selectedGroup)
            )
          : String(equipo.categoria?.id || '') === selectedCategoryId ||
            registeredIdsInCategory.has(Number(equipo.id)))
    )
    return list.filter((p) => availableParticipant(p.id, 'parejas'))
  }, [
    equipos,
    selectedDeporte,
    useGroups,
    distribution,
    registrations,
    selectedCategoryId,
    selectedPhase,
    selectedGroup,
    editing,
    retirements,
    selectedTournamentId,
  ])
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
        const activeTournaments = (tournaments.data || []).filter(
          (tournament) => tournament.estado !== 'cancelado'
        )
        setTorneos(activeTournaments)
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
    if (t && /^\d+$/.test(t)) {
      setBracketTorneoId(t)
    }
    if (searchParams.get('brackets') === '1') {
      setShowBracketsView(true)
    }
    if (searchParams.get('armar') === '1') {
      setShowBracketsView(true)
      setAutoOpenBracketBuilder(true)
    }
    if (searchParams.get('crear') === '1') {
      openCreate()
      const next = new URLSearchParams(searchParams)
      next.delete('crear')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams])

  // Torneos con soporte de fase eliminatoria (brackets)
  const knockoutTournaments = useMemo(
    () =>
      torneos.filter(
        (t) => !t.archivado && ['grupos_eliminacion', 'eliminacion_directa'].includes(t.sistema)
      ),
    [torneos]
  )
  const activeBracketTournament = useMemo(() => {
    if (bracketTorneoId) {
      const found = torneos.find((t) => String(t.id) === String(bracketTorneoId))
      if (found) return found
    }
    if (filterTorneo !== 'todos' && filterTorneo !== 'sin_torneo') {
      const found = torneos.find((t) => String(t.id) === String(filterTorneo))
      if (found) return found
    }
    const withExistingBrackets = knockoutTournaments.find((t) =>
      partidos.some(
        (p) =>
          p.estado !== 'cancelado' &&
          String(p.torneo?.id) === String(t.id) &&
          (t.sistema === 'eliminacion_directa' ||
            String(p.fase || '').toLowerCase() === 'eliminacion')
      )
    )
    return withExistingBrackets || knockoutTournaments[0] || torneos[0] || null
  }, [bracketTorneoId, filterTorneo, knockoutTournaments, torneos, partidos])

  const openCreate = (presetPhase = null) => {
    setSubmitError('')
    setLinkedBracketMatchId(null)
    const selectedTorneo = searchParams.get('torneo') || filterTorneo
    const fallbackTorneo =
      knockoutTournaments[0] || torneos.find((t) => !t.archivado) || torneos[0] || null
    const defaultTorneo = /^\d+$/.test(selectedTorneo)
      ? selectedTorneo
      : fallbackTorneo
        ? String(fallbackTorneo.id)
        : ''
    const initialPhase = presetPhase === 'eliminacion' ? 'eliminacion' : 'grupos'
    reset({
      torneo_id: defaultTorneo,
      deporte: fallbackTorneo?.deporte || 'tenis',
      modalidad: fallbackTorneo?.modalidad || 'individual',
      categoria_id: '',
      estado: 'programado',
      participante1_tipo: 'fijo',
      participante2_tipo: 'fijo',
      fase: initialPhase,
      grupo: '',
      ronda: initialPhase === 'eliminacion' ? 'Cuartos de final' : '',
      juez_id: '',
      cancha_id: '',
      mejor_de_sets: '3',
      juegos_por_set: '6',
      diferencia_juegos: '2',
      modo_game: 'ventaja',
      set_decisivo: 'match_tiebreak',
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
    setLinkedBracketMatchId(null)
    setEditing(partido)
    const tId = partido.torneo?.id ? String(partido.torneo.id) : ''
    const hasP1 = Boolean(partido.equipo1?.id || partido.jugador1?.id)
    const hasP2 = Boolean(partido.equipo2?.id || partido.jugador2?.id)
    const isElim = partido.fase === 'eliminacion'
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
      participante1_tipo: hasP1
        ? 'fijo'
        : partido.origen_partido1
          ? 'ganador'
          : isElim
            ? 'por_definir'
            : 'fijo',
      participante2_tipo: hasP2
        ? 'fijo'
        : partido.origen_partido2
          ? 'ganador'
          : isElim
            ? 'por_definir'
            : 'fijo',
      origen_partido1_id: partido.origen_partido1?.id ? String(partido.origen_partido1.id) : '',
      origen_partido2_id: partido.origen_partido2?.id ? String(partido.origen_partido2.id) : '',
      notas: partido.notas || '',
      juez_id: partido.juez?.id ? String(partido.juez.id) : '',
      cancha_id: partido.cancha?.id ? String(partido.cancha.id) : '',
      mejor_de_sets: String(partido.formato?.mejor_de_sets || 3),
      juegos_por_set: String(partido.formato?.juegos_por_set || 6),
      diferencia_juegos: String(partido.formato?.diferencia_juegos || 2),
      modo_game: partido.formato?.modo_game || 'ventaja',
      set_decisivo: partido.formato?.set_decisivo || (['Semifinales', 'Final', 'Tercer puesto'].includes(partido.ronda) ? 'set_completo' : 'match_tiebreak'),
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

  const validateEncounter = (data) => {
    const isKnockout =
      selectedPhase === 'eliminacion' || selectedTournament?.sistema === 'eliminacion_directa'
    if (useGroups) {
      if (!distribution || groupError)
        throw new Error(groupError || 'Espera a que se carguen los grupos antes de guardar.')
      if (
        selectedPhase === 'grupos' &&
        !distribution.grupos.some(
          (g) => String(g.categoria_id) === selectedCategoryId && g.nombre === data.grupo
        )
      ) {
        throw new Error('Selecciona un grupo válido de esta categoría.')
      }
    }
    for (const side of [1, 2]) {
      const mode = data[`participante${side}_tipo`]
      if (isKnockout && mode === 'por_definir') {
        continue
      }
      if (mode === 'ganador') {
        if (
          !sourceMatches.some(
            (match) => String(match.id) === String(data[`origen_partido${side}_id`])
          )
        )
          throw new Error(`Selecciona un partido de origen válido para el participante ${side}.`)
        continue
      }
      const options = selectedModality === 'dobles' ? equiposDisponibles : jugadoresDisponibles
      const id = data[`${selectedModality === 'dobles' ? 'equipo' : 'jugador'}${side}_id`]
      if (!options.some((option) => String(option.id) === String(id))) {
        throw new Error(
          `El participante ${side} no pertenece a la selección actual. Revisa categoría y grupo.`
        )
      }
    }
    if (data.participante1_tipo === 'fijo' && data.participante2_tipo === 'fijo') {
      const prefix = selectedModality === 'dobles' ? 'equipo' : 'jugador'
      if (String(data[`${prefix}1_id`]) === String(data[`${prefix}2_id`])) {
        throw new Error('Selecciona dos participantes diferentes.')
      }
      if (selectedModality === 'dobles') {
        const first = equipos.find((team) => String(team.id) === String(data.equipo1_id))
        const second = equipos.find((team) => String(team.id) === String(data.equipo2_id))
        const members = [first?.jugador1?.id, first?.jugador2?.id].filter(Boolean).map(Number)
        if (
          [second?.jugador1?.id, second?.jugador2?.id].some(
            (id) => id && members.includes(Number(id))
          )
        ) {
          throw new Error('Las parejas no pueden compartir un jugador en el mismo partido.')
        }
      }
    }
  }
  const openManualSelection = () => {
    const details = document.getElementById('manual-match-selection')
    if (details) details.open = true
  }
  const nextWizardStep = async () => {
    setSubmitError('')
    if (wizardStep === 0) {
      const data = getValues()
      const prefix = selectedModality === 'dobles' ? 'equipo' : 'jugador'
      const fields = [
        !selectedTournament?.categoria?.id && 'categoria_id',
        useGroups && selectedPhase === 'grupos' && 'grupo',
        ...[1, 2].map((side) => {
          const mode = data[`participante${side}_tipo`]
          if (mode === 'por_definir') return null
          return mode === 'ganador' ? `origen_partido${side}_id` : `${prefix}${side}_id`
        }),
      ].filter(Boolean)
      if (!(await trigger(fields, { shouldFocus: false }))) {
        openManualSelection()
        setSubmitError('Completa la categoría y los dos participantes antes de continuar.')
        return
      }
      try {
        validateEncounter(data)
      } catch (e) {
        setSubmitError(e.message)
        return
      }
      setWizardStep(1)
    } else if (wizardStep === 1) {
      await handleSubmit(
        () => setWizardStep(2),
        () => {
          setSubmitError('Revisa los campos señalados antes de confirmar.')
          setWizardStep(0)
          openManualSelection()
        }
      )()
    }
  }
  const participantSummary = [1, 2].map((side) => {
    const mode = watch(`participante${side}_tipo`)
    if (mode === 'por_definir') return 'Por definir (Cupo abierto)'
    if (mode === 'ganador') {
      const source = partidos.find(
        (p) => String(p.id) === String(watch(`origen_partido${side}_id`))
      )
      return source ? `Ganador: ${getMatchupLabel(source)}` : ''
    }
    if (selectedModality === 'dobles')
      return equipos.find((p) => String(p.id) === String(watch(`equipo${side}_id`)))?.nombre || ''
    const p = jugadores.find((p) => String(p.id) === String(watch(`jugador${side}_id`)))
    return p ? `${p.nombre} ${p.apellido}` : ''
  })
  const wizardSummary = {
    tournament: selectedTournament?.nombre,
    category: categorias.find((c) => String(c.id) === selectedCategoryId)?.nombre,
    group: selectedGroup,
    phase: selectedPhase,
    participants: participantSummary,
    date: watch('fecha_inicio'),
    time: watch('hora_inicio'),
    court: canchas.find((c) => String(c.id) === String(watch('cancha_id')))?.nombre,
    judge: jueces.find((j) => String(j.id) === String(watch('juez_id')))?.nombre,
    format: `Mejor de ${watch('mejor_de_sets') || 3} sets · ${watch('juegos_por_set') || 6} juegos · ${watch('set_decisivo') === 'match_tiebreak' ? 'Supertiebreak decisivo' : 'Set decisivo completo'}`,
  }
  const onSubmit = async (data, createAnother = false) => {
    setSubmitError('')
    try {
      validateEncounter(data)
      const p1Fixed = data.participante1_tipo === 'fijo'
      const p2Fixed = data.participante2_tipo === 'fijo'
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
        participante1_tipo: data.participante1_tipo,
        participante2_tipo: data.participante2_tipo,
        jugador1_id: p1Fixed ? data.jugador1_id : null,
        jugador2_id: p2Fixed ? data.jugador2_id : null,
        equipo1_id: p1Fixed ? data.equipo1_id : null,
        equipo2_id: p2Fixed ? data.equipo2_id : null,
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

      if (editing) {
        const origSrc1 = editing.origen_partido1?.id || editing.origen_partido1_id || null
        const origSrc2 = editing.origen_partido2?.id || editing.origen_partido2_id || null
        const origP1 = editing.equipo1?.id || editing.jugador1?.id || null
        const origP2 = editing.equipo2?.id || editing.jugador2?.id || null
        const nextP1 = payload.equipo1_id || payload.jugador1_id || null
        const nextP2 = payload.equipo2_id || payload.jugador2_id || null
        if (origSrc1 && !payload.origen_partido1_id && p1Fixed && String(nextP1) === String(origP1)) {
          payload.origen_partido1_id = origSrc1
        }
        if (origSrc2 && !payload.origen_partido2_id && p2Fixed && String(nextP2) === String(origP2)) {
          payload.origen_partido2_id = origSrc2
        }
      }

      const linkedMatch =
        !editing && linkedBracketMatchId
          ? partidos.find(
              (m) =>
                Number(m.id) === Number(linkedBracketMatchId) &&
Number(m.torneo?.id ?? m.torneo_id) === Number(payload.torneo_id) &&
                String(m.categoria?.id ?? m.categoria_id ?? '') === String(selectedCategoryId) &&
                data.fase === 'eliminacion'
            )
          : null


      if (linkedMatch) {
        const allMap = new Map(partidos.map((m) => [Number(m.id), m]))
        const slot1 = resolveEffectiveParticipant(linkedMatch, 1, allMap)
        const slot2 = resolveEffectiveParticipant(linkedMatch, 2, allMap)
        const origSrc1 =
          linkedMatch.origen_partido1?.id || linkedMatch.origen_partido1_id || null
        const origSrc2 =
          linkedMatch.origen_partido2?.id || linkedMatch.origen_partido2_id || null

        if (
          selectedModality === 'dobles' &&
          slot2.id &&
          Number(payload.equipo1_id) === Number(slot2.id) &&
          (!payload.equipo2_id || Number(payload.equipo2_id) === Number(slot1.id || 0))
        ) {
          // El admin seleccionó primero a la pareja del lado 2 de la llave:
          // conservamos el orden original (lado 1 / lado 2) de la llave en el árbol
          const tmpEq = payload.equipo1_id
          payload.equipo1_id = payload.equipo2_id
          payload.equipo2_id = tmpEq
          const tmpSrc = payload.origen_partido1_id
          payload.origen_partido1_id = payload.origen_partido2_id
          payload.origen_partido2_id = tmpSrc
const tmpMode = payload.participante1_tipo
            payload.participante1_tipo = payload.participante2_tipo
            payload.participante2_tipo = tmpMode
        }
        if (
          origSrc1 &&
          !payload.origen_partido1_id &&
          (!payload.equipo1_id || Number(payload.equipo1_id) === Number(slot1.id || 0))
        ) {
          payload.origen_partido1_id = origSrc1
        }
        if (
          origSrc2 &&
          !payload.origen_partido2_id &&
          (!payload.equipo2_id || Number(payload.equipo2_id) === Number(slot2.id || 0))
        ) {
          payload.origen_partido2_id = origSrc2
        }
      }

      const targetMatch = editing || linkedMatch || null
      // Save rechecks on the server under a scheduling lock; this preview is not authoritative.
      const review = await matchService.checkSchedule({
        ...payload,
        id: targetMatch?.id || null,
      })
      const checks = review.data || {}
      if (checks.conflicts?.length)
        throw new Error(checks.conflicts.map((c) => c.message).join('\n'))
      if (
        checks.warnings?.length &&
        !(await confirm({
          title: 'Revisa duración y descanso',
          message: `${checks.warnings.map((w) => w.message).join('\n')}\nReferencia orientativa: 2 horas entre inicios, no una duración obligatoria. ¿Guardar esta programación?`,
          confirmLabel: 'Guardar programación',
        }))
      )
        return
      if (targetMatch) {
        await matchService.update(targetMatch.id, {
          ...payload,
          expected_control_version: targetMatch.control_version,
        })
        addToast({
          type: 'success',
          title: linkedMatch ? 'Llave del bracket programada' : 'Partido actualizado',
        })
      } else {
        await matchService.create(payload)
        addToast({ type: 'success', title: 'Partido creado' })
      }
      setLinkedBracketMatchId(null)
      if (createAnother && !editing) {
        setWizardStep(0)
        reset({
          ...data,
          equipo1_id: '',
          equipo2_id: '',
          jugador1_id: '',
          jugador2_id: '',
          origen_partido1_id: '',
          origen_partido2_id: '',
          participante1_tipo: 'fijo',
          participante2_tipo: 'fijo',
          fecha_inicio: '',
          hora_inicio: '',
          notas: '',
          estado: 'programado',
        })
      } else setShowForm(false)
      await fetchAll()
    } catch (err) {
      setSubmitError(
        err.message || 'No se pudo guardar el partido. Tus datos se conservan; vuelve a intentarlo.'
      )
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
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
            Partidos y Cuadros Eliminatorios
          </h1>
          <p className='text-sm mt-0.5' style={{ color: 'var(--text-muted)' }}>
            {partidos.length} partido{partidos.length !== 1 ? 's' : ''} registrado
            {partidos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {knockoutTournaments.length > 0 && (
            <>
              <button
                type='button'
                onClick={() => {
                  setAutoOpenBracketBuilder(true)
                  setShowBracketsView(true)
                }}
                className='btn-secondary px-3.5 py-2 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 border-[var(--color-brand)] text-[var(--color-brand)]'
              >
                <Trophy className='w-4 h-4' />
                <span>Armar Brackets</span>
              </button>
              <button
                type='button'
                onClick={() => {
                  setAutoOpenBracketBuilder(false)
                  setShowBracketsView((v) => !v)
                }}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 border transition-all ${
                  showBracketsView
                    ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                    : 'btn-secondary'
                }`}
              >
                <GitBranch className='w-4 h-4' />
                <span>{showBracketsView ? 'Ocultar Cuadros' : 'Ver Cuadros'}</span>
              </button>
            </>
          )}
          <Button onClick={() => openCreate()} leftIcon={<Plus className='w-4 h-4' />}>
            Nuevo partido
          </Button>
        </div>
      </div>

      {/* Acceso directo y gestor integrado de Cuadros Eliminatorios (Brackets) */}
      {knockoutTournaments.length > 0 && !showBracketsView && (
        <div className='card p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 border border-emerald-500/30 bg-emerald-500/5'>
          <div className='flex items-center gap-3 min-w-0'>
            <div className='w-10 h-10 rounded-xl bg-emerald-500/15 text-[var(--color-brand)] flex items-center justify-center shrink-0'>
              <Trophy className='w-5 h-5' />
            </div>
            <div className='min-w-0'>
              <p className='text-xs sm:text-sm font-extrabold text-[var(--text-primary)]'>
                Cuadros de Fase Eliminatoria (Brackets estilo Champions)
              </p>
              <p className='text-xs text-[var(--text-secondary)]'>
                Arma todas las llaves por categoría (desde Dieciseisavos, Octavos, Cuartos o Semis) o
                programa llaves individuales.
              </p>
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-2 shrink-0'>
            <button
              type='button'
              onClick={() => openCreate('eliminacion')}
              className='btn-secondary px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5'
            >
              <Plus className='w-3.5 h-3.5' /> Partido de llave
            </button>
            <button
              type='button'
              onClick={() => {
                setAutoOpenBracketBuilder(false)
                setShowBracketsView(true)
              }}
              className='btn-primary px-3.5 py-1.5 text-xs font-bold inline-flex items-center gap-1.5'
            >
              <GitBranch className='w-3.5 h-3.5' /> Ver Cuadros Creados
            </button>
            <button
              type='button'
              onClick={() => {
                setAutoOpenBracketBuilder(true)
                setShowBracketsView(true)
              }}
              className='btn-secondary px-3.5 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 text-[var(--color-brand)] border-[var(--color-brand)]/40'
            >
              <Sparkles className='w-3.5 h-3.5' /> Armar / Configurar
            </button>
          </div>
        </div>
      )}

      {showBracketsView && activeBracketTournament && (
        <div className='card p-3 sm:p-4 space-y-3 border-2 border-[var(--color-brand)]/40'>
          <div className='flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--border-color)]'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-xs font-extrabold uppercase tracking-wider text-[var(--color-brand)] flex items-center gap-1.5'>
                <Trophy className='w-4 h-4' /> Gestor de Brackets:
              </span>
              {knockoutTournaments.length > 1 ? (
                <select
                  aria-label='Seleccionar torneo para ver brackets'
                  className='form-input text-xs py-1 px-2.5 font-bold'
                  value={activeBracketTournament.id}
                  onChange={(e) => setBracketTorneoId(e.target.value)}
                >
                  {knockoutTournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <strong className='text-xs sm:text-sm font-extrabold text-[var(--text-primary)]'>
                  {activeBracketTournament.nombre}
                </strong>
              )}
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={() => openCreate('eliminacion')}
                className='btn-secondary px-2.5 py-1 text-xs font-bold inline-flex items-center gap-1'
              >
                <Plus className='w-3.5 h-3.5' /> Crear partido de llave
              </button>
              <button
                type='button'
                onClick={() => {
                  setShowBracketsView(false)
                  setAutoOpenBracketBuilder(false)
                }}
                className='btn-ghost p-1.5 rounded-lg text-xs'
                title='Cerrar vista de cuadros'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
          </div>

          <TournamentBracket
            key={`${activeBracketTournament.id}-${autoOpenBracketBuilder ? 'open' : 'view'}`}
            matches={partidos.filter(
              (p) => String(p.torneo?.id) === String(activeBracketTournament.id)
            )}
            system={activeBracketTournament.sistema}
            management={true}
            tournament={activeBracketTournament}
            onRefresh={fetchAll}
            initialOpenBuilder={autoOpenBracketBuilder}
          />
        </div>
      )}

      {/* Modal nuevo/editar */}
      {searchParams.get('partido') && (
        <div className='card p-3 text-sm flex flex-wrap gap-3 items-center justify-between'>
          <span>Revisando partido #{searchParams.get('partido')}</span>
          <button
            type='button'
            className='btn-secondary px-3 py-2'
            onClick={() =>
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev)
                next.delete('partido')
                return next
              })
            }
          >
            Ver los demás partidos
          </button>
        </div>
      )}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Editar partido' : 'Nuevo partido'}
        subtitle={
          editing
            ? editing.torneo?.nombre
              ? `${editing.torneo.nombre} · Modifica los datos del encuentro`
              : 'Partido libre · Modifica los datos del encuentro'
            : 'Programa un nuevo partido libre, de fase de grupos o de llave eliminatoria'
        }
        icon={editing ? Pencil : Plus}
        maxWidth={editing ? 'max-w-3xl' : 'max-w-6xl'}
        busy={isSubmitting}
        onSubmit={
          editing || wizardStep === 2
            ? handleSubmit(
                (data) => onSubmit(data),
                () => {
                  setWizardStep(0)
                  openManualSelection()
                  setSubmitError('Revisa los campos señalados.')
                }
              )
            : (event) => {
                event.preventDefault()
                nextWizardStep()
              }
        }
        footer={
          <div className='flex flex-wrap justify-end gap-2 w-full'>
            <Button
              type='button'
              variant='secondary'
              onClick={() => setShowForm(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            {!editing && wizardStep > 0 && (
              <Button
                type='button'
                variant='secondary'
                disabled={isSubmitting}
                onClick={() => {
                  setSubmitError('')
                  setWizardStep((s) => s - 1)
                }}
              >
                Volver
              </Button>
            )}
            {!editing && wizardStep < 2 && (
              <Button type='button' onClick={nextWizardStep} disabled={isSubmitting}>
                {wizardStep === 0 ? 'Continuar a programación' : 'Revisar partido'}
              </Button>
            )}
            {!editing && wizardStep === 2 && (
              <Button
                type='button'
                variant='secondary'
                disabled={isSubmitting || (useGroups && (!distribution || !!groupError))}
                onClick={handleSubmit((data) => onSubmit(data, true))}
              >
                Guardar y crear otro
              </Button>
            )}
            {(editing || wizardStep === 2) && (
              <Button
                type='submit'
                loading={isSubmitting}
                disabled={useGroups && (!distribution || !!groupError)}
              >
                {editing ? 'Guardar cambios' : linkedBracketMatchId ? 'Guardar programación' : 'Crear partido'}
              </Button>
            )}
          </div>
        }
      >
        {!editing && (
          <nav className='match-wizard-nav' aria-label='Pasos para crear el partido'>
            {['Encuentro', 'Programación', 'Confirmar'].map((label, i) => (
              <button
                key={label}
                type='button'
                aria-current={wizardStep === i ? 'step' : undefined}
                disabled={isSubmitting || i > wizardStep}
                onClick={() => setWizardStep(i)}
              >
                <span>{i + 1}</span>
                {label}
              </button>
            ))}
          </nav>
        )}
        {submitError && (
          <p role='alert' className='form-error'>
            {submitError}
          </p>
        )}
        <div className={editing ? '' : `match-wizard ${wizardStep === 2 ? 'is-review' : ''}`}>
          <div className='match-wizard-content'>
            <section
              hidden={!editing && wizardStep !== 0}
              className='match-wizard-panel'
              aria-label='Encuentro'
            >
              {!editing && (
                <h3 id='match-step-0' tabIndex={-1}>
                  Selecciona el encuentro
                </h3>
              )}
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
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
                    {torneos
                      .filter((t) => !t.archivado || Number(editing?.torneo?.id) === Number(t.id))
                      .map((tournament) => (
                        <option key={tournament.id} value={tournament.id}>
                          {tournament.nombre} ·{' '}
                          {tournament.modalidad === 'dobles' ? 'Dobles' : 'Individual'} ·{' '}
                          {tournament.categoria?.nombre || 'Todas las categorías'}
                        </option>
                      ))}
                  </select>
                  {errors.torneo_id && <p className='form-error'>{errors.torneo_id.message}</p>}
                  {retirementError && (
                    <p role='alert' className='form-error'>
                      {retirementError}. Cierra y vuelve a abrir el formulario para reintentar.
                    </p>
                  )}
                </div>

                {selectedTournament &&
                  ['grupos_eliminacion', 'eliminacion_directa'].includes(
                    selectedTournament.sistema
                  ) && (
                    <div className='sm:col-span-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3.5 space-y-3'>
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]'>
                            Fase del partido:
                          </span>
                          {selectedTournament.sistema === 'grupos_eliminacion' ? (
                            <div className='inline-flex rounded-xl p-0.5 bg-[var(--bg-card)] border border-[var(--border-color)]'>
                              {[
                                ['grupos', 'Fase de grupos'],
                                ['eliminacion', 'Fase eliminatoria (Brackets)'],
                              ].map(([pVal, pLabel]) => (
                                <button
                                  key={pVal}
                                  type='button'
                                  onClick={() => {
                                    setValue('fase', pVal, { shouldValidate: true })
                                    if (pVal === 'eliminacion') {
                                      setValue('grupo', '')
                                    } else {
                                      setValue('ronda', '')
                                      setLinkedBracketMatchId(null)
                                      const currentEq1 = watch('equipo1_id')
                                      if (currentEq1) {
                                        const currentPair = quickChoices.find((p) => String(p.equipo_id) === String(currentEq1))
                                        if (currentPair?.grupo) {
                                          setValue('grupo', currentPair.grupo, { shouldValidate: true })
                                        }
                                      }
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    selectedPhase === pVal
                                      ? 'bg-[var(--color-brand)] text-white'
                                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                  }`}
                                >
                                  {pLabel}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className='px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-[var(--color-brand)]'>
                              Eliminación directa
                            </span>
                          )}
                        </div>

                        <button
                          type='button'
                          onClick={() => {
                            setBracketTorneoId(String(selectedTournamentId))
                            setShowForm(false)
                            setAutoOpenBracketBuilder(true)
                            setShowBracketsView(true)
                          }}
                          className='btn-secondary px-2.5 py-1 text-xs font-extrabold text-[var(--color-brand)] border-[var(--color-brand)]/40 inline-flex items-center gap-1'
                        >
                          <Sparkles size={13} /> Armar cuadro completo por categoría →
                        </button>
                      </div>

                      {(selectedPhase === 'eliminacion' ||
                        selectedTournament.sistema === 'eliminacion_directa') && (
                        <div className='space-y-3 pt-2 border-t border-[var(--border-color)]'>
                          {/* 1. Píldoras de Categoría visibles directamente */}
                          {!selectedTournament.categoria && categoriasDisponibles.length > 0 && (
                            <div className='space-y-1.5'>
                              <span className='block text-[11px] font-bold text-[var(--text-secondary)]'>
                                1. Categoría de la llave (filtra solo parejas en eliminación de esa categoría):
                              </span>
                              <div className='flex flex-wrap gap-1.5'>
                                {categoriasDisponibles
                                  .filter((cat) => {
                                    const hasPairsInTournament = quickChoices.some(
                                      (p) => String(p.categoria_id) === String(cat.id)
                                    )
                                    const hasMatchesInTournament = partidos.some(
                                      (m) =>
                                        String(m.torneo?.id) === String(selectedTournamentId) &&
                                        String(m.categoria?.id) === String(cat.id)
                                    )
                                    return (
                                      !quickChoices.length ||
                                      hasPairsInTournament ||
                                      hasMatchesInTournament
                                    )
                                  })
                                  .map((cat) => {
                                    const isCatActive = String(selectedCategoryId) === String(cat.id)
                                    const elimCount = partidos.filter(
                                      (m) =>
                                        m.estado !== 'cancelado' &&
                                        String(m.torneo?.id) === String(selectedTournamentId) &&
                                        String(m.categoria?.id) === String(cat.id) &&
                                        (m.fase === 'eliminacion' ||
                                          selectedTournament.sistema === 'eliminacion_directa')
                                    ).length
                                    return (
                                      <button
                                        key={cat.id}
                                        type='button'
                                        onClick={() =>
                                          handleCategorySelectInWizard(
                                            isCatActive ? '' : String(cat.id)
                                          )
                                        }
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors inline-flex items-center gap-1.5 ${
                                          isCatActive
                                            ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                                            : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--color-brand)]'
                                        }`}
                                      >
                                        <span>{cat.nombre}</span>
                                        <span className='opacity-75 text-[10px]'>
                                          ({elimCount > 0 ? `${elimCount} llaves` : 'En Grupos'})
                                        </span>
                                      </button>
                                    )
                                  })}
                              </div>
                            </div>
                          )}

                          {/* 2. Píldoras de Ronda eliminatoria */}
                          <div className='space-y-1.5'>
                            <span className='block text-[11px] font-bold text-[var(--text-secondary)]'>
                              2. Ronda de la llave (muestra solo las parejas de esa ronda):
                            </span>
                            <div className='flex flex-wrap gap-1.5'>
                              <button
                                type='button'
                                onClick={() => handleRoundSelectInWizard('')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                                  !watch('ronda')
                                    ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                                    : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--color-brand)]'
                                }`}
                              >
                                Todas las rondas
                              </button>
                              {[
                                'Dieciseisavos',
                                'Octavos de final',
                                'Cuartos de final',
                                'Semifinales',
                                'Final',
                                'Tercer puesto',
                              ].map((rLabel) => {
                                const activeRound = watch('ronda') === rLabel
                                const countInRound = selectedCategoryId
                                  ? partidos.filter(
                                      (m) =>
                                        m.estado !== 'cancelado' &&
                                        String(m.torneo?.id) === String(selectedTournamentId) &&
                                        String(m.categoria?.id) === String(selectedCategoryId) &&
                                        roundInfo(m.ronda).key === roundInfo(rLabel).key
                                    ).length
                                  : partidos.filter(
                                      (m) =>
                                        m.estado !== 'cancelado' &&
                                        String(m.torneo?.id) === String(selectedTournamentId) &&
                                        (m.fase === 'eliminacion' ||
                                          selectedTournament.sistema === 'eliminacion_directa') &&
                                        roundInfo(m.ronda).key === roundInfo(rLabel).key
                                    ).length
                                return (
                                  <button
                                    key={rLabel}
                                    type='button'
                                    onClick={() =>
                                      handleRoundSelectInWizard(activeRound ? '' : rLabel)
                                    }
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors inline-flex items-center gap-1 ${
                                      activeRound
                                        ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                                        : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--color-brand)]'
                                    }`}
                                  >
                                    <span>{rLabel}</span>
                                    {countInRound > 0 && (
                                      <span className='text-[10px] opacity-80'>
                                        ({countInRound} {countInRound === 1 ? 'llave' : 'llaves'})
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* 3. Si ya existen llaves en esa categoría y ronda, mostrarlas para poder editarlas en 1 clic */}
                          {selectedCategoryId &&
                            watch('ronda') &&
                            (() => {
                              const existingRoundMatches = partidos.filter(
                                (m) =>
                                  m.estado !== 'cancelado' &&
                                  String(m.torneo?.id) === String(selectedTournamentId) &&
                                  String(m.categoria?.id) === String(selectedCategoryId) &&
                                  roundInfo(m.ronda).key === roundInfo(watch('ronda')).key &&
                                  (!editing || Number(m.id) !== Number(editing.id))
                              )
                              if (!existingRoundMatches.length) return null
                              return (
                                <div className='p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-1.5'>
                                  <p className='text-[11px] font-bold text-[var(--text-secondary)]'>
                                    💡 Ya existen {existingRoundMatches.length} llave(s) en{' '}
                                    <strong>{watch('ronda')}</strong> de esta categoría. Toca una si
                                    deseas cargarla o elige directamente una pareja de esta ronda
                                    abajo:
                                  </p>
                                  <div className='flex flex-wrap gap-1.5'>
                                    {existingRoundMatches.map((m, idx) => {
                                      const allMap = new Map(
                                        partidos.map((item) => [Number(item.id), item])
                                      )
                                      const s1 = resolveEffectiveParticipant(m, 1, allMap)
                                      const s2 = resolveEffectiveParticipant(m, 2, allMap)
                                      return (
                                        <button
                                          key={m.id}
                                          type='button'
                                          onClick={() => selectBracketMatch(m, s1, s2)}
                                          className='px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--color-brand)] text-left'
                                        >
                                          <strong className='text-[var(--color-brand)]'>
                                            Llave #{idx + 1} (#{m.id}):
                                          </strong>{' '}
                                          {s1.nombre} vs {s2.nombre}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })()}
                        </div>
                      )}
                    </div>
                  )}

                {!editing && selectedTournamentId && selectedModality === 'dobles' && (
                  <MatchPlanner
                    choices={quickChoices}
                    firstId={watch('equipo1_id')}
                    secondId={watch('equipo2_id')}
                    firstMode={participant1Mode}
                    secondMode={participant2Mode}
                    firstSourceId={watch('origen_partido1_id')}
                    secondSourceId={watch('origen_partido2_id')}
                    sourceMatches={sourceMatches}
                    standings={tournamentStandings}
                    categoryId={selectedCategoryId}
                    group={selectedGroup}
                    phase={selectedPhase}
                    round={watch('ronda') || ''}
                    system={selectedTournament?.sistema || ''}
                    useGroups={useGroups}
                    tournamentId={selectedTournamentId}
                    matches={partidos}
                    linkedBracketMatchId={linkedBracketMatchId}
                    busy={isSubmitting}
                    loading={!registrations || !retirements || (useGroups && !distribution)}
                    error={registrationError || retirementError || groupError}
                    onRetry={() => setRegistrationRetry((n) => n + 1)}
                    onFirst={chooseQuickPair}
                    onSecond={(pair) => {
                      setValue('participante2_tipo', 'fijo')
                      setValue('origen_partido2_id', '')
                      if (!selectedCategoryId && pair.categoria_id) {
                        setValue('categoria_id', String(pair.categoria_id))
                      }
                      setValue('equipo2_id', String(pair.equipo_id), { shouldValidate: true })
                    }}
                    onCategoryChange={handleCategorySelectInWizard}
                    onRoundChange={handleRoundSelectInWizard}
                    onSelectBracketMatch={selectBracketMatch}
                    onSourceSelect={(side, srcMatch) => {
                      setValue(`participante${side}_tipo`, 'ganador')
                      setValue(`equipo${side}_id`, '')
                      setValue(`jugador${side}_id`, '')
                      if (!selectedCategoryId && srcMatch.categoria?.id) {
                        setValue('categoria_id', String(srcMatch.categoria.id))
                      }
                      setValue(`origen_partido${side}_id`, String(srcMatch.id), {
                        shouldValidate: true,
                      })
                    }}
                    onPendingSelect={(side) => {
                      setValue(`participante${side}_tipo`, 'por_definir')
                      setValue(`equipo${side}_id`, '')
                      setValue(`jugador${side}_id`, '')
                      setValue(`origen_partido${side}_id`, '')
                    }}
                    onOpenBracketBuilder={(catId) => {
                      setBracketTorneoId(String(selectedTournamentId))
                      if (catId) {
                        const next = new URLSearchParams(searchParams)
                        next.set('categoria', String(catId))
                        setSearchParams(next, { replace: true })
                      }
                      setShowForm(false)
                      setAutoOpenBracketBuilder(true)
                      setShowBracketsView(true)
                    }}
                    onClear={() => {
                      setLinkedBracketMatchId(null)
                      setValue('equipo1_id', '')
                      setValue('equipo2_id', '')
                      setValue('origen_partido1_id', '')
                      setValue('origen_partido2_id', '')
                      setValue('participante1_tipo', 'fijo')
                      setValue('participante2_tipo', 'fijo')
                    }}
                    onContinue={nextWizardStep}
                    onManual={() => {
                      openManualSelection()
                      document.querySelector('[name="participante1_tipo"]')?.focus()
                    }}
                  />
                )}

                <details
                  id='manual-match-selection'
                  className='match-wizard-advanced sm:col-span-2'
                  open={
                    editing || !selectedTournament || selectedModality !== 'dobles'
                      ? true
                      : undefined
                  }
                >
                  <summary>Categoría, fase y selección manual</summary>
                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
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
                        style={{
                          backgroundColor: 'var(--color-brand-dim)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <span className='font-semibold'>
                          {selectedDeporte === 'padel' ? 'Pádel' : 'Tenis'}
                        </span>
                        <span>·</span>
                        <span>
                          {selectedTournament.categoria?.nombre || 'Todas las categorías'}
                        </span>
                        <span>·</span>
                        <span>{selectedModality === 'dobles' ? 'Parejas' : 'Individual'}</span>
                      </div>
                    )}

                    {selectedTournament && !selectedTournament.categoria && (
                      <div className='form-group'>
                        <label className='form-label'>Categoría del partido *</label>
                        <select
                          className='form-input'
                          {...register('categoria_id', {
                            required: 'Selecciona la categoría del partido',
                          })}
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

                    {selectedTournament?.sistema === 'grupos_eliminacion' &&
                      selectedPhase === 'grupos' && (
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
                                <option value=''>
                                  {!distribution && !groupError
                                    ? 'Cargando grupos…'
                                    : 'Selecciona un grupo…'}
                                </option>
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
                                {groupError ||
                                  'Solo podrás seleccionar parejas de esta categoría y grupo.'}{' '}
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
                        {...register('ronda', {
                          onChange: (e) => {
                            const val = (e.target.value || '').toLowerCase()
                            if (val.includes('semi') || val.includes('final') || val.includes('tercer')) {
                              setValue('set_decisivo', 'set_completo')
                            } else if (
                              val.includes('cuarto') ||
                              val.includes('octavo') ||
                              val.includes('dieciseis') ||
                              val.includes('16') ||
                              val.includes('grupo') ||
                              val.includes('fecha')
                            ) {
                              setValue('set_decisivo', 'match_tiebreak')
                            }
                          },
                        })}
                      />
                    )}

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
                            search: teamSearch(equipo),
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
                            search: teamSearch(equipo),
                          }))}
                          sourceMatches={sourceMatches}
                          control={control}
                          disabled={useGroups && !distribution}
                          error={errors.equipo2_id || errors.origen_partido2_id}
                        />
                      </>
                    )}
                  </div>
                </details>
              </div>
            </section>
            <section
              hidden={!editing && wizardStep !== 1}
              className='match-wizard-panel'
              aria-label='Programación'
            >
              {!editing && (
                <>
                  <h3 id='match-step-1' tabIndex={-1}>
                    ¿Cuándo y dónde?
                  </h3>
                  <p className='match-wizard-description'>
                    Asigna horario, cancha y juez. Puedes dejar los datos pendientes si aún no están
                    definidos.
                  </p>
                </>
              )}
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
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
                      .filter(
                        (court) => court.deporte === selectedDeporte || court.deporte === 'ambos'
                      )
                      .map((court) => (
                        <option key={court.id} value={court.id}>
                          {court.nombre} · {court.sede_nombre}
                        </option>
                      ))}
                  </select>
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

                <details
                  className='match-wizard-advanced sm:col-span-2'
                  open
                >
                  <summary>Formato de puntuación y ajustes</summary>
                  <div
                    className='sm:col-span-2 rounded-xl p-4 space-y-3'
                    style={{ backgroundColor: 'var(--bg-hover)' }}
                  >
                    <div className='flex items-center gap-2'>
                      <SlidersHorizontal
                        className='w-4 h-4'
                        style={{ color: 'var(--color-brand)' }}
                      />
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
                </details>
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
            </section>
            {!editing && wizardStep === 2 && (
              <section className='match-wizard-panel' aria-label='Confirmar'>
                <h3 id='match-step-2' tabIndex={-1}>
                  Revisa tu partido
                </h3>
                <p className='match-wizard-description'>
                  Al guardar se comprobarán los cruces, la disponibilidad y los tiempos de descanso.
                </p>
                <MatchWizardSummary {...wizardSummary} review />
                {watch('notas') && (
                  <p className='text-sm mt-4 break-words'>
                    <strong>Observaciones:</strong> {watch('notas')}
                  </p>
                )}
                <p className='text-sm mt-4'>
                  Estado: {ESTADOS.find((e) => e.value === watch('estado'))?.label}
                </p>
              </section>
            )}
          </div>
          {!editing && (
            <aside className='match-wizard-aside'>
              <MatchWizardSummary {...wizardSummary} />
            </aside>
          )}
        </div>
      </Modal>

      {/* Modal Editor de marcador */}
      <ModalMarcadorManual
        isOpen={Boolean(showMarcador)}
        onClose={() => setShowMarcador(null)}
        marcadorParticipante1={marcadorParticipante1}
        marcadorParticipante2={marcadorParticipante2}
        isSubmitting={isSubmittingM}
        onSubmit={handleM(onMarcador)}
        register={regM}
        estados={ESTADOS}
        setNumbers={setNumbers}
        addSet={addSet}
        removeLastSet={removeLastSet}
        maxSets={MAX_SETS}
      />

      {/* Filtros y Búsqueda */}
      <div className='card p-4 space-y-3'>
        {filterTorneo !== 'todos' && (
          <div
            className='flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold'
            style={{ backgroundColor: 'var(--color-brand-dim)', color: 'var(--color-brand)' }}
          >
            <span className='flex items-center gap-1.5'>
              <Trophy className='w-4 h-4' />
              Filtrando por torneo:{' '}
              {torneos.find((t) => String(t.id) === String(filterTorneo))?.nombre ||
                `#${filterTorneo}`}
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
            Mostrando <strong className='text-[var(--text-primary)]'>{filtered.length}</strong> de{' '}
            {partidos.length} partidos
          </span>
          {(search ||
            filterTorneo !== 'todos' ||
            filterDeporte !== 'todos' ||
            filterTab !== 'todos') && (
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
      <Link to='/admin/agenda' className='btn-secondary inline-flex px-4 py-2'>
        Ver agenda por cancha
      </Link>
      <Tabs
        tabs={FILTER_TABS}
        activeTab={filterTab}
        onChange={setFilterTab}
        className='flex-wrap'
      />

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

