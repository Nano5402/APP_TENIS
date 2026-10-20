import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tournamentService } from '../../services/tournamentService'
import { formatDate } from '../../utils/formatDate'
export default function TournamentDirectory() {
  const [archive, setArchive] = useState('activos')
  const [items, setItems] = useState([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    tournamentService
      .getAll({ deporte: 'tenis', archivo: archive })
      .then((r) => {
        if (active) {
          setItems(r.data)
          setError('')
        }
      })
      .catch((e) => {
        if (active) setError(e.message || 'No se pudieron cargar los torneos')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [retry, archive])
  if (error)
    return (
      <div role='alert'>
        {error}{' '}
        <button className='underline' onClick={() => setRetry((v) => v + 1)}>
          Reintentar
        </button>
      </div>
    )
  if (loading) return <p role='status'>Cargando torneos…</p>
  return (
    <div className='space-y-4'>
    <label className='block text-sm font-semibold'>Torneos<select className='form-input mt-1 w-full sm:max-w-xs' value={archive} onChange={e=>setArchive(e.target.value)}><option value='activos'>Sin archivar</option><option value='archivados'>Historial archivado</option></select></label>
    <div className='grid sm:grid-cols-2 gap-4'>
      {!items.length && <p>No hay torneos en esta selección.</p>}
      {items.map((t) => (
        <article key={t.id} className='card p-5 flex flex-col justify-between gap-4'>
          <Link to={`/torneo/${t.id}`} className='block space-y-2.5 group'>
            <span className='badge-brand'>
              {t.archivado ? 'Archivado · ' : ''}
              {t.modalidad === 'dobles' ? 'Dobles' : 'Individual'} · {t.estado.replace('_', ' ')}
            </span>
            <h2 className='font-bold text-lg group-hover:text-[var(--color-brand)] transition-colors'>
              {t.nombre}
            </h2>
            <p className='text-sm text-[var(--text-secondary)]'>
              {t.categoria?.nombre || 'Todas las categorías'} ·{' '}
              {t.fecha_inicio ? formatDate(t.fecha_inicio) : 'Fecha por definir'}
            </p>
            <p className='text-sm'>
              {t.partidos_count} partidos · {t.inscripciones_count || 0} inscripciones
            </p>
          </Link>
          <div className='flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border-color)]'>
            <Link
              to={`/torneo/${t.id}?tab=bracket`}
              className='btn-primary px-3 py-1.5 text-xs font-bold'
            >
              🏆 Eliminatorias (Brackets)
            </Link>
            <Link
              to={`/torneo/${t.id}?tab=standings`}
              className='btn-secondary px-3 py-1.5 text-xs font-semibold'
            >
              Posiciones
            </Link>
            {t.modalidad === 'dobles' && (
              <Link
                to={`/torneo/${t.id}?tab=teams`}
                className='btn-secondary px-3 py-1.5 text-xs font-semibold'
              >
                Parejas inscritas
              </Link>
            )}
            <Link
              to={`/torneo/${t.id}?tab=matches`}
              className='btn-secondary px-3 py-1.5 text-xs font-semibold'
            >
              Partidos →
            </Link>
          </div>
        </article>
      ))}
    </div>
    </div>
  )
}
