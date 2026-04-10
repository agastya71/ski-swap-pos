/**
 * Pre-built JWT test tokens for all three user roles.
 * Each token encodes a non-expiring payload (exp: 9_999_999_999) with a
 * fake signature, suitable for use in Vitest tests that require an
 * authenticated session without a running backend.
 */

/**
 * Builds a structurally valid (but cryptographically unsigned) JWT string
 * from the given payload for use in tests.
 *
 * @param payload - Key/value pairs to encode as the JWT body claim.
 * @returns A dot-separated `header.body.fake` JWT string.
 */
function makeTestToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `${header}.${body}.fake`
}

/** Test JWT encoding the `admin` role for user `admin1` on event 1. */
export const ADMIN_TOKEN = makeTestToken({ sub: 'admin1', role: 'admin', event_id: 1, exp: 9_999_999_999 })
/** Test JWT encoding the `intake` role for user `intake1` on event 1. */
export const INTAKE_TOKEN = makeTestToken({ sub: 'intake1', role: 'intake', event_id: 1, exp: 9_999_999_999 })
/** Test JWT encoding the `cashier` role for user `cashier1` on event 1. */
export const CASHIER_TOKEN = makeTestToken({ sub: 'cashier1', role: 'cashier', event_id: 1, exp: 9_999_999_999 })
