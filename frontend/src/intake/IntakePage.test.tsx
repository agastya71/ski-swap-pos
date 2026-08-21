/**
 * Tests for {@link IntakePage} — covers the full multi-step intake workflow:
 * initial render at seller search, advancing to intake selection after choosing a seller,
 * listing and resuming existing intakes, creating a new intake, and breadcrumb navigation.
 *
 * @module IntakePage.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { AuthProvider } from '../auth/AuthContext'
import { IntakePage } from './IntakePage'
import type { Seller, Intake, IntakeWithItems } from '../types'

const SELLER: Seller = {
  id: 1, code: 'A001', first_name: 'Jane', last_name: 'Doe',
  company: null, is_vendor: false, phone: null, email: null,
  address: null, city: null, state: null, zip: null, donate_unsold_default: false, donate_proceeds_default: false,
  event_id: 1, created_at: '2026-04-04T10:00:00',
}
const INTAKE: Intake = {
  id: 5, seller_id: 1, date_entered: '2026-04-04', date_received: null,
  donate_proceeds: false, donate_unsold: false,
  total: 0, mysl_total: 0, seller_total: 0, created_at: '2026-04-04T10:00:00',
  created_by: 'intake1',
}
const INTAKE_WITH_ITEMS: IntakeWithItems = { ...INTAKE, items: [] }

function renderPage() {
  render(<AuthProvider><IntakePage /></AuthProvider>)
}

async function selectSeller() {
  fireEvent.change(screen.getByPlaceholderText(/search by name or code/i), { target: { value: 'Jane' } })
  await waitFor(() => screen.getByText('Jane Doe — A001'))
  fireEvent.click(screen.getByText('Jane Doe — A001'))
}

/** Tests covering the complete multi-step intake workflow driven by IntakePage. */
describe('IntakePage workflow', () => {
  /** Verifies that the page opens at the seller search step showing the search input. */
  it('starts at seller search step', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name or code/i)).toBeInTheDocument()
  })

  /** Verifies the select-intake step is shown after choosing a seller who has no prior intakes. */
  it('shows select-intake step after selecting a seller with no prior intakes', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER])),
      http.get('/sellers/:id/intakes', () => HttpResponse.json([])),
    )
    renderPage()
    await selectSeller()
    await waitFor(() => expect(screen.getByRole('button', { name: /\+ new intake/i })).toBeInTheDocument())
    expect(screen.getByText(/no previous intakes/i)).toBeInTheDocument()
  })

  /** Verifies that prior intakes are listed and that clicking Continue advances to item entry. */
  it('lists existing intakes and allows continuing one', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER])),
      http.get('/sellers/:id/intakes', () => HttpResponse.json([INTAKE])),
      http.get('/intakes/:id', () => HttpResponse.json(INTAKE_WITH_ITEMS)),
    )
    renderPage()
    await selectSeller()
    await waitFor(() => expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument())
    expect(screen.getByText('#5')).toBeInTheDocument()
    // The "Intake by" column surfaces who recorded the intake.
    expect(screen.getByText('intake1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument())
  })

  /** Verifies that creating a new intake via the form advances to the item-entry step. */
  it('advances to item entry after creating a new intake', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER])),
      http.get('/sellers/:id/intakes', () => HttpResponse.json([])),
      http.post('/intakes', () => HttpResponse.json(INTAKE)),
      http.get('/intakes/:id', () => HttpResponse.json(INTAKE_WITH_ITEMS)),
    )
    renderPage()
    await selectSeller()
    await waitFor(() => screen.getByRole('button', { name: /\+ new intake/i }))
    fireEvent.click(screen.getByRole('button', { name: /\+ new intake/i }))
    await waitFor(() => screen.getByRole('button', { name: /start intake/i }))
    fireEvent.click(screen.getByRole('button', { name: /start intake/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument())
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument()
    // The bulk-import control is available in the intake items step (individual consignors).
    expect(screen.getByRole('button', { name: /import items/i })).toBeInTheDocument()
  })

  /** Verifies that clicking the breadcrumb "Intake" link resets the workflow to seller search. */
  it('returns to search when Intake breadcrumb link is clicked', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER])),
      http.get('/sellers/:id/intakes', () => HttpResponse.json([])),
    )
    renderPage()
    await selectSeller()
    await waitFor(() => screen.getByRole('button', { name: /^intake$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^intake$/i }))
    expect(screen.getByPlaceholderText(/search by name or code/i)).toBeInTheDocument()
  })
})
