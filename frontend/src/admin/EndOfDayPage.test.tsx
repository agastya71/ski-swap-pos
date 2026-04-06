import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { downloadFile } from '../api/reports'
import { EndOfDayPage } from './EndOfDayPage'

vi.mock('../api/reports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/reports')>()
  return { ...actual, downloadFile: vi.fn() }
})

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

  it('shows PDF, CSV and Markdown download buttons when report is loaded', async () => {
    render(<EndOfDayPage eventId={1} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pdf/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /csv/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /markdown/i })).toBeInTheDocument()
    })
  })

  it('calls downloadFile with correct url and filename for each format', async () => {
    render(<EndOfDayPage eventId={1} />)
    await waitFor(() => screen.getByRole('button', { name: /pdf/i }))

    fireEvent.click(screen.getByRole('button', { name: /pdf/i }))
    expect(downloadFile).toHaveBeenCalledWith('/reports/1/end-of-day?format=pdf', 'end_of_day_1.pdf')

    fireEvent.click(screen.getByRole('button', { name: /csv/i }))
    expect(downloadFile).toHaveBeenCalledWith('/reports/1/end-of-day?format=csv', 'end_of_day_1.csv')

    fireEvent.click(screen.getByRole('button', { name: /markdown/i }))
    expect(downloadFile).toHaveBeenCalledWith('/reports/1/end-of-day?format=md', 'end_of_day_1.md')
  })
})
