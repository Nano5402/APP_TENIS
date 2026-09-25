import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { tournamentService } from '../services/tournamentService'
import { matchService } from '../services/matchService'
import useAuthStore from '../store/useAuthStore'
import { useMatchRealtime } from '../hooks/useMatchRealtime'
import TournamentTeamsModal from '../components/tournament/TournamentTeamsModal'
import TournamentRoster from '../components/tournament/TournamentRoster'
import TournamentStandings from '../components/tournament/TournamentStandings'
import TournamentMatches from '../components/tournament/TournamentMatches'
import { confirm } from '../utils/confirm'
export default function TournamentDetail() {
  const { id } = useParams(),
    admin = useAuthStore((s) => s.user?.rol === 'admin')
  const standingsManagement = useAuthStore((s) => s.isAuthenticated && ['admin', 'juez_director'].includes(s.user?.rol))
  const [t, setT] = useState(null),
    [tab, setTab] = useState('matches'),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [adding, setAdding] = useState(false),
    [removing, setRemoving] = useState(false),
    [rosterDirty, setRosterDirty] = useState(false)
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
    ])
      .then(([meta, content]) => {
        if (active) {
          setT(meta.data)
          setData(content.data)
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
        title: 'Retirar inscripción',
        message: `¿Retirar a ${team.nombre}? No elimina la pareja ni sus jugadores.`,
        confirmLabel: 'Retirar',
      }))
    )
      return
    setRemoving(true)
    try {
      await tournamentService.removeInscripcion(id, team.equipo_id)
      refresh()
    } catch (e) {
      setError(e.message || 'No se pudo retirar')
    } finally {
      setRemoving(false)
    }
  }
  return (
    <section className='space-y-5 min-w-0'>
      <div className='flex justify-between gap-3'>
        <Link to='/tennis' className='btn-ghost text-sm'>
          ← Volver a tenis
        </Link>
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
            {admin && <p className='text-xs'>
              La organización programa los partidos. Inscribir parejas no genera cruces
              automáticamente.
            </p>}
          </header>
          <div className='flex flex-wrap gap-2' aria-label='Secciones del torneo'>
            {[
              ['matches', 'Partidos'],
              ...(t.modalidad === 'dobles' ? [['teams', 'Parejas inscritas']] : []),
              ['standings', 'Posiciones'],
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
      {data && tab === 'matches' && <TournamentMatches matches={data} loading={false} />}
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
            admin={admin}
            remove={remove}
            removing={removing}
            onDirtyChange={setRosterDirty}
          />
        </div>
      )}
      {data && tab === 'standings' && <TournamentStandings data={data} />}
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
