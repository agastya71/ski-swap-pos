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
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactElement } from 'react'
import { server } from '../mocks/server'
import { ADMIN_TOKEN } from '../mocks/tokens'
import { AuthProvider } from '../auth/AuthContext'
import { setToken } from '../api/client'
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
import {
  ITEM_LIST,
  ITEM_FORM,
  INTAKE_PAGE,
  SEARCH_PAGE,
} from './intakeStyles'
import { ItemList } from './ItemList'
import { ItemSearchPage } from './ItemSearchPage'
import { UiVariantContext } from '../lib/uiVariant'
import type { Item, ItemSearchResult, Seller } from '../types'

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

// U6 promotion: v1 is no longer the render default — the "v1 keeps …"
// assertions must pin the variant explicitly, mirroring inV2().
const inV1 = (ui: ReactElement) =>
  render(<UiVariantContext.Provider value="v1">{ui}</UiVariantContext.Provider>)

const renderV2 = inV2

const ITEM = {
  id: 11,
  code: 'A001',
  intake_id: 3,
  category: 'Skis',
  type: 'Alpine',
  brand: 'Rossignol',
  description: 'Slalom ski',
  size: '170cm',
  price: 120,
  quantity: 2,
  remaining: 2,
  donate_unsold: false,
  label_printed: false,
  status: 'available',
} as unknown as Item

const ITEM_RESULT = {
  id: 11,
  code: 'A001',
  quantity: 2,
  category: 'Skis',
  type: 'Alpine',
  brand: 'Rossignol',
  description: 'Slalom ski',
  size: '170cm',
  price: 120,
  donate_unsold: false,
  remaining: 2,
  status: 'available',
  seller_code: 'TRAI1',
  seller_name: 'Tess Trail',
} as unknown as ItemSearchResult

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
    inV1(<IntakeForm seller={SELLER} onCreated={vi.fn()} />)
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
    inV1(<SellerSearch onSelect={vi.fn()} onCreateNew={vi.fn()} />)
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
    inV1(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
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
    inV1(<ImportItemsButton intakeId={1} onImported={vi.fn()} />)
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

/* ── U4 part 2: items half ─────────────────────────────────────────────────── */

describe('U4 part 2 style tables keep the v1 values verbatim', () => {
  it('ItemList table and cell geometry match the pre-U4 values', () => {
    expect(ITEM_LIST.table.width).toBe('100%')
    expect(ITEM_LIST.table.borderCollapse).toBe('collapse')
    expect(ITEM_LIST.table.fontSize).toBe(14)
    expect(ITEM_LIST.headRow.borderBottom).toBe('2px solid #ccc')
    expect(ITEM_LIST.thLeft.textAlign).toBe('left')
    expect(ITEM_LIST.thRight.textAlign).toBe('right')
    expect(ITEM_LIST.cell.padding).toBe('4px 8px')
    expect(ITEM_LIST.cellNowrap.whiteSpace).toBe('nowrap')
    expect(ITEM_LIST.footRow.borderTop).toBe('2px solid #333')
    expect(ITEM_LIST.footRow.background).toBe('#f8fafc')
  })

  it('an open edit row drops its bottom border so the panel continues it', () => {
    expect(ITEM_LIST.row(true).borderBottom).toBe('none')
    expect(ITEM_LIST.row(false).borderBottom).toBe('1px solid #eee')
  })

  it('the Save button keeps its pointer cursor but not while saving', () => {
    expect(ITEM_LIST.saveButton(false).cursor).toBe('pointer')
    expect(ITEM_LIST.saveButton(true).cursor).toBe('default')
    expect(ITEM_LIST.saveButton(false).background).toBe('#fff')
  })

  it('ItemForm grid is two columns and the counter turns red at 90 chars', () => {
    expect(ITEM_FORM.grid.gridTemplateColumns).toBe('1fr 1fr')
    expect(ITEM_FORM.grid.gap).toBe('0 12px')
    expect(ITEM_FORM.counter(false).color).toBe('#94a3b8')
    expect(ITEM_FORM.counter(true).color).toBe('#ef4444')
    expect(ITEM_FORM.counter(true).textAlign).toBe('right')
    // Box-sizing only ever applied to the text inputs in v1.
    expect(ITEM_FORM.inputBox.boxSizing).toBe('border-box')
    expect((ITEM_FORM.inputPlain as Record<string, unknown>).boxSizing).toBeUndefined()
  })

  it('IntakePage breadcrumb and meta values are unchanged', () => {
    expect(INTAKE_PAGE.root.maxWidth).toBe(800)
    expect(INTAKE_PAGE.breadcrumb.fontSize).toBe(13)
    expect(INTAKE_PAGE.crumbLink.color).toBe('#1a237e')
    expect(INTAKE_PAGE.crumbLink.textDecoration).toBe('underline')
    expect(INTAKE_PAGE.crumbSep.color).toBe('#999')
    expect(INTAKE_PAGE.cell.padding).toBe('6px 8px')
    expect(INTAKE_PAGE.importWrap.margin).toBe('12px 0')
  })

  it('ItemSearchPage keeps its wide query box and 12px filter inputs', () => {
    expect(SEARCH_PAGE.queryInput.width).toBe(320)
    expect(SEARCH_PAGE.queryInput.padding).toBe(8)
    expect(SEARCH_PAGE.formButton.padding).toBe('8px 20px')
    expect(SEARCH_PAGE.cell.textAlign).toBe('left')
    expect(SEARCH_PAGE.filterInput.minWidth).toBe(90)
    expect(SEARCH_PAGE.filterCell.paddingBottom).toBe(4)
  })
})

describe('ItemList renders the same table in both variants', () => {
  it('v1 keeps per-cell inline padding and the plain table element', () => {
    inV1(<ItemList items={[ITEM]} intakeId={3} onItemsChanged={vi.fn()} />)
    const table = screen.getByRole('table')
    expect(table.className).toBe('')
    expect(table.style.width).toBe('100%')
    const codeCell = screen.getByText('A001')
    expect(codeCell.style.padding).toBe('4px 8px')
  })

  it('v2 drops the inline styles and takes the class names instead', () => {
    renderV2(<ItemList items={[ITEM]} intakeId={3} onItemsChanged={vi.fn()} />)
    const table = screen.getByRole('table')
    expect(table.className).toBe('ui2-items-table')
    expect(table.style.width).toBe('')
    const codeCell = screen.getByText('A001')
    expect(codeCell.className).toBe('')
    expect(codeCell.style.padding).toBe('')
  })

  it('v2 marks numeric cells so they stay right-aligned and tabular', () => {
    renderV2(<ItemList items={[ITEM]} intakeId={3} onItemsChanged={vi.fn()} />)
    // Qty, price, extended price, and on-hand are the four numeric columns.
    const qtyCells = screen.getAllByText('2')
    expect(qtyCells.some((el) => el.className.includes('ui2-num'))).toBe(true)
  })
})

describe('ItemSearchPage renders the same results table in both variants', () => {
  beforeEach(() => {
    setToken(ADMIN_TOKEN)
    server.use(
      http.get('/items/intake-search', () =>
          HttpResponse.json({ total: 1, limit: 100, offset: 0, items: [ITEM_RESULT] }),
        ),
    )
  })
  afterEach(() => setToken(null))

  /** Renders the page under the given variant, wrapped in the auth provider it needs. */
  function renderPage(v2: boolean) {
    return render(
      <AuthProvider>
        <UiVariantContext.Provider value={v2 ? 'v2' : 'v1'}>
          <ItemSearchPage />
        </UiVariantContext.Provider>
      </AuthProvider>,
    )
  }

  it('v1 keeps the inline cell padding', async () => {
    const user = userEvent.setup()
    renderPage(false)
    await user.click(screen.getByRole('button', { name: /^search$/i }))
    const cell = await screen.findByText('A001')
    expect(cell.style.padding).toBe('6px 8px')
    expect(cell.className).toBe('')
  })

  it('v2 uses the table class and drops the per-cell padding', async () => {
    const user = userEvent.setup()
    renderPage(true)
    await user.click(screen.getByRole('button', { name: /^search$/i }))
    const cell = await screen.findByText('A001')
    expect(cell.className).toBe('')
    expect(cell.style.padding).toBe('')
    const table = screen.getByRole('table')
    expect(table.className).toBe('ui2-search-table')
  })
})
