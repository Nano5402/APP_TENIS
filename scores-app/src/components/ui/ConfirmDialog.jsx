import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import useConfirmStore from '../../store/useConfirmStore'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export default function ConfirmDialog() {
  const {
    isOpen,
    title,
    message,
    confirmLabel,
    cancelLabel,
    danger,
    alertOnly,
    requireText,
    resolver,
    close,
  } = useConfirmStore()

  const [typed, setTyped] = useState('')
  const dialogRef = useDialogFocus(
    isOpen,
    () => {
      resolver?.(false)
      close()
    },
    false
  )

  useEffect(() => {
    if (isOpen) setTyped('')
  }, [isOpen])

  if (!isOpen || typeof document === 'undefined') return null

  const needsTyping = Boolean(requireText)
  const canConfirm = !needsTyping || typed.trim() === requireText.trim()

  const handleConfirm = () => {
    if (!canConfirm) return
    resolver?.(true)
    close()
  }

  const handleCancel = () => {
    resolver?.(false)
    close()
  }

  // Confirmations can be opened from Modal (z-index 9999). Keep them outside
  // layout stacking contexts and above the form that is awaiting the answer.
  return createPortal(
    <div
      className='fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fade-up'
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={handleCancel}
    >
      <div
        ref={dialogRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby='confirm-dialog-title'
        tabIndex={-1}
        className='w-full rounded-2xl max-h-[90dvh] overflow-y-auto'
        style={{
          maxWidth: '420px',
          backgroundColor: 'var(--bg-sidebar)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className='flex items-start gap-3 px-5 pt-5 pb-2'>
          <div
            className='w-10 h-10 rounded-xl flex items-center justify-center shrink-0'
            style={{
              backgroundColor: danger ? 'rgba(239,68,68,0.12)' : 'var(--color-brand-dim)',
            }}
          >
            <AlertTriangle
              className='w-5 h-5'
              style={{ color: danger ? '#ef4444' : 'var(--color-brand)' }}
            />
          </div>
          <div className='flex-1 min-w-0 pt-1'>
            <h3
              id='confirm-dialog-title'
              className='text-base font-bold'
              style={{ color: 'var(--text-primary)' }}
            >
              {title}
            </h3>
          </div>
          <button
            aria-label='Cerrar diálogo'
            onClick={handleCancel}
            className='btn-ghost p-1 shrink-0'
          >
            <X className='w-4 h-4' style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Mensaje */}
        <div className='px-5 pb-4'>
          <p
            className='text-sm leading-relaxed whitespace-pre-line break-words'
            style={{ color: 'var(--text-secondary)' }}
          >
            {message}
          </p>

          {/* Verificación doble — escribir texto exacto */}
          {needsTyping && (
            <div className='mt-4'>
              <label className='form-label'>
                Escribe{' '}
                <span style={{ color: danger ? '#ef4444' : 'var(--color-brand)', fontWeight: 700 }}>
                  {requireText}
                </span>{' '}
                para confirmar
              </label>
              <input
                autoFocus
                className='form-input'
                placeholder={requireText}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canConfirm) handleConfirm()
                }}
              />
            </div>
          )}
        </div>

        {/* Acciones */}
        <div
          className='flex gap-3 px-5 py-4'
          style={{ borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-hover)' }}
        >
          {!alertOnly && (
            <button onClick={handleCancel} className='btn-secondary flex-1'>
              {cancelLabel}
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className='flex-1 rounded-lg text-sm font-semibold py-2.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed'
            style={{
              backgroundColor: danger ? '#ef4444' : 'var(--color-brand)',
              color: '#fff',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
