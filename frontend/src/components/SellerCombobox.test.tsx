import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SellerCombobox } from './SellerCombobox'

describe('SellerCombobox', () => {
  it('renders an empty input', () => {
    render(<SellerCombobox onSelect={vi.fn()} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows matching sellers in dropdown after typing', async () => {
    render(<SellerCombobox onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Jane' } })
    await waitFor(() => expect(screen.getByText(/Jane Smith/)).toBeInTheDocument())
  })

  it('calls onSelect with the seller when an option is clicked', async () => {
    const onSelect = vi.fn()
    render(<SellerCombobox onSelect={onSelect} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText(/Jane Smith/))
    fireEvent.click(screen.getByText(/Jane Smith/))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1, code: '001' }))
  })

  it('shows selected seller name in input after selection', async () => {
    render(<SellerCombobox onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText(/Jane Smith/))
    fireEvent.click(screen.getByText(/Jane Smith/))
    expect(screen.getByRole('combobox')).toHaveValue('001 — Jane Smith')
  })

  it('clears selection when × is clicked', async () => {
    render(<SellerCombobox onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText(/Jane Smith/))
    fireEvent.click(screen.getByText(/Jane Smith/))
    fireEvent.click(screen.getByRole('button', { name: '×' }))
    expect(screen.getByRole('combobox')).toHaveValue('')
  })
})
