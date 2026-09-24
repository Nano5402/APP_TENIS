import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Maximize2,
  Radio,
  Trophy,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import MatchStats from '../components/match/MatchStats'
import MatchJudge from '../components/match/MatchJudge'
import MatchPhoto from '../components/match/MatchPhoto'
import { SPONSORS } from '../data/sponsors'
import { useMatchRealtime } from '../hooks/useMatchRealtime'
import { useMatchTimer } from '../hooks/useMatchTimer'
import { matchService } from '../services/matchService'
import { getParticipantName } from '../utils/matchParticipants'
import ParticipantAvatar from '../components/ui/ParticipantAvatar'

const REFRESH_MS = 30000
const SCREEN_SPONSOR = SPONSORS.find((sponsor) => sponsor.name === 'Induleche')
const OTHER_SPONSORS = SPONSORS.filter((s) => s.name !== 'Induleche')

const getLocalDate = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function Pantalla() {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [focusedMatchId, setFocusedMatchId] = useState(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [recentFallback, setRecentFallback] = useState(false)
  const requestActive = useRef(false)

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0

    const onScroll = () => {
      const scrollPos = window.scrollY || document.documentElement.scrollTop || 0
      setIsScrolled(scrollPos > 60)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const load = useCallback(() => {
    if (requestActive.current) return
    requestActive.current = true
    const today = getLocalDate()
    Promise.all([
      matchService.getAll({ estado: 'en_vivo', orden: 'asc' }),
      matchService.getAll({ estado: 'finalizado', orden: 'desc' }),
    ])
      .then(([liveResponse, finishedResponse]) => {
        const live = liveResponse.data || []
        const finishedAll = finishedResponse.data || []
        const finishedToday = finishedAll.filter((match) => {
          const finDate = match.en_vivo?.finalizado_at
            ? getLocalDate(new Date(match.en_vivo.finalizado_at))
            : null
          return match.fecha_inicio === today || finDate === today
        })
        const finishedToShow = finishedToday.length > 0 ? finishedToday : finishedAll.slice(0, 10)
        setRecentFallback(finishedToday.length === 0 && finishedAll.length > 0)
        setLoadError('')
        const combined = [...live, ...finishedToShow]
        setMatches(Array.from(new Map(combined.map((match) => [Number(match.id), match])).values()))
      })
      .catch(() =>
        setLoadError(
          'No se pudo actualizar. Se conserva el último marcador recibido; reintentando automáticamente.'
        )
      )
      .finally(() => {
        requestActive.current = false
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    load()
    const matchesTimer = window.setInterval(load, REFRESH_MS)
    return () => {
      window.clearInterval(matchesTimer)
    }
  }, [load])

  useMatchRealtime(useCallback(() => load(), [load]))

  useEffect(() => {
    if (focusedMatchId && !matches.some((match) => Number(match.id) === Number(focusedMatchId))) {
      setFocusedMatchId(null)
    }
  }, [focusedMatchId, matches])

  const sponsor = SCREEN_SPONSOR
  const focusedMatch = matches.find((match) => Number(match.id) === Number(focusedMatchId))
  const liveMatches = matches.filter((match) => match.estado === 'en_vivo')
  const finishedMatches = matches.filter((match) => match.estado === 'finalizado')

  return (
    <main
      className='min-h-screen w-full text-white pb-4 sm:pb-6 relative touch-pan-y'
      style={{
        background: 'radial-gradient(circle at top left, #174b34 0, #0d251b 34%, #07110d 76%)',
      }}
    >
      <header
        className='sticky top-0 z-30 h-14 sm:h-[72px] shrink-0 flex items-center justify-between gap-3 sm:gap-4 px-3 sm:px-7 py-2 sm:py-3 backdrop-blur-xl'
        style={{
          backgroundColor: 'rgba(7,17,13,.95)',
          borderBottom: '1px solid rgba(139,203,96,.2)',
        }}
      >
        <div className='flex items-center gap-2 sm:gap-3 min-w-0'>
          <Link
            to='/'
            className='w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 inline-flex items-center justify-center shrink-0 transition-colors'
            aria-label='Regresar a la página principal'
          >
            <ArrowLeft className='w-4 h-4 sm:w-5 sm:h-5' />
          </Link>
          <img
            src='/branding/subcomite-tenis-club-union.png'
            alt='Subcomité de Tenis Club Unión'
            className='w-9 h-9 sm:w-12 sm:h-12 object-contain shrink-0'
          />
          <div className='min-w-0'>
            <p className='font-black truncate text-xs sm:text-base'>Marcadores Club Unión</p>
            <p className='text-[10px] sm:text-xs text-white/55 truncate'>Subcomité de Tenis · Bucaramanga</p>
          </div>
        </div>
        <div className='flex items-center gap-3 sm:gap-4 shrink-0'>
          <a
            href='https://www.instagram.com/legal.branding'
            target='_blank'
            rel='noreferrer'
            className='hidden sm:block'
            aria-label='Instagram de Legal Branding'
          >
            <img
              src='/branding/legal-branding.png'
              alt='Legal Branding'
              className='h-10 w-auto object-contain brightness-0 invert opacity-80'
            />
          </a>
          <ScreenClock />
        </div>
      </header>

      <div className='grid lg:grid-cols-[minmax(0,1fr)_260px] lg:min-h-[calc(100vh-73px)]'>
        <div className='min-w-0'>
          {/* Barra Sticky de Induleche: Aparece suavemente al hacer scroll y se junta con el header */}
          <div
            className={`fixed top-14 sm:top-[72px] left-0 right-0 lg:right-[260px] z-20 touch-pan-y transition-all duration-200 ease-out ${
              isScrolled
                ? 'opacity-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 -translate-y-2 pointer-events-none'
            }`}
            style={{
              backgroundColor: 'rgba(7, 20, 15, 0.98)',
              borderBottom: '1px solid rgba(139,203,96,.2)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            }}
          >
            <div
              className='absolute inset-0 pointer-events-none'
              style={{
                background: `linear-gradient(135deg, ${sponsor.accent}18 0%, transparent 45%, ${sponsor.accent}08 100%)`,
              }}
            />
            <div className='relative flex items-center justify-center gap-3 sm:gap-4 px-3 py-2 sm:py-2.5'>
              <a
                href='https://www.instagram.com/induleche/?hl=es'
                target='_blank'
                rel='noreferrer'
                className='flex items-center justify-center gap-3 sm:gap-4 group shrink-0'
              >
                <div className='relative shrink-0 flex items-center justify-center'>
                  <div
                    className='absolute -inset-1.5 rounded-2xl opacity-35 blur-xl transition-opacity group-hover:opacity-65'
                    style={{ background: sponsor.accent }}
                  />
                  <div
                    className='relative aspect-[16/9] rounded-xl bg-white p-1.5 flex items-center justify-center overflow-hidden shadow-xl shrink-0 h-[46px] xs:h-[50px] sm:h-[56px] max-w-[110px] xs:max-w-[125px] sm:max-w-[140px]'
                    style={{ boxShadow: `0 8px 30px ${sponsor.accent}45` }}
                  >
                    <img
                      src={sponsor.image}
                      alt={sponsor.name}
                      className='w-full h-full object-contain rounded-lg max-h-full'
                    />
                  </div>
                </div>
                <div className='flex flex-col justify-center min-w-0'>
                  <span
                    className='uppercase tracking-[.22em] font-extrabold block truncate text-[8px] xs:text-[8.5px] sm:text-[9.5px]'
                    style={{ color: `${sponsor.accent}ee` }}
                  >
                    Patrocinador oficial
                  </span>
                  <p className='font-black tracking-tight leading-tight mt-0.5 text-white truncate text-base xs:text-lg sm:text-xl'>
                    {sponsor.name}
                  </p>
                  <div className='mt-0.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 font-semibold text-white/80 group-hover:text-white transition-all w-fit text-[10px] xs:text-[10.5px] sm:text-[11.5px]'>
                    <svg
                      className='w-3 h-3 shrink-0'
                      fill='currentColor'
                      viewBox='0 0 24 24'
                      style={{ color: sponsor.accent }}
                    >
                      <path d='M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' />
                    </svg>
                    <span>@induleche</span>
                  </div>
                </div>
              </a>
            </div>
          </div>

          {/* Mobile-first: Barra compacta de patrocinador oficial para que el partido en vivo quede visible arriba */}
          <div
            className='block md:hidden mx-2.5 mt-1.5 mb-1.5 rounded-xl px-2.5 py-1.5 relative overflow-hidden shadow-sm'
            style={{
              border: '1px solid rgba(255,255,255,.09)',
              backgroundColor: 'rgba(7, 20, 15, 0.96)',
            }}
          >
            <div className='flex items-center justify-between gap-2'>
              <a
                href='https://www.instagram.com/induleche/?hl=es'
                target='_blank'
                rel='noreferrer'
                className='flex items-center gap-2 min-w-0'
              >
                <div className='h-6 aspect-[16/9] rounded bg-white p-0.5 shrink-0 flex items-center justify-center'>
                  <img src={sponsor.image} alt={sponsor.name} className='w-full h-full object-contain' />
                </div>
                <div className='min-w-0'>
                  <span className='uppercase tracking-wider font-extrabold text-[7.5px] text-lime-400 block leading-none'>
                    Patrocinador oficial
                  </span>
                  <span className='font-black text-white text-[11px] truncate block leading-tight mt-0.5'>
                    {sponsor.name}
                  </span>
                </div>
              </a>
              <a
                href='https://www.instagram.com/induleche/?hl=es'
                target='_blank'
                rel='noreferrer'
                className='px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/15 text-[9.5px] font-semibold text-white/80 border border-white/10 shrink-0'
              >
                @induleche
              </a>
            </div>
          </div>

          {/* Desktop/TV: Banner principal permanente lado a lado */}
          <div
            className='hidden md:block mx-7 mt-3 mb-3 rounded-3xl relative overflow-hidden shadow-2xl touch-pan-y'
            style={{
              border: '1px solid rgba(255,255,255,.08)',
              backgroundColor: 'rgba(7, 20, 15, 0.95)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div
              className='absolute inset-0 pointer-events-none'
              style={{
                background: `linear-gradient(135deg, ${sponsor.accent}18 0%, transparent 45%, ${sponsor.accent}08 100%)`,
              }}
            />
            <div
              className='absolute top-0 left-0 right-0 h-[2px]'
              style={{
                background: `linear-gradient(90deg, transparent 5%, ${sponsor.accent}90, ${sponsor.accent}50, transparent 95%)`,
              }}
            />
            <div
              className='absolute bottom-0 left-8 right-8 h-px opacity-20'
              style={{
                background: `linear-gradient(90deg, transparent, ${sponsor.accent}40, transparent)`,
              }}
            />

            <div className='relative flex flex-col md:grid md:grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4 md:gap-6 px-3 py-3 sm:px-6 sm:py-3.5 md:px-8 md:py-4'>
              {/* Izquierda: Branding Hero de Induleche con logo grande y ancho */}
              <a
                href='https://www.instagram.com/induleche/?hl=es'
                target='_blank'
                rel='noreferrer'
                className='flex items-center justify-center gap-3.5 xs:gap-4 sm:gap-5 w-full md:w-auto group shrink-0'
              >
                <div className='relative shrink-0 flex items-center justify-center'>
                  <div
                    className='absolute -inset-2 sm:-inset-2.5 rounded-2xl sm:rounded-3xl opacity-35 blur-xl transition-opacity group-hover:opacity-65'
                    style={{ background: sponsor.accent }}
                  />
                  <div
                    className='relative aspect-[16/9] rounded-xl sm:rounded-2xl bg-white p-1.5 flex items-center justify-center overflow-hidden shadow-xl shrink-0 h-[76px] xs:h-[84px] sm:h-[96px] md:h-[104px] lg:h-[114px] max-w-[160px] xs:max-w-[185px] sm:max-w-[210px] md:max-w-[230px] lg:max-w-[250px]'
                    style={{ boxShadow: `0 8px 30px ${sponsor.accent}45` }}
                  >
                    <img
                      src={sponsor.image}
                      alt={sponsor.name}
                      className='w-full h-full object-contain rounded-lg sm:rounded-xl max-h-full'
                    />
                  </div>
                </div>
                <div className='flex flex-col justify-center min-w-0'>
                  <span
                    className='uppercase tracking-[.22em] font-extrabold block truncate text-[8.5px] xs:text-[9px] sm:text-[10px] md:text-[10.5px]'
                    style={{ color: `${sponsor.accent}ee` }}
                  >
                    Patrocinador oficial
                  </span>
                  <p className='font-black tracking-tight leading-tight mt-0.5 text-white truncate text-lg xs:text-xl sm:text-2xl md:text-3xl'>
                    {sponsor.name}
                  </p>
                  <div className='mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 font-semibold text-white/80 group-hover:text-white transition-all w-fit shadow-sm text-[10.5px] xs:text-[11px] sm:text-[12px]'>
                    <svg
                      className='w-3 h-3 shrink-0'
                      fill='currentColor'
                      viewBox='0 0 24 24'
                      style={{ color: sponsor.accent }}
                    >
                      <path d='M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' />
                    </svg>
                    <span>@induleche</span>
                    <svg
                      className='w-3 h-3 text-white/40 group-hover:translate-x-0.5 transition-transform'
                      fill='none'
                      stroke='currentColor'
                      strokeWidth='2.5'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      viewBox='0 0 24 24'
                    >
                      <path d='M5 12h14M12 5l7 7-7 7' />
                    </svg>
                  </div>
                </div>
              </a>

              {/* Separador degradado elegante */}
              <div className='hidden md:block w-px h-20 bg-gradient-to-b from-transparent via-white/20 to-transparent mx-auto' />
              <div className='block md:hidden h-px w-2/3 max-w-[260px] bg-gradient-to-r from-transparent via-white/15 to-transparent mx-auto my-1' />

              {/* Derecha: Mini carrusel de aliados */}
              <div className='w-full flex justify-center'>
                <MiniSponsorsCarousel sponsors={OTHER_SPONSORS} />
              </div>
            </div>
          </div>

          <section className='px-3 py-3 sm:p-7'>
            {loadError && (
              <p role='status' className='text-sm text-amber-200 mb-3'>
                {loadError}
              </p>
            )}
            <div className='flex items-center justify-between gap-3 mb-2'>
              <div className='flex items-center gap-2 min-w-0'>
                {focusedMatch ? (
                  <Trophy className='w-5 h-5 text-lime-300 shrink-0' />
                ) : (
                  <span className='relative flex w-3 h-3 shrink-0'>
                    <span className='absolute inset-0 rounded-full bg-orange-500 animate-ping' />
                    <span className='relative w-3 h-3 rounded-full bg-orange-500' />
                  </span>
                )}
                <h1 className='font-black text-lg sm:text-xl truncate'>
                  {focusedMatch ? 'Detalle del partido' : 'Jornada de hoy'}
                </h1>
              </div>
              {focusedMatch && (
                <button
                  type='button'
                  onClick={() => setFocusedMatchId(null)}
                  className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs sm:text-sm font-bold transition-colors shrink-0'
                >
                  <ArrowLeft className='w-4 h-4' /> Todos
                </button>
              )}
            </div>

            {loading ? (
              <div className='grid md:grid-cols-2 gap-4'>
                {[1, 2].map((item) => (
                  <div key={item} className='h-56 rounded-3xl bg-white/5 animate-pulse' />
                ))}
              </div>
            ) : focusedMatch ? (
              <ScreenMatch match={focusedMatch} featured onBack={() => setFocusedMatchId(null)} />
            ) : (
              <div className='space-y-6 sm:space-y-8'>
                <MatchGroup
                  title='Partidos en vivo'
                  matches={liveMatches}
                  emptyText='No hay partidos en vivo en este momento.'
                  onFocus={setFocusedMatchId}
                  live
                />
                <MatchGroup
                  title={recentFallback ? 'Resultados recientes' : 'Resultados de hoy'}
                  matches={finishedMatches}
                  emptyText='Todavía no hay partidos finalizados hoy.'
                  onFocus={setFocusedMatchId}
                />
              </div>
            )}
          </section>

          {/* Aliados en móvil: ubicados debajo de los resultados para priorizar el marcador */}
          <div className='block md:hidden mx-3 mb-4 p-3 rounded-2xl bg-white/[.04] border border-white/10'>
            <p className='text-[9px] uppercase font-bold tracking-wider text-white/50 mb-2.5 text-center'>
              Aliados y Patrocinadores
            </p>
            <MiniSponsorsCarousel sponsors={OTHER_SPONSORS} />
          </div>

          <a
            href='https://www.instagram.com/induleche/?hl=es'
            target='_blank'
            rel='noreferrer'
            className='lg:hidden mx-3 mb-4 rounded-2xl overflow-hidden relative block group'
            style={{ border: `1px solid ${sponsor.accent}30` }}
          >
            <div
              className='absolute inset-0 pointer-events-none'
              style={{
                background: `linear-gradient(135deg, ${sponsor.accent}20 0%, transparent 50%, ${sponsor.accent}10 100%)`,
              }}
            />
            <div
              className='absolute top-0 left-0 right-0 h-[3px]'
              style={{
                background: `linear-gradient(90deg, transparent 5%, ${sponsor.accent}80, ${sponsor.accent}50, transparent 95%)`,
              }}
            />
            <div
              className='absolute bottom-0 left-0 right-0 h-[2px]'
              style={{
                background: `linear-gradient(90deg, transparent 5%, ${sponsor.accent}40, transparent 95%)`,
              }}
            />
            <div
              key={`mobile-${sponsor.image}`}
              className='relative flex flex-col items-center text-center px-4 py-5 animate-fade-up'
            >
              <p
                className='text-[9px] uppercase tracking-[.22em] font-extrabold mb-3'
                style={{ color: `${sponsor.accent}bb` }}
              >
                Patrocinador oficial
              </p>
              <div className='relative mb-3'>
                <div
                  className='absolute -inset-2 rounded-3xl opacity-35 blur-xl'
                  style={{ background: sponsor.accent }}
                />
                <div
                  className='relative h-[64px] sm:h-[76px] aspect-video max-w-[150px] rounded-2xl bg-white p-1 flex items-center justify-center overflow-hidden shadow-xl'
                  style={{ boxShadow: `0 8px 32px ${sponsor.accent}50` }}
                >
                  <img
                    src={sponsor.image}
                    alt={sponsor.name}
                    className='w-full h-full object-contain rounded-xl max-h-full'
                  />
                </div>
              </div>
              <p className='font-black text-lg tracking-tight'>{sponsor.name}</p>
              <div
                className='mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold group-hover:scale-105 transition-transform'
                style={{
                  background: `${sponsor.accent}cc`,
                  color: '#fff',
                  boxShadow: `0 4px 16px ${sponsor.accent}40`,
                }}
              >
                <svg className='w-3.5 h-3.5' fill='currentColor' viewBox='0 0 24 24'>
                  <path d='M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' />
                </svg>
                Ver en Instagram
                <svg
                  className='w-3 h-3'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  viewBox='0 0 24 24'
                >
                  <path d='M5 12h14M12 5l7 7-7 7' />
                </svg>
              </div>
            </div>
          </a>
        </div>

        <a
          href='https://www.instagram.com/induleche/?hl=es'
          target='_blank'
          rel='noreferrer'
          className='hidden lg:flex flex-col items-center justify-center p-6 text-center group transition-colors hover:bg-white/[.05] sticky top-[73px] self-start h-[calc(100vh-73px)]'
          style={{
            backgroundColor: 'rgba(255,255,255,.035)',
            borderLeft: '1px solid rgba(255,255,255,.08)',
          }}
        >
          <p className='uppercase tracking-[.22em] text-[10px] text-white/45 mb-6'>
            Patrocinador oficial
          </p>
          <div key={sponsor.image} className='w-full animate-fade-up'>
            <div
              className='aspect-square rounded-3xl bg-white p-3 flex items-center justify-center shadow-2xl group-hover:scale-[1.03] transition-transform'
              style={{ boxShadow: `0 0 44px ${sponsor.accent}55` }}
            >
              <img
                src={sponsor.image}
                alt={sponsor.name}
                className='w-full h-full object-contain rounded-2xl'
              />
            </div>
            <p className='font-black mt-5 text-lg'>{sponsor.name}</p>
            <p className='mt-2 text-[10px] text-white/40 font-semibold flex items-center justify-center gap-1.5 group-hover:text-white/60 transition-colors'>
              <svg
                className='w-3 h-3'
                fill='currentColor'
                viewBox='0 0 24 24'
                style={{ color: `${sponsor.accent}99` }}
              >
                <path d='M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z' />
              </svg>
              @induleche
            </p>
          </div>
        </a>
      </div>
    </main>
  )
}

function ScreenClock() {
  const [clock, setClock] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className='text-right font-mono'>
      <p className='text-sm sm:text-2xl font-black tabular-nums'>
        {clock.toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })}
      </p>
      <p className='hidden sm:block text-[11px] text-white/50 capitalize'>
        {clock.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
    </div>
  )
}

function MatchGroup({ title, matches, emptyText, onFocus, live = false }) {
  return (
    <section>
      <div className='mb-4 flex items-center gap-2'>
        {live ? (
          <span className='relative flex w-2.5 h-2.5 shrink-0'>
            <span className='absolute inset-0 rounded-full bg-orange-500 animate-ping' />
            <span className='relative w-2.5 h-2.5 rounded-full bg-orange-500' />
          </span>
        ) : (
          <Trophy className='w-4 h-4 text-amber-300' />
        )}
        <h2 className='font-black text-lg'>{title}</h2>
        <span className='rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold'>
          {matches.length}
        </span>
      </div>
      {matches.length ? (
        <div className='grid md:grid-cols-2 gap-4'>
          {matches.map((match) => (
            <ScreenMatch key={match.id} match={match} onFocus={() => onFocus(match.id)} />
          ))}
        </div>
      ) : (
        <div className='rounded-2xl border border-white/10 bg-white/[.035] px-5 py-6 text-sm text-white/45'>
          {emptyText}
        </div>
      )}
    </section>
  )
}

function ScreenMatch({ match, onFocus, onBack, featured = false }) {
  const marker = match.marcador_actual
  const { formatted, isPaused } = useMatchTimer(match.en_vivo, match.estado)
  const p1 = getParticipantName(match, 1) || 'Por definir'
  const p2 = getParticipantName(match, 2) || 'Por definir'
  const sets = marker?.sets || []
  const visibleSets = Math.max(3, sets.length)
  const isFinished = match.estado === 'finalizado'

  return (
    <article
      className={`rounded-3xl overflow-hidden border border-white/10 bg-black/20 shadow-2xl ${featured ? 'min-h-[55vh] flex flex-col justify-center' : ''}`}
    >
      <div className='h-1' style={{ background: 'linear-gradient(90deg,#8bcb60,#c65d32)' }} />
      <div className={featured ? 'p-5 sm:p-8 lg:p-10' : 'p-4 sm:p-5'}>
        <div className='flex flex-col items-start justify-between gap-3 mb-4 sm:flex-row sm:items-center'>
          <div>
            <p className='text-xs uppercase tracking-wider font-bold text-lime-300'>
              {match.torneo?.nombre ? `${match.torneo.nombre} · ` : ''}
              {match.categoria?.nombre || 'Tenis'}
            </p>
            <p className='text-xs text-white/45 mt-1'>
              {match.cancha?.nombre || 'Cancha por confirmar'}
            </p>
            <MatchJudge match={match} dark className='mt-2' />
          </div>
          <div className='flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end'>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-mono font-bold ${isFinished ? 'bg-amber-300/15 text-amber-200' : 'bg-white/10'}`}
            >
              {isFinished ? <Trophy className='w-3 h-3' /> : <Clock3 className='w-3 h-3' />}
              {isFinished
                ? `FINALIZADO · ${formatted}`
                : `${formatted}${isPaused ? ' · PAUSA' : ''}`}
            </span>
            {onFocus && (
              <button
                type='button'
                onClick={onFocus}
                className='h-9 rounded-full bg-white/10 hover:bg-white/15 inline-flex items-center justify-center gap-2 px-3 transition-colors'
                aria-label='Ver este partido a detalle'
              >
                <Maximize2 className='w-4 h-4' />
                <span className='text-xs font-bold'>Ver a detalle</span>
              </button>
            )}
          </div>
        </div>
        <ScreenPlayer
          team={match.equipo1}
          name={p1}
          photo={match.jugador1?.foto}
          side='jugador1'
          index={0}
          marker={marker}
          visibleSets={visibleSets}
          featured={featured}
        />
        <div className='h-px bg-white/10 my-2' />
        <ScreenPlayer
          team={match.equipo2}
          name={p2}
          photo={match.jugador2?.foto}
          side='jugador2'
          index={1}
          marker={marker}
          visibleSets={visibleSets}
          featured={featured}
        />
        {marker?.breakpoint && !isFinished && (
          <div className='mt-2 text-center'>
            <span
              className='inline-block rounded-full px-3 py-1 text-xs font-bold'
              style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}
            >
              {marker.breakpoint.count === 2 ? '2 BREAK POINTS' : 'BREAK POINT'}
            </span>
          </div>
        )}
        {featured && (
          <>
            <section
              className='mt-7 rounded-2xl border border-white/10 bg-white/[.045] p-4 sm:p-5'
              style={{
                '--text-muted': 'rgba(255,255,255,.52)',
                '--text-secondary': 'rgba(255,255,255,.78)',
                '--border-color': 'rgba(255,255,255,.1)',
                '--club-green': '#bef264',
                '--club-clay': '#fdba74',
                '--color-brand': '#bef264',
                '--color-brand-dim': 'rgba(190,242,100,.13)',
                '--bg-hover': 'rgba(255,255,255,.08)',
              }}
            >
              <div className='mb-4 flex items-center justify-between gap-3'>
                <div>
                  <p className='text-[10px] font-bold uppercase tracking-[.18em] text-white/40'>
                    Comparativo
                  </p>
                  <h2 className='mt-1 text-lg font-black text-white'>
                    Estadísticas de los jugadores
                  </h2>
                </div>
                <span className='rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/55'>
                  En tiempo real
                </span>
              </div>
              <MatchPhoto key={match.id} matchId={match.id} match={match} dark />
              <MatchStats matchId={match.id} player1={p1} player2={p2} />
            </section>
            <div className='mt-5 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-sm text-white/55'>
              <div className='flex flex-wrap gap-x-5 gap-y-2'>
                <span>
                  <strong className='text-white/80'>Formato:</strong> mejor de{' '}
                  {match.formato?.mejor_de_sets || 3} sets
                </span>
                <span>
                  <strong className='text-white/80'>Modalidad:</strong>{' '}
                  {match.modalidad === 'dobles' ? 'Dobles' : 'Individual'}
                </span>
                {match.notas && (
                  <span>
                    <strong className='text-white/80'>Nota:</strong> {match.notas}
                  </span>
                )}
              </div>
              <button
                type='button'
                onClick={onBack}
                className='inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/15 px-4 py-2 font-bold text-white transition-colors'
              >
                <ArrowLeft className='w-4 h-4' /> Regresar a partidos
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  )
}

function ScreenPlayer({ name, photo, team, side, index, marker, visibleSets, featured }) {
  return (
    <div
      className='grid items-center gap-1 sm:gap-2 py-2 [--screen-set:24px] sm:[--screen-set:36px] [--screen-point:36px] sm:[--screen-point:48px]'
      style={{
        gridTemplateColumns: `minmax(0,1fr) repeat(${visibleSets},var(--screen-set)) var(--screen-point)`,
      }}
    >
      <div className='flex items-center gap-2 min-w-0'>
        <span
          className='w-2.5 h-2.5 rounded-full shrink-0'
          style={{ backgroundColor: marker?.server === side ? '#c65d32' : 'transparent' }}
        />
        <ParticipantAvatar team={team} player={{ foto: photo }} name={name} size='xs' />
        <strong
          className={`break-words min-w-0 ${featured ? 'text-sm sm:text-xl' : 'text-xs sm:text-base'}`}
        >
          {name}
        </strong>
        {marker?.winner === side && <Trophy className='w-4 h-4 text-amber-400 shrink-0' />}
      </div>
      {Array.from({ length: visibleSets }, (_, setIndex) => (
        <strong key={setIndex} className='text-center rounded-lg py-1.5 bg-white/5 text-white/80'>
          {marker?.sets?.[setIndex]?.games?.[index] ?? '/'}
        </strong>
      ))}
      <strong
        className={`text-center rounded-xl py-2 bg-lime-300/15 text-lime-200 ${featured ? 'text-2xl sm:text-3xl' : 'text-lg'}`}
      >
        {marker?.displayPoints?.[index] ?? '0'}
      </strong>
    </div>
  )
}

let globalCarouselIndex = 0

function MiniSponsorsCarousel({ sponsors = [] }) {
  const [activeIndex, setActiveIndex] = useState(globalCarouselIndex)
  const [isPaused, setIsPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const pointerStartX = useRef(null)
  const pointerStartY = useRef(null)
  const total = sponsors.length

  const goNext = useCallback(() => {
    setActiveIndex((current) => {
      const next = (current + 1) % total
      globalCarouselIndex = next
      return next
    })
  }, [total])

  const goPrevious = useCallback(() => {
    setActiveIndex((current) => {
      const next = (current - 1 + total) % total
      globalCarouselIndex = next
      return next
    })
  }, [total])

  const goTo = useCallback(
    (index) => {
      const next = (index + total) % total
      globalCarouselIndex = next
      setActiveIndex(next)
    },
    [total]
  )

  useEffect(() => {
    if (isPaused || reducedMotion || total <= 1) return undefined
    const timer = window.setInterval(goNext, 3600)
    return () => window.clearInterval(timer)
  }, [isPaused, reducedMotion, goNext, total, activeIndex])

  const visibleSponsors = useMemo(() => {
    if (!total) return []
    return sponsors
      .map((sponsor, index) => {
        let offset = index - activeIndex
        if (offset > total / 2) offset -= total
        if (offset < -total / 2) offset += total
        return {
          ...sponsor,
          index,
          offset,
        }
      })
      .filter(({ offset }) => Math.abs(offset) <= 1)
  }, [activeIndex, sponsors, total])

  const activeSponsor = sponsors[activeIndex]

  const handleTouchStart = (e) => {
    pointerStartX.current = e.touches[0].clientX
    pointerStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e) => {
    if (pointerStartX.current === null || pointerStartY.current === null) return
    const deltaX = e.changedTouches[0].clientX - pointerStartX.current
    const deltaY = e.changedTouches[0].clientY - pointerStartY.current
    pointerStartX.current = null
    pointerStartY.current = null
    // Solo cambiar slide si fue un gesto horizontal claro, permitiendo el scroll vertical nativo
    if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0) goPrevious()
      else goNext()
    }
  }

  if (!total) return null

  return (
    <div
      className='relative flex flex-col items-center justify-center touch-pan-y select-none'
      onMouseEnter={() => {
        if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches) {
          setIsPaused(true)
        }
      }}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header sutil y centrado con el carrusel */}
      <div className='flex items-center justify-between w-[250px] xs:w-[270px] sm:w-[290px] md:w-[310px] mb-1.5 px-1'>
        <div className='flex items-center gap-1.5 min-w-0'>
          <span className='px-1.5 py-0.5 rounded-full bg-white/10 text-[8px] uppercase tracking-[.2em] font-extrabold text-white/60 shrink-0'>
            Aliado
          </span>
          <span
            className='text-[11px] xs:text-xs font-bold text-white truncate max-w-[130px] xs:max-w-[150px] sm:max-w-[170px]'
            key={activeSponsor?.name}
          >
            {activeSponsor?.name}
          </span>
        </div>
        <span className='px-1.5 py-0.5 rounded-full bg-white/5 text-[8.5px] xs:text-[9px] font-mono text-white/50 border border-white/10 shrink-0'>
          Aliados del torneo
        </span>
      </div>

      {/* Stage: Las flechas abrazan directamente a las tarjetas */}
      <div className='flex items-center justify-center gap-2 sm:gap-2.5 w-full'>
        {/* Flecha izquierda */}
        <button
          type='button'
          onClick={goPrevious}
          className='w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 text-white/80 hover:text-white flex items-center justify-center shrink-0 backdrop-blur-md shadow-md transition-all hover:scale-105'
          aria-label='Anterior aliado'
        >
          <ChevronLeft className='w-4 h-4' />
        </button>

        {/* Contenedor de tarjetas centrado y responsive */}
        <div className='relative h-[60px] xs:h-[66px] sm:h-[72px] md:h-[80px] w-[190px] xs:w-[210px] sm:w-[230px] md:w-[240px] overflow-hidden flex items-center justify-center'>
          {/* Glow sutil con el acento del aliado activo */}
          <div
            className='absolute w-24 h-12 rounded-full opacity-35 blur-lg pointer-events-none transition-colors duration-700'
            style={{ background: activeSponsor?.accent || '#ffffff' }}
          />

          {visibleSponsors.map((item) => {
            const isActive = item.offset === 0
            let transformStyle = 'translateX(-50%) translateY(-50%) scale(0.6)'
            let opacityStyle = 0
            let zIndexStyle = 1

            if (isActive) {
              transformStyle = 'translateX(-50%) translateY(-50%) scale(1)'
              opacityStyle = 1
              zIndexStyle = 10
            } else if (item.offset === -1) {
              transformStyle = 'translateX(calc(-50% - 56px)) translateY(-50%) scale(0.78)'
              opacityStyle = 0.35
              zIndexStyle = 5
            } else if (item.offset === 1) {
              transformStyle = 'translateX(calc(-50% + 56px)) translateY(-50%) scale(0.78)'
              opacityStyle = 0.35
              zIndexStyle = 5
            }

            return (
              <button
                type='button'
                key={item.image}
                onClick={() => goTo(item.index)}
                className={`absolute top-1/2 left-1/2 rounded-xl bg-white p-1.5 flex items-center justify-center transition-all duration-500 ease-out cursor-pointer ${
                  isActive
                    ? 'w-[115px] xs:w-[130px] sm:w-[145px] h-[52px] xs:h-[56px] sm:h-[64px]'
                    : 'w-[95px] xs:w-[110px] sm:w-[125px] h-[44px] xs:h-[48px] sm:h-[54px]'
                }`}
                style={{
                  transform: transformStyle,
                  opacity: opacityStyle,
                  zIndex: zIndexStyle,
                  boxShadow: isActive
                    ? `0 6px 20px -3px ${item.accent || '#000'}60, 0 3px 10px rgba(0,0,0,0.3)`
                    : '0 2px 8px rgba(0,0,0,0.25)',
                  border: isActive
                    ? `1.5px solid ${item.accent || '#ffffff'}aa`
                    : '1px solid rgba(255,255,255,0.2)',
                }}
                aria-label={item.name}
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className='w-full h-full object-contain rounded-lg pointer-events-none'
                  loading='lazy'
                />
              </button>
            )
          })}
        </div>

        {/* Flecha derecha */}
        <button
          type='button'
          onClick={goNext}
          className='w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 border border-white/15 text-white/80 hover:text-white flex items-center justify-center shrink-0 backdrop-blur-md shadow-md transition-all hover:scale-105'
          aria-label='Siguiente aliado'
        >
          <ChevronRight className='w-4 h-4' />
        </button>
      </div>
    </div>
  )
}
