/**
 * Modal form for an authenticated user to change their own password.
 * Re-verifies the current password and enforces the complexity policy
 * (client-side preview + server-side 422). Available to all roles.
 *
 * @module ChangePasswordModal
 */
import { useState, type FormEvent } from 'react'
import { changePassword, generatePassword } from '../api/auth'
import { validatePassword, PASSWORD_MIN_LENGTH } from '../lib/passwordPolicy'
import { useUiVariant } from '../lib/uiVariant'
import { CHANGE_PASSWORD, v1Only, variantProps } from '../uiStyles'

/**
 * @param props.onClose - Callback invoked when the modal is dismissed or the password is changed.
 */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const v2 = useUiVariant() === 'v2'

  const policy = validatePassword(newPassword)
  const confirmMismatch = confirm.length > 0 && newPassword !== confirm

  /** Prefill the new-password fields with a compliant suggestion; the user can
   *  accept it as-is or edit before submitting. */
  async function fillSuggested() {
    try {
      const pw = await generatePassword()
      setNewPassword(pw)
      setConfirm(pw)
    } catch {
      // ignore — user can still type a password manually
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!policy.ok) {
      setError('New password does not meet the requirements.')
      return
    }
    if (newPassword !== confirm) {
      setError('New password and confirmation do not match.')
      return
    }
    if (oldPassword === newPassword) {
      setError('New password must differ from the current password.')
      return
    }
    setLoading(true)
    try {
      await changePassword(oldPassword, newPassword)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Change password"
      {...variantProps(v2, 'ui2-cp-backdrop', CHANGE_PASSWORD.backdrop)}
    >
      <form
        onSubmit={handleSubmit}
        {...variantProps(v2, 'ui2-cp-panel', CHANGE_PASSWORD.panel)}
      >
        <h3 {...variantProps(v2, 'ui2-cp-title', CHANGE_PASSWORD.title)}>
          Change Password
        </h3>
        <div {...variantProps(v2, 'ui2-cp-field', CHANGE_PASSWORD.field)}>
          <label htmlFor="oldPassword">Current Password</label>
          <input
            id="oldPassword"
            type="password"
            value={oldPassword}
            onChange={e => setOldPassword(e.target.value)}
            required
          />
        </div>
        <div {...variantProps(v2, 'ui2-cp-field', CHANGE_PASSWORD.field)}>
          <label htmlFor="newPassword">New Password</label>
          <div
            {...variantProps(v2, 'ui2-cp-password-row', CHANGE_PASSWORD.passwordRow)}
          >
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
            />
            <button
              type="button"
              onClick={fillSuggested}
              title="Suggest a compliant password"
              {...variantProps(v2, 'ui2-cp-suggest', CHANGE_PASSWORD.suggestButton)}
            >
              Suggest
            </button>
          </div>
        </div>
        <div {...variantProps(v2, 'ui2-cp-field', CHANGE_PASSWORD.field)}>
          <label htmlFor="confirmPassword">Confirm New Password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
          />
          {confirmMismatch && (
            <div {...variantProps(v2, 'ui2-cp-mismatch', CHANGE_PASSWORD.mismatch)}>
              Passwords do not match.
            </div>
          )}
        </div>
        <ul {...variantProps(v2, 'ui2-cp-policy', CHANGE_PASSWORD.policyList)}>
          {policy.errors.map(req => (
            <li
              key={req}
              data-met={v2 ? 'false' : undefined}
              {...v1Only(v2, CHANGE_PASSWORD.unmet)}
            >
              {req}
            </li>
          ))}
          {policy.ok && newPassword.length > 0 && (
            <li
              data-met={v2 ? 'true' : undefined}
              {...v1Only(v2, CHANGE_PASSWORD.met)}
            >
              Password meets all requirements.
            </li>
          )}
        </ul>
        {error && (
          <div
            role="alert"
            {...variantProps(v2, 'ui2-cp-error', CHANGE_PASSWORD.error)}
          >
            {error}
          </div>
        )}
        <div {...variantProps(v2, 'ui2-cp-footer', CHANGE_PASSWORD.footer)}>
          <button
            type="button"
            onClick={onClose}
            {...variantProps(v2, 'ui2-cp-cancel', CHANGE_PASSWORD.cancel)}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            {...variantProps(
              v2,
              'ui2-cp-submit',
              CHANGE_PASSWORD.submit,
            )}
          >
            {loading ? 'Saving…' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  )
}
