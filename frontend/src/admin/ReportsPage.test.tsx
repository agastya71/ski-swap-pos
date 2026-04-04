import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReportsPage } from './ReportsPage'

describe('ReportsPage', () => {
  it('loads and displays event revenue totals', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => expect(screen.getByText(/gross revenue/i)).toBeInTheDocument())
    expect(screen.getByText('$190.00')).toBeInTheDocument()
  })

  it('shows donations summary with items', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => expect(screen.getByText('A001-004')).toBeInTheDocument())
    expect(screen.getByText('Blue helmet')).toBeInTheDocument()
  })

  it('shows unsold items table', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => expect(screen.getByText('A001-005')).toBeInTheDocument())
    expect(screen.getByText('Red jacket')).toBeInTheDocument()
  })

  it('looks up seller payout by seller id', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByLabelText(/seller id/i))
    fireEvent.change(screen.getByLabelText(/seller id/i), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /get payout/i }))
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
    expect(screen.getByText('$105.00')).toBeInTheDocument()
  })

  it('shows CSV download buttons', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByText(/gross revenue/i))
    const csvButtons = screen.getAllByRole('button', { name: /download csv/i })
    expect(csvButtons.length).toBeGreaterThan(0)
  })
})
