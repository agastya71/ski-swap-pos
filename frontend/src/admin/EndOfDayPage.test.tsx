import { render, screen, waitFor } from '@testing-library/react'
import { EndOfDayPage } from './EndOfDayPage'

describe('EndOfDayPage', () => {
  it('shows the sales count from the end-of-day report', async () => {
    render(<EndOfDayPage eventId={1} />)
    await waitFor(() => expect(screen.getByText(/5 sale/i)).toBeInTheDocument())
  })

  it('shows gross revenue from the report', async () => {
    render(<EndOfDayPage eventId={1} />)
    await waitFor(() => expect(screen.getByText('$250.00')).toBeInTheDocument())
  })

  it('shows payment breakdown', async () => {
    render(<EndOfDayPage eventId={1} />)
    await waitFor(() => expect(screen.getByText(/cash/i)).toBeInTheDocument())
    expect(screen.getByText('$200.00')).toBeInTheDocument()
  })

  it('shows Download Backup button', async () => {
    render(<EndOfDayPage eventId={1} />)
    await waitFor(() => screen.getByRole('button', { name: /download backup/i }))
  })
})
