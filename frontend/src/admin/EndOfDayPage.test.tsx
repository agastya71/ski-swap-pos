/**
 * Tests for {@link EndOfDayPage} — covers report data display (sales count,
 * gross revenue, payment breakdown), the presence of format download buttons
 * (PDF, CSV, Markdown), the database backup button, and correct `downloadFile`
 * call arguments for each format.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UiVariantContext } from "../lib/uiVariant";
// U6 promotion: v1 is no longer the render default — these assertions are
// v1-expectation tests, so the variant is pinned explicitly.
function renderV1(ui: React.ReactElement) {
  return render(<UiVariantContext.Provider value="v1">{ui}</UiVariantContext.Provider>);
}

import { vi } from 'vitest'
import { downloadFile } from '../api/reports'
import { EndOfDayPage } from './EndOfDayPage'

vi.mock('../api/reports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/reports')>()
  return { ...actual, downloadFile: vi.fn() }
})

/** End-of-day report page — rendering and download interaction tests. */
describe('EndOfDayPage', () => {
  /** Verifies that the sales count from the MSW-mocked report is displayed on screen. */
  it('shows the sales count from the end-of-day report', async () => {
    renderV1(<EndOfDayPage eventId={1} />)
    await waitFor(() => expect(screen.getByText(/5 sale/i)).toBeInTheDocument())
  })

  /** Verifies that the gross revenue total is rendered once the report loads. */
  it('shows gross revenue from the report', async () => {
    renderV1(<EndOfDayPage eventId={1} />)
    await waitFor(() => expect(screen.getByText('$250.00')).toBeInTheDocument())
  })

  /** Verifies that payment tender rows (Cash, Check, Card) are rendered. */
  it('shows payment breakdown', async () => {
    renderV1(<EndOfDayPage eventId={1} />)
    await waitFor(() => expect(screen.getByText(/cash/i)).toBeInTheDocument())
    expect(screen.getByText('$200.00')).toBeInTheDocument()
  })

  /** Verifies that the database backup download button is present. */
  /** Verifies the End-of-Day amounts sit next to their labels: the summary
   *  table is shrink-to-fit, overriding the global table { width: 100% } rule
   *  (same fix as the payout summary tables, fe93c09). */
  it('keeps the summary amounts next to their labels', async () => {
    renderV1(<EndOfDayPage eventId={1} />)
    await waitFor(() => expect(screen.getByText('$75.00')).toBeInTheDocument())
    const summaryTable = screen.getByText('MYSL Total').closest('table')
    expect(summaryTable).toHaveStyle({ width: 'auto' })
  })

  it('shows Download Backup button', async () => {
    renderV1(<EndOfDayPage eventId={1} />)
    await waitFor(() => screen.getByRole('button', { name: /download backup/i }))
  })

  /** Verifies that all three report format download buttons appear after the report loads. */
  it('shows PDF, CSV and Markdown download buttons when report is loaded', async () => {
    renderV1(<EndOfDayPage eventId={1} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pdf/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /csv/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /markdown/i })).toBeInTheDocument()
    })
  })

  /** Verifies that clicking each format button calls `downloadFile` with the correct URL and filename. */
  it('calls downloadFile with correct url and filename for each format', async () => {
    renderV1(<EndOfDayPage eventId={1} />)
    await waitFor(() => screen.getByRole('button', { name: /pdf/i }))

    fireEvent.click(screen.getByRole('button', { name: /pdf/i }))
    expect(downloadFile).toHaveBeenCalledWith('/reports/1/end-of-day?format=pdf', 'end_of_day_1.pdf')

    fireEvent.click(screen.getByRole('button', { name: /csv/i }))
    expect(downloadFile).toHaveBeenCalledWith('/reports/1/end-of-day?format=csv', 'end_of_day_1.csv')

    fireEvent.click(screen.getByRole('button', { name: /markdown/i }))
    expect(downloadFile).toHaveBeenCalledWith('/reports/1/end-of-day?format=md', 'end_of_day_1.md')
  })
})
