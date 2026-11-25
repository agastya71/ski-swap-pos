/**
 * UI v2 primitives (phase U1 of docs/ui-overhaul-ab-plan-2026-11-24.md).
 *
 * Plain-React, dependency-free components rendered with class names driven by
 * the v2 token layer (ui-v2.css). In v1 mode these render neutrally so pages
 * can adopt them without changing the v1 look; the v2 class on <html> is what
 * activates the overhauled styling. No Chromium-only CSS is used (works in
 * Firefox/Safari).
 */
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { useUiVariant } from '../../lib/uiVariant'

/** Shared className helper: primitive class + v2 marker + caller extras. */
function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * Returns the modifier classes for the current variant. In v1 every primitive
 * renders with only its base class (v1 look untouched); in v2 it gets the
 * `ui2-` modifier classes styled from the token layer.
 */
function useVariantClass(): string {
  return useUiVariant() === 'v2' ? 'ui2' : ''
}

/* ── Button ─────────────────────────────────────────────────────────────── */
type ButtonVariant = 'primary' | 'secondary' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

/** Primary action button (v2: navy fill). Falls back to global button look in v1. */
export function Button({ variant = 'primary', ...rest }: ButtonProps) {
  const mod = useVariantClass()
  return <button className={cx('ui-btn', mod && `ui2-btn--${variant}`)} data-variant={variant} {...rest} />
}

/* ── Inputs ─────────────────────────────────────────────────────────────── */
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string | null
  hint?: string
}

/** Text input with optional label + error display. */
export function TextField({ label, error, hint, id, className, ...rest }: TextFieldProps) {
  const mod = useVariantClass()
  const inputId = id ?? rest.name
  return (
    <div className={cx('ui-field', mod && 'ui2-field')}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <input id={inputId} className={cx(className, error ? 'ui-invalid' : undefined)} aria-invalid={error ? true : undefined} {...rest} />
      {hint && !error && <div className="ui-field-hint">{hint}</div>}
      {error && <div className="ui-field-error" role="alert">{error}</div>}
    </div>
  )
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string | null
}

/** Select with optional label + error display. */
export function SelectField({ label, error, id, className, children, ...rest }: SelectFieldProps) {
  const mod = useVariantClass()
  const selectId = id ?? rest.name
  return (
    <div className={cx('ui-field', mod && 'ui2-field')}>
      {label && <label htmlFor={selectId}>{label}</label>}
      <select id={selectId} className={cx(className, error ? 'ui-invalid' : undefined)} aria-invalid={error ? true : undefined} {...rest}>
        {children}
      </select>
      {error && <div className="ui-field-error" role="alert">{error}</div>}
    </div>
  )
}

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string | null
}

/** Multiline text input with optional label + error display. */
export function TextAreaField({ label, error, id, className, ...rest }: TextAreaFieldProps) {
  const mod = useVariantClass()
  const areaId = id ?? rest.name
  return (
    <div className={cx('ui-field', mod && 'ui2-field')}>
      {label && <label htmlFor={areaId}>{label}</label>}
      <textarea id={areaId} className={cx(className, error ? 'ui-invalid' : undefined)} aria-invalid={error ? true : undefined} {...rest} />
      {error && <div className="ui-field-error" role="alert">{error}</div>}
    </div>
  )
}

/* ── Card ───────────────────────────────────────────────────────────────── */

/** Bordered content panel (v2: radius + spacing from tokens). */
export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  const mod = useVariantClass()
  return (
    <section className={cx('ui-card', mod && 'ui2-card', className)}>
      {(title || actions) && (
        <div className="ui-card-head">
          {title && <h3>{title}</h3>}
          {actions && <div className="ui-card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/* ── Table (structural shell; responsive behavior lands in U2) ──────────── */
export type TableColumn<T> = {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
}

export interface TableProps<T> {
  columns: Array<TableColumn<T>>
  rows: T[]
  rowKey: (row: T) => string | number
  caption?: string
  emptyMessage?: string
}

/** Column-config data table with a11y caption + empty state. */
export function DataTable<T>({ columns, rows, rowKey, caption, emptyMessage = 'Nothing to show' }: TableProps<T>) {
  const mod = useVariantClass()
  return (
    <table className={cx('ui-table', mod && 'ui2-table')}>
      {caption && <caption className="ui-table-caption">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col">{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length}>{emptyMessage}</td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key}>{c.render(row)}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

/* ── Modal ──────────────────────────────────────────────────────────────── */

export interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * Dialog with native <dialog>-free implementation (portable): focus the panel
 * on open, close on Escape, click on the backdrop closes.
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const mod = useVariantClass()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className={cx('ui-modal-backdrop', mod && 'ui2-modal-backdrop')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx('ui-modal-panel', mod && 'ui2-modal-panel')}
      >
        <div className="ui-modal-head">
          <h3>{title}</h3>
          <button type="button" className="ui-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ── Toast ──────────────────────────────────────────────────────────────── */
export type ToastTone = 'success' | 'error' | 'info'

export interface ToastProps {
  message: string
  tone?: ToastTone
  onDone?: () => void
  /** Auto-dismiss after this many ms; 0 = sticky. Default 4000. */
  timeoutMs?: number
}

/** Transient status message; polite live region (announced by AT, not intrusive). */
export function Toast({ message, tone = 'success', onDone, timeoutMs = 4000 }: ToastProps) {
  const mod = useVariantClass()
  useEffect(() => {
    if (!timeoutMs) return
    const t = setTimeout(() => onDone?.(), timeoutMs)
    return () => clearTimeout(t)
  }, [timeoutMs, message, onDone])
  if (!message) return null
  return (
    <div role="status" aria-live="polite" className={cx('ui-toast', mod && `ui2-toast--${tone}`)} data-tone={tone}>
      {message}
    </div>
  )
}
