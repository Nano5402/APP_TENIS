import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Swords, Trophy, Radio, CalendarDays, ChevronRight } from 'lucide-react'
import { playerService } from '../../services/playerService'
import { teamService } from '../../services/teamService'
import { tournamentService } from '../../services/tournamentService'
import { matchService } from '../../services/matchService'
import { formatRelative } from '../../utils/formatDate'
import { getParticipantName } from '../../utils/matchParticipants'
import AdminAttention from '../../components/tournament/AdminAttention'

export default function Dashboard() {
  const [stats, setStats] = useState({ jugadores: 0, equipos: 0, torneos: 0, enVivo: 0 })
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    Promise.all([
      playerService.getAll(),
      teamService.getAll(),
      tournamentService.getAll({ estado: 'en_curso' }),
      matchService.getLive(),
      matchService.getFinished(),
    ])
      .then(([jugadores, equipos, torneos, live, finished]) => {
        if (!active) return
        setStats({
          jugadores: jugadores.data?.length || 0,
          equipos: equipos.data?.length || 0,
          torneos: torneos.data?.length || 0,
          enVivo: live.data?.length || 0,
        })
        setRecent(finished.data?.slice(0, 5) || [])
      })
      .catch(() => { if (active) setError('No se pudo consultar el resumen. Los valores no están disponibles.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [revision])

  const STAT_CARDS = [
    {
      label: 'Jugadores',
      value: stats.jugadores,
      icon: Users,
      to: '/admin/jugadores',
      color: 'var(--club-green)',
    },
    {
      label: 'Parejas',
      value: stats.equipos,
      icon: Swords,
      to: '/admin/equipos',
      color: 'var(--club-green-light)',
    },
    {
      label: 'Torneos activos',
      value: stats.torneos,
      icon: Trophy,
      to: '/admin/torneos',
      color: 'var(--color-brand)',
    },
    {
      label: 'En vivo ahora',
      value: stats.enVivo,
      icon: Radio,
      to: '/admin/partidos',
      color: 'var(--club-clay)',
    },
  ]

  return (
    <div className='space-y-8 animate-fade-up'>
      <div>
        <h1
          className='text-2xl font-extrabold tracking-[-0.035em]'
          style={{ color: 'var(--text-primary)' }}
        >
          Resumen del torneo
        </h1>
        <p className='text-sm mt-0.5' style={{ color: 'var(--text-muted)' }}>
          Resumen general del club
        </p>
      </div>

      <AdminAttention />
      {error && <div role='alert' className='card p-4 text-sm'>{error} <button className='underline font-semibold' onClick={() => setRevision(n => n + 1)}>Reintentar resumen</button></div>}
      {/* Stats */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
        {STAT_CARDS.map((card) => (
          <Link key={card.label} to={card.to}>
            <div className='card-hover p-4'>
              <div className='flex items-center justify-between mb-3'>
                <p
                  className='text-xs font-semibold uppercase tracking-wide'
                  style={{ color: 'var(--text-muted)' }}
                >
                  {card.label}
                </p>
                <div
                  className='w-8 h-8 rounded-lg flex items-center justify-center'
                  style={{ backgroundColor: `${card.color}20` }}
                >
                  <card.icon className='w-4 h-4' style={{ color: card.color }} />
                </div>
              </div>
              <p className='text-3xl font-black' style={{ color: 'var(--text-primary)' }}>
                {loading || error ? '—' : card.value}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Acciones rápidas */}
      <div>
        <h2 className='text-base font-semibold mb-3' style={{ color: 'var(--text-primary)' }}>
          Acciones rápidas
        </h2>
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'>
          {[
            { label: 'Nuevo jugador', to: '/admin/jugadores', icon: Users },
            { label: 'Nueva pareja', to: '/admin/equipos', icon: Swords },
            { label: 'Nuevo torneo', to: '/admin/torneos', icon: Trophy },
            { label: 'Nuevo partido', to: '/admin/partidos', icon: CalendarDays },
          ].map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className='card p-3 flex items-center gap-3 hover:border-[var(--border-hover)] transition-all'
            >
              <action.icon className='w-4 h-4 shrink-0' style={{ color: 'var(--color-brand)' }} />
              <span className='text-sm font-medium' style={{ color: 'var(--text-primary)' }}>
                {action.label}
              </span>
              <ChevronRight
                className='w-4 h-4 ml-auto shrink-0'
                style={{ color: 'var(--text-muted)' }}
              />
            </Link>
          ))}
        </div>
      </div>

      {/* Últimos resultados */}
      {recent.length > 0 && (
        <div>
          <div className='flex items-center justify-between mb-3'>
            <h2 className='text-base font-semibold' style={{ color: 'var(--text-primary)' }}>
              Últimos resultados
            </h2>
            <Link
              to='/admin/partidos'
              className='text-xs font-medium flex items-center gap-1'
              style={{ color: 'var(--color-brand)' }}
            >
              Ver todos <ChevronRight className='w-3.5 h-3.5' />
            </Link>
          </div>
          <div className='card overflow-hidden'>
            {recent.map((m, i) => {
              const p1 = getParticipantName(m, 1)
              const p2 = getParticipantName(m, 2)
              const ganadorNombre = m.ganador === 'jugador1' ? p1 : m.ganador === 'jugador2' ? p2 : 'Sin ganador registrado'

              return (
                <div
                  key={m.id}
                  className='list-row'
                  style={{
                    borderBottom: i < recent.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  <div className='flex-1 min-w-0'>
                    <p
                      className='text-sm font-medium truncate'
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {p1} <span style={{ color: 'var(--text-muted)' }}>vs</span> {p2}
                    </p>
                    <p className='text-xs mt-0.5' style={{ color: 'var(--text-muted)' }}>
                      {m.categoria?.nombre || 'Sin categoría'}
                    </p>
                  </div>
                  <div className='text-right shrink-0'>
                    <p className='text-xs font-semibold' style={{ color: 'var(--color-brand)' }}>
                      🏆 {ganadorNombre}
                    </p>
                    {m.fecha_inicio && (
                      <p className='text-[10px]' style={{ color: 'var(--text-muted)' }}>
                        {formatRelative(m.fecha_inicio)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
