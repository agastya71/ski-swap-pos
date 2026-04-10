/**
 * MSW Node.js test server — configures a Mock Service Worker server instance
 * with all default API handlers. Started and reset globally in `test-setup.ts`
 * so every Vitest test file gets a clean, pre-configured mock backend.
 */

import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** Shared MSW server instance used by all Vitest tests to intercept HTTP requests. */
export const server = setupServer(...handlers)
