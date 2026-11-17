import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from 'lucide-react'

/* ------------------------------- Notificaciones --------------------------- */

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

let toastSeq = 0
const listeners = new Set<(items: ToastItem[]) => void>()
let items: ToastItem[] = []

const emit = () => listeners.forEach((l) => l([...items]))

export const toast = {
  success: (message: string) => push(message, 'success'),
  error: (message: string) => push(message, 'error'),
  info: (message: string) => push(message, 'info'),
}

function push(message: string, kind: ToastKind) {
  const id = ++toastSeq
  items = [...items, { id, message, kind }]
  emit()
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== id)
    emit()
  }, kind === 'error' ? 6500 : 4200)
}

export function ToastStack() {
  const [list, setList] = useState<ToastItem[]>([])
  useEffect(() => {
    listeners.add(setList)
    return () => {
      listeners.delete(setList)
    }
  }, [])

  if (!list.length) return null

  return createPortal(
    <div className="toast-stack" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'info' ? '' : t.kind}`}>
          {t.kind === 'success' && <CheckCircle2 size={16} />}
          {t.kind === 'error' && <AlertCircle size={16} />}
          {t.kind === 'info' && <Info size={16} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>,
    document.body,
  )
}

/* ---------------------------------- Modal --------------------------------- */

interface ModalProps {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  large?: boolean
}

export function Modal({ open, title, subtitle, onClose, children, footer, large }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="modal-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal ${large ? 'modal-lg' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <div>
            <h2 style={{ fontSize: 19 }}>{title}</h2>
            {subtitle && (
              <p className="text-sm text-muted" style={{ marginTop: 4 }}>
                {subtitle}
              </p>
            )}
          </div>
          <button type="button" className="icon-btn plain" onClick={onClose} aria-label="Cerrar">
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------------------------------- Varios -------------------------------- */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading-screen">
      <div className="spinner" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function InlineSpinner() {
  return <Loader2 size={15} className="spin-icon" style={{ animation: 'spin 0.9s linear infinite' }} />
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="form-error" role="alert">
      <AlertCircle size={16} style={{ flex: '0 0 16px', marginTop: 1 }} />
      <span>{message}</span>
    </div>
  )
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="form-success" role="status">
      <CheckCircle2 size={16} style={{ flex: '0 0 16px', marginTop: 1 }} />
      <span>{message}</span>
    </div>
  )
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="empty-state">
      {icon}
      <p style={{ fontWeight: 500, color: 'var(--ink-700)' }}>{title}</p>
      {hint && <p className="text-xs mt-8">{hint}</p>}
    </div>
  )
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="info-note">
      <Info size={16} />
      <div>{children}</div>
    </div>
  )
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
