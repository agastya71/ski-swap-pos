/**
 * Modal shown after a new user is created, displaying the generated/default
 * password so the admin can hand it to the user. The password is shown once
 * here (the API never returns it afterwards). Dismiss closes the modal.
 *
 * @module CreatedUserModal
 */
import { useState } from 'react'

const NAVY = '#1e3a8a'

/**
 * @param props.username - The newly created user's login name.
 * @param props.password - The plaintext password used at creation (to show once).
 * @param props.onClose - Callback invoked when the modal is dismissed.
 */
export function CreatedUserModal({
  username,
  password,
  onClose,
}: {
  username: string
  password: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState<'user' | 'pw' | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)

  /** Copy to the clipboard with a fallback for non-secure contexts where the
   *  async Clipboard API is unavailable. Surfaces a visible error instead of
   *  failing silently. */
  async function copy(label: 'user' | 'pw', text: string) {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // Fallback: hidden textarea + execCommand for older/secure-less contexts.
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    if (ok) {
      setCopied(label)
      setCopyError(null)
    } else {
      setCopied(null)
      setCopyError('Copy failed — select the text and copy manually.')
    }
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
  }
  const valueBox: React.CSSProperties = {
    flex: 1, padding: '8px 10px', background: '#f1f5f9', borderRadius: 4,
    fontFamily: 'monospace', fontSize: 14, userSelect: 'all',
  }

  return (
    <div role="dialog" aria-label={`Created user ${username}`} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <div style={{ background: '#fff', borderRadius: 6, padding: 24, width: 380, boxSizing: 'border-box' }}>
        <h3 style={{ marginTop: 0 }}>User Created</h3>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
          Share these credentials with the user. The password is shown only this once.
        </p>
        <div style={rowStyle}>
          <span style={{ fontSize: 13, width: 80 }}>Username</span>
          <div style={valueBox}>{username}</div>
          <button type="button" onClick={() => copy('user', username)} style={{ padding: '6px 10px' }}>
            {copied === 'user' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div style={rowStyle}>
          <span style={{ fontSize: 13, width: 80 }}>Password</span>
          <div style={valueBox}>{password}</div>
          <button type="button" onClick={() => copy('pw', password)} style={{ padding: '6px 10px' }}>
            {copied === 'pw' ? 'Copied' : 'Copy'}
          </button>
        </div>
        {copyError && (
          <div role="alert" style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{copyError}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 16px', background: NAVY, color: '#fff', border: 'none', cursor: 'pointer' }}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}