import { cn } from '../../utils/cn'

export default function ScoreDisplay({ sets, isWinner, isLive, compact = false }) {
  if (!sets?.length) return <span className='text-text-muted text-xs'>vs</span>
  const displaySets = compact
    ? sets
    : Array.from(
        { length: Math.max(3, sets.length) },
        (_, index) => sets[index] ?? '/'
      )

  return (
    <div
      className='flex items-center gap-1.5 shrink-0'
      aria-label={`Marcador por sets: ${displaySets.join(', ')}`}
    >
      {displaySets.map((score, index) => (
        <span
          key={index}
          className={cn(
            'score-number text-center font-bold tabular-nums',
            compact ? 'text-xs min-w-[1.1rem]' : 'text-base min-w-[1.25rem]',
            isLive && index === sets.length - 1
              ? 'text-text-primary'
              : isWinner
                ? 'text-[var(--color-brand)] font-extrabold'
                : 'text-[var(--text-muted)] font-medium'
          )}
        >
          {score}
        </span>
      ))}
    </div>
  )
}
