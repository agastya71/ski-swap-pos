/**
 * Vitest global test setup — extends jest-dom matchers for DOM assertions,
 * starts the MSW mock server before all tests, resets MSW handlers and cleans up
 * rendered components after each test, and stops the server after the suite completes.
 */
import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, afterAll } from 'vitest'
import { server } from './mocks/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => { cleanup(); server.resetHandlers(); localStorage.clear() })
afterAll(() => server.close())
