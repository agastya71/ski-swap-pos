/**
 * Tests for the v2 UI primitives (components/ui/primitives.tsx, phase U1).
 * Coverage: variant-neutral render in v1, v2 modifier classes under a forced
 * v2 context, a11y wiring (labels, aria-invalid, role=dialog, role=status),
 * modal Escape/backdrop close, toast auto-dismiss.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UiVariantContext } from '../../lib/uiVariant'
import {
  Button,
  Card,
  DataTable,
  Modal,
  SelectField,
  TextAreaField,
  TextField,
  Toast,
} from './primitives'

type Row = { id: number; name: string; qty: number }

const ROWS: Row[] = [
  { id: 1, name: 'Skate skis', qty: 2 },
  { id: 2, name: 'Boots', qty: 5 },
]

const COLUMNS = [
  { key: 'name', header: 'Item', render: (r: Row) => r.name },
  { key: 'qty', header: 'Qty', render: (r: Row) => r.qty },
]

function withVariant(ui: 'v1' | 'v2', ui_: React.ReactNode) {
  return <UiVariantContext.Provider value={ui}>{ui_}</UiVariantContext.Provider>
}

describe('Button', () => {
  it('renders a plain button in v1 with no v2 modifier', () => {
    render(withVariant('v1', <Button onClick={() => {}}>Save</Button>))
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.className).not.toMatch(/ui2-/)
    expect(btn.getAttribute('data-variant')).toBe('primary')
  })

  it('adds the v2 modifier class and honors variant in v2', () => {
    render(withVariant('v2', <Button variant="danger">Delete</Button>))
    const btn = screen.getByRole('button', { name: 'Delete' })
    expect(btn.className).toContain('ui2-btn--danger')
  })

  it('passes through native button props', () => {
    render(withVariant('v1', <Button disabled type="submit">Go</Button>))
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()
  })
})

describe('TextField', () => {
  it('associates the label and shows the error accessibly', () => {
    render(withVariant('v2', <TextField label="Price" name="price" error="Price is required" />))
    const input = screen.getByLabelText('Price')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Price is required')
  })

  it('shows hint when there is no error', () => {
    render(withVariant('v1', <TextField label="Price" name="price" hint="Whole dollars only" />))
    expect(screen.getByText('Whole dollars only')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('SelectField / TextAreaField', () => {
  it('select associates label and options render', () => {
    render(
      withVariant(
        'v2',
        <SelectField label="Category" name="category">
          <option>Skis</option>
          <option>Boots</option>
        </SelectField>,
      ),
    )
    expect((screen.getByLabelText('Category') as HTMLSelectElement).options).toHaveLength(2)
  })

  it('textarea error surfaces via role=alert', () => {
    render(withVariant('v2', <TextAreaField label="Notes" name="notes" error="Too long" />))
    expect(screen.getByRole('alert')).toHaveTextContent('Too long')
  })
})

describe('Card', () => {
  it('renders title, actions and children', () => {
    render(
      withVariant('v2', (
        <Card title="Totals" actions={<Button>Export</Button>}>
          <p>$120.00</p>
        </Card>
      )),
    )
    expect(screen.getByText('Totals')).toBeInTheDocument()
    expect(screen.getByText('$120.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })
})

describe('DataTable', () => {
  it('renders headers, rows and cells', () => {
    render(withVariant('v2', <DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />))
    expect(screen.getByRole('columnheader', { name: 'Item' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Skate skis' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2 rows
  })

  it('shows the empty state and caption', () => {
    render(
      withVariant(
        'v1',
        <DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} caption="Sale lines" emptyMessage="No lines yet" />,
      ),
    )
    expect(screen.getByText('No lines yet')).toBeInTheDocument()
    expect(screen.getByText('Sale lines')).toBeInTheDocument()
  })
})

describe('Modal', () => {
  it('does not render when closed; renders dialog with title when open', async () => {
    const { rerender } = render(
      withVariant('v2', <Modal open={false} title="Confirm" onClose={() => {}}>body</Modal>),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(withVariant('v2', <Modal open title="Confirm" onClose={() => {}}>body</Modal>))
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('closes on Escape and on backdrop click, not on panel click', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(withVariant('v1', <Modal open title="Confirm" onClose={onClose}>body</Modal>))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    // backdrop target: click lands on the wrapper element itself
    const backdrop = screen.getByRole('dialog').parentElement!
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(2) // panel clicks don't close
  })

  it('exposes a Close button inside the dialog', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(withVariant('v2', <Modal open title="Confirm" onClose={onClose}>body</Modal>))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Toast', () => {
  it('renders the message with polite live region and tone', () => {
    render(withVariant('v2', <Toast message="Saved" tone="success" />))
    const el = screen.getByRole('status')
    expect(el).toHaveTextContent('Saved')
    expect(el.getAttribute('aria-live')).toBe('polite')
    expect(el.getAttribute('data-tone')).toBe('success')
  })

  it('auto-dismisses after the timeout by calling onDone', async () => {
    const onDone = vi.fn()
    render(withVariant('v1', <Toast message="Saved" onDone={onDone} timeoutMs={30} />))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 500 })
  })

  it('stays visible with timeoutMs=0', async () => {
    const onDone = vi.fn()
    render(withVariant('v1', <Toast message="Sticky" onDone={onDone} timeoutMs={0} />))
    await new Promise((r) => setTimeout(r, 60))
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText('Sticky')).toBeInTheDocument()
  })
})
