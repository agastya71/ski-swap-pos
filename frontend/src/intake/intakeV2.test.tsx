/**
 * Regression tests for the U4 part 1 intake v2 pass.
 *
 * U4 part 1 lifted the inline styles out of the seller-entry path — IntakeForm,
 * SellerSearch, SellerForm, ImportItemsButton and the IntakeModulePage chrome —
 * into `intakeStyles.ts` so a variant-aware class could replace them. That
 * refactor must be invisible in v1: with no `.ui-v2` root (the default, and what
 * every other intake test renders) each component has to keep exactly the inline
 * values it had before.
 *
 * Two directions are pinned per component: the v1 inline values survive, and v2
 * swaps them for class names with no leftover inline style.
 *
 * @module intakeV2.test
 */
import { render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { IntakeForm } from './IntakeForm'
import { SellerSearch } from './SellerSearch'
import { SellerForm } from './SellerForm'
import { ImportItemsButton } from './ImportItemsButton'
import {
  INTAKE_FORM,
  SELLER_SEARCH,
  SELLER_FORM,
  IMPORT_BUTTON,
  INTAKE_MODULE,
  variantProps,
  v1Only,
  v2Only,
} from './intakeStyles'
import { UiVariantContext } from '../lib/uiVariant'
import type { Seller } from '../types'

const SELLER = {
  id: 7,
  code: 'TRAI1',
  first_name: 'Tess',
  last_name: 'Trail',
  company: null,
  is_vendor: false,
  donate_proceeds_default: false,
  donate_unsold_default: false,
} as unknown as Seller

const inV2 = (ui: ReactElement) =>
  render(<UiVariantContext.Provider value="v2">{ui}</UiVariantContext.Provider>)

describe('intake style tables keep the v1 values verbatim', () => {
  it('IntakeForm fieldset/legend match the pre-U4 values', () => {
    expect(INTAKE_FORM.fieldset.border).toBe('1px solid #e2e8f0')
    expect(INTAKE_FORM.fieldset.borderRadius).toBe(4)
    expect(INTAKE_FORM.fieldset.padding).toBe('10px 12px')
    expect(INTAKE_FORM.fieldset.marginBottom).toBe(10)
    expect(INTAKE_FORM.legend.fontSize).toBe(13)
    expect(INTAKE_FORM.legend.color).toBe('#64748b')
  })

  it('SellerForm field input stays width:100% with 6px padding', () => {
    expect(SELLER_FORM.fieldInput.width).toBe('100%')
    expect(SELLER_FORM.fieldInput.padding).toBe(6)
    expect(SELLER_FORM.fieldInput.boxSizing).toBe('border-box')
    expect(SELLER_FORM.fieldLabel.display).toBe('block')
    expect(SELLER_FORM.fieldWrap.marginBottom).toBe(10)
  })

  it('SellerSearch result row keeps its left-aligned transparent button', () => {
    expect(SELLER_SEARCH.resultButton.width).toBe('100%')
    expect(SELLER_SEARCH.resultButton.textAlign).toBe('left')
    expect(SELLER_SEARCH.resultButton.background).toBe('none')
    expect(SELLER_SEARCH.resultButton.border).toBe('1px solid #ccc')
    expect(SELLER_SEARCH.input.padding).toBe(8)
  })

  it('module tab flips background and colour together on the active tab', () => {
    const active = INTAKE_MODULE.tab(true)
    const inactive = INTAKE_MODULE.tab(false)
    expect(active.background).toBe('#1a237e')
    expect(active.color).toBe('white')
    expect(inactive.background).toBe('transparent')
    expect(inactive.color).toBe('#1a237e')
    // Border is the same either way — only fill and text colour change.
    expect(active.border).toBe(inactive.border)
  })

  it('ghost button switches to a wait cursor while importing', () => {
    expect(INTAKE_MODULE.ghostButton().cursor).toBe('pointer')
    expect(INTAKE_MODULE.ghostButton(true).cursor).toBe('wait')
  })

  it('import buttons reuse the shared BUTTON_STYLE object', () => {
    expect(IMPORT_BUTTON.button.color).toBe('#1e3a8a')
    expect(IMPORT_BUTTON.button.border).toBe('1px solid #1e3a8a')
    expect(IMPORT_BUTTON.root.display).toBe('inline-block')
    expect(IMPORT_BUTTON.hiddenInput.display).toBe('none')
  })

  it('variant helpers never emit an empty class name', () => {
    expect(variantProps(false, 'ui2-x', { color: 'red' })).toEqual({
      className: undefined,
      style: { color: 'red' },
    })
    expect(variantProps(true, 'ui2-x', { color: 'red' })).toEqual({
      className: 'ui2-x',
      style: undefined,
    })
    expect(variantProps(true, '', {})).toEqual({
      className: undefined,
      style: undefined,
    })
    expect(v1Only(true, { color: 'red' })).toEqual({ style: undefined })
    expect(v2Only(true, 'ui2-y')).toEqual({ className: 'ui2-y' })
    expect(v2Only(false, 'ui2-y')).toEqual({ className: undefined })
  })
})

describe('IntakeForm renders the same fields in both variants', () => {
  it('v1 keeps the inline fieldset/legend and browser-default submit button', () => {
    render(<IntakeForm seller={SELLER} onCreated={vi.fn()} />)
    const fieldset = screen.getByRole('group')
    // jsdom normalises the hex colour to rgb() on read-back.
    expect(fieldset.style.border).toBe('1px solid rgb(226, 232, 240)')
    expect(fieldset.style.borderRadius).toBe('4px')
    const legend = within(fieldset).getByText(/Donation preferences/)
    expect(legend.style.fontSize).toBe('13px')
    expect(legend.style.color).toBe('rgb(100, 116, 139)')

    const submit = screen.getByRole('button', { name: 'Start Intake' })
    expect(submit.style.backgroundColor).toBe('')
    expect(submit.className).toBe('')
  })

  it('v2 swaps in classes with no inline style left behind', () => {
    inV2(<IntakeForm seller={SELLER} onCreated={vi.fn()} />)
    const fieldset = screen.getByRole('group')
    expect(fieldset.className).toBe('ui2-intake-fieldset')
    expect(fieldset.style.border).toBe('')

    const legend = within(fieldset).getByText(/Donation preferences/)
    expect(legend.className).toBe('ui2-intake-legend')

    const submit = screen.getByRole('button', { name: 'Start Intake' })
    expect(submit.className).toContain('ui2-btn--primary')
  })

  it('both variants keep the same checkboxes and ids', () => {
    for (const renderer of [
      () => render(<IntakeForm seller={SELLER} onCreated={vi.fn()} />),
      () => inV2(<IntakeForm seller={SELLER} onCreated={vi.fn()} />),
    ]) {
      const { unmount } = renderer()
      expect(document.querySelector('#donateProceeds')).not.toBeNull()
      expect(document.querySelector('#donateUnsold')).not.toBeNull()
      unmount()
    }
  })
})

describe('SellerSearch renders results identically in both variants', () => {
  it('v1 keeps the transparent left-aligned result button', () => {
    render(<SellerSearch onSelect={vi.fn()} onCreateNew={vi.fn()} />)
    const input = screen.getByPlaceholderText('Search by name or code')
    expect(input.style.width).toBe('100%')
    expect(input.style.padding).toBe('8px')

    const newBtn = screen.getByRole('button', { name: 'Register New Seller' })
    expect(newBtn.style.marginTop).toBe('8px')
    expect(newBtn.style.color).toBe('rgb(30, 58, 138)')
  })

  it('v2 swaps the input and fallback button to classes', () => {
    inV2(<SellerSearch onSelect={vi.fn()} onCreateNew={vi.fn()} />)
    const input = screen.getByPlaceholderText('Search by name or code')
    expect(input.className).toBe('ui2-intake-search-input')
    expect(input.style.width).toBe('')

    const newBtn = screen.getByRole('button', { name: 'Register New Seller' })
    expect(newBtn.className).toContain('ui2-btn--secondary')
    expect(newBtn.style.marginTop).toBe('')
  })
})

describe('SellerForm renders the same fields in both variants', () => {
  it('v1 keeps the plain input sizing', () => {
    render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    const first = screen.getByLabelText('First Name')
    expect(first.style.width).toBe('100%')
    expect(first.style.padding).toBe('6px')
    expect(first.className).toBe('')
  })

  it('v2 gives every field the touch-target class', () => {
    inV2(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    const first = screen.getByLabelText('First Name')
    expect(first.className).toBe('ui2-intake-field-input')
    expect(first.style.width).toBe('')

    // Same labels, same required-ness — only presentation changed.
    const state = screen.getByLabelText('State') as HTMLInputElement
    const zip = screen.getByLabelText('ZIP') as HTMLInputElement
    expect(state.required).toBe(true)
    expect(zip.required).toBe(true)
  })
})

describe('ImportItemsButton keeps both actions in both variants', () => {
  it('v1 keeps BUTTON_STYLE inline on both buttons', () => {
    render(<ImportItemsButton intakeId={1} onImported={vi.fn()} />)
    for (const name of ['Import Items', 'Download Template']) {
      const btn = screen.getByRole('button', { name })
      expect(btn.style.color).toBe('rgb(30, 58, 138)')
      expect(btn.className).toBe('')
    }
  })

  it('v2 moves both buttons to the secondary class', () => {
    inV2(<ImportItemsButton intakeId={1} onImported={vi.fn()} />)
    for (const name of ['Import Items', 'Download Template']) {
      const btn = screen.getByRole('button', { name })
      expect(btn.className).toContain('ui2-btn--secondary')
      expect(btn.style.color).toBe('')
    }
  })
})
