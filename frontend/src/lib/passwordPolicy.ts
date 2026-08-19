/**
 * Client-side password complexity policy — mirrors the backend
 * `app.services.auth.validate_password`. Used to give immediate feedback in the
 * change/reset password forms before submitting.
 */

export interface PasswordPolicyResult {
  ok: boolean
  errors: string[]
}

export const PASSWORD_MIN_LENGTH = 8

export function validatePassword(password: string): PasswordPolicyResult {
  const errors: string[] = []
  if (password.length < PASSWORD_MIN_LENGTH) errors.push(`At least ${PASSWORD_MIN_LENGTH} characters`)
  if (!/[A-Z]/.test(password)) errors.push('An uppercase letter')
  if (!/[a-z]/.test(password)) errors.push('A lowercase letter')
  if (!/\d/.test(password)) errors.push('A digit')
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('A special character')
  return { ok: errors.length === 0, errors }
}
