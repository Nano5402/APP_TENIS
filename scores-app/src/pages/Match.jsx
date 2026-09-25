import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Clock3,
  MapPin,
  MessageSquareText,
  Star,
} from 'lucide-react'
import LiveBadge from '../components/match/LiveBadge'
import MatchStats from '../components/match/MatchStats'
import ClayCourt from '../components/match/ClayCourt'
import MatchJudge from '../components/match/MatchJudge'
import MatchPhoto from '../components/match/MatchPhoto'
import MatchPhotoCapture from '../components/match/MatchPhotoCapture'
import useAuthStore from '../store/useAuthStore'
import { MatchCardSkeleton } from '../components/ui/Skeleton'
import useFavoritesStore from '../store/useFavoritesStore'
import { useMatch } from '../hooks/useMatches'
import { formatClockTime, formatDate } from '../utils/formatDate'
import { cn } from '../utils/cn'
import { useLoginRequired } from '../hooks/useLoginRequired'
import { getParticipantName } from '../utils/matchParticipants'
import { useMatchTimer } from '../hooks/useMatchTimer'
import ParticipantAvatar from '../components/ui/ParticipantAvatar'

export default function Match() {
  const user = useAuthStore((store) => store.user)
  const { id } = useParams()
  const { match, loading } = useMatch(id)
  const { togglePartido, isPartidoFavorite } = useFavoritesStore()
  const requireLogin = useLoginRequired()
  const matchTimer = useMatchTimer(match?.en_vivo, match?.estado)

  if (loading)
    return (
      <div className='space-y-4'>
        <MatchCardSkeleton />
        <MatchCardSkeleton />
      </div>
    )
  if (!match)
    return (
      <p className='text-center py-16 text-sm' style={{ color: 'var(--text-muted)' }}>
        Partido no encontrado
      </p>
    )

  const isLive = match.estado === 'en_vivo'
  const statusLabel =
    {
      programado: 'PROGRAMADO',
      finalizado: 'FIN',
      cancelado: 'CANCELADO',
    }[match.estado] || match.estado
  const winner = match.ganador
  const isDoubles = match.modalidad === 'dobles'
  const isFav = isPartidoFavorite(match.id)

  const p1 = isDoubles
    ? { name: getParticipantName(match, 1), team: match.equipo1 }
    : {
        name: getParticipantName(match, 1),
        ranking: match.jugador1?.ranking,
        photo: match.jugador1?.foto,
      }
  const p2 = isDoubles
    ? { name: getParticipantName(match, 2), team: match.equipo2 }
    : {
        name: getParticipantName(match, 2),
        ranking: match.jugador2?.ranking,
        photo: match.jugador2?.foto,
      }

  const p1Scores = match.sets?.map((set) => set.games_j1) ?? []
  const p2Scores = match.sets?.map((set) => set.games_j2) ?? []
  const setCount = Math.max(3, p1Scores.length, p2Scores.length)
  const p1Sets = Array.from({ length: setCount }, (_, index) => p1Scores[index] ?? '/')
  const p2Sets = Array.from({ length: setCount }, (_, index) => p2Scores[index] ?? '/')
  const { formatted: elapsed, isPaused } = matchTimer

  return (
    <div className='space-y-5 animate-fade-up'>
      <div className='flex items-center justify-between'>
        <Link
          to='/'
          className='flex items-center gap-2 text-sm transition-colors'
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className='w-4 h-4' /> Volver
        </Link>
        <button
          onClick={() => {
            if (requireLogin('Para guardar partidos en favoritos debes iniciar sesión.')) {
              togglePartido(match)
            }
          }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all btn-ghost'
          )}
          style={{ color: isFav ? '#facc15' : 'var(--text-muted)' }}
        >
          <Star className={cn('w-4 h-4', isFav && 'fill-current')} />
          {isFav ? 'Guardado' : 'Guardar'}
        </button>
      </div>

      {/* Scoreboard */}
      <div className='card p-5'>
        <div
          className='flex items-center justify-center gap-2 mb-5 text-sm'
          style={{ color: 'var(--text-muted)' }}
        >
          {match.categoria?.nombre && <span className='badge-brand'>{match.categoria.nombre}</span>}
          {match.torneo?.nombre && <span className='font-semibold'>{match.torneo.nombre}</span>}
          {match.cancha?.nombre && (
            <span className='inline-flex items-center gap-1'>
              <MapPin className='w-3 h-3' />
              {match.cancha.nombre}
            </span>
          )}
        </div>

        <MatchJudge match={match} className='justify-center mb-4' />

        <div className='space-y-4'>
          <ScoreRow
            player={p1}
            sets={p1Sets}
            points={match.marcador_actual?.displayPoints?.[0]}
            isServing={match.marcador_actual?.server === 'jugador1'}
            isWinner={winner === 'jugador1'}
            isLive={isLive}
          />
          <div className='flex items-center gap-3'>
            <div className='flex-1 h-px' style={{ backgroundColor: 'var(--border-color)' }} />
            {isLive ? (
              <div className='flex items-center gap-2'>
                <LiveBadge />
                {match.en_vivo && (
                  <span
                    className='inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-xs'
                    style={{
                      backgroundColor: 'var(--bg-hover)',
                      color: isPaused ? 'var(--club-clay)' : 'var(--text-secondary)',
                    }}
                  >
                    <Clock3 className='w-3 h-3' /> {elapsed}
                    {isPaused ? ' · PAUSADO' : ''}
                  </span>
                )}
              </div>
            ) : (
              <span className='text-xs px-2' style={{ color: 'var(--text-muted)' }}>
                {statusLabel}
              </span>
            )}
            <div className='flex-1 h-px' style={{ backgroundColor: 'var(--border-color)' }} />
          </div>
          <ScoreRow
            player={p2}
            sets={p2Sets}
            points={match.marcador_actual?.displayPoints?.[1]}
            isServing={match.marcador_actual?.server === 'jugador2'}
            isWinner={winner === 'jugador2'}
            isLive={isLive}
          />
        </div>

        <div
          className='flex items-center justify-center gap-4 mt-5 text-xs'
          style={{ color: 'var(--text-muted)' }}
        >
          {(match.fecha_inicio || match.hora_inicio) && (
            <span className='flex items-center gap-1'>
              <CalendarDays className='w-3 h-3' />
              {[
                match.fecha_inicio && formatDate(match.fecha_inicio),
                formatClockTime(match.hora_inicio),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>
      </div>

      {match.deporte === 'tenis' && match.estado === 'en_vivo' && (
        <div className='card p-4'>
          <ClayCourt match={match} />
        </div>
      )}
      {match.notas && (
        <div
          className='card p-4 flex items-start gap-3'
          style={{ borderColor: 'var(--club-clay)' }}
        >
          <MessageSquareText
            className='w-4 h-4 mt-0.5 shrink-0'
            style={{ color: 'var(--club-clay)' }}
          />
          <div>
            <p className='text-xs font-semibold mb-1' style={{ color: 'var(--text-primary)' }}>
              Observación del partido
            </p>
            <p className='text-sm leading-relaxed' style={{ color: 'var(--text-secondary)' }}>
              {match.notas}
            </p>
          </div>
        </div>
      )}

      {user?.rol === 'admin' && (
        <MatchPhotoCapture
          key={`photo:${user.id}:${match.id}`}
          matchId={match.id}
          userId={user.id}
          finished={match.estado === 'finalizado'}
        />
      )}
      <MatchPhoto key={match.id} matchId={match.id} match={match} />
      {(isLive || match.estado === 'finalizado') && match.deporte === 'tenis' && (
        <section className='card p-4 sm:p-5'>
          <h2
            className='font-bold flex items-center gap-2 mb-4'
            style={{ color: 'var(--text-primary)' }}
          >
            <BarChart3 className='w-4 h-4' /> Estadísticas del partido
          </h2>
          {isDoubles && (
            <p className='text-xs mb-4' style={{ color: 'var(--text-muted)' }}>
              En dobles, estas estadísticas corresponden a cada pareja completa, no a cada jugador
              por separado.
            </p>
          )}
          <MatchStats matchId={match.id} player1={p1.name} player2={p2.name} />
        </section>
      )}
    </div>
  )
}

function ScoreRow({ player, sets, points, isServing, isWinner, isLive }) {
  return (
    <div className='flex items-center gap-3'>
      <div className='flex items-center gap-2 flex-1 min-w-0'>
        {isServing && isLive && (
          <span
            className='w-2.5 h-2.5 rounded-full shrink-0'
            style={{ backgroundColor: 'var(--club-clay)' }}
          />
        )}
        <ParticipantAvatar
          team={player.team}
          player={{ foto: player.photo }}
          name={player.name}
          size='sm'
        />
        <div>
          <p
            className='font-semibold'
            style={{ color: isWinner ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {player.name || '—'}
          </p>
          {player.ranking && (
            <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
              Ranking #{player.ranking}
            </p>
          )}
        </div>
      </div>
      <div className='flex items-center gap-3 max-w-[55%] overflow-x-auto pb-1'>
        {sets.map((s, i) => (
          <span
            key={i}
            className='score-number text-2xl min-w-[1.75rem] text-center'
            style={{ color: isWinner ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {s}
          </span>
        ))}
        {isLive && points != null && (
          <strong
            className='score-number text-2xl min-w-[2.5rem] text-center rounded-lg py-1'
            style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}
          >
            {points}
          </strong>
        )}
      </div>
    </div>
  )
}
