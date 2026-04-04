import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { AuthProvider } from '../auth/AuthContext'
import { IntakePage } from './IntakePage'
import type { Seller, Intake, IntakeWithItems } from '../types'

const SELLER: Seller = {
  id: 1, code: 'A001', first_name: 'Jane', last_name: 'Doe',
  company: null, is_vendor: false, phone: null, email: null,
  address: null, city: null, state: null, zip: null,
  event_id: 1, created_at: '2026-04-04T10:00:00',
}
const INTAKE: Intake = {
  id: 5, seller_id: 1, date_entered: '2026-04-04', date_received: null,
  donate_proceeds: false, donate_unsold: false,
  total: 0, mysl_total: 0, seller_total: 0, created_at: '2026-04-04T10:00:00',
}
const INTAKE_WITH_ITEMS: IntakeWithItems = { ...INTAKE, items: [] }

function renderPage() {
  render(<AuthProvider><IntakePage /></AuthProvider>)
}

describe('IntakePage workflow', () => {
  it('starts at seller search step', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name or code/i)).toBeInTheDocument()
  })

  it('advances to intake form after selecting a seller', async () => {
    server.use(http.get('/sellers', () => HttpResponse.json([SELLER])))
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(/search by name or code/i), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText('Jane Doe — A001'))
    fireEvent.click(screen.getByText('Jane Doe — A001'))
    await waitFor(() => expect(screen.getByText(/start intake/i)).toBeInTheDocument())
  })

  it('advances to item entry after creating intake', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER])),
      http.post('/intakes', () => HttpResponse.json(INTAKE)),
      http.get('/intakes/:id', () => HttpResponse.json(INTAKE_WITH_ITEMS)),
    )
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(/search by name or code/i), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText('Jane Doe — A001'))
    fireEvent.click(screen.getByText('Jane Doe — A001'))
    await waitFor(() => screen.getByRole('button', { name: /start intake/i }))
    fireEvent.click(screen.getByRole('button', { name: /start intake/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument())
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument()
  })

  it('shows New Intake button to start over', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER])),
      http.post('/intakes', () => HttpResponse.json(INTAKE)),
      http.get('/intakes/:id', () => HttpResponse.json(INTAKE_WITH_ITEMS)),
    )
    renderPage()
    fireEvent.change(screen.getByPlaceholderText(/search by name or code/i), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText('Jane Doe — A001'))
    fireEvent.click(screen.getByText('Jane Doe — A001'))
    await waitFor(() => screen.getByRole('button', { name: /start intake/i }))
    fireEvent.click(screen.getByRole('button', { name: /start intake/i }))
    await waitFor(() => screen.getByRole('button', { name: /new intake/i }))
    fireEvent.click(screen.getByRole('button', { name: /new intake/i }))
    expect(screen.getByPlaceholderText(/search by name or code/i)).toBeInTheDocument()
  })
})
