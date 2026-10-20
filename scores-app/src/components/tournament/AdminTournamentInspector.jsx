import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  ExternalLink,
  Flag,
  GitBranch,
  Plus,
  RefreshCw,
  Search,
  Swords,
  Trophy,
  Users,
  UsersRound,
  X,
} from 'lucide-react'
import { tournamentService } from '../../services/tournamentService'
import { matchService } from '../../services/matchService'
import { teamService } from '../../services/teamService'
import { confirm } from '../../utils/confirm'
import { findBracketMatchupForTeam } from '../../utils/tournamentBracket'
import TournamentBracket from './TournamentBracket'
import TournamentRoster from './TournamentRoster'
import TournamentStandings from './TournamentStandings'
import TournamentMatches from './TournamentMatches'
import TournamentRetirements from './TournamentRetirements'
import TournamentTeamsModal from './TournamentTeamsModal'
import { TournamentBracketSkeleton } from '../ui/Skeleton'

const INSPECTOR_TABS = [
  { id: 'bracket', label: 'Eliminatorias (Brackets)', icon: GitBranch },
  { id: 'teams', label: 'Parejas inscritas y Grupos', icon: UsersRound },
  { id: 'all_pairs', label: 'Parejas a detalle', icon: Swords },
  { id: 'standings', label: 'Posiciones', icon: BarChart3 },
  { id: 'matches', label: 'Partidos', icon: CalendarDays },
  { id: 'participation', label: 'Participación y Retiros', icon: Flag },
]

export default function AdminTournamentInspector({
  tournament,
  initialSection = 'bracket',
  onClose,
}) {
  const [section, setSection] = useState(
    INSPECTOR_TABS.some((t) => t.id === initialSection) ? initialSection : 'bracket'
  )
  const [matches, setMatches] = useState([])
  const [inscripciones, setInscripciones] = useState(null)
  const [standings, setStandings] = useState(null)
  const [retirements, setRetirements] = useState(null)
  const [groupsDist, setGroupsDist] = useState(null)
  const [allTeams, setAllTeams] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [addingTeams, setAddingTeams] = useState(false)
  const [removingTeam, setRemovingTeam] = useState(false)
  const [rosterDirty, setRosterDirty] = useState(false)

  // Filtros para la pestaña "Parejas a detalle"
  const [pairSearch, setPairSearch] = useState('')
  const [pairCatFilter, setPairCatFilter] = useState('')
  const [pairStatusFilter, setPairStatusFilter] = useState('todas') // 'todas' | 'inscritas' | 'eliminatoria' | 'grupos'

  useEffect(() => {
    if (initialSection && INSPECTOR_TABS.some((t) => t.id === initialSection)) {
      setSection(initialSection)
    }
  }, [initialSection])

  const loadAll = useCallback(async () => {
    if (!tournament?.id) return
    setBusy(true)
    setError('')
    try {
      const isDoubles = tournament.modalidad === 'dobles'
      const [matchesRes, inscRes, standRes, retRes, grpRes, teamsRes] = await Promise.all([

        matchService.getAll({ torneo_id: tournament.id }).catch(() => ({ data: [] })),
        isDoubles
          ? tournamentService.getInscripciones(tournament.id).catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
        tournamentService.getStandings(tournament.id, true).catch(() => ({ data: null })),
        tournamentService.getRetirements(tournament.id).catch(() => ({ data: null })),
        isDoubles && tournament.sistema === 'grupos_eliminacion'
          ? tournamentService.getGroups(tournament.id).catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
        isDoubles
          ? teamService.getAll({ deporte: tournament.deporte || 'tenis' }).catch(() => ({ data: [] }))

          : Promise.resolve({ data: [] }),
      ])
      setMatches(Array.isArray(matchesRes?.data) ? matchesRes.data : [])
      setInscripciones(inscRes?.data || null)
      setStandings(standRes?.data || null)
      setRetirements(retRes?.data || null)
      setGroupsDist(grpRes?.data || null)
      setAllTeams(Array.isArray(teamsRes?.data) ? teamsRes.data : [])
    } catch (e) {
      setError(e.message || 'No se pudo cargar el detalle completo del torneo.')
    } finally {
      setBusy(false)
    }
  }, [tournament?.id, tournament?.modalidad, tournament?.sistema, tournament?.deporte])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleTabChange = async (nextTab) => {
    if (
      rosterDirty &&
      !(await confirm({
        title: 'Cambios sin guardar',
        message: '¿Salir de Parejas inscritas sin guardar la distribución de grupos?',
        confirmLabel: 'Salir sin guardar',
      }))
    ) {
      return
    }
    setRosterDirty(false)
    setSection(nextTab)
  }

  const handleRemoveInscripcion = async (team) => {
    if (
      !(await confirm({
        title: 'Quitar inscripción',
        message: `¿Quitar la inscripción de ${team.nombre}? Solo se permite si no tiene partidos. Para registrar un retiro conservando el historial, usa la sección Participación.`,
        confirmLabel: 'Quitar inscripción',
      }))
    )
      return
    setRemovingTeam(true)
    try {
      await tournamentService.removeInscripcion(tournament.id, team.equipo_id)
      await loadAll()
    } catch (e) {
      const errMsg = e?.response?.data?.message || e.message || 'No se pudo retirar'
      setError(errMsg)
    } finally {
      setRemovingTeam(false)
    }
  }

  // Estadísticas resumidas del torneo
  const stats = useMemo(() => {
    const elimMatches = matches.filter(
      (m) =>
        m.estado !== 'cancelado' &&
        (tournament?.sistema === 'eliminacion_directa' ||
          String(m.fase || '').toLowerCase() === 'eliminacion')
    )
    const groupMatches = matches.filter(
      (m) => m.estado !== 'cancelado' && String(m.fase || '').toLowerCase() === 'grupos'
    )
    const liveMatches = matches.filter((m) => m.estado === 'en_vivo')
    const finishedMatches = matches.filter((m) => m.estado === 'finalizado')

    const bracketCatsMap = new Map()
    for (const m of elimMatches) {
      const catId = String(m.categoria?.id ?? m.categoria_id ?? '')
      const catName = m.categoria?.nombre || 'Categoría'
      if (catId) {
        bracketCatsMap.set(catId, {
          id: catId,
          nombre: catName,
          count: (bracketCatsMap.get(catId)?.count || 0) + 1,
        })
      }
    }

    const inscribedRaw = inscripciones?.inscripciones_raw || []
    return {
      totalMatches: matches.length,
      elimCount: elimMatches.length,
      groupCount: groupMatches.length,
      liveCount: liveMatches.length,
      finishedCount: finishedMatches.length,
      bracketCategories: [...bracketCatsMap.values()],
      inscribedCount: inscribedRaw.length || tournament?.inscripciones_count || 0,
    }
  }, [matches, inscripciones, tournament])

  // Enriquecer todas las parejas con su inscripción, grupo y estado en brackets
  const detailedPairs = useMemo(() => {
    const enrolledMap = new Map()
    for (const cat of inscripciones?.categorias || []) {
      for (const p of cat.parejas || []) {
        enrolledMap.set(Number(p.equipo_id), {
          ...p,
          categoria_id: cat.id || p.categoria_id,
          categoria_nombre: cat.nombre || p.categoria_nombre,
        })
      }
    }
    const groupAssignmentMap = new Map()
    for (const g of groupsDist?.parejas || []) {
      groupAssignmentMap.set(Number(g.equipo_id), g.grupo || '')
    }

    const baseList = allTeams.map((team) => {
      const enrolled = enrolledMap.get(Number(team.id))
      const catId = enrolled?.categoria_id || team.categoria?.id || team.categoria_id || ''
      const catName =
        enrolled?.categoria_nombre || team.categoria?.nombre || 'Sin categoría'
      const grupo = groupAssignmentMap.get(Number(team.id)) || enrolled?.grupo || ''
      const bracketInfo = catId
        ? findBracketMatchupForTeam({
            teamId: team.id,
            categoryId: catId,
            matches,
            tournamentId: tournament?.id,
            system: tournament?.sistema,
          })
        : null

      const teamMatchesCount = matches.filter(
        (m) =>
          m.estado !== 'cancelado' &&
          (Number(m.equipo1?.id) === Number(team.id) ||
            Number(m.equipo2?.id) === Number(team.id))
      ).length

      return {
        id: team.id,
        nombre: team.nombre,
        jugador1: team.jugador1,
        jugador2: team.jugador2,
        categoria_id: String(catId || ''),
        categoria_nombre: catName,
        isEnrolled: Boolean(enrolled),
        grupo,
        inBracket: Boolean(bracketInfo?.inBracket),
        bracketInfo,
        teamMatchesCount,
      }
    })

    return baseList.sort((a, b) => {
      if (a.inBracket !== b.inBracket) return Number(b.inBracket) - Number(a.inBracket)
      if (a.isEnrolled !== b.isEnrolled) return Number(b.isEnrolled) - Number(a.isEnrolled)
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
    })
  }, [allTeams, inscripciones, groupsDist, matches, tournament])

  const pairCategories = useMemo(() => {
    const map = new Map()
    for (const p of detailedPairs) {
      if (p.categoria_id && p.categoria_nombre) {
        map.set(p.categoria_id, p.categoria_nombre)
      }
    }
    return [...map.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], 'es', { numeric: true })
    )
  }, [detailedPairs])

  const filteredPairs = useMemo(() => {
    const q = pairSearch.trim().toLowerCase()
    return detailedPairs.filter((p) => {
      if (pairCatFilter && p.categoria_id !== String(pairCatFilter)) return false
      if (pairStatusFilter === 'inscritas' && !p.isEnrolled) return false
      if (pairStatusFilter === 'eliminatoria' && !p.inBracket) return false
      if (pairStatusFilter === 'grupos' && (!p.isEnrolled || p.inBracket)) return false
      if (q) {
        const text = [
          p.nombre,
          p.jugador1?.nombre,
          p.jugador1?.apellido,
          p.jugador2?.nombre,
          p.jugador2?.apellido,
          p.categoria_nombre,
          p.grupo,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })
  }, [detailedPairs, pairCatFilter, pairStatusFilter, pairSearch])

  return (
    <section
      className='card p-4 sm:p-6 space-y-5 border-2 border-[var(--color-brand)]/40 animate-fade-up'
      aria-label={`Detalle administrativo de ${tournament.nombre}`}
    >
      {/* Cabecera del panel de detalle del torneo */}
      <div className='flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--border-color)]'>
        <div className='space-y-1.5 min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='badge-brand text-xs font-extrabold uppercase tracking-wider'>
              Centro de Control del Torneo
            </span>
            <span className='text-xs font-semibold text-[var(--text-muted)]'>
              {tournament.modalidad === 'dobles' ? 'Dobles' : 'Individual'} ·{' '}
              {tournament.sistema.replaceAll('_', ' ')}
            </span>
          </div>
          <h2 className='text-xl sm:text-2xl font-black text-[var(--text-primary)] break-words'>
            {tournament.nombre}
          </h2>
          {stats.bracketCategories.length > 0 && (
            <div className='flex flex-wrap items-center gap-1.5 pt-1'>
              <span className='text-xs font-bold text-[var(--color-brand)]'>
                <Trophy className='w-3.5 h-3.5 inline-block mr-1 text-[var(--color-brand)]' /> Cuadros creados:
              </span>
              {stats.bracketCategories.map((c) => (
                <button
                  key={c.id}
                  type='button'
                  onClick={() => handleTabChange('bracket')}
                  className='px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/15 text-[var(--color-brand)] border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors'
                >
                  {c.nombre} ({c.count} llaves)
                </button>
              ))}
            </div>
          )}
        </div>

        <div className='flex flex-wrap items-center gap-2 shrink-0'>
          {tournament.modalidad === 'dobles' && (
            <button
              type='button'
              onClick={() => setAddingTeams(true)}
              className='btn-secondary px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5'
            >
              <Users className='w-3.5 h-3.5 text-[var(--color-brand)]' />
              <span>Inscribir parejas</span>
            </button>
          )}
          <Link
            to={`/admin/partidos?torneo=${tournament.id}&crear=1`}
            className='btn-primary px-3.5 py-2 text-xs font-bold inline-flex items-center gap-1.5'
          >
            <Plus className='w-3.5 h-3.5' />
            <span>Crear partido</span>
          </Link>
          <Link
            to={`/torneo/${tournament.id}?tab=${section === 'all_pairs' ? 'teams' : section}`}
            className='btn-secondary px-3 py-2 text-xs font-semibold inline-flex items-center gap-1.5'
            title='Abrir vista pública/compartida del torneo'
          >
            <ExternalLink className='w-3.5 h-3.5' />
            <span className='hidden sm:inline'>Vista en Torneo</span>
          </Link>
          <button
            type='button'
            onClick={loadAll}
            disabled={busy}
            className='btn-ghost p-2 rounded-xl'
            title='Actualizar datos del torneo'
            aria-label='Actualizar datos del torneo'
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              type='button'
              onClick={onClose}
              className='btn-ghost p-2 rounded-xl'
              title='Cerrar panel de detalle'
              aria-label='Cerrar panel de detalle'
            >
              <X className='w-4 h-4' />
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de resumen rápido (clicables para saltar a cada sección) */}
      <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5'>
        <button
          type='button'
          onClick={() => handleTabChange('bracket')}
          className={`p-3 rounded-xl border text-left transition-all ${
            section === 'bracket'
              ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)]'
              : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--border-hover)]'
          }`}
        >
          <p className='text-[11px] font-bold uppercase tracking-wider text-[var(--color-brand)]'>
            <Trophy className='w-3 h-3 inline-block mr-1 text-[var(--color-brand)]' /> Brackets
          </p>
          <p className='text-lg font-black text-[var(--text-primary)] mt-0.5'>
            {stats.elimCount} llaves
          </p>
          <p className='text-[11px] text-[var(--text-muted)] truncate'>
            {stats.bracketCategories.length > 0
              ? stats.bracketCategories.map((c) => c.nombre).join(', ')
              : 'Ver / Armar cuadros'}
          </p>
        </button>

        <button
          type='button'
          onClick={() => handleTabChange('teams')}
          className={`p-3 rounded-xl border text-left transition-all ${
            section === 'teams'
              ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)]'
              : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--border-hover)]'
          }`}
        >
          <p className='text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]'>
            Parejas inscritas
          </p>
          <p className='text-lg font-black text-[var(--text-primary)] mt-0.5'>
            {stats.inscribedCount}
          </p>
          <p className='text-[11px] text-[var(--text-muted)] truncate'>Inscripciones y grupos</p>
        </button>

        <button
          type='button'
          onClick={() => handleTabChange('all_pairs')}
          className={`p-3 rounded-xl border text-left transition-all ${
            section === 'all_pairs'
              ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)]'
              : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--border-hover)]'
          }`}
        >
          <p className='text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]'>
            Parejas (Club)
          </p>
          <p className='text-lg font-black text-[var(--text-primary)] mt-0.5'>
            {detailedPairs.length}
          </p>
          <p className='text-[11px] text-[var(--text-muted)] truncate'>Estado y llaves por pareja</p>
        </button>

        <button
          type='button'
          onClick={() => handleTabChange('standings')}
          className={`p-3 rounded-xl border text-left transition-all ${
            section === 'standings'
              ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)]'
              : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--border-hover)]'
          }`}
        >
          <p className='text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]'>
            Posiciones
          </p>
          <p className='text-lg font-black text-[var(--text-primary)] mt-0.5'>
            {standings?.categorias?.length || 0} cat.
          </p>
          <p className='text-[11px] text-[var(--text-muted)] truncate'>Tablas y clasificados</p>
        </button>

        <button
          type='button'
          onClick={() => handleTabChange('matches')}
          className={`p-3 rounded-xl border text-left transition-all ${
            section === 'matches'
              ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)]'
              : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--border-hover)]'
          }`}
        >
          <p className='text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]'>
            Partidos
          </p>
          <p className='text-lg font-black text-[var(--text-primary)] mt-0.5'>
            {stats.totalMatches}
          </p>
          <p className='text-[11px] text-[var(--text-muted)] truncate'>
            {stats.finishedCount} fin. · {stats.liveCount} en vivo
          </p>
        </button>

        <button
          type='button'
          onClick={() => handleTabChange('participation')}
          className={`p-3 rounded-xl border text-left transition-all ${
            section === 'participation'
              ? 'border-[var(--color-brand)] bg-[var(--color-brand-dim)]'
              : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--border-hover)]'
          }`}
        >
          <p className='text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]'>
            Participación
          </p>
          <p className='text-lg font-black text-[var(--text-primary)] mt-0.5'>
            Retiros
          </p>
          <p className='text-[11px] text-[var(--text-muted)] truncate'>Control de bajas</p>
        </button>
      </div>

      {/* Barra de pestañas de navegación */}
      <div className='flex flex-wrap gap-2 border-b border-[var(--border-color)] pb-3'>
        {INSPECTOR_TABS.filter(
          (tab) =>
            tournament.modalidad === 'dobles' ||
            !['teams', 'all_pairs'].includes(tab.id)
        ).map((tab) => {
          const Icon = tab.icon
          const active = section === tab.id
          return (
            <button
              key={tab.id}
              type='button'
              onClick={() => handleTabChange(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-all ${
                active ? 'btn-primary shadow-sm' : 'btn-secondary'
              }`}
            >
              <Icon className='w-4 h-4' />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {error && (
        <div role='alert' className='p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-500 font-semibold'>
          {error}
        </div>
      )}

      {busy && matches.length > 0 && (
        <div className='flex items-center justify-between px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-[var(--color-brand)] font-semibold animate-pulse'>
          <span className='inline-flex items-center gap-2'>
            <RefreshCw className='w-3 h-3 animate-spin' /> Sincronizando datos del torneo…
          </span>
        </div>
      )}

      {/* SECCIÓN 1: ELIMINATORIAS / BRACKETS */}
      {section === 'bracket' && busy && matches.length === 0 && (
        <TournamentBracketSkeleton />
      )}
      {section === 'bracket' && matches.length > 0 && (
        <div className='space-y-4'>
          <TournamentBracket
            key={`admin-inspector-bracket-${tournament.id}`}
            matches={matches}
            system={tournament.sistema}
            management={true}
            tournament={tournament}
            onRefresh={loadAll}
          />
        </div>
      )}

      {/* SECCIÓN 2: PAREJAS INSCRITAS Y DISTRIBUCIÓN DE GRUPOS */}
      {section === 'teams' && tournament.modalidad === 'dobles' && (
        <div className='space-y-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <p className='text-xs sm:text-sm text-[var(--text-secondary)]'>
              Gestiona las parejas inscritas por categoría y arma o edita la distribución de grupos del torneo.
            </p>
            <button
              type='button'
              className='btn-primary px-4 py-2 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5'
              onClick={() => setAddingTeams(true)}
            >
              <Plus className='w-4 h-4' /> Agregar parejas al torneo
            </button>
          </div>
          {inscripciones ? (
            <TournamentRoster
              tournament={tournament}
              data={inscripciones}
              retirements={retirements}
              admin={true}
              remove={handleRemoveInscripcion}
              removing={removingTeam}
              onDirtyChange={setRosterDirty}
              onRefresh={loadAll}
            />
          ) : (
            !busy && <p className='text-sm text-[var(--text-muted)]'>No hay datos de inscripciones.</p>
          )}
        </div>
      )}

      {/* SECCIÓN 3: PAREJAS A DETALLE (TODAS LAS PAREJAS, ESTADO EN GRUPOS Y EN BRACKETS) */}
      {section === 'all_pairs' && tournament.modalidad === 'dobles' && (
        <div className='space-y-4'>
          <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)]'>
            <div className='relative'>
              <Search className='w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none' />
              <input
                type='text'
                value={pairSearch}
                onChange={(e) => setPairSearch(e.target.value)}
                placeholder='Buscar pareja o jugador...'
                className='form-input pl-9 text-xs sm:text-sm'
              />
            </div>
            <div>
              <select
                value={pairCatFilter}
                onChange={(e) => setPairCatFilter(e.target.value)}
                className='form-input text-xs sm:text-sm'
                aria-label='Filtrar parejas por categoría'
              >
                <option value=''>Todas las categorías ({pairCategories.length})</option>
                {pairCategories.map(([cid, cname]) => (
                  <option key={cid} value={cid}>
                    Categoría {cname}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <select
                value={pairStatusFilter}
                onChange={(e) => setPairStatusFilter(e.target.value)}
                className='form-input text-xs sm:text-sm'
                aria-label='Filtrar parejas por fase o estado'
              >
                <option value='todas'>Todas las parejas ({detailedPairs.length})</option>
                <option value='inscritas'>
                  Solo inscritas en este torneo ({detailedPairs.filter((p) => p.isEnrolled).length})
                </option>
                <option value='eliminatoria'>
                  En Fase Eliminatoria / Brackets ({detailedPairs.filter((p) => p.inBracket).length})
                </option>
                <option value='grupos'>
                  En Fase de Grupos ({detailedPairs.filter((p) => p.isEnrolled && !p.inBracket).length})
                </option>
              </select>
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            {filteredPairs.length === 0 ? (
              <p className='text-sm text-[var(--text-muted)] col-span-full py-6 text-center'>
                No se encontraron parejas con los filtros seleccionados.
              </p>
            ) : (
              filteredPairs.map((pair) => (
                <article
                  key={pair.id}
                  className='rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3.5 flex flex-col justify-between gap-3'
                >
                  <div className='space-y-1.5'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='badge-brand text-[10px] px-2 py-0.5'>
                        Cat. {pair.categoria_nombre}
                      </span>
                      <div className='flex flex-wrap items-center gap-1.5'>
                        {pair.isEnrolled ? (
                          <span className='px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-[var(--color-brand)]'>
                            Inscrita {pair.grupo ? `· ${pair.grupo}` : ''}
                          </span>
                        ) : (
                          <span className='px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-hover)] text-[var(--text-muted)]'>
                            No inscrita
                          </span>
                        )}
                        {pair.inBracket && (
                          <span className='px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-500 border border-amber-500/30'>
                            <Trophy className='w-3 h-3 inline-block mr-1' /> {pair.bracketInfo?.ronda}
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className='font-bold text-sm sm:text-base text-[var(--text-primary)]'>
                      {pair.nombre}
                    </h3>
                    <p className='text-xs text-[var(--text-secondary)]'>
                      Jugadores:{' '}
                      <strong>
                        {[pair.jugador1?.nombre, pair.jugador1?.apellido].filter(Boolean).join(' ') ||
                          'Jugador 1'}
                      </strong>{' '}
                      / {' '}
                      <strong>
                        {[pair.jugador2?.nombre, pair.jugador2?.apellido].filter(Boolean).join(' ') ||
                          'Jugador 2'}
                      </strong>
                    </p>

                    {pair.inBracket && pair.bracketInfo && (
                      <div className='mt-2 p-2 rounded-xl bg-emerald-500/8 border border-emerald-500/25 text-xs space-y-0.5'>
                        <p className='font-bold text-[var(--color-brand)]'>
                          Llave actual ({pair.bracketInfo.ronda} · Partido #{pair.bracketInfo.matchId}):
                        </p>
                        <p className='text-[var(--text-primary)]'>
                          Rival en bracket: <strong>{pair.bracketInfo.opponentName}</strong>
                        </p>
                      </div>
                    )}
                  </div>

                  <div className='flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-color)] text-xs'>
                    <span className='text-[var(--text-muted)]'>
                      {pair.teamMatchesCount} partido{pair.teamMatchesCount !== 1 ? 's' : ''} en el torneo
                    </span>
                    <div className='flex items-center gap-2'>
                      <Link
                        to={`/team/${pair.id}`}
                        className='btn-secondary px-2.5 py-1 text-[11px] font-semibold'
                      >
                        Ver pareja
                      </Link>
                      {pair.isEnrolled && (
                        <Link
                          to={`/admin/partidos?torneo=${tournament.id}&crear=1`}
                          className='btn-primary px-2.5 py-1 text-[11px] font-bold'
                        >
                          Programar partido
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}

      {/* SECCIÓN 4: TABLAS DE POSICIONES */}
      {section === 'standings' && (
        <div className='space-y-4'>
          {standings ? (
            <TournamentStandings data={standings} retirements={retirements} />
          ) : (
            !busy && <p className='text-sm text-[var(--text-muted)]'>No hay posiciones disponibles.</p>
          )}
        </div>
      )}

      {/* SECCIÓN 5: PARTIDOS DEL TORNEO */}
      {section === 'matches' && (
        <div className='space-y-4'>
          <div className='flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)]'>
            <p className='text-xs sm:text-sm text-[var(--text-secondary)]'>
              Mostrando <strong>{matches.length}</strong> partidos registrados en{' '}
              <strong>{tournament.nombre}</strong> ({stats.groupCount} de grupos · {stats.elimCount} de
              eliminatoria).
            </p>
            <div className='flex flex-wrap items-center gap-2'>
              <Link
                to={`/admin/partidos?torneo=${tournament.id}`}
                className='btn-secondary px-3 py-1.5 text-xs font-semibold'
              >
                Abrir gestor de partidos
              </Link>
              <Link
                to={`/admin/partidos?torneo=${tournament.id}&crear=1`}
                className='btn-primary px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5'
              >
                <Plus className='w-3.5 h-3.5' /> Programar partido
              </Link>
            </div>
          </div>
          <TournamentMatches matches={matches} loading={busy} />
        </div>
      )}

      {/* SECCIÓN 6: PARTICIPACIÓN Y RETIROS */}
      {section === 'participation' && (
        <TournamentRetirements tournamentId={tournament.id} onChange={loadAll} />
      )}

      {addingTeams && (
        <TournamentTeamsModal
          tournament={tournament}
          enrolledTeamIds={
            new Set((inscripciones?.inscripciones_raw || []).map((r) => Number(r.equipo_id)))
          }
          onClose={() => setAddingTeams(false)}
          onSuccess={loadAll}
        />
      )}
    </section>
  )
}
