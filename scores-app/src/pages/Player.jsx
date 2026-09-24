import { useState, useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  ExternalLink,
  MapPin,
  Star,
  Trophy,
  User,
  Users,
} from 'lucide-react'
import { usePlayer } from '../hooks/usePlayers'
import { matchService } from '../services/matchService'
import useFavoritesStore from '../store/useFavoritesStore'
import { cn } from '../utils/cn'
import { useLoginRequired } from '../hooks/useLoginRequired'
import Avatar from '../components/ui/Avatar'
import ParticipantAvatar from '../components/ui/ParticipantAvatar'
import ScoreDisplay from '../components/match/ScoreDisplay'
import { formatClockTime, formatDate } from '../utils/formatDate'
import { getParticipantName } from '../utils/matchParticipants'

export default function Player() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { player, loading } = usePlayer(id)
  const { toggleJugador, isJugadorFavorite } = useFavoritesStore()
  const requireLogin = useLoginRequired()

  const [matches, setMatches] = useState([])
  const [matchesLoading, setMatchesLoading] = useState(true)
  const [matchesError, setMatchesError] = useState('')
  const [modalityFilter, setModalityFilter] = useState('todas')
  const [statusFilter, setStatusFilter] = useState('todos')

  useEffect(() => {
    if (!id) return
    let active = true
    setMatches([])
    setMatchesError('')
    setMatchesLoading(true)
    matchService
      .getAll({ jugador_id: id })
      .then((res) => {
        if (active) setMatches(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => {
        if (active) setMatchesError('No se pudo cargar el historial. Actualiza la página para reintentar.')
      })
      .finally(() => {
        if (active) setMatchesLoading(false)
      })
    return () => { active = false }
  }, [id])

  if (loading) return <div className='skeleton h-48 w-full rounded-xl' />
  if (!player) {
    return (
      <div className='card p-12 text-center'>
        <p className='text-sm' style={{ color: 'var(--text-muted)' }}>
          Jugador no encontrado
        </p>
        <Link
          to='/tennis'
          className='btn-outline inline-flex items-center gap-2 mt-4 text-xs px-3 py-1.5'
        >
          <ArrowLeft className='w-3.5 h-3.5' /> Volver a Tenis
        </Link>
      </div>
    )
  }

  const statsByCategory = useMemo(() => player.estadisticas || [], [player])

  // Consolidado General (Todas las categorías y parejas integradas)
  const generalStats = useMemo(() => {
    if (!statsByCategory.length) return null
    const pj = statsByCategory.reduce((acc, s) => acc + (s.partidos_jugados || 0), 0)
    const v = statsByCategory.reduce((acc, s) => acc + (s.victorias || 0), 0)
    const d = statsByCategory.reduce((acc, s) => acc + (s.derrotas || 0), 0)
    const pts = statsByCategory.reduce((acc, s) => acc + (s.puntos || 0), 0)
    const sg = statsByCategory.reduce((acc, s) => acc + (s.sets_ganados || 0), 0)
    const sp = statsByCategory.reduce((acc, s) => acc + (s.sets_perdidos || 0), 0)
    const gg = statsByCategory.reduce((acc, s) => acc + (s.games_ganados || 0), 0)
    const gp = statsByCategory.reduce((acc, s) => acc + (s.games_perdidos || 0), 0)
    const totalSets = sg + sp
    const totalGames = gg + gp

    return {
      jugador_id: player.id,
      categoria: {
        id: 'todas',
        nombre: 'Todas las categorías (General)',
      },
      ranking: null,
      partidos_jugados: pj,
      victorias: v,
      derrotas: d,
      puntos: pts,
      sets_ganados: sg,
      sets_perdidos: sp,
      games_ganados: gg,
      games_perdidos: gp,
      porcentaje_sets: totalSets > 0 ? sg / totalSets : 0,
      porcentaje_games: totalGames > 0 ? gg / totalGames : 0,
    }
  }, [statsByCategory, player])

  const requestedCategoryId = searchParams.get('categoria_id')

  // Opciones de categoría en selector: Si tiene más de una categoría, incluimos la opción General primero
  const categoryOptions = useMemo(() => {
    if (!generalStats) return statsByCategory
    if (statsByCategory.length <= 1) return statsByCategory
    return [generalStats, ...statsByCategory]
  }, [generalStats, statsByCategory])

  const selectedStats = useMemo(() => {
    if (!statsByCategory.length) return null
    if (!requestedCategoryId || requestedCategoryId === 'todas') {
      return (statsByCategory.length > 1 && generalStats) ? generalStats : statsByCategory[0]
    }
    return (
      statsByCategory.find((stats) => String(stats.categoria?.id) === requestedCategoryId) ||
      (statsByCategory.length > 1 && generalStats) ||
      statsByCategory[0]
    )
  }, [requestedCategoryId, statsByCategory, generalStats])
  const isFav = isJugadorFavorite(player.id)
  const playerId = Number(player.id)

  const doublesCount = matches.filter(
    (m) => m.modalidad === 'dobles' || m.torneo?.modalidad === 'dobles'
  ).length
  const singlesCount = matches.filter(
    (m) => m.modalidad !== 'dobles' && m.torneo?.modalidad !== 'dobles'
  ).length

  const scopedByModality = matches.filter((m) => {
    const isDoubles = m.modalidad === 'dobles' || m.torneo?.modalidad === 'dobles'
    if (modalityFilter === 'dobles' && !isDoubles) return false
    if (modalityFilter === 'individual' && isDoubles) return false
    return true
  })

  const finishedMatches = scopedByModality.filter((m) => m.estado === 'finalizado')
  const liveMatches = scopedByModality.filter((m) => m.estado === 'en_vivo')
  const upcomingMatches = scopedByModality.filter((m) => m.estado === 'programado')

  const filteredMatches = scopedByModality.filter((m) => {
    if (statusFilter === 'finalizado') return m.estado === 'finalizado'
    if (statusFilter === 'programado') return m.estado === 'programado'
    if (statusFilter === 'en_vivo') return m.estado === 'en_vivo'
    return true
  })

  return (
    <div className='space-y-5 animate-fade-up'>
      {/* Barra de navegación superior */}
      <div className='flex items-center justify-between'>
        <Link
          to='/tennis'
          className='flex items-center gap-2 text-sm transition-colors'
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className='w-4 h-4' /> Tenis
        </Link>
        <button
          type='button'
          onClick={() => {
            if (requireLogin('Para guardar jugadores en favoritos debes iniciar sesión.')) {
              toggleJugador(player)
            }
          }}
          className='btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm'
          style={{ color: isFav ? '#facc15' : 'var(--text-muted)' }}
        >
          <Star className={cn('w-4 h-4', isFav && 'fill-current')} />
          {isFav ? 'Guardado' : 'Guardar'}
        </button>
      </div>

      {/* Cabecera del perfil */}
      <div className='card p-5'>
        <div className='flex items-center gap-4 flex-wrap sm:flex-nowrap'>
          <Avatar
            src={player.foto || player.avatar || player.usuario?.avatar}
            name={`${player.nombre || ''} ${player.apellido || ''}`}
            size='lg'
            className='rounded-2xl shrink-0'
          />
          <div className='flex-1 min-w-0'>
            <p
              className='text-xs font-semibold uppercase tracking-wider mb-1'
              style={{ color: 'var(--color-brand)' }}
            >
              Ficha del Jugador
            </p>
            <h1 className='text-xl sm:text-2xl font-bold truncate' style={{ color: 'var(--text-primary)' }}>
              {player.nombre} {player.apellido}
            </h1>
            <div className='flex items-center gap-2 mt-2 flex-wrap'>
              <span className='badge-atp capitalize'>{player.deporte || 'Tenis'}</span>
              {(player.categoria?.nombre || player.categoria_nombre) && (
                <span className='badge-brand'>
                  {player.categoria?.nombre || player.categoria_nombre}
                </span>
              )}
              <span
                className={cn(
                  'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                  player.activo
                    ? 'bg-emerald-500/10 text-emerald-500'
                    : 'bg-zinc-500/10 text-zinc-400'
                )}
              >
                {player.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Parejas / Duplas que integra */}
      {player.parejas && player.parejas.length > 0 && (
        <section className='space-y-3'>
          <div className='flex items-center justify-between'>
            <h2 className='text-sm font-bold flex items-center gap-2' style={{ color: 'var(--text-primary)' }}>
              <Users className='w-4 h-4' style={{ color: 'var(--color-brand)' }} />
              Parejas / Duplas que integra
            </h2>
            <span
              className='text-xs rounded-full px-2 py-0.5 font-semibold'
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              {player.parejas.length}
            </span>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            {player.parejas.map((pareja) => (
              <Link
                key={pareja.id}
                to={`/team/${pareja.id}`}
                className='card-hover p-4 flex items-center justify-between gap-3'
              >
                <div className='flex items-center gap-3 min-w-0'>
                  <Avatar
                    src={pareja.companero?.foto || pareja.companero?.avatar}
                    name={`${pareja.companero?.nombre || ''} ${pareja.companero?.apellido || ''}`}
                    size='md'
                  />
                  <div className='min-w-0'>
                    <p className='font-bold text-sm truncate' style={{ color: 'var(--text-primary)' }}>
                      {pareja.nombre}
                    </p>
                    <p className='text-xs truncate mt-0.5' style={{ color: 'var(--text-muted)' }}>
                      {pareja.companero
                        ? `Con ${pareja.companero.nombre} ${pareja.companero.apellido}`
                        : 'Dupla registrada'}
                    </p>
                  </div>
                </div>

                <div className='flex items-center gap-2 shrink-0'>
                  {pareja.categoria?.nombre && (
                    <span className='badge-brand text-xs'>{pareja.categoria.nombre}</span>
                  )}
                  <ChevronRight className='w-4 h-4' style={{ color: 'var(--text-muted)' }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Estadísticas */}
      <section className='space-y-3'>
        <div className='flex items-center justify-between'>
          <h2 className='text-sm font-bold flex items-center gap-2' style={{ color: 'var(--text-primary)' }}>
            <Trophy className='w-4 h-4' style={{ color: 'var(--color-brand)' }} />
            Estadísticas y Ranking
          </h2>
        </div>

        {statsByCategory.length > 0 ? (
          <>
            {statsByCategory.length > 1 && (
              <div className='card p-4'>
                <label className='form-label' htmlFor='player-category'>
                  Categoría
                </label>
                <select
                  id='player-category'
                  className='form-input'
                  value={String(selectedStats?.categoria?.id || 'todas')}
                  onChange={(event) =>
                    setSearchParams({ categoria_id: event.target.value }, { replace: true })
                  }
                >
                  {categoryOptions.map((stats) => (
                    <option key={stats.categoria.id} value={stats.categoria.id}>
                      {stats.categoria.nombre}
                    </option>
                  ))}
                </select>
                <p className='text-xs mt-2' style={{ color: 'var(--text-muted)' }}>
                  Sistema oficial: 1 punto al ganador y 0 al perdedor. El supertiebreak decisivo se computa como 1 game al ganador y 0 al perdedor.
                </p>
              </div>
            )}

            {selectedStats && (
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
                <StatCard
                  label='Ranking'
                  value={selectedStats.ranking ? `#${selectedStats.ranking}` : 'General'}
                  accent
                />
                <StatCard label='Puntos' value={selectedStats.puntos} accent />
                <StatCard label='Partidos' value={selectedStats.partidos_jugados} />
                <StatCard
                  label='Balance'
                  value={`${selectedStats.victorias}V / ${selectedStats.derrotas}D`}
                />
                <StatCard
                  label='Sets'
                  value={`${selectedStats.sets_ganados}–${selectedStats.sets_perdidos}`}
                />
                <StatCard
                  label='Games'
                  value={`${selectedStats.games_ganados}–${selectedStats.games_perdidos}`}
                />
                <StatCard label='% de sets' value={formatPercentage(selectedStats.porcentaje_sets)} />
                <StatCard label='% de games' value={formatPercentage(selectedStats.porcentaje_games)} />
              </div>
            )}
          </>
        ) : (
          <div className='card p-8 text-center'>
            <Trophy className='w-10 h-10 mx-auto mb-3' style={{ color: 'var(--text-muted)' }} />
            <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
              Sin estadísticas registradas todavía
            </p>
            <p className='text-xs mt-1' style={{ color: 'var(--text-muted)' }}>
              Se calcularán automáticamente tanto en partidos individuales como de parejas.
            </p>
          </div>
        )}
      </section>

      {/* Historial de partidos */}
      <section className='space-y-3'>
        <div className='flex items-center justify-between flex-wrap gap-2'>
          <h2 className='text-sm font-bold flex items-center gap-2' style={{ color: 'var(--text-primary)' }}>
            <Calendar className='w-4 h-4' style={{ color: 'var(--color-brand)' }} />
            Historial de Partidos
          </h2>
          <span
            className='text-xs rounded-full px-2 py-0.5 font-semibold'
            style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
          >
            {filteredMatches.length} de {matches.length}
          </span>
        </div>

        {/* Barra de Filtros: Modalidad y Estado */}
        {matches.length > 0 && (
          <div className='card p-3 space-y-2.5'>
            {/* Filtro por Modalidad (Parejas / Solitario) */}
            <div className='flex items-center justify-between flex-wrap gap-2'>
              <span className='text-xs font-semibold' style={{ color: 'var(--text-muted)' }}>
                Modalidad:
              </span>
              <div className='flex items-center gap-1.5 flex-wrap'>
                <FilterChip
                  label='Todas'
                  count={matches.length}
                  active={modalityFilter === 'todas'}
                  onClick={() => setModalityFilter('todas')}
                />
                <FilterChip
                  icon={<Users className='w-3.5 h-3.5' />}
                  label='En pareja (Dobles)'
                  count={doublesCount}
                  active={modalityFilter === 'dobles'}
                  onClick={() => setModalityFilter('dobles')}
                />
                <FilterChip
                  icon={<User className='w-3.5 h-3.5' />}
                  label='En solitario (Individual)'
                  count={singlesCount}
                  active={modalityFilter === 'individual'}
                  onClick={() => setModalityFilter('individual')}
                />
              </div>
            </div>

            {/* Filtro por Estado (Finalizados / Próximos / En vivo) */}
            <div className='flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-[var(--border-color)]'>
              <span className='text-xs font-semibold' style={{ color: 'var(--text-muted)' }}>
                Estado:
              </span>
              <div className='flex items-center gap-1.5 flex-wrap'>
                <FilterChip
                  label='Todos'
                  count={scopedByModality.length}
                  active={statusFilter === 'todos'}
                  onClick={() => setStatusFilter('todos')}
                />
                {finishedMatches.length > 0 && (
                  <FilterChip
                    label='Finalizados'
                    count={finishedMatches.length}
                    active={statusFilter === 'finalizado'}
                    onClick={() => setStatusFilter('finalizado')}
                  />
                )}
                {upcomingMatches.length > 0 && (
                  <FilterChip
                    label='Próximos'
                    count={upcomingMatches.length}
                    active={statusFilter === 'programado'}
                    onClick={() => setStatusFilter('programado')}
                  />
                )}
                {liveMatches.length > 0 && (
                  <FilterChip
                    label='En vivo'
                    count={liveMatches.length}
                    active={statusFilter === 'en_vivo'}
                    onClick={() => setStatusFilter('en_vivo')}
                    highlight
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {matchesLoading ? (
          <div className='space-y-3'>
            <div className='skeleton h-28 w-full rounded-xl' />
            <div className='skeleton h-28 w-full rounded-xl' />
          </div>
        ) : matchesError ? <p role='alert' className='card p-4'>{matchesError}</p> : filteredMatches.length === 0 ? (
          <div className='card p-8 text-center'>
            <Calendar className='w-10 h-10 mx-auto mb-2' style={{ color: 'var(--text-muted)' }} />
            <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
              {matches.length === 0
                ? 'Aún no hay partidos registrados para este jugador'
                : 'No hay partidos en este filtro'}
            </p>
            <p className='text-xs mt-1' style={{ color: 'var(--text-muted)' }}>
              Los partidos de torneos y duplas en los que participe se mostrarán aquí.
            </p>
          </div>
        ) : (
          <div className='card overflow-hidden divide-y' style={{ borderColor: 'var(--border-color)' }}>
            {filteredMatches.map((match) => (
              <PlayerMatchRow key={match.id} match={match} playerId={playerId} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PlayerMatchRow({ match, playerId }) {
  const isDoubles = match.modalidad === 'dobles' || match.torneo?.modalidad === 'dobles'
  const p1Name = getParticipantName(match, 1) || 'Por definir'
  const p2Name = getParticipantName(match, 2) || 'Por definir'
  const sets1 = match.sets?.map((s) => s.games_j1) || []
  const sets2 = match.sets?.map((s) => s.games_j2) || []

  // Determinar lado del jugador
  let mySide = null
  let partner = null
  if (isDoubles) {
    const inE1 =
      Number(match.equipo1?.jugador1?.id) === playerId ||
      Number(match.equipo1?.jugador2?.id) === playerId
    const inE2 =
      Number(match.equipo2?.jugador1?.id) === playerId ||
      Number(match.equipo2?.jugador2?.id) === playerId

    if (inE1) {
      mySide = 'jugador1'
      partner =
        Number(match.equipo1?.jugador1?.id) === playerId
          ? match.equipo1?.jugador2
          : match.equipo1?.jugador1
    } else if (inE2) {
      mySide = 'jugador2'
      partner =
        Number(match.equipo2?.jugador1?.id) === playerId
          ? match.equipo2?.jugador2
          : match.equipo2?.jugador1
    }
  } else {
    if (Number(match.jugador1?.id) === playerId) mySide = 'jugador1'
    else if (Number(match.jugador2?.id) === playerId) mySide = 'jugador2'
  }

  // Resultado
  const isFinished = match.estado === 'finalizado'
  const isLive = match.estado === 'en_vivo'
  const isCancelled = match.estado === 'cancelado'
  const isWon = isFinished && match.ganador && match.ganador === mySide
  const isLost = isFinished && match.ganador && match.ganador !== mySide

  return (
    <Link
      to={`/match/${match.id}`}
      className='block p-4 transition-colors hover:bg-[var(--bg-hover)]'
    >
      {/* Línea superior: Torneo / Categoría / Fecha / Estado */}
      <div className='flex items-center justify-between gap-2 mb-2.5 flex-wrap'>
        <div className='flex items-center gap-2 flex-wrap'>
          {match.categoria?.nombre && (
            <span className='badge-brand text-xs'>{match.categoria.nombre}</span>
          )}
          {match.torneo?.nombre && (
            <span className='text-xs font-semibold' style={{ color: 'var(--text-primary)' }}>
              {match.torneo.nombre}
            </span>
          )}
          {isDoubles ? (
            <span
              className='text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full inline-flex items-center gap-1'
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
            >
              <Users className='w-3 h-3 text-[var(--color-brand)]' /> Dobles
            </span>
          ) : (
            <span
              className='text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full inline-flex items-center gap-1'
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
            >
              <User className='w-3 h-3 text-sky-500' /> Individual
            </span>
          )}
        </div>

        <div className='flex items-center gap-2 shrink-0'>
          {isWon && (
            <span className='text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-emerald-500/10 text-emerald-500'>
              Victoria
            </span>
          )}
          {isLost && (
            <span className='text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-rose-500/10 text-rose-500'>
              Derrota
            </span>
          )}
          {isLive && (
            <span className='text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-red-500/10 text-red-500 flex items-center gap-1'>
              <span className='w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse' /> En vivo
            </span>
          )}
          {isCancelled && (
            <span className='text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-zinc-500/10 text-zinc-400'>
              Cancelado
            </span>
          )}
          {!isFinished && !isLive && !isCancelled && (
            <span className='text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-sky-500/10 text-sky-400'>
              Programado
            </span>
          )}
          <span className='text-[11px]' style={{ color: 'var(--text-muted)' }}>
            {[
              match.fecha_inicio && formatDate(match.fecha_inicio),
              formatClockTime(match.hora_inicio),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </div>

      {/* Participantes y marcadores */}
      <div className='space-y-1.5'>
        <MatchParticipantLine
          name={p1Name}
          team={match.equipo1}
          player={match.jugador1}
          sets={sets1}
          winner={match.ganador === 'jugador1'}
          isMe={mySide === 'jugador1'}
        />
        <MatchParticipantLine
          name={p2Name}
          team={match.equipo2}
          player={match.jugador2}
          sets={sets2}
          winner={match.ganador === 'jugador2'}
          isMe={mySide === 'jugador2'}
        />
      </div>

      {/* Detalle adicional: Compañero en dobles / Cancha */}
      <div className='flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[var(--border-color)] text-[11px]' style={{ color: 'var(--text-muted)' }}>
        {partner ? (
          <span className='flex items-center gap-1.5 truncate'>
            <Users className='w-3 h-3 text-[var(--color-brand)] shrink-0' />
            <span>Compañero:</span>
            <strong className='font-semibold' style={{ color: 'var(--text-secondary)' }}>
              {partner.nombre} {partner.apellido}
            </strong>
          </span>
        ) : (
          <span className='flex items-center gap-1.5 truncate'>
            <User className='w-3 h-3 text-sky-500 shrink-0' />
            <span>En solitario</span>
            {match.fase && <span style={{ color: 'var(--text-muted)' }}>· Fase: {match.fase}</span>}
          </span>
        )}

        {match.cancha?.nombre ? (
          <span className='flex items-center gap-1'>
            <MapPin className='w-3 h-3' /> {match.cancha.nombre}
          </span>
        ) : (
          <span className='flex items-center gap-1 text-[var(--color-brand)] font-medium'>
            Ver partido <ChevronRight className='w-3 h-3' />
          </span>
        )}
      </div>
    </Link>
  )
}

function MatchParticipantLine({ name, team, player, sets, winner, isMe }) {
  return (
    <div className='flex items-center gap-2 py-0.5'>
      <ParticipantAvatar team={team} player={player} name={name} size='xs' />
      <span
        className={cn(
          'flex-1 min-w-0 truncate text-sm',
          winner && 'font-bold',
          isMe && 'underline underline-offset-2 decoration-[var(--color-brand)]'
        )}
        style={{ color: winner ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        {name}
        {isMe && (
          <span className='ml-1.5 text-[10px] uppercase font-bold text-[var(--color-brand)]'>
            (Tú)
          </span>
        )}
      </span>
      <ScoreDisplay sets={sets} isWinner={winner} />
    </div>
  )
}

function FilterChip({ icon, label, count, active, onClick, highlight = false }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 text-xs rounded-full font-medium transition-colors flex items-center gap-1.5 shrink-0',
        active
          ? 'bg-[var(--color-brand)] text-white shadow-sm'
          : 'hover:bg-[var(--bg-hover)]'
      )}
      style={
        !active
          ? {
              backgroundColor: 'var(--bg-card)',
              color: highlight ? '#ef4444' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
            }
          : {}
      }
    >
      {icon && <span className='shrink-0'>{icon}</span>}
      <span>{label}</span>
      {count != null && (
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
            active ? 'bg-black/20 text-white' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function StatCard({ label, value, accent = false }) {
  return (
    <div className='card p-4'>
      <p className='text-xs mb-1' style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p
        className='text-lg font-bold'
        style={{ color: accent ? 'var(--color-brand)' : 'var(--text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}

function formatPercentage(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`
}
