function makeTestToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `${header}.${body}.fake`
}

export const ADMIN_TOKEN = makeTestToken({ sub: 'admin1', role: 'admin', event_id: 1, exp: 9_999_999_999 })
export const INTAKE_TOKEN = makeTestToken({ sub: 'intake1', role: 'intake', event_id: 1, exp: 9_999_999_999 })
export const CASHIER_TOKEN = makeTestToken({ sub: 'cashier1', role: 'cashier', event_id: 1, exp: 9_999_999_999 })
