# Frontend Inline Documentation (TSDoc) Design

**Date:** 2026-04-10
**Status:** Approved

---

## Problem

The frontend TypeScript/React codebase (54 meaningful files) has almost no inline documentation. Developers reading the code must trace through implementations to understand what each module, component, hook, or function does, what props are expected, what errors may be raised, and what individual type fields represent.

## Goal

Add TSDoc-style comments to all frontend source and test files so developers can understand each module, component, and function without reading the full implementation body — and so VS Code renders useful hover tooltips on all exported symbols.

## Scope

**In scope — all 54 files across 9 layers:**

| Layer | Files |
|---|---|
| `src/types.ts` | 1 file — 29 shared domain interfaces |
| `src/api/` | 9 files — auth, client, events, intakes, items, reports, sales, sellers, users |
| `src/auth/` | 2 source files (AuthContext.tsx, LoginPage.tsx) + 1 test file |
| `src/components/` | Layout.tsx, ProtectedRoute.tsx |
| `src/App.tsx`, `src/main.tsx`, `src/test-setup.ts` | App shell and test setup |
| `src/intake/` | 6 source files + 6 test files |
| `src/pos/` | 6 source files + 5 test files |
| `src/admin/` | 5 source files + 5 test files |
| `src/mocks/` | handlers.ts, server.ts, tokens.ts |

**Out of scope:** `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `index.html` — config files with no business logic to document.

---

## TSDoc Style Guide

### File-level comments

Every file opens with a `/** */` module comment describing its responsibility:

```ts
/**
 * Shared API client — token management, authentication headers, and fetch wrapper.
 * All API modules call {@link apiFetch} rather than fetch() directly.
 */
```

### API functions (`src/api/`)

Full TSDoc with `@param`, `@returns`, and `@throws` on every exported function:

```ts
/**
 * Fetch all sellers matching a partial code, name, or company string.
 *
 * @param query - Search string (partial code, first/last name, or company).
 * @returns Array of matching Seller records for the active event.
 * @throws {ApiError} 401 if the session token is invalid or expired.
 */
export async function searchSellers(query: string): Promise<Seller[]>
```

### React components

Summary sentence describing what the component does and its role in the UI, followed by `@param props.*` for each prop:

```ts
/**
 * Item code lookup field for the POS checkout screen.
 * Supports barcode scanner (exact match), partial code autocomplete with a
 * live dropdown, and keyboard navigation (ArrowUp/Down, Enter, Escape).
 *
 * @param props.onFound - Called with the matched Item when a valid, available item is selected.
 */
export function LookupField({ onFound }: { onFound: (item: ItemLookupResponse) => void })
```

When a component has a named props interface, document fields on the interface rather than repeating them on the component function signature.

### Interfaces and type fields

Every field in every interface gets a one-line `/** */` TSDoc comment explaining its business meaning. Self-evident fields (`id`, `created_at`) get brief comments; non-obvious domain fields (`donate_proceeds`, `commission_rate`, `donate_unsold`) get explicit business-rule explanations:

```ts
export interface Intake {
  /** Unique identifier for this intake session. */
  id: number
  /** Foreign key to the Seller who consigned these items. */
  seller_id: number
  /** Whether all unsold items should be donated at close of event rather than returned. */
  donate_unsold: boolean
  /** Whether 100% of sale proceeds are donated; the seller waives their commission cut. */
  donate_proceeds: boolean
  /** MYSL's share of total sales from this intake, after commission calculation. */
  mysl_total: number
  /** ISO 8601 timestamp when this intake record was created. */
  created_at: string
}
```

### Hooks

Summary + `@returns` + `@throws` where applicable:

```ts
/**
 * Returns the current authentication context value.
 * Must be called within an {@link AuthProvider} — throws if called outside one.
 *
 * @returns Object containing `token`, `decoded`, `signIn`, and `signOut`.
 * @throws {Error} If called outside of an AuthProvider tree.
 */
export function useAuth()
```

### Classes

Class-level docstring + constructor `@param` documentation:

```ts
/**
 * Error thrown by {@link apiFetch} for non-2xx HTTP responses.
 * Consumers can inspect {@link ApiError.status} to branch on HTTP status codes
 * (e.g. 401 for session expiry, 404 for missing resources, 409 for conflicts).
 */
export class ApiError extends Error {
  /**
   * @param status - The HTTP status code returned by the server.
   * @param message - The `detail` field from the error response body, or the HTTP status text.
   */
  constructor(public status: number, message: string)
}
```

### Test files

Three levels of documentation:

1. **File-level:** A `/** */` block at the top describing what is being tested and which scenarios are covered.
2. **Describe-block level:** A `/** */` comment above each `describe()` group explaining the scenario.
3. **Test level:** A `/** */` comment above each `it()` / `test()` call stating what it verifies.

```ts
/**
 * Tests for LookupField — covers barcode scan (exact match fast path),
 * partial code autocomplete with live dropdown, keyboard navigation
 * (ArrowUp/Down/Enter/Escape), and error states (not found, already sold).
 */

describe('LookupField', () => {
  /** Renders the label and input element on initial mount. */
  it('renders input with label', () => { ... })

  describe('autocomplete dropdown', () => {
    /** Shows a dropdown after 300 ms debounce when input has ≥3 characters. */
    it('shows results after debounce', async () => { ... })
  })
})
```

### Mock files (`src/mocks/`)

- `handlers.ts`: File-level comment + a `/** */` comment above each MSW handler group explaining which API route it mocks and what it returns.
- `server.ts`: File-level comment explaining the MSW server setup.
- `tokens.ts`: File-level comment + a `/** */` comment per exported token constant describing the role it encodes.

---

## Execution

### Branch strategy

All changes land on a single feature branch: `docs/frontend-tsdoc`. The branch is submitted as one PR at the end.

### Phase 1 — Foundation (sequential, one agent)

The foundation layer runs first because `types.ts` defines the shared domain vocabulary and `src/api/client.ts` defines `ApiError` — both are referenced throughout all component and test files.

**Files:**
1. `src/types.ts`
2. `src/api/client.ts`
3. `src/api/auth.ts`, `events.ts`, `intakes.ts`, `items.ts`, `reports.ts`, `sales.ts`, `sellers.ts`, `users.ts`

Agent commits all Phase 1 files before Phase 2 begins.

### Phase 2 — Modules (four parallel agents)

| Agent | Responsible for |
|---|---|
| A — Auth + Shell | `src/auth/` (2 source + 1 test), `src/components/` (2 files), `src/App.tsx`, `src/main.tsx`, `src/test-setup.ts` |
| B — Intake | `src/intake/` (6 source + 6 test files) |
| C — POS | `src/pos/` (6 source + 5 test files) |
| D — Admin + Mocks | `src/admin/` (5 source + 5 test files), `src/mocks/` (3 files) |

Each Phase 2 agent reads the committed Phase 1 output (especially `types.ts`) before writing comments, ensuring consistent terminology across modules.

---

## No Functional Changes

TSDoc comments are additive only. No logic, imports, function signatures, component behaviour, props interfaces, or test assertions change. The only edits are inserting `/** */` blocks before symbols and adding one-line field comments inside interface bodies.

---

## Verification

After all Phase 2 agents complete, run the full Vitest suite in `frontend/`:

```bash
cd frontend && npm test
```

All existing tests must pass before the PR is opened. This is a hard gate — if any test fails, investigate before opening the PR.
