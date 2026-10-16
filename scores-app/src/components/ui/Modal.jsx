import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconColor,
  iconBg,
  children,
  footer,
  onSubmit,
  maxWidth = 'max-w-2xl',
  busy = false,
  className = '',
}) {
  const dialogRef = useDialogFocus(isOpen, onClose, busy)

  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen])

  if (!isOpen || typeof document === 'undefined') return null

  const content = (
    <div
      ref={dialogRef}
      role='dialog'
      aria-modal='true'
      aria-label={title}
      tabIndex={-1}
      className='fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 animate-fade-in'
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={() => !busy && onClose()}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border animate-scale-up overflow-hidden ${className}`}
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-color)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado Fijo */}
        <div
          className='flex items-center justify-between px-5 sm:px-6 py-4 border-b shrink-0'
          style={{
            borderColor: 'var(--border-color)',
            backgroundColor: 'var(--bg-card)',
          }}
        >
          <div className='flex items-center gap-3 min-w-0'>
            {Icon && (
              <div
                className='w-10 h-10 rounded-xl flex items-center justify-center shrink-0'
                style={{
                  backgroundColor: iconBg || 'var(--color-brand-dim)',
                  color: iconColor || 'var(--color-brand)',
                }}
              >
                <Icon className='w-5 h-5' />
              </div>
            )}
            <div className='min-w-0'>
              <h2 className='text-base sm:text-lg font-bold truncate' style={{ color: 'var(--text-primary)' }}>
                {title}
              </h2>
              {subtitle && (
                <p className='text-xs truncate mt-0.5' style={{ color: 'var(--text-muted)' }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type='button'
            onClick={onClose}
            disabled={busy}
            className='btn-ghost p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ml-3 shrink-0'
            aria-label='Cerrar modal'
          >
            <X className='w-5 h-5' />
          </button>
        </div>

        {/* Contenido con Scroll / Formulario */}
        {onSubmit ? (
          <form onSubmit={onSubmit} className='flex flex-col flex-1 min-h-0 overflow-hidden'>
            <div className='flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4 custom-scrollbar'>
              {children}
            </div>
            {footer && (
              <div
                className='flex items-center justify-end gap-3 px-5 sm:px-6 py-4 border-t shrink-0 mt-auto'
                style={{
                  borderColor: 'var(--border-color)',
                  backgroundColor: 'var(--bg-card)',
                }}
              >
                {footer}
              </div>
            )}
          </form>
        ) : (
          <>
            <div className='flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4 custom-scrollbar'>
              {children}
            </div>
            {footer && (
              <div
                className='flex items-center justify-end gap-3 px-5 sm:px-6 py-4 border-t shrink-0 mt-auto'
                style={{
                  borderColor: 'var(--border-color)',
                  backgroundColor: 'var(--bg-card)',
                }}
              >
                {footer}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
