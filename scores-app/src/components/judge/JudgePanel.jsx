import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function JudgePanel({ title, children, onClose, busy, compact = false }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className={`judge-dialog${compact ? ' judge-dialog-compact' : ''}`}
      aria-labelledby='judge-panel-title'
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className='judge-dialog-heading'>
        <h2 className='font-bold' id='judge-panel-title'>
          {title}
        </h2>
        <button
          className='judge-tool'
          onClick={onClose}
          disabled={busy}
          aria-label='Cerrar panel'
        >
          <X size={20} />
        </button>
      </div>
      <div className='p-4'>{children}</div>
    </dialog>
  )
}
