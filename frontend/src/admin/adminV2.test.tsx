/**
 * Regression tests for the U5 part 1 admin reporting pass.
 *
 * U5 part 1 lifted every inline style out of the report half — ReportsPage,
 * SellerPayoutPanel, AllSellersPayouts, EndOfDayPage and
 * SellerEquipmentSummaryPanel — into `adminStyles.ts` so a variant-aware class
 * could replace it. That refactor must be invisible in v1: with no `.ui-v2`
 * root (the default, and what every other admin test renders) each component
 * keeps exactly the inline values it had before.
 *
 * The v1 pins below are the specific values that carry behaviour:
 * `width: auto` on key/value tables (four pre-existing tests depend on it) and
 * `#64748b` on sold-out ITEMS rows (pinned by SellerPayoutPanel.test.tsx).
 *
 * @module adminV2.test
 */
import { render, screen } from '@testing-library/react'
import type { CSSProperties, ReactElement } from 'react'
import { UiVariantContext } from '../lib/uiVariant'
import {
  ADMIN_NAVY,
  ADMIN_TABS,
  ALL_SELLERS,
  CREATED_USER,
  END_OF_DAY,
  EQUIPMENT,
  EVENT_SETUP,
  ERROR_RED,
  MUTED,
  MUTED_LINE,
  OUTLINE_BUTTON,
  PAYOUT,
  REPORTS,
  RESET_PASSWORD,
  SECTION_HEADER,
  SELLER_DETAIL,
  SELLER_LIST,
  SESSIONS,
  TABLE,
  TRANSACTIONS,
  USER_MANAGEMENT,
  v1Only,
  v2Only,
  variantProps,
} from './adminStyles'

/** Wraps a tree in the v2 variant context (the default is v1). */
function withV2(ui: ReactElement): ReactElement {
  return (
    <UiVariantContext.Provider value="v2">{ui}</UiVariantContext.Provider>
  )
}

describe('variant helpers (shared with U2–U4)', () => {
  it('variantProps picks exactly one of class/style', () => {
    const v1 = { width: 'auto' } satisfies CSSProperties
    expect(variantProps(false, 'ui2-x', v1)).toEqual({ className: undefined, style: v1 })
    expect(variantProps(true, 'ui2-x', v1)).toEqual({ className: 'ui2-x', style: undefined })
  })

  it('variantProps maps an empty class name to undefined', () => {
    // Row helpers pass "" when no modifier applies; React would render class="".
    expect(variantProps(true, '', {}).className).toBeUndefined()
  })

  it('v1Only only ever returns the style, and only in v1', () => {
    const v1 = { borderBottom: '1px solid #eee' } satisfies CSSProperties
    expect(v1Only(false, v1)).toEqual({ style: v1 })
    expect(v1Only(true, v1)).toEqual({ style: undefined })
  })

  it('v2Only only ever returns the class, and only in v2', () => {
    expect(v2Only(false, 'ui2-scroll')).toEqual({ className: undefined })
    expect(v2Only(true, 'ui2-scroll')).toEqual({ className: 'ui2-scroll' })
    expect(v2Only(true, '')).toEqual({ className: undefined })
  })
})

describe('adminStyles v1 values (the contract v2 must not disturb)', () => {
  it('keeps key/value tables at width:auto — the global table rule demands it', () => {
    // index.css has `table { width: 100% }`; these inline autos are what stop a
    // two-column summary from stretching across the page. Four existing tests
    // assert this, and the kv tables are deliberately never wrapped in
    // TableScroll (whose CSS forces width:100% on its child).
    expect(TABLE.kvTable.width).toBe('auto')
    expect(TABLE.kvTableSpaced.width).toBe('auto')
    expect(END_OF_DAY.kvTable.width).toBe('auto')
    expect(EQUIPMENT.table.width).toBe('auto')
    expect(PAYOUT.kvTable.width).toBe('auto')
    expect(ALL_SELLERS.kvTable.width).toBe('auto')
  })

  it('keeps data tables at width:100%', () => {
    expect(TABLE.table.width).toBe('100%')
    expect(TABLE.tableSpaced.width).toBe('100%')
    expect(PAYOUT.dataTable.width).toBe('100%')
  })

  it('keeps the sold-out ITEMS row grey (pinned by SellerPayoutPanel.test)', () => {
    expect(PAYOUT.bodyRowSoldOut.color).toBe('#64748b')
    expect(MUTED).toBe('#64748b')
  })

  it('keeps the voided-row tint and the sold-out row border', () => {
    expect(TABLE.bodyRowVoided.background).toBe('#fafafa')
    expect(TABLE.bodyRowVoided.borderBottom).toBe('1px solid #eee')
    expect(TABLE.bodyRowSoldOut.borderBottom).toBe('1px solid #eee')
  })

  it('keeps the admin navy distinct from the shell navy', () => {
    // The shell uses #1e3a8a (--navy); every admin report uses #1a237e.
    expect(ADMIN_NAVY).toBe('#1a237e')
    expect(OUTLINE_BUTTON.border).toBe('1px solid #1a237e')
    expect(OUTLINE_BUTTON.color).toBe('#1a237e')
    expect(OUTLINE_BUTTON.background).toBe('none')
    expect(OUTLINE_BUTTON.padding).toBe('3px 10px')
    expect(OUTLINE_BUTTON.borderRadius).toBe(3)
  })

  it('keeps the end-of-day panel geometry and its #ddd row separators', () => {
    expect(END_OF_DAY.root.maxWidth).toBe(600)
    expect(END_OF_DAY.panel.background).toBe('#f5f5f5')
    expect(END_OF_DAY.panel.padding).toBe(16)
    expect(END_OF_DAY.panel.borderRadius).toBe(4)
    // #ddd here, #eee everywhere else — preserved deliberately.
    expect(END_OF_DAY.kvRow.borderBottom).toBe('1px solid #ddd')
    expect(TABLE.bodyRow.borderBottom).toBe('1px solid #eee')
  })

  it('keeps the section-header gutter tied to the open flag', () => {
    expect(SECTION_HEADER.row(false).marginBottom).toBe(0)
    expect(SECTION_HEADER.row(true).marginBottom).toBe(12)
    // staticRow has no gutter at all — absence, not zero.
    expect('marginBottom' in SECTION_HEADER.staticRow).toBe(false)
    expect(SECTION_HEADER.chevron.userSelect).toBe('none')
  })

  it('keeps the shared cell geometry', () => {
    expect(TABLE.thLeft).toEqual({ textAlign: 'left', padding: '4px 8px' })
    expect(TABLE.thRight).toEqual({ textAlign: 'right', padding: '4px 8px' })
    expect(TABLE.thCenter).toEqual({ textAlign: 'center', padding: '4px 8px' })
    expect(TABLE.cell).toEqual({ padding: '4px 8px' })
    expect(TABLE.kvLabel).toEqual({ padding: '4px 16px 4px 8px', fontWeight: 'bold' })
    expect(TABLE.kvLabelSm).toEqual({
      padding: '3px 16px 3px 8px',
      fontWeight: 'bold',
      fontSize: 12,
    })
  })

  it('names the numeric columns as string arrays so `.includes` type-checks', () => {
    // Typed `readonly string[]`, not a literal tuple: the header union is wider
    // than these three/five labels and a tuple type rejects the call.
    expect(PAYOUT.itemsNumericColumns).toEqual(['Sell Price', 'Quantity', 'Remaining'])
    expect(PAYOUT.salesNumericColumns).toEqual([
      'Qty',
      'Sell Price',
      'Extended',
      'Due Seller',
      'Rate',
    ])
  })

  it('keeps the muted and error line tokens', () => {
    expect(MUTED_LINE).toEqual({ color: '#64748b', fontSize: 13 })
    expect(REPORTS.itemCode).toEqual({ color: '#64748b', fontSize: 12, marginLeft: 4 })
    expect(REPORTS.cashierMeta).toEqual({
      color: '#64748b',
      fontSize: 13,
      fontWeight: 400,
      marginLeft: 8,
    })
    expect(ERROR_RED).toBe('#ef4444')
    expect(REPORTS.section.marginBottom).toBe(32)
  })

  it('keeps the seller-card and generate-all panel frames', () => {
    expect(ALL_SELLERS.sellerCard).toEqual({
      marginBottom: 24,
      border: '1px solid #e2e8f0',
      borderRadius: 6,
      padding: 12,
    })
    expect(REPORTS.generateAllPanel).toEqual({
      border: '2px solid #1a237e',
      borderRadius: 6,
      padding: 12,
    })
  })
})

describe('v2 variant wiring', () => {
  it('the v2 context is what flips the class on', () => {
    // Nothing here renders a report (they all fetch); this pins the context
    // plumbing that every converted component reads.
    function Probe() {
      const v2 = true
      return <span {...variantProps(v2, 'ui2-report-table', {})}>probe</span>
    }
    const { container } = render(withV2(<Probe />))
    const span = container.querySelector('span')!
    expect(span.className).toBe('ui2-report-table')
    expect(span.getAttribute('style')).toBeNull()
  })

  it('keeps v1 inline styles when no v2 root is present', () => {
    function Probe() {
      const v2 = false
      return (
        <span {...variantProps(v2, 'ui2-report-table', TABLE.kvTable)}>probe</span>
      )
    }
    const { container } = render(<Probe />)
    const span = container.querySelector('span')!
    expect(span.className).toBe('')
    expect(span.style.width).toBe('auto')
  })
})

describe('converted report components carry no inline styles in v2', () => {
  it('EndOfDayPage renders a class-based summary table under v2', async () => {
    // Rendered through the real component so the wiring is exercised, using a
    // fresh dynamic import to avoid the module-level api mock other admin tests
    // install.
    const { EndOfDayPage } = await import('./EndOfDayPage')
    render(withV2(<EndOfDayPage eventId={1} />))
    const heading = await screen.findByRole('heading', { name: /end of day/i })
    expect(heading).toBeInTheDocument()
    // The panel wrapper is class-based in v2 …
    const section = heading.ownerDocument.querySelector('section.ui2-eod-panel')
    expect(section).not.toBeNull()
    expect(section?.getAttribute('style')).toBeNull()
  })
})

describe('U5 part 2 style tables (sellers & settings)', () => {
  it('keeps the settings tables at their v1 widths', () => {
    // Events and Users were width:100%; Sessions was width:auto inline and is
    // the only settings table that may not stretch.
    expect(EVENT_SETUP.table.width).toBe('100%')
    expect(USER_MANAGEMENT.table.width).toBe('100%')
    expect(SESSIONS.table.width).toBe('auto')
    expect(TRANSACTIONS.table.width).toBe('100%')
    expect(SELLER_LIST.table.width).toBe('100%')
  })

  it('keeps the admin tab strip on the darker admin navy', () => {
    expect(ADMIN_TABS.bar.borderBottom).toBe('2px solid #1a237e')
    expect(ADMIN_TABS.bar.paddingBottom).toBe(8)
    // The active tab inverts; both variants express it, differently.
    expect(ADMIN_TABS.tab(true).background).toBe('#1a237e')
    expect(ADMIN_TABS.tab(true).color).toBe('white')
    expect(ADMIN_TABS.tab(false).background).toBe('transparent')
    expect(ADMIN_TABS.tab(false).color).toBe('#1a237e')
  })

  it('keeps the back button on the SHELL navy, not the admin navy', () => {
    // AdminPage's "Back to Sellers" predates the admin palette and uses
    // #1e3a8a. Changing it here would be an unrequested visual change.
    expect(ADMIN_TABS.backButton.border).toBe('1px solid #1e3a8a')
    expect(ADMIN_TABS.backButton.color).toBe('#1e3a8a')
    expect(ADMIN_TABS.backButton.background).toBe('none')
  })

  it('keeps the modal geometry (width differs per modal on purpose)', () => {
    expect(RESET_PASSWORD.backdrop.position).toBe('fixed')
    expect(RESET_PASSWORD.backdrop.zIndex).toBe(50)
    expect(RESET_PASSWORD.panel.width).toBe(360)
    expect(CREATED_USER.panel.width).toBe(380)
    expect(CREATED_USER.panel.padding).toBe(24)
    expect(RESET_PASSWORD.policyList.paddingLeft).toBe(20)
  })

  it('keeps the password-policy colours', () => {
    expect(RESET_PASSWORD.unmet.color).toBe('#ef4444')
    expect(RESET_PASSWORD.met.color).toBe('#16a34a')
    expect(RESET_PASSWORD.mismatch.color).toBe('#ef4444')
  })

  it('keeps the credential value box selectable and monospace', () => {
    expect(CREATED_USER.valueBox.userSelect).toBe('all')
    expect(CREATED_USER.valueBox.fontFamily).toBe('monospace')
    expect(CREATED_USER.valueBox.background).toBe('#f1f5f9')
    expect(CREATED_USER.rowLabel.width).toBe(80)
  })

  it('keeps the seller-detail geometry', () => {
    expect(SELLER_DETAIL.contactCard.padding).toBe(16)
    expect(SELLER_DETAIL.contactCard.marginBottom).toBe(20)
    expect(SELLER_DETAIL.outlineButton.marginTop).toBe(8)
    expect(SELLER_DETAIL.smallOutline.fontSize).toBe(13)
    expect(SELLER_DETAIL.smallOutlineDisabled.cursor).toBe('not-allowed')
    expect(SELLER_DETAIL.saveButton.background).toBe('#1e3a8a')
    expect(SELLER_DETAIL.cancelButton.border).toBe('1px solid #94a3b8')
    expect(SELLER_DETAIL.hiddenFile.display).toBe('none')
    expect(SELLER_DETAIL.addItemCancel.float).toBe('right')
    expect(SELLER_DETAIL.headingMeta.color).toBe('#64748b')
  })

  it('keeps the seller-list badge colours', () => {
    // labelStatus() swaps which modifier class it emits, so the v2 colours
    // live in CSS; the v1 hexes stay here for the pixel-identical promise.
    expect(SELLER_LIST.codeCell.fontWeight).toBe(600)
    expect(SELLER_LIST.search.border).toBe('1px solid #1e3a8a')
    expect(SELLER_LIST.payoutCell.background).toBe('#f8fafc')
  })

  it('keeps the transactions voided-row tint', () => {
    expect(TRANSACTIONS.row(false).borderBottom).toBe('1px solid #eee')
    expect(TRANSACTIONS.row(false).color).toBeUndefined()
    expect(TRANSACTIONS.row(true).color).toBe('#9ca3af')
    expect(TRANSACTIONS.statusCell(true).color).toBe('#b91c1c')
    expect(TRANSACTIONS.statusCell(false).color).toBe('#15803d')
  })
})
