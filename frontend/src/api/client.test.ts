/**
 * Tests for the API client's error extraction — FastAPI returns 422 validation
 * errors as `detail` arrays of {loc, msg} objects; the client must flatten them
 * into readable cashier-facing text instead of "[object Object]".
 */
import { extractApiErrorMessage } from './client'

describe('extractApiErrorMessage', () => {
  it('passes through string details unchanged', () => {
    expect(extractApiErrorMessage({ detail: 'check_number is required when check_amount > 0' }))
      .toBe('check_number is required when check_amount > 0')
  })

  it('flattens FastAPI 422 validation arrays with field locations', () => {
    expect(extractApiErrorMessage({
      detail: [
        { loc: ['body', 'check_number'], msg: 'Field required', type: 'missing' },
        { loc: ['body', 'zip'], msg: 'String should match pattern', type: 'pattern' },
      ],
    })).toBe('Field required (field: check_number); String should match pattern (field: zip)')
  })

  it('omits the field prefix when only the top-level location exists', () => {
    expect(extractApiErrorMessage({ detail: [{ loc: ['body'], msg: 'Value error, no seller active' }] }))
      .toBe('Value error, no seller active')
  })

  it('returns undefined for missing or malformed details (caller falls back to statusText)', () => {
    expect(extractApiErrorMessage(null)).toBeUndefined()
    expect(extractApiErrorMessage({ detail: null })).toBeUndefined()
    expect(extractApiErrorMessage('plain body')).toBeUndefined()
  })
})