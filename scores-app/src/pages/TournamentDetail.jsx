import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { tournamentService } from '../services/tournamentService'
import { matchService } from '../services/matchService'
import useAuthStore from '../store/useAuthStore'
import { useMatchRealtime } from '../hooks/useMatchRealtime'
import TournamentTeamsModal from '../components/tournament/TournamentTeamsModal'
import TournamentRoster from '../components/tournament/TournamentRoster'
import TournamentStandings from '../components/tournament/TournamentStandings'
import TournamentMatches from '../components/tournament/TournamentMatches'
import TournamentBracket from '../components/tournament/TournamentBracket'
import TournamentRetirements from '../components/tournament/TournamentRetirements'
import { confirm } from '../utils/confirm'
export default function TournamentDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { id } = useParams(),
    admin = useAuthStore((s) => s.user?.rol === 'admin')
  const standingsManagement = useAuthStore((s) => s.isAuthenticated && ['admin', 'juez_director'].includes(s.user?.rol))
  const [t, setT] = useState(null),
    [retirements, setRetirements] = useState(null),
    [tab, setTab] = useState(() => {
      const initial = searchParams.get('tab') || 'matches'
      if (initial === 'participation' && !admin) return 'matches'
      return ['matches', 'teams', 'standings', 'participation', 'bracket'].includes(initial) ? initial : 'matches'
    }),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [adding, setAdding] = useState(false),
    [removing, setRemoving] = useState(false),
    [rosterDirty, setRosterDirty] = useState(false)

  useEffect(() => {
    const requested = searchParams.get('tab') || 'matches'
    const tParam = ['matches', 'teams', 'standings', 'participation', 'bracket'].includes(requested) ? requested : 'matches'
    if (tParam && tParam !== tab) {
      if (tParam === 'participation' && !admin) {
        setTab('matches')
        setSearchParams({ tab: 'matches' }, { replace: true })
        return
      }
      setTab(tParam)
    } else if (tab === 'participation' && !admin) {
      setTab('matches')
      setSearchParams({ tab: 'matches' }, { replace: true })
    }
  }, [searchParams, admin, tab])
  const refresh = () => setTick((v) => v + 1),
    timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  useMatchRealtime(
    useCallback(() => {
      if (!timer.current)
        timer.current = setTimeout(() => {
          timer.current = null
          setTick((v) => v + 1)
        }, 1500)
    }, [])
  )
  useEffect(() => {
    let active = true
    setBusy(true)
    setError('')
    Promise.all([
      tournamentService.getById(id),
      tab === 'teams'
        ? tournamentService.getInscripciones(id)
        : tab === 'standings'
          ? tournamentService.getStandings(id, standingsManagement)
          : matchService.getAll({ torneo_id: id }),
      tournamentService.getRetirements(id),
    ])
      .then(([meta, content, statuses]) => {
        if (active) {
          setT(meta.data)
          setData(content.data)
          setRetirements(statuses.data)
        }
      })
      .catch((e) => {
        if (active) setError(e.message || 'No se pudo cargar el torneo')
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [id, tab, tick, standingsManagement])
  const remove = async (team) => {
    if (
      !(await confirm({
        title: 'Quitar inscripción',
        message: `¿Quitar la inscripción de ${team.nombre}? Solo se permite si no tiene partidos. Para registrar un retiro conservando el historial, usa la sección Participación. No elimina la pareja ni sus jugadores.`,
        confirmLabel: 'Quitar inscripción',
      }))
    )
      return
    setRemoving(true)
    try {
      await tournamentService.removeInscripcion(id, team.equipo_id)
      refresh()
    } catch (e) {
      const errMsg = e?.response?.data?.message || e.message || 'No se pudo retirar'
      if (
        e?.response?.status === 409 ||
        errMsg.includes('partidos') ||
        errMsg.includes('Participación')
      ) {
        setError(
          'Esta pareja ya tiene partidos disputados. Para no perder sus estadísticas ni historial y liberar su cupo en el grupo, usa el botón «Retirar del torneo» o la sección Participación.'
        )
      } else {
        setError(errMsg)
      }
    } finally {
      setRemoving(false)
    }
  }
  return (
    <section className='space-y-5 min-w-0'>
      <div className='flex justify-between gap-3'>
        <button
          type='button'
          onClick={() => {
            if (location.state?.from) navigate(location.state.from)
            else if (window.history.length > 1) navigate(-1)
            else navigate(t?.deporte === 'padel' ? '/padel' : '/tennis?tab=tournaments')
          }}
          className='btn-ghost text-sm flex items-center gap-1.5'
        >
          <ArrowLeft className='w-4 h-4' /> Volver a {t?.deporte === 'padel' ? 'pádel' : 'tenis'}
        </button>
        <button className='btn-ghost text-sm' disabled={busy} onClick={refresh}>
          Actualizar
        </button>
      </div>
      {error && (
        <p role='alert' className='card p-4 text-red-600'>
          {error}
        </p>
      )}
      {t && (
        <>
          <header className='card p-5 space-y-2'>
            <p className='text-sm text-[var(--color-brand)]'>
              {t.modalidad === 'dobles' ? 'Dobles' : 'Individual'} ·{' '}
              {t.categoria?.nombre || 'Todas las categorías'}
            </p>
            <h1 className='text-2xl font-bold break-words'>{t.nombre}</h1>
            <p className='text-sm'>
              {t.estado.replace('_', ' ')} · {t.sistema.replaceAll('_', ' ')}
            </p>
            {t.archivado && <p className='text-sm font-semibold'>Torneo archivado · historial disponible</p>}
          </header>
          <div className='flex flex-wrap gap-2' aria-label='Secciones del torneo'>
            {[
              ['matches', 'Partidos'],
              ...(t.modalidad === 'dobles' ? [['teams', 'Parejas inscritas']] : []),
              ['standings', 'Posiciones'],
              ...(['grupos_eliminacion', 'eliminacion_directa'].includes(t.sistema) ? [['bracket', 'Eliminatorias']] : []),
              ...(admin ? [['participation', 'Participación']] : []),
            ].map(([v, l]) => (
              <button
                key={v}
                className={
                  tab === v ? 'btn-primary px-3 py-2 text-sm' : 'btn-secondary px-3 py-2 text-sm'
                }
                aria-pressed={tab === v}
                onClick={async () => {
                  if (
                    rosterDirty &&
                    !(await confirm({
                      title: 'Cambios sin guardar',
                      message: '¿Salir sin guardar la distribución?',
                      confirmLabel: 'Salir sin guardar',
                    }))
                  )
                    return
                  setRosterDirty(false)
                  setTab(v)
                  setSearchParams({ tab: v }, { replace: true })
                  setData(null)
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </>
      )}
      {busy && (
        <p role='status' className='text-sm'>
          Actualizando…
        </p>
      )}
      {data && tab === 'matches' && (
        <div className='space-y-4'>
          {admin && (
            <div className='flex flex-wrap items-center justify-between gap-3 p-3.5 card'>
              <p className='text-xs text-[var(--text-muted)]'>
                {data.length} partido{data.length !== 1 ? 's' : ''} registrado{data.length !== 1 ? 's' : ''} en este torneo.
              </p>
              <div className='flex items-center gap-2'>
                <Link
                  to={`/admin/partidos?torneo=${id}`}
                  className='btn-secondary px-3 py-1.5 text-xs'
                >
                  Ver en gestión
                </Link>
                <Link
                  to={`/admin/partidos?torneo=${id}&crear=1`}
                  className='btn-primary px-3 py-1.5 text-xs flex items-center gap-1.5'
                >
                  <Plus className='w-3.5 h-3.5' /> Programar partido
                </Link>
              </div>
            </div>
          )}
          <TournamentMatches matches={data} loading={false} />
        </div>
      )}
      {data && tab === 'teams' && (
        <div className='space-y-4'>
          {admin && t?.modalidad === 'dobles' && (
            <button className='btn-primary px-4 py-2' onClick={() => setAdding(true)}>
              Agregar parejas
            </button>
          )}
          <TournamentRoster
            tournament={t}
            data={data}
            retirements={retirements}
            admin={admin}
            remove={remove}
            removing={removing}
            onDirtyChange={setRosterDirty}
            onRefresh={refresh}
          />
        </div>
      )}
      {data && tab === 'standings' && <TournamentStandings data={data} retirements={retirements} />}
      {!busy && !error && Array.isArray(data) && tab === 'bracket' && <TournamentBracket key={id} matches={data} system={t?.sistema} management={standingsManagement} />}
      {admin && tab === 'participation' && <TournamentRetirements tournamentId={id} onChange={refresh} />}
      {adding && (
        <TournamentTeamsModal
          tournament={t}
          enrolledTeamIds={new Set((data?.inscripciones_raw || []).map((r) => Number(r.equipo_id)))}
          onClose={() => setAdding(false)}
          onSuccess={refresh}
        />
      )}
    </section>
  )
}
