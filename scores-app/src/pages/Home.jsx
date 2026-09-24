import { Link } from 'react-router-dom'
import { CalendarDays, ChevronDown, ChevronRight, ChevronUp, Clock3, History, Radio, Trophy } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import MatchCard from '../components/match/MatchCard'
import SponsorsCarousel from '../components/sponsors/SponsorsCarousel'
import { MatchCardSkeleton } from '../components/ui/Skeleton'
import SectionHeader from '../components/common/SectionHeader'
import { useMatches } from '../hooks/useMatches'
import { newsService } from '../services/newsService'
import { formatFriendlyDateTime, formatRelative } from '../utils/formatDate'

function getMatchTime(m) {
  if (!m) return 0
  if (m.en_vivo?.finalizado_at) {
    const t = new Date(m.en_vivo.finalizado_at).getTime()
    if (!isNaN(t) && t > 0) return t
  }
  if (m.fecha_inicio) {
    const dStr = String(m.fecha_inicio).slice(0, 10)
    const tStr = m.hora_inicio ? String(m.hora_inicio).slice(0, 5) : '00:00'
    const [year, month, day] = dStr.split('-').map(Number)
    const [h, min] = tStr.split(':').map(Number)
    if (year && month && day) {
      const t = new Date(year, month - 1, day, h || 0, min || 0).getTime()
      if (!isNaN(t) && t > 0) return t
    }
  }
  return 0
}

function getMatchSlotKey(m) {
  if (!m) return ''
  const dateStr = m.fecha_inicio ? String(m.fecha_inicio).slice(0, 10) : ''
  const timeStr = m.hora_inicio ? String(m.hora_inicio).slice(0, 5) : ''
  return `${dateStr} ${timeStr}`.trim()
}

export default function Home() {
  const { matches: live, loading: ll } = useMatches({ estado: 'en_vivo' })
  const { matches: finished, loading: lf } = useMatches({ estado: 'finalizado' })
  const { matches: upcoming, loading: lu } = useMatches({ estado: 'programado' })
  const [news, setNews] = useState([])
  const [isUpcomingExpanded, setIsUpcomingExpanded] = useState(false)

  const INITIAL_UPCOMING_COUNT = 2

  useEffect(() => {
    newsService
      .getAll()
      .then((r) => setNews(r.data?.slice(0, 4) || []))
      .catch(() => {})
  }, [])

  // Agrupar los partidos concluidos del último turno/hora jugado
  const { latestSlotMatches, latestMatch } = useMemo(() => {
    if (!finished.length) return { latestSlotMatches: [], latestMatch: null }

    const sorted = [...finished].sort((a, b) => {
      const tb = getMatchTime(b)
      const ta = getMatchTime(a)
      return tb - ta || Number(b.id) - Number(a.id)
    })

    const mostRecent = sorted[0]
    const mostRecentTime = getMatchTime(mostRecent)
    const mostRecentSlotKey = getMatchSlotKey(mostRecent)
    const mostRecentDate = mostRecent.fecha_inicio ? String(mostRecent.fecha_inicio).slice(0, 10) : ''

    // Agrupar todos los partidos que concluyeron en ese mismo turno o bloque horario
    const slotMatches = sorted.filter((m) => {
      // 1. Mismo turno exacto por fecha y hora (ej. ambos ayer a las 8:00 PM)
      const mSlotKey = getMatchSlotKey(m)
      if (mostRecentSlotKey && mSlotKey === mostRecentSlotKey) {
        return true
      }
      // 2. Misma fecha y dentro de una ventana de 45 minutos del turno más reciente
      const mDate = m.fecha_inicio ? String(m.fecha_inicio).slice(0, 10) : ''
      if (mostRecentDate && mDate === mostRecentDate) {
        const t = getMatchTime(m)
        if (mostRecentTime > 0 && t > 0 && Math.abs(mostRecentTime - t) <= 45 * 60 * 1000) {
          return true
        }
      }
      return false
    })

    return { latestSlotMatches: slotMatches, latestMatch: mostRecent }
  }, [finished])

  // Ordenar los próximos partidos cronológicamente
  const sortedUpcoming = useMemo(() => {
    return [...upcoming].sort((a, b) => {
      const ta = getMatchTime(a)
      const tb = getMatchTime(b)
      if (ta !== tb) return ta - tb
      return Number(a.id) - Number(b.id)
    })
  }, [upcoming])

  const visibleUpcoming = isUpcomingExpanded
    ? sortedUpcoming
    : sortedUpcoming.slice(0, INITIAL_UPCOMING_COUNT)

  const slotFriendlyLabel = latestMatch
    ? formatFriendlyDateTime(latestMatch.fecha_inicio, latestMatch.hora_inicio)
    : ''

  return (
    <div className='space-y-8 animate-fade-up'>
      <SponsorsCarousel />

      <section className='hero-panel'>
        <div className='relative z-10 max-w-2xl'>
          <span className='hero-kicker'>
            <Trophy className='w-3.5 h-3.5' />
            Club Unión · Bucaramanga
          </span>
          <h1 className='text-3xl sm:text-5xl font-extrabold tracking-[-0.05em] leading-[1.08] mt-5 max-w-xl'>
            El torneo del club, punto a punto.
          </h1>
          <p className='text-sm sm:text-base leading-relaxed mt-4 max-w-xl text-white/70'>
            Consulta marcadores en vivo, resultados del último turno y la programación oficial del torneo.
          </p>

          <div className='flex flex-wrap gap-2.5 mt-7'>
            <Link
              to={live.length > 0 ? '/live' : '/tennis'}
              className='inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold'
              style={{ backgroundColor: 'var(--club-green-light)', color: 'var(--club-green-dark)' }}
            >
              <Radio className='w-4 h-4' />
              {live.length > 0 ? 'Ver partidos en vivo' : 'Ver programación en Tenis'}
            </Link>
            <Link
              to='/tennis'
              className='inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold text-white'
              style={{
                backgroundColor: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.14)',
              }}
            >
              Ver historial completo
              <ChevronRight className='w-4 h-4' />
            </Link>
          </div>

          <div className='flex flex-wrap gap-2.5 mt-8'>
            <HeroStat
              icon={Radio}
              value={ll ? '—' : live.length}
              label='En vivo'
              accent='var(--club-clay)'
            />
            <HeroStat
              icon={Clock3}
              value={lf ? '—' : latestSlotMatches.length}
              label='Último turno'
              accent='var(--club-green-light)'
            />
            <HeroStat
              icon={CalendarDays}
              value={lu ? '—' : upcoming.length}
              label='Próximos'
              accent='var(--club-white)'
            />
          </div>
        </div>
      </section>

      {/* Partidos en Vivo (si los hay) */}
      {(ll || live.length > 0) && (
        <section>
          <SectionHeader
            title='En vivo ahora'
            subtitle={!ll ? `${live.length} partido${live.length !== 1 ? 's' : ''} en directo` : ''}
            action={
              <Link
                to='/live'
                className='flex items-center gap-1 text-xs font-medium'
                style={{ color: 'var(--color-brand)' }}
              >
                Ver todos <ChevronRight className='w-3.5 h-3.5' />
              </Link>
            }
          />
          <div className='space-y-3'>
            {ll
              ? Array(2)
                  .fill(0)
                  .map((_, i) => <MatchCardSkeleton key={i} />)
              : live.map((m) => <MatchCard key={m.id} match={m} />)}
          </div>
        </section>
      )}

      {/* Últimos Resultados (partidos del último turno/hora jugado) */}
      <section>
        <SectionHeader
          title='Últimos resultados'
          subtitle={
            lf
              ? 'Cargando marcadores…'
              : latestSlotMatches.length > 0 && slotFriendlyLabel
              ? `Turno finalizado: ${slotFriendlyLabel} (${latestSlotMatches.length} partido${latestSlotMatches.length === 1 ? '' : 's'})`
              : 'Resultados más recientes'
          }
          action={
            <Link
              to='/tennis'
              className='flex items-center gap-1 text-xs font-medium'
              style={{ color: 'var(--color-brand)' }}
            >
              Ver historial completo <ChevronRight className='w-3.5 h-3.5' />
            </Link>
          }
        />
        <div className='grid grid-cols-1 md:grid-cols-2 gap-3.5'>
          {lf ? (
            Array(2)
              .fill(0)
              .map((_, i) => <MatchCardSkeleton key={i} />)
          ) : latestSlotMatches.length > 0 ? (
            latestSlotMatches.map((m) => <MatchCard key={m.id} match={m} compact />)
          ) : (
            <div className='card p-6 sm:p-8 text-center space-y-2 col-span-full'>
              <div className='w-10 h-10 rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)] flex items-center justify-center mx-auto'>
                <Clock3 size={20} />
              </div>
              <p className='text-sm font-bold text-[var(--text-primary)]'>
                Sin resultados recientes
              </p>
              <p className='text-xs text-[var(--text-muted)] max-w-sm mx-auto'>
                Aún no hay partidos finalizados o puedes consultar todos los resultados en el historial.
              </p>
              <div className='pt-2'>
                <Link
                  to='/tennis'
                  className='inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[var(--bg-hover)] text-[var(--text-primary)] hover:border-[var(--color-brand)] border border-[var(--border-color)] transition-all'
                >
                  <History size={14} className='text-[var(--color-brand)]' />
                  Ver resultados anteriores en Tenis
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Próximos Partidos (con control de espacio y botón Expandir / Recoger) */}
      {(lu || sortedUpcoming.length > 0) && (
        <section>
          <SectionHeader
            title='Próximos partidos'
            subtitle={
              !lu
                ? `${sortedUpcoming.length} partido${sortedUpcoming.length === 1 ? '' : 's'} programado${sortedUpcoming.length === 1 ? '' : 's'}`
                : 'Cargando programación…'
            }
            action={
              <Link
                to='/tennis'
                className='flex items-center gap-1 text-xs font-medium'
                style={{ color: 'var(--color-brand)' }}
              >
                Ver programación completa <ChevronRight className='w-3.5 h-3.5' />
              </Link>
            }
          />
          <div className='space-y-3'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-3.5'>
              {lu
                ? Array(2)
                    .fill(0)
                    .map((_, i) => <MatchCardSkeleton key={i} />)
                : visibleUpcoming.map((m) => (
                    <MatchCard key={m.id} match={m} compact />
                  ))}
            </div>

            {sortedUpcoming.length > INITIAL_UPCOMING_COUNT && (
              <button
                type='button'
                onClick={() => setIsUpcomingExpanded(!isUpcomingExpanded)}
                className='w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all border border-[var(--border-color)] bg-[var(--bg-hover)] text-[var(--text-primary)] hover:border-[var(--color-brand)] shadow-sm'
              >
                {isUpcomingExpanded ? (
                  <>
                    <span>Recoger próximos partidos</span>
                    <ChevronUp className='w-4 h-4 text-[var(--color-brand)]' />
                  </>
                ) : (
                  <>
                    <span>
                      Ver más próximos partidos (+{sortedUpcoming.length - INITIAL_UPCOMING_COUNT} restantes)
                    </span>
                    <ChevronDown className='w-4 h-4 text-[var(--color-brand)]' />
                  </>
                )}
              </button>
            )}

            {!lu && sortedUpcoming.length === 0 && (
              <div className='card p-6 text-center text-xs' style={{ color: 'var(--text-muted)' }}>
                No hay partidos programados próximamente.
              </div>
            )}
          </div>
        </section>
      )}

      {/* Anuncios del Club */}
      {news.length > 0 && (
        <section>
          <SectionHeader title='Anuncios del club' />
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
            {news.map((n) => (
              <NewsCard key={n.id} article={n} />
            ))}
          </div>
        </section>
      )}

      {/* Acceso Rápido a Programación y Fixtures */}
      <section className='card p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-[var(--border-color)]'>
        <div className='flex items-center gap-3'>
          <div className='w-9 h-9 rounded-xl bg-[var(--color-brand)]/10 text-[var(--color-brand)] flex items-center justify-center shrink-0'>
            <CalendarDays size={18} />
          </div>
          <div>
            <h3 className='text-sm font-bold text-[var(--text-primary)]'>
              Programación por canchas y fixture completo
            </h3>
            <p className='text-xs text-[var(--text-muted)]'>
              Consulta los horarios, canchas asignadas y cuadros de eliminatorias en Tenis.
            </p>
          </div>
        </div>
        <Link
          to='/tennis'
          className='btn-primary text-xs px-4 py-2.5 rounded-xl shrink-0 whitespace-nowrap font-bold flex items-center gap-1.5'
        >
          <span>Ir a Tenis</span>
          <ChevronRight size={14} />
        </Link>
      </section>
    </div>
  )
}

function HeroStat({ icon: Icon, value, label, accent }) {
  return (
    <div className='hero-stat'>
      <div className='flex items-center gap-2'>
        <Icon className='w-3.5 h-3.5' style={{ color: accent }} />
        <span className='text-xl font-extrabold tracking-[-0.04em] text-white'>{value}</span>
      </div>
      <p className='text-[10px] font-semibold text-white/55 mt-1'>{label}</p>
    </div>
  )
}

function NewsCard({ article }) {
  const tipos = {
    noticia: { label: 'Noticia', class: 'badge-atp' },
    evento: { label: 'Evento', class: 'badge-padel' },
    resultado: { label: 'Resultado', class: 'badge-brand' },
    aviso: { label: 'Aviso', class: 'badge-live' },
  }
  const tipo = tipos[article.tipo] || tipos.noticia

  return (
    <div className='card-hover p-4'>
      <div className='flex items-center gap-2 mb-2'>
        <span className={tipo.class}>{tipo.label}</span>
      </div>
      <h3 className='text-sm font-medium leading-snug' style={{ color: 'var(--text-primary)' }}>
        {article.titulo}
      </h3>
      <p className='text-[10px] mt-2' style={{ color: 'var(--text-muted)' }}>
        {formatRelative(article.created_at)}
      </p>
    </div>
  )
}
