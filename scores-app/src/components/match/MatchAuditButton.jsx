import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import ActionDialog from '../common/ActionDialog'
import { matchService } from '../../services/matchService'
import { getParticipantName } from '../../utils/matchParticipants'
import { formatDate, formatTime } from '../../utils/formatDate'
import { cn } from '../../utils/cn'

const auditTime = (value) =>
  value ? `${formatDate(value)} · ${formatTime(value)}` : 'Fecha no disponible'

function Audit({ match, onClose }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('todos')
  const load = async (after = 0) => {
    setBusy(true)
    setError('')
    try {
      const res = await matchService.getAudit(match.id, after)
      setData((old) => ({
        ...res.data,
        eventos: after ? [...old.eventos, ...res.data.eventos] : res.data.eventos,
      }))
    } catch (err) {
      setError(err.message || 'No se pudo cargar la auditoría.')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    load()
  }, [match.id])
  const events = (data?.eventos || []).filter(
    (e) =>
      filter === 'todos' ||
      (filter === 'anulados'
        ? e.anulado_at
        : filter === 'puntos' && e.tipo === 'punto' && !e.anulado_at)
  )
  return (
    <ActionDialog title={`Auditoría del partido #${match.id}`} onClose={onClose}>
      <label className='block text-sm'>
        Mostrar
        <select
          className='form-input mt-1'
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value='todos'>Todas las acciones</option>
          <option value='puntos'>Puntos vigentes</option>
          <option value='anulados'>Acciones anuladas</option>
          <option value='control'>Intervenciones</option>
        </select>
      </label>
      {error && (
        <p role='alert' className='text-red-600 text-sm'>
          {error}{' '}
          <button className='underline' onClick={() => load()}>
            Reintentar
          </button>
        </p>
      )}
      {(filter === 'todos' || filter === 'control') &&
        data?.intervenciones.map((a) => (
          <article
            key={`a${a.id}`}
            className='rounded-lg p-3 border border-[var(--border-color)] text-sm'
          >
            <strong>{a.accion.replaceAll('_', ' ')}</strong>
            <p>
              {a.autor_nombre || 'Autor no disponible'} · {auditTime(a.created_at)}
            </p>
            <details>
              <summary className='cursor-pointer'>Detalle registrado</summary>
              <pre className='whitespace-pre-wrap break-words text-xs mt-2'>
                {typeof a.detalle === 'string' ? a.detalle : JSON.stringify(a.detalle, null, 2)}
              </pre>
            </details>
          </article>
        ))}
      {data?.control_limitado && (
        <p className='text-sm'>Se muestran las 100 intervenciones más recientes.</p>
      )}
      {events.map((e) => (
        <article
          key={e.id}
          className='rounded-lg p-3 border border-[var(--border-color)] text-sm space-y-1'
        >
          <strong>
            #{e.secuencia} · {e.tipo.replaceAll('_', ' ')}
            {e.anulado_at ? ' · Anulado' : ''}
          </strong>
          {e.ganador && <p>Punto para {getParticipantName(match, e.ganador === 'jugador1' ? 1 : 2)}</p>}
          {e.motivo && <p>{e.motivo.replaceAll('_', ' ')}</p>}
          <p>
            Registrado por {e.autor_nombre || 'Autor no disponible'} · {auditTime(e.created_at)}
          </p>
          {e.anulado_at && (
            <p>
              Anulado por {e.anulador_nombre || 'Autor no disponible'} · {auditTime(e.anulado_at)}
            </p>
          )}
        </article>
      ))}
      {!busy && data && !events.length && (filter !== 'control' || !data.intervenciones.length) && (
        <p className='text-sm'>No hay acciones en esta selección de registros cargados.</p>
      )}
      {busy ? (
        <p role='status'>Cargando registros…</p>
      ) : (
        data?.siguiente != null && (
          <button
            className='btn-secondary px-4 py-2 rounded-lg'
            onClick={() => load(data.siguiente)}
          >
            Cargar más acciones
          </button>
        )
      )}
    </ActionDialog>
  )
}

export default function MatchAuditButton({
  match,
  className,
  title = 'Auditoría del partido',
  showIcon = true,
  responsive = true,
  style,
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className={cn(
          'btn-secondary px-3 py-2 flex items-center gap-1.5 text-xs',
          className
        )}
        style={style}
        title={title}
        aria-label={title}
      >
        {showIcon && <History className='w-4 h-4' />}
        <span className={responsive ? 'hidden lg:inline' : ''}>Auditoría</span>
      </button>
      {open && <Audit match={match} onClose={() => setOpen(false)} />}
    </>
  )
}
