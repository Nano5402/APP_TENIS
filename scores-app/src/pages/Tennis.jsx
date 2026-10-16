import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import MatchCard from '../components/match/MatchCard'
import PlayerCard from '../components/player/PlayerCard'
import { MatchCardSkeleton } from '../components/ui/Skeleton'
import SectionHeader from '../components/common/SectionHeader'
import Tabs from '../components/ui/Tabs'
import { useMatches } from '../hooks/useMatches'
import { usePlayers } from '../hooks/usePlayers'
import { useDebounce } from '../hooks/useDebounce'
import { categoriaService } from '../services/categoriaService'
import { formatDate } from '../utils/formatDate'
import TournamentDirectory from '../components/tournament/TournamentDirectory'

const VIEW_TABS = [
  { value: 'tournaments', label: 'Torneos' },
  { value: 'results', label: 'Resultados' },
  { value: 'upcoming', label: 'Próximos' },
  { value: 'players', label: 'Jugadores' },
]

function normalizeTab(raw) {
  const val = String(raw || '').toLowerCase().trim()
  if (['results', 'resultados'].includes(val)) return 'results'
  if (['upcoming', 'proximos', 'programacion', 'partidos'].includes(val)) return 'upcoming'
  if (['tournaments', 'torneos'].includes(val)) return 'tournaments'
  if (['players', 'jugadores', 'ranking'].includes(val)) return 'players'
  return 'results'
}

export default function Tennis() {
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = normalizeTab(searchParams.get('tab') || searchParams.get('view'))
  const [view, setView] = useState(initialTab)

  const [playerSearch, setPlayerSearch] = useState(() => searchParams.get('jugador') || searchParams.get('q') || '')
  const [date, setDate] = useState(() => searchParams.get('date') || searchParams.get('fecha') || '')
  const [categoryId, setCategoryId] = useState(() => searchParams.get('categoria') || searchParams.get('categoria_id') || '')

  const [upcomingPlayerSearch, setUpcomingPlayerSearch] = useState(
    () => searchParams.get('upcoming_jugador') || (initialTab === 'upcoming' ? (searchParams.get('jugador') || searchParams.get('q')) : '') || ''
  )
  const [upcomingDate, setUpcomingDate] = useState(
    () => searchParams.get('upcoming_date') || (initialTab === 'upcoming' ? (searchParams.get('date') || searchParams.get('fecha')) : '') || ''
  )
  const [upcomingCategoryId, setUpcomingCategoryId] = useState(
    () => searchParams.get('upcoming_categoria') || (initialTab === 'upcoming' ? (searchParams.get('categoria') || searchParams.get('categoria_id')) : '') || ''
  )

  const [categories, setCategories] = useState([])
  const [playerCategoryId, setPlayerCategoryId] = useState(() => searchParams.get('player_categoria') || '')
  const [playerSearchQuery, setPlayerSearchQuery] = useState(() => searchParams.get('player_q') || '')
  const [playerOrder, setPlayerOrder] = useState(() => searchParams.get('orden') || 'alphabetical')
  const debouncedPlayer = useDebounce(playerSearch.trim(), 350)
  const debouncedUpcomingPlayer = useDebounce(upcomingPlayerSearch.trim(), 350)

  // Sincronizar estados si los parámetros de la URL cambian (ej. al pulsar Volver en el navegador o en un partido)
  useEffect(() => {
    const rawTab = searchParams.get('tab') || searchParams.get('view')
    if (rawTab) {
      const norm = normalizeTab(rawTab)
      setView((v) => (v !== norm ? norm : v))
    }
    const d = searchParams.get('date') || searchParams.get('fecha') || ''
    setDate((v) => (v !== d ? d : v))
    const c = searchParams.get('categoria') || searchParams.get('categoria_id') || ''
    setCategoryId((v) => (v !== c ? c : v))
    const p = searchParams.get('jugador') || searchParams.get('q') || ''
    setPlayerSearch((v) => (v !== p ? p : v))

    const activeTab = normalizeTab(rawTab)
    if (activeTab === 'upcoming') {
      const ud = searchParams.get('upcoming_date') || searchParams.get('date') || searchParams.get('fecha') || ''
      setUpcomingDate((v) => (v !== ud ? ud : v))
      const uc = searchParams.get('upcoming_categoria') || searchParams.get('categoria') || searchParams.get('categoria_id') || ''
      setUpcomingCategoryId((v) => (v !== uc ? uc : v))
      const up = searchParams.get('upcoming_jugador') || searchParams.get('jugador') || searchParams.get('q') || ''
      setUpcomingPlayerSearch((v) => (v !== up ? up : v))
    }
  }, [searchParams])

  useEffect(() => {
    categoriaService
      .getAll({ deporte: 'tenis' })
      .then((response) => {
        const loadedCategories = response.data || []
        setCategories(loadedCategories)
      })
      .catch(() => setCategories([]))
  }, [])

  const { matches: live, loading: ll } = useMatches({ estado: 'en_vivo', deporte: 'tenis' })
  const historyFilters = useMemo(
    () => ({
      estado: 'finalizado',
      deporte: 'tenis',
      ...(debouncedPlayer && { jugador: debouncedPlayer }),
      ...(date && { fecha: date }),
      ...(categoryId && { categoria_id: categoryId }),
    }),
    [categoryId, date, debouncedPlayer]
  )
  const { matches: finished, loading: lf } = useMatches(historyFilters)
  const upcomingFilters = useMemo(
    () => ({
      estado: 'programado',
      deporte: 'tenis',
      orden: 'asc',
      ...(debouncedUpcomingPlayer && { jugador: debouncedUpcomingPlayer }),
      ...(upcomingDate && { fecha: upcomingDate }),
      ...(upcomingCategoryId && { categoria_id: upcomingCategoryId }),
    }),
    [debouncedUpcomingPlayer, upcomingCategoryId, upcomingDate]
  )
  const { matches: upcoming, loading: lu } = useMatches(upcomingFilters)
  const upcomingGroups = useMemo(() => groupUpcomingMatches(upcoming), [upcoming])
  const { players, loading: lp } = usePlayers({
    deporte: 'tenis',
    ...(playerCategoryId && { categoria_id: playerCategoryId }),
  })
  const sortedPlayers = useMemo(() => {
    const byName = (a, b) =>
      `${a.apellido || ''} ${a.nombre || ''}`.localeCompare(
        `${b.apellido || ''} ${b.nombre || ''}`,
        'es'
      )

    return [...players].sort((a, b) => {
      if (playerOrder === 'alphabetical_desc') return byName(b, a)
      return byName(a, b)
    })
  }, [players, playerOrder])

  const displayedPlayers = useMemo(() => {
    const q = playerSearchQuery.trim().toLowerCase()
    if (!q) return sortedPlayers
    return sortedPlayers.filter((p) => {
      const full = `${p.nombre || ''} ${p.apellido || ''}`.toLowerCase()
      return full.includes(q)
    })
  }, [sortedPlayers, playerSearchQuery])

  const hasFilters = Boolean(playerSearch || date || categoryId)
  const hasUpcomingFilters = Boolean(upcomingPlayerSearch || upcomingDate || upcomingCategoryId)

  const updateUrlParams = (changes) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        Object.entries(changes).forEach(([k, v]) => {
          if (v) next.set(k, v)
          else next.delete(k)
        })
        return next
      },
      { replace: true }
    )
  }

  const handleTabChange = (nextTab) => {
    setView(nextTab)
    updateUrlParams({ tab: nextTab })
  }

  const handleDateChange = (val) => {
    setDate(val)
    updateUrlParams({ date: val })
  }

  const handleCategoryChange = (val) => {
    setCategoryId(val)
    updateUrlParams({ categoria: val })
  }

  const handlePlayerSearchChange = (val) => {
    setPlayerSearch(val)
    updateUrlParams({ jugador: val.trim() })
  }

  const handleUpcomingDateChange = (val) => {
    setUpcomingDate(val)
    updateUrlParams({ upcoming_date: val })
  }

  const handleUpcomingCategoryChange = (val) => {
    setUpcomingCategoryId(val)
    updateUrlParams({ upcoming_categoria: val })
  }

  const handleUpcomingPlayerSearchChange = (val) => {
    setUpcomingPlayerSearch(val)
    updateUrlParams({ upcoming_jugador: val.trim() })
  }

  const clearFilters = () => {
    setPlayerSearch('')
    setDate('')
    setCategoryId('')
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('date')
        next.delete('fecha')
        next.delete('categoria')
        next.delete('categoria_id')
        next.delete('jugador')
        next.delete('q')
        return next
      },
      { replace: true }
    )
  }

  const clearUpcomingFilters = () => {
    setUpcomingPlayerSearch('')
    setUpcomingDate('')
    setUpcomingCategoryId('')
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('upcoming_date')
        next.delete('upcoming_categoria')
        next.delete('upcoming_jugador')
        return next
      },
      { replace: true }
    )
  }

  return (
    <div className='space-y-5 animate-fade-up'>
      <h1 className='text-xl font-bold' style={{ color: 'var(--text-primary)' }}>
        Tenis
      </h1>
      <Tabs tabs={VIEW_TABS} activeTab={view} onChange={handleTabChange} />
      {view === 'tournaments' && <TournamentDirectory/>}

      {view === 'results' && (
        <div className='space-y-6'>
          {live.length > 0 && (
            <section>
              <SectionHeader title='En Vivo' subtitle={`${live.length} partidos`} />
              <div className='space-y-3'>
                {live.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}
          <section>
            <SectionHeader
              title='Historial de partidos'
              subtitle={`${finished.length} resultado${finished.length === 1 ? '' : 's'}`}
            />
            <div className='card p-4 mb-4'>
              <div className='flex items-center justify-between gap-3 mb-3'>
                <div className='flex items-center gap-2'>
                  <SlidersHorizontal className='w-4 h-4' style={{ color: 'var(--color-brand)' }} />
                  <span className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
                    Buscar resultados
                  </span>
                </div>
                {hasFilters && (
                  <button
                    type='button'
                    onClick={clearFilters}
                    className='btn-ghost text-xs flex items-center gap-1 px-2 py-1'
                  >
                    <X className='w-3.5 h-3.5' />
                    Limpiar
                  </button>
                )}
              </div>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
                <div className='relative'>
                  <Search
                    className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4'
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    className='form-input pl-10'
                    value={playerSearch}
                    onChange={(event) => handlePlayerSearchChange(event.target.value)}
                    placeholder='Nombre del jugador'
                    aria-label='Buscar por jugador'
                  />
                </div>
                <input
                  type='date'
                  className='form-input'
                  value={date}
                  onChange={(event) => handleDateChange(event.target.value)}
                  aria-label='Buscar por fecha'
                />
                <select
                  className='form-input'
                  value={categoryId}
                  onChange={(event) => handleCategoryChange(event.target.value)}
                  aria-label='Buscar por categoría'
                >
                  <option value=''>Todas las categorías</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className='space-y-3'>
              {lf ? (
                Array(2)
                  .fill(0)
                  .map((_, i) => <MatchCardSkeleton key={i} />)
              ) : finished.length > 0 ? (
                finished.map((m) => <MatchCard key={m.id} match={m} />)
              ) : (
                <p className='card p-8 text-center text-sm' style={{ color: 'var(--text-muted)' }}>
                  No hay partidos que coincidan con la búsqueda.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {view === 'upcoming' && (
        <div className='space-y-5'>
          <SectionHeader
            title='Próximos partidos'
            subtitle={`${upcoming.length} partido${upcoming.length === 1 ? '' : 's'}`}
          />

          <div className='card p-4'>
            <div className='flex items-center justify-between gap-3 mb-3'>
              <div className='flex items-center gap-2'>
                <SlidersHorizontal className='w-4 h-4' style={{ color: 'var(--color-brand)' }} />
                <span className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
                  Filtrar programación
                </span>
              </div>
              {hasUpcomingFilters && (
                <button
                  type='button'
                  onClick={clearUpcomingFilters}
                  className='btn-ghost text-xs flex items-center gap-1 px-2 py-1'
                >
                  <X className='w-3.5 h-3.5' />
                  Limpiar
                </button>
              )}
            </div>

            <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
              <div className='relative'>
                <Search
                  className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4'
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  className='form-input pl-10'
                  value={upcomingPlayerSearch}
                  onChange={(event) => handleUpcomingPlayerSearchChange(event.target.value)}
                  placeholder='Nombre del jugador'
                  aria-label='Filtrar próximos partidos por jugador'
                />
              </div>
              <input
                type='date'
                className='form-input'
                value={upcomingDate}
                onChange={(event) => handleUpcomingDateChange(event.target.value)}
                aria-label='Filtrar próximos partidos por fecha'
              />
              <select
                className='form-input'
                value={upcomingCategoryId}
                onChange={(event) => handleUpcomingCategoryChange(event.target.value)}
                aria-label='Filtrar próximos partidos por categoría'
              >
                <option value=''>Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {lu ? (
            <div className='space-y-3'>
              {Array(3)
                .fill(0)
                .map((_, index) => (
                  <MatchCardSkeleton key={index} />
                ))}
            </div>
          ) : upcomingGroups.length > 0 ? (
            upcomingGroups.map((group) => (
              <section key={group.date || 'sin-fecha'} className='space-y-3'>
                <SectionHeader
                  title={group.date ? formatDate(group.date) : 'Sin fecha definida'}
                  subtitle={`${group.matches.length} partido${
                    group.matches.length === 1 ? '' : 's'
                  }`}
                />
                <div className='space-y-3'>
                  {group.matches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <p className='card p-8 text-center text-sm' style={{ color: 'var(--text-muted)' }}>
              No hay próximos partidos que coincidan con los filtros.
            </p>
          )}
        </div>
      )}

      {view === 'players' && (
        <div className='space-y-3'>
          <div className='card p-4 space-y-3'>
            <div>
              <p className='text-sm font-semibold' style={{ color: 'var(--text-primary)' }}>
                Directorio de jugadores
              </p>
              <p className='text-xs mt-1' style={{ color: 'var(--text-muted)' }}>
                Busca a cualquier jugador por nombre o apellido para consultar su perfil, estadísticas e historial.
              </p>
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
              <div className='relative'>
                <Search size={16} className='absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]' />
                <input
                  type='text'
                  className='form-input pl-9 text-xs sm:text-sm'
                  placeholder='Buscar por nombre o apellido…'
                  value={playerSearchQuery}
                  onChange={(e) => setPlayerSearchQuery(e.target.value)}
                  aria-label='Buscar jugador'
                />
                {playerSearchQuery && (
                  <button
                    type='button'
                    onClick={() => setPlayerSearchQuery('')}
                    className='absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    aria-label='Limpiar búsqueda'
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <select
                className='form-input text-xs sm:text-sm'
                value={playerCategoryId}
                onChange={(event) => setPlayerCategoryId(event.target.value)}
                aria-label='Filtrar por categoría'
              >
                <option value=''>Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nombre}
                  </option>
                ))}
              </select>

              <select
                className='form-input text-xs sm:text-sm'
                value={playerOrder}
                onChange={(event) => setPlayerOrder(event.target.value)}
                aria-label='Ordenar jugadores'
              >
                <option value='alphabetical'>Alfabético A–Z</option>
                <option value='alphabetical_desc'>Alfabético Z–A</option>
              </select>
            </div>
          </div>
          {lp ? (
            Array(4)
              .fill(0)
              .map((_, i) => <div key={i} className='skeleton h-16 rounded-xl' />)
          ) : displayedPlayers.length > 0 ? (
            displayedPlayers.map((p) => (
              <PlayerCard key={p.id} player={p} categoryId={playerCategoryId} />
            ))
          ) : (
            <p className='card p-8 text-center text-sm' style={{ color: 'var(--text-muted)' }}>
              No se encontraron jugadores para los filtros seleccionados.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function groupUpcomingMatches(matches) {
  const sorted = [...matches].sort((a, b) => {
    if (!a.fecha_inicio && b.fecha_inicio) return 1
    if (a.fecha_inicio && !b.fecha_inicio) return -1

    const dateComparison = String(a.fecha_inicio || '').localeCompare(String(b.fecha_inicio || ''))
    if (dateComparison) return dateComparison

    const timeComparison = String(a.hora_inicio || '99:99:99').localeCompare(
      String(b.hora_inicio || '99:99:99')
    )
    return timeComparison || Number(a.id) - Number(b.id)
  })

  const groups = new Map()
  for (const match of sorted) {
    const date = match.fecha_inicio || null
    const key = date || 'sin-fecha'
    if (!groups.has(key)) groups.set(key, { date, matches: [] })
    groups.get(key).matches.push(match)
  }

  return [...groups.values()]
}
