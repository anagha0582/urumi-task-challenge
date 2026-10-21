import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { AlertCircle, Check, Copy, LoaderCircle, X } from 'lucide-react'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle size={19} className="spin" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={18} />
      <span>{message}</span>
      {onRetry && <button className="button button-quiet button-small" onClick={onRetry} type="button">Retry</button>}
    </div>
  )
}

export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><AlertCircle size={20} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
        ))
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    dialogRef.current?.querySelector<HTMLElement>('button, input, select, textarea, a[href]')?.focus()
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        ref={dialogRef}
        className={`modal${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close dialog"><X size={18} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  busy = false,
  onCancel,
  onConfirm,
}: {
  title: string
  description: string
  confirmLabel?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="modal-copy">{description}</p>
      <div className="modal-actions">
        <button className="button button-secondary" onClick={onCancel} type="button" disabled={busy}>Cancel</button>
        <button className="button button-danger" onClick={onConfirm} type="button" disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function Toast({
  message,
  kind,
  onClose,
}: {
  message: string
  kind: 'success' | 'error'
  onClose: () => void
}) {
  return (
    <div className={`toast toast-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
      <span>{message}</span>
      <button className="icon-button" onClick={onClose} type="button" aria-label="Dismiss notification"><X size={16} /></button>
    </div>
  )
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const copy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setCopyError(false)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopyError(true)
    }
  }
  return (
    <span className="copy-control">
      <button className="button button-secondary button-small" type="button" onClick={copy}>
        <Copy size={15} /> <span>{copied ? 'Copied' : label}</span>
      </button>
      {copyError && <span className="copy-error" role="status">Select and copy the key manually.</span>}
    </span>
  )
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'good' | 'bad' | 'warning' | 'neutral' }) {
  return <span className={`status-badge status-${tone}`}><span className="status-dot" />{children}</span>
}
