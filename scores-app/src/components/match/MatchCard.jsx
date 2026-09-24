import { Link } from 'react-router-dom'
import { Clock3, MapPin, Star } from 'lucide-react'
import LiveBadge from './LiveBadge'
import MatchJudge from './MatchJudge'
import ScoreDisplay from './ScoreDisplay'
import useFavoritesStore from '../../store/useFavoritesStore'
import { formatClockTime, formatDate, formatFriendlyDateTime } from '../../utils/formatDate'
import { cn } from '../../utils/cn'
import { useLoginRequired } from '../../hooks/useLoginRequired'
import { getParticipantName } from '../../utils/matchParticipants'
import { useMatchTimer } from '../../hooks/useMatchTimer'
import ParticipantAvatar from '../ui/ParticipantAvatar'

export default function MatchCard({ match, compact = false, to }) {
  const { togglePartido, isPartidoFavorite } = useFavoritesStore()
  const requireLogin = useLoginRequired()
  const isFav = isPartidoFavorite(match.id)
  const isLive = match.estado === 'en_vivo'
  const isFinished = match.estado === 'finalizado'
  const winner = match.ganador
  const timer = useMatchTimer(match.en_vivo, match.estado)

  const p1Sets = match.sets?.map((s) => s.games_j1) ?? []
  const p2Sets = match.sets?.map((s) => s.games_j2) ?? []

  const p1Name = getParticipantName(match, 1)
  const p2Name = getParticipantName(match, 2)
  return (
    <Link to={to || `/match/${match.id}`} className='block h-full'>
      <div className={cn('card-hover group h-full flex flex-col justify-between', isLive && 'match-card-live')}>
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between',
            compact ? 'px-3.5 py-1.5' : 'px-4 py-2'
          )}
          style={{ borderBottom: '1px solid var(--border-color)' }}
        >
          <div className='flex items-center gap-1.5 min-w-0'>
            <span className='badge-brand shrink-0 text-[10px] px-2 py-0.5'>
              {match.categoria?.nombre || 'General'}
            </span>
            {compact && match.cancha?.nombre && (
              <span
                className='text-[10px] font-medium truncate flex items-center gap-1'
                style={{ color: 'var(--text-muted)' }}
              >
                <MapPin className='w-2.5 h-2.5 shrink-0' />
                {match.cancha.nombre}
              </span>
            )}
            {!compact && match.torneo?.nombre && (
              <span
                className='text-[10px] font-semibold truncate'
                style={{ color: 'var(--text-muted)' }}
              >
                {match.torneo.nombre}
              </span>
            )}
          </div>
          <div className='flex items-center gap-1.5 shrink-0 ml-2'>
            {isLive && (
              <span className='flex items-center gap-1.5'>
                <LiveBadge />
                {match.en_vivo?.iniciado_at && (
                  <span
                    className='flex items-center gap-1 text-xs font-semibold tabular-nums'
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Clock3 className='h-3.5 w-3.5 text-amber-500' /> {timer.formatted}
                  </span>
                )}
              </span>
            )}
            {isFinished && (
              <div className='flex items-center gap-1.5'>
                {!compact && (match.fecha_inicio || match.hora_inicio) && (
                  <span
                    className='inline-flex items-center gap-1 text-xs font-medium'
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <Clock3 className='w-3.5 h-3.5' style={{ color: 'var(--text-muted)' }} />
                    {formatFriendlyDateTime(match.fecha_inicio, match.hora_inicio)}
                  </span>
                )}
                <span
                  className='text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded'
                  style={{
                    backgroundColor: 'var(--color-brand-dim)',
                    color: 'var(--color-brand)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  FIN
                </span>
              </div>
            )}
            {!isLive && !isFinished && (match.fecha_inicio || match.hora_inicio) && (
              <span
                className='inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold'
                style={{
                  backgroundColor: 'var(--bg-hover)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <Clock3 className='w-3 h-3' style={{ color: 'var(--color-brand)' }} />
                {formatFriendlyDateTime(match.fecha_inicio, match.hora_inicio)}
              </span>
            )}
            <button
              onClick={(e) => {
                e.preventDefault()
                if (requireLogin('Para guardar partidos en favoritos debes iniciar sesión.')) {
                  togglePartido(match)
                }
              }}
              className='p-1 transition-colors'
              style={{ color: isFav ? '#facc15' : 'var(--text-muted)' }}
              title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            >
              <Star className={cn('w-3 h-3', isFav && 'fill-current')} />
            </button>
          </div>
        </div>

        {/* Jugadores + Scores */}
        <div className={cn(compact ? 'px-3.5 py-2 space-y-1.5 flex-1' : 'px-4 py-3 space-y-2.5')}>
          <PlayerRow
            name={p1Name}
            photo={match.jugador1?.foto}
            team={match.equipo1}
            sets={p1Sets}
            points={match.marcador_actual?.displayPoints?.[0]}
            isServing={match.marcador_actual?.server === 'jugador1'}
            isWinner={winner === 'jugador1'}
            isLive={isLive}
            compact={compact}
          />
          <PlayerRow
            name={p2Name}
            photo={match.jugador2?.foto}
            team={match.equipo2}
            sets={p2Sets}
            points={match.marcador_actual?.displayPoints?.[1]}
            isServing={match.marcador_actual?.server === 'jugador2'}
            isWinner={winner === 'jugador2'}
            isLive={isLive}
            compact={compact}
          />
        </div>

        {!compact && match.cancha && (
          <div
            className='px-4 py-2 text-[11px] flex items-center gap-1.5'
            style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}
          >
            <MapPin className='w-3 h-3' /> {match.cancha.nombre}
            {match.cancha.superficie ? ` · ${match.cancha.superficie}` : ''}
          </div>
        )}

        {!compact && <MatchJudge match={match} className='px-4 py-2' />}

        {!compact && match.notas && (
          <div
            className='px-4 py-2 text-xs line-clamp-2'
            style={{
              color: 'var(--text-secondary)',
              borderTop: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-hover)',
            }}
          >
            <span className='font-semibold'>Observación:</span> {match.notas}
          </div>
        )}
      </div>
    </Link>
  )
}

function PlayerRow({ name, photo, team, sets, points, isServing, isWinner, isLive, compact = false }) {
  return (
    <div className='flex items-center gap-2'>
      {isServing && isLive && (
        <span
          className='w-2 h-2 rounded-full shrink-0'
          style={{ backgroundColor: 'var(--club-clay)' }}
        />
      )}
      <ParticipantAvatar team={team} player={{ foto: photo }} name={name} size='xs' />
      <span
        className={cn('flex-1 truncate', compact ? 'text-xs' : 'text-sm')}
        style={{
          color: isWinner ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: isWinner ? 700 : 400,
        }}
      >
        {name || '—'}
      </span>
      <ScoreDisplay sets={sets} isWinner={isWinner} isLive={isLive} compact={compact} />
      {isLive && points != null && (
        <strong
          className='min-w-9 text-center rounded-md py-1 text-sm'
          style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}
        >
          {points}
        </strong>
      )}
    </div>
  )
}
