import { cn } from '../../utils/cn'

export default function Skeleton({ className = '' }) {
  return <div className={cn('skeleton', className)} />
}

export function MatchCardSkeleton() {
  return (
    <div className='card p-4 space-y-3'>
      <div className='flex justify-between'>
        <Skeleton className='h-3 w-32' />
        <Skeleton className='h-3 w-12' />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Skeleton className='h-5 w-5 rounded-full' />
            <Skeleton className='h-3 w-28' />
          </div>
          <Skeleton className='h-5 w-14' />
        </div>
      ))}
    </div>
  )
}

export function TournamentHeaderSkeleton() {
  return (
    <div className='space-y-5 animate-pulse'>
      <div className='flex justify-between items-center'>
        <Skeleton className='h-8 w-32 rounded-lg' />
        <Skeleton className='h-8 w-24 rounded-lg' />
      </div>
      <div className='card p-5 space-y-3'>
        <Skeleton className='h-4 w-40 rounded' />
        <Skeleton className='h-8 w-72 rounded-lg' />
        <Skeleton className='h-4 w-48 rounded' />
      </div>
      <div className='flex flex-wrap gap-2'>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className='h-9 w-28 rounded-xl' />
        ))}
      </div>
    </div>
  )
}

export function TournamentBracketSkeleton() {
  return (
    <div className='space-y-4 animate-pulse'>
      {/* Selector de categorías simulado */}
      <div className='p-3.5 card rounded-2xl flex flex-wrap items-center justify-between gap-3 border border-[var(--border-color)]'>
        <div className='flex items-center gap-2'>
          <Skeleton className='w-4 h-4 rounded-full' />
          <Skeleton className='h-4 w-32 rounded' />
        </div>
        <div className='flex flex-wrap gap-2'>
          <Skeleton className='h-8 w-24 rounded-full' />
          <Skeleton className='h-8 w-24 rounded-full' />
          <Skeleton className='h-8 w-24 rounded-full' />
        </div>
      </div>

      {/* Estructura del cuadro de llaves */}
      <div className='card p-4 sm:p-6 rounded-2xl overflow-hidden border border-[var(--border-color)] space-y-4'>
        <div className='flex items-center justify-between pb-3 border-b border-[var(--border-color)]'>
          <div className='flex items-center gap-2'>
            <Skeleton className='h-6 w-48 rounded-lg' />
            <Skeleton className='h-5 w-20 rounded-full' />
          </div>
          <div className='flex items-center gap-2'>
            <Skeleton className='h-8 w-28 rounded-xl' />
            <Skeleton className='h-8 w-28 rounded-xl' />
          </div>
        </div>

        {/* Columnas de eliminatorias */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 min-h-[380px]'>
          {/* Ronda 1: Cuartos / Semis */}
          <div className='space-y-4 flex flex-col justify-around'>
            <div className='flex items-center justify-between px-1'>
              <Skeleton className='h-4 w-24 rounded' />
              <Skeleton className='h-4 w-12 rounded-full' />
            </div>
            {[1, 2].map((idx) => (
              <div key={idx} className='p-3.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-input)] space-y-2.5'>
                <div className='flex justify-between items-center'>
                  <Skeleton className='h-3 w-16 rounded' />
                  <Skeleton className='h-3 w-10 rounded' />
                </div>
                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Skeleton className='w-6 h-6 rounded-full' />
                      <Skeleton className='h-3 w-28 rounded' />
                    </div>
                    <Skeleton className='h-4 w-8 rounded' />
                  </div>
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Skeleton className='w-6 h-6 rounded-full' />
                      <Skeleton className='h-3 w-24 rounded' />
                    </div>
                    <Skeleton className='h-4 w-8 rounded' />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Ronda 2: Semifinales */}
          <div className='space-y-4 flex flex-col justify-center'>
            <div className='flex items-center justify-between px-1'>
              <Skeleton className='h-4 w-28 rounded' />
              <Skeleton className='h-4 w-12 rounded-full' />
            </div>
            <div className='p-4 rounded-2xl border border-emerald-500/20 bg-[var(--bg-input)] space-y-3 shadow-sm'>
              <div className='flex justify-between items-center'>
                <Skeleton className='h-3 w-20 rounded' />
                <Skeleton className='h-3 w-12 rounded' />
              </div>
              <div className='space-y-2.5'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Skeleton className='w-6 h-6 rounded-full' />
                    <Skeleton className='h-3 w-32 rounded' />
                  </div>
                  <Skeleton className='h-4 w-8 rounded' />
                </div>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Skeleton className='w-6 h-6 rounded-full' />
                    <Skeleton className='h-3 w-28 rounded' />
                  </div>
                  <Skeleton className='h-4 w-8 rounded' />
                </div>
              </div>
            </div>
          </div>

          {/* Ronda 3: Gran Final */}
          <div className='space-y-4 flex flex-col justify-center'>
            <div className='flex items-center justify-between px-1'>
              <Skeleton className='h-4 w-28 rounded' />
              <Skeleton className='h-4 w-16 rounded-full' />
            </div>
            <div className='p-4 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 space-y-3 shadow-md'>
              <div className='flex justify-between items-center'>
                <Skeleton className='h-3 w-24 rounded' />
                <Skeleton className='h-3 w-12 rounded' />
              </div>
              <div className='space-y-2.5'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Skeleton className='w-7 h-7 rounded-full' />
                    <Skeleton className='h-3.5 w-32 rounded' />
                  </div>
                  <Skeleton className='h-5 w-8 rounded' />
                </div>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <Skeleton className='w-7 h-7 rounded-full' />
                    <Skeleton className='h-3.5 w-28 rounded' />
                  </div>
                  <Skeleton className='h-5 w-8 rounded' />
                </div>
              </div>
              <div className='pt-2 border-t border-[var(--border-color)]/60 flex justify-center'>
                <Skeleton className='h-4 w-36 rounded-full' />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
