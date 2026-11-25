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

/* ── Table (structural shell + responsive behavior, U2) ──────────────────── */
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
  /**
   * How the table adapts to narrow screens (CSS-only, no JS measurement):
   * - `scroll` (default): horizontal scroll region, focusable for keyboard panning.
   * - `stack`: below 720px each row becomes a card and every cell shows its
   *   column name (from a string header) via `data-label`.
   * The same DOM and attributes are rendered in v1 and v2; only the v2
   * stylesheet interprets them, so behaviour is identical in both variants.
   */
  responsive?: 'scroll' | 'stack'
}

/** Horizontal scroll region: keyboard focusable so wide tables can be panned. */
export function TableScroll({ children, stack }: { children: ReactNode; stack?: boolean }) {
  const mod = useVariantClass()
  return (
    <div
      className={cx('ui-table-scroll', mod && 'ui2-table-scroll')}
      data-stack={stack ? '' : undefined}
      tabIndex={0}
      role="region"
      aria-label="Scrollable table"
    >
      {children}
    </div>
  )
}

/** Column-config data table with a11y caption + empty state. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = 'Nothing to show',
  responsive = 'scroll',
}: TableProps<T>) {
  const mod = useVariantClass()
  const stack = responsive === 'stack'
  return (
    <TableScroll stack={stack}>
      <table className={cx('ui-table', mod && 'ui2-table')} data-stack={stack ? '' : undefined}>
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
                  <td key={c.key} data-label={stack && typeof c.header === 'string' ? c.header : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableScroll>
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

/* ── Page header ────────────────────────────────────────────────────────── */

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}

/**
 * Page title block: heading + optional subtitle on the left, actions on the
 * right; wraps on narrow screens. Rendered inside page content, so it uses
 * `.ui2-*` classes that the shell stylesheet scopes to the v2 variant.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  const mod = useVariantClass()
  return (
    <div className={cx('ui-page-header', mod && 'ui2-page-header')}>
      <div className={cx('ui-page-header-text', mod && 'ui2-page-header-text')}>
        <h1>{title}</h1>
        {subtitle && <p className={cx('ui-page-header-subtitle', mod && 'ui2-page-header-subtitle')}>{subtitle}</p>}
      </div>
      {actions && <div className={cx('ui-page-header-actions', mod && 'ui2-page-header-actions')}>{actions}</div>}
    </div>
  )
}

/* ── Page states: empty / loading / error ───────────────────────────────── */

export interface EmptyStateProps {
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
}

/** Neutral placeholder for a list/report with no rows (announced politely). */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  const mod = useVariantClass()
  return (
    <div className={cx('ui-state', mod && 'ui2-state')} role="status">
      {title && <p className={cx('ui-state-title', mod && 'ui2-state-title')}>{title}</p>}
      {children && <div className={cx('ui-state-body', mod && 'ui2-state-body')}>{children}</div>}
      {action}
    </div>
  )
}

/**
 * Loading placeholder. The spinner is decorative; the live region carries the
 * text so screen readers announce it once and never depend on the animation.
 */
export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  const mod = useVariantClass()
  return (
    <div className={cx('ui-state', mod && 'ui2-state', mod && 'ui2-state--loading')} role="status" aria-live="polite">
      <span className={cx(mod && 'ui2-spinner')} aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

/**
 * Inline error surface. `role="alert"` (implicit for the global banner style)
 * so a failed fetch is announced immediately rather than on next focus.
 */
export function ErrorBanner({ title, children, action }: { title?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const mod = useVariantClass()
  return (
    <div className={cx('ui-state', mod && 'ui2-state', mod && 'ui2-state--error')} role="alert">
      {title && <p className={cx('ui-state-title', mod && 'ui2-state-title')}>{title}</p>}
      <div className={cx('ui-state-body', mod && 'ui2-state-body')}>{children}</div>
      {action}
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
