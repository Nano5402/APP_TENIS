import { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useMatchRealtime } from '../../hooks/useMatchRealtime'
import { matchService } from '../../services/matchService'

function ClosureCard({ info, player1, player2 }) {
  const winner = info.ganador === 'jugador1' ? player1 : info.ganador === 'jugador2' ? player2 : null
  const sets = info.sets || []
  return <section className='rounded-2xl border p-4 sm:p-5 space-y-3 text-left' style={{ borderColor: 'var(--border-color)', background: 'var(--bg-hover)' }}>
    <span className='text-xs font-bold uppercase tracking-wider' style={{ color: 'var(--color-brand)' }}>
      {info.es_retiro ? 'Cierre por retiro' : info.doble ? 'Doble W.O.' : 'Victoria por W.O.'}
    </span>
    <h3 className='font-bold text-base break-words' style={{ color: 'var(--text-primary)' }}>{winner ? `Victoria: ${winner}` : 'Sin ganador'}</h3>
    <div className='grid grid-cols-2 gap-3'>
      <div className='rounded-xl p-3' style={{ background: 'var(--bg-card)' }}><p className='text-xs'>Marcador registrado (lado 1 / lado 2)</p><strong className='text-lg'>{info.marcador_oficial || 'Sin parciales'}</strong></div>
      <div className='rounded-xl p-3' style={{ background: 'var(--bg-card)' }}><p className='text-xs'>Puntos de clasificación</p><strong className='text-lg'>{winner ? '1 al ganador · 0 al rival' : '0 para ambos'}</strong></div>
    </div>
    <p className='text-xs leading-relaxed'>{info.es_retiro ? 'Se conservan el marcador y las acciones registradas antes del retiro.' : !sets.length && winner ? 'No hay sets guardados: no se atribuyen games ni sets desconocidos. Requiere revisión administrativa.' : 'El marcador asignado no genera aces, winners ni otros puntos de juego ficticios.'}</p>
  </section>
}

const ROWS = [
  ['Total de puntos ganados', 'puntos_ganados'],
  ['Aces · puntos directos de saque', 'aces'],
  ['Dobles faltas cometidas', 'dobles_faltas'],
  ['Primer saque dentro (%)', 'porcentaje_primer_servicio', '%'],
  ['Puntos ganados al primer saque', 'puntos_primer_servicio_ganados'],
  ['Puntos ganados al segundo saque', 'puntos_segundo_servicio_ganados'],
  ['Winners · golpes ganadores', 'tiros_ganadores'],
  ['Errores no forzados cometidos', 'errores_no_forzados'],
]

export default function MatchStats({ matchId, player1, player2, initialStats = null, isLive = false }) {
  const [stats, setStats] = useState(initialStats)
  const [walkover, setWalkover] = useState(initialStats?.walkover || null)
  const [totalSets, setTotalSets] = useState(0)
  const [selectedSet, setSelectedSet] = useState(null)
  const [loading, setLoading] = useState(!initialStats)
  const [hasCorrections, setHasCorrections] = useState(false)
  const [view, setView] = useState('chart')
  const sequence = useRef(0)
  const refreshTimer = useRef(null)

  const loadStats = useCallback(({ silent = false } = {}) => {
    if (!matchId) return
    const version = ++sequence.current
    if (!silent) setLoading(true)
    matchService.getStats(matchId, selectedSet)
      .then((response) => {
        if (version !== sequence.current) return
        setStats(response.data?.estadisticas || null)
        setWalkover(response.data?.walkover || null)
        setTotalSets(Number(response.data?.total_sets || 0))
        setHasCorrections(Boolean(response.data?.tiene_correcciones))
      })
      .catch(() => { if (version === sequence.current) { setStats(null); setWalkover(null) } })
      .finally(() => {
        if (version === sequence.current) setLoading(false)
      })
  }, [matchId, selectedSet])

  useEffect(() => {
    loadStats()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadStats({ silent: true })
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      sequence.current++
      clearTimeout(refreshTimer.current)
      refreshTimer.current = null
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [loadStats, isLive])

  useMatchRealtime(useCallback((event) => {
    if (event.matchId === null || Number(event.matchId) === Number(matchId)) {
      if (document.visibilityState !== 'visible' || refreshTimer.current !== null) return
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null
        if (document.visibilityState === 'visible') loadStats({ silent: true })
      }, 250)
    }
  }, [loadStats, matchId]))

  if (loading) return <div className='skeleton h-44 rounded-xl' />
  if (!stats || (!stats.jugador1?.puntos_ganados && !stats.jugador2?.puntos_ganados)) {
    return (
      <div className='text-center py-8' style={{ color: 'var(--text-muted)' }}>
        {walkover ? <ClosureCard info={walkover} player1={player1} player2={player2} /> : <>
        <BarChart3 className='w-7 h-7 mx-auto mb-2 opacity-40' />
        <p className='text-sm'>Aún no hay estadísticas disponibles.</p>
        </>}
        {selectedSet !== null && <FilterButton active={false} onClick={() => setSelectedSet(null)}>Volver al partido completo</FilterButton>}
        {hasCorrections && <p className='text-xs mt-2'>El marcador contiene una corrección supervisada; no se generan estadísticas de puntos que no fueron registrados.</p>}
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      {walkover && <ClosureCard info={walkover} player1={player1} player2={player2} />}
      {hasCorrections && <p className='text-xs rounded-lg p-3 bg-amber-500/10'>Este marcador tiene correcciones supervisadas. Las estadísticas conservan los puntos registrados y pueden no coincidir con los games corregidos.</p>}
      <p className='text-xs' style={{ color: 'var(--text-muted)' }}>Estadísticas basadas en los puntos y saques registrados por el juez.</p>
      <details className='rounded-xl p-3 text-xs' style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
        <summary className='cursor-pointer font-semibold py-1'>¿Qué significa cada indicador?</summary>
        <dl className='mt-3 space-y-2'>
          <div><dt className='font-bold'>Puntos ganados</dt><dd>Total de puntos registrados a favor, no juegos ni sets.</dd></div>
          <div><dt className='font-bold'>Ace / Winner</dt><dd>Ace: saque válido que el rival no toca. Winner: golpe ganador que el rival no consigue devolver.</dd></div>
          <div><dt className='font-bold'>Doble falta</dt><dd>Dos faltas de saque en el mismo punto; el punto lo gana el receptor.</dd></div>
          <div><dt className='font-bold'>Primer saque dentro</dt><dd>Porcentaje de puntos con servicio registrado en los que entró el primer saque. No es el porcentaje de puntos ganados.</dd></div>
          <div><dt className='font-bold'>Puntos ganados al primer / segundo saque</dt><dd>Cantidad de puntos que ganó el sacador usando ese servicio; no es un porcentaje.</dd></div>
          <div><dt className='font-bold'>Error no forzado / forzado</dt><dd>No forzado: fallo sin presión clara del golpe rival. Forzado: fallo provocado por esa presión. El error se atribuye a quien falla, no a quien gana el punto.</dd></div>
        </dl>
        <p className='mt-3'>En el modo rápido no se clasifica el motivo: un cero en Winners, Aces o errores no demuestra que no hayan ocurrido. «—» indica que el dato no está disponible.</p>
      </details>
      <div className='flex flex-wrap gap-2' role='group' aria-label='Vista de estadísticas'>
        <FilterButton active={view === 'chart'} onClick={() => setView('chart')}>Comparación gráfica</FilterButton>
        <FilterButton active={view === 'table'} onClick={() => setView('table')}>Tabla de datos</FilterButton>
      </div>
      {totalSets > 1 && (
        <div className='flex gap-1.5 flex-wrap'>
          <FilterButton active={selectedSet === null} onClick={() => setSelectedSet(null)}>Partido</FilterButton>
          {Array.from({ length: totalSets }, (_, index) => (
            <FilterButton key={index} active={selectedSet === index + 1} onClick={() => setSelectedSet(index + 1)}>
              Set {index + 1}
            </FilterButton>
          ))}
        </div>
      )}

      {view === 'chart' ? <div className='space-y-5'>
        <div className='grid grid-cols-2 gap-4 text-xs font-bold'>
          <span style={{ color: 'var(--club-green)' }}>{player1}</span>
          <span className='text-right' style={{ color: 'var(--club-clay)' }}>{player2}</span>
        </div>
        <p className='text-xs' style={{ color: 'var(--text-muted)' }}>Cada fila compara ambos lados en la misma escala. En faltas y errores, un valor menor es mejor. Los motivos no registrados no se pueden deducir.</p>
        {ROWS.map(([label, key, suffix = '']) => {
          const a = stats.jugador1?.[key]
          const b = stats.jugador2?.[key]
          const scale = suffix === '%' ? 100 : Math.max(Number(a) || 0, Number(b) || 0, 1)
          return <div key={key} className='space-y-2'>
            <p className='text-sm font-medium text-center'>{label}</p>
            <div className='grid grid-cols-2 gap-3'>
              {[a, b].map((value, index) => <div key={index}>
                <p className={`text-sm font-bold mb-1 ${index ? 'text-right' : ''}`}>{value == null ? '—' : `${value}${suffix}`}</p>
                <div className='h-2 rounded-full overflow-hidden' style={{ backgroundColor: 'var(--bg-hover)' }} aria-hidden='true'>
                  <div className='h-full rounded-full transition-all duration-300' style={{ width: `${Math.min(100, Math.max(0, Number(value) || 0) / scale * 100)}%`, backgroundColor: index ? 'var(--club-clay)' : 'var(--club-green)' }} />
                </div>
              </div>)}
            </div>
          </div>
        })}
      </div> : <>
      <div className='grid grid-cols-[minmax(120px,1fr)_64px_64px] gap-2 text-xs font-bold pb-1' style={{ color: 'var(--text-muted)' }}>
        <span />
        <span className='text-center break-words'>{player1}</span>
        <span className='text-center break-words'>{player2}</span>
      </div>
      {ROWS.map(([label, key, suffix = '']) => (
        <div key={key} className='grid grid-cols-[minmax(120px,1fr)_64px_64px] gap-2 items-center py-2.5 text-sm' style={{ borderTop: '1px solid var(--border-color)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
          <strong className='text-center' style={{ color: 'var(--club-green)' }}>{stats.jugador1?.[key] == null ? '—' : `${stats.jugador1[key]}${suffix}`}</strong>
          <strong className='text-center' style={{ color: 'var(--club-clay)' }}>{stats.jugador2?.[key] == null ? '—' : `${stats.jugador2[key]}${suffix}`}</strong>
        </div>
      ))}
      </>}
    </div>
  )
}

function FilterButton({ active, onClick, children }) {
  return (
    <button type='button' aria-pressed={active} onClick={onClick} className='px-3 py-1.5 rounded-full text-xs font-semibold' style={{ backgroundColor: active ? 'var(--color-brand-dim)' : 'var(--bg-hover)', color: active ? 'var(--color-brand)' : 'var(--text-muted)' }}>
      {children}
    </button>
  )
}
