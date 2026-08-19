/**
 * MSW (Mock Service Worker) request handlers for all backend API routes.
 * Used in Vitest tests to intercept HTTP calls and return deterministic
 * fixture data without a running backend. Covers auth, events, users,
 * sellers, intakes, items, sales, reports, and admin endpoints.
 */

import { http, HttpResponse } from 'msw'
import { ADMIN_TOKEN } from './tokens'

const SELLER = {
  id: 1, code: 'A001', first_name: 'Jane', last_name: 'Doe',
  company: null, is_vendor: false, phone: null, email: null,
  address: null, city: null, state: null, zip: null, donate_unsold_default: false, donate_proceeds_default: false,
  event_id: 1, created_at: '2026-04-04T10:00:00',
}

const ITEM = {
  id: 1, intake_id: 1, seller_id: 1, code: 'A001-001',
  category: 'Skis', brand: null, type: null, description: null,
  color: null, size: null, uom: null, gender_age: null, year: null,
  used: true, price: 50, quantity: 1,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false, is_deleted: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
}

const INTAKE = {
  id: 1, seller_id: 1, date_entered: '2026-04-04', date_received: null,
  donate_unsold: false, donate_proceeds: false,
  total: 0, mysl_total: 0, seller_total: 0, created_at: '2026-04-04T10:00:00',
}

const SALE = {
  id: 1, event_id: 1, date_of_sale: '2026-04-04',
  customer_name: null, customer_email: null,
  sale_total: 50, mysl_total: 15, seller_total: 35,
  cash_amount: 50, check_amount: 0, cc_amount: 0,
  check_number: null, total_paid: 50, balance_due: 0,
  notes: null, is_voided: false, created_at: '2026-04-04T10:00:00',
  created_by: null, sale_items: [],
}

export const handlers = [
  /** POST /auth/login — returns a fixed admin JWT token for all login attempts. */
  http.post('/auth/login', () =>
    HttpResponse.json({ access_token: ADMIN_TOKEN, role: 'admin', event_id: 1 })
  ),

  /** GET /events — returns a two-event list (one inactive, one active). */
  http.get('/events', () => HttpResponse.json([
    { id: 1, name: 'Swap 2025', year: 2025, commission_rate: 0.3, is_active: false },
    { id: 2, name: 'Swap 2026', year: 2026, commission_rate: 0.3, is_active: true },
  ])),
  /** POST /events — returns a new stub event with id 3 (Swap 2027). */
  http.post('/events', () =>
    HttpResponse.json({ id: 3, name: 'Swap 2027', year: 2027, commission_rate: 0.3, is_active: false })
  ),
  /** POST /events/:id/activate — marks the addressed event as active. */
  http.post('/events/:id/activate', ({ params }) =>
    HttpResponse.json({ id: Number(params['id']), name: 'Swap 2026', year: 2026, commission_rate: 0.3, is_active: true })
  ),

  /** GET /users — returns an empty user list (tests override as needed). */
  http.get('/users', () => HttpResponse.json([])),
  /** POST /users — returns a stub intake user with id 1. */
  http.post('/users', () => HttpResponse.json({ id: 1, username: 'user1', role: 'intake', is_active: true, event_id: 1 })),
  /** PATCH /users/:id/deactivate — returns the same user with is_active set to false. */
  http.patch('/users/:id/deactivate', () => HttpResponse.json({ id: 1, username: 'user1', role: 'intake', is_active: false, event_id: 1 })),

  /** GET /sellers — filters by optional `q` query param (code, first/last name). */
  http.get('/sellers', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q') ?? ''
    const sellers = [
      { id: 1, code: '001', first_name: 'Jane', last_name: 'Smith', company: null,
        is_vendor: false, phone: null, email: null, address: null, city: null,
        state: null, zip: null, donate_unsold_default: false, donate_proceeds_default: false, event_id: 1, created_at: '2026-01-01T00:00:00Z' },
    ].filter(s =>
      !q ||
      s.code.includes(q) || s.first_name.toLowerCase().includes(q.toLowerCase()) ||
      s.last_name.toLowerCase().includes(q.toLowerCase())
    )
    return HttpResponse.json(sellers)
  }),
  /** POST /sellers — creates a new seller, auto-assigns code '001'. */
  http.post('/sellers', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: 1, code: '001',
      first_name: body.first_name ?? 'Jane',
      last_name: body.last_name ?? 'Smith',
      company: body.company ?? null,
      is_vendor: body.is_vendor ?? false,
      phone: body.phone ?? null,
      email: body.email ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      zip: body.zip ?? null,
      event_id: 1,
      created_at: '2026-01-01T00:00:00Z',
    }, { status: 201 })
  }),
  /** GET /sellers/:id/intakes — returns a single-element intake array for the seller. */
  http.get('/sellers/:id/intakes', () => HttpResponse.json([INTAKE])),
  /** GET /sellers/:id/items — returns a single-element item array for the seller. */
  http.get('/sellers/:id/items', () => HttpResponse.json([
    {
      id: 1, intake_id: 1, seller_id: 1, code: '001-01',
      category: 'Skis', brand: 'Atomic', type: null, description: 'Atomic skis 160cm',
      color: 'Red', size: '160cm', uom: null, gender_age: 'Men', year: 2020,
      used: true, price: 120.0, quantity: 1, barcode_39: '001-01',
      label_line_2: null, label_line_3: null, donate_unsold: false,
      status: 'available', label_printed: false, is_deleted: false, vendor_item_id: null,
      created_at: '2026-01-01T00:00:00Z',
    },
  ])),
  /** GET /sellers/:id — returns the shared SELLER fixture. */
  http.get('/sellers/:id', () => HttpResponse.json(SELLER)),
  /** PATCH /sellers/:id — returns the shared SELLER fixture unchanged. */
  http.patch('/sellers/:id', () => HttpResponse.json(SELLER)),

  /** POST /intakes — creates a new intake session, returns the INTAKE fixture. */
  http.post('/intakes', () => HttpResponse.json(INTAKE)),
  /** GET /intakes/:id — returns the INTAKE fixture with an empty items array. */
  http.get('/intakes/:id', () => HttpResponse.json({ ...INTAKE, items: [] })),
  /** PATCH /intakes/:id — updates intake options, returns the INTAKE fixture. */
  http.patch('/intakes/:id', () => HttpResponse.json(INTAKE)),
  /** POST /intakes/:intakeId/items — adds an item to the intake; auto-assigns code '001-01'. */
  http.post('/intakes/:intakeId/items', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({
      id: 1, intake_id: 1, seller_id: 1,
      code: '001-01',
      category: body.category ?? null,
      brand: body.brand ?? null,
      type: body.type ?? null,
      description: body.description ?? null,
      color: body.color ?? null,
      size: body.size ?? null,
      uom: body.uom ?? null,
      gender_age: body.gender_age ?? null,
      year: body.year ?? null,
      used: body.used ?? true,
      price: body.price ?? 0,
      quantity: body.quantity ?? 1,
      barcode_39: '001-01',
      label_line_2: null, label_line_3: null,
      donate_unsold: body.donate_unsold ?? false,
      status: 'available',
      label_printed: false, is_deleted: false,
      vendor_item_id: null,
      created_at: '2026-01-01T00:00:00Z',
    }, { status: 201 })
  }),
  /** POST /intakes/:id/labels — triggers label printing, returns a count of printed labels. */
  http.post('/intakes/:id/labels', () => HttpResponse.json({ intake_id: 1, printed: 5 })),
  /** POST /intakes/:intakeId/items/import — bulk Excel import; returns import summary. */
  http.post('/intakes/:intakeId/items/import', () =>
    HttpResponse.json({ imported: 2, skipped: 0, errors: [] })
  ),

  /** GET /items/lookup — exact item lookup by code or barcode; returns ITEM with seller_code. */
  http.get('/items/lookup', () => HttpResponse.json({ ...ITEM, seller_code: 'A001' })),
  /** GET /items/search — partial-code search; returns an empty array (tests override as needed). */
  http.get('/items/search', () => HttpResponse.json([])),
  http.get('/items/brands', () => HttpResponse.json([])),
  /** GET /items/:id — fetches a single item by numeric ID, returns the ITEM fixture. */
  http.get('/items/:id', () => HttpResponse.json(ITEM)),
  /** PATCH /items/:id — updates item fields, returns the ITEM fixture unchanged. */
  http.patch('/items/:id', () => HttpResponse.json(ITEM)),
  /** DELETE /items/:id — deletes an item, returns 204 No Content. */
  http.delete('/items/:id', () => new HttpResponse(null, { status: 204 })),
  /** POST /items/:id/label — marks an item label as printed, returns the updated ITEM fixture. */
  http.post('/items/:id/label', () => HttpResponse.json(ITEM)),

  /** POST /sales — creates a new sale transaction, returns the SALE fixture. */
  http.post('/sales', () => HttpResponse.json(SALE)),
  /** GET /sales/:id — fetches a sale by ID, returns the SALE fixture. */
  http.get('/sales/:id', () => HttpResponse.json(SALE)),
  /** POST /sales/:id/void — voids a sale, returns the SALE fixture with is_voided true. */
  http.post('/sales/:id/void', () => HttpResponse.json({ ...SALE, is_voided: true })),

  /** GET /reports/:eventId/seller/:sellerId — returns seller payout report for seller 001 (Jane Smith). */
  http.get('/reports/:eventId/seller/:sellerId', () =>
    HttpResponse.json({
      event_id: 1, event_name: 'Swap 2026',
      seller_id: 1, seller_code: '001', seller_name: 'Jane Smith',
      seller_email: null,
      items_consigned: 2, items_sold: 1, items_unsold: 1, items_donated: 0,
      gross_sales: 120.0, mysl_total: 36.0, seller_total: 84.0,
      line_items: [
        { item_code: '001-01', description: 'Atomic skis', price: 120.0, sell_price: 120.0, status: 'sold' },
        { item_code: '001-02', description: 'Boots', price: 40.0, sell_price: 0.0, status: 'unsold' },
      ],
      generated_at: '2026-04-11T00:00:00Z',
    })
  ),
  /** GET /reports/:eventId/revenue — returns event-level revenue totals and payment breakdown. */
  http.get('/reports/:eventId/revenue', () =>
    HttpResponse.json({
      event_id: 1, event_name: 'Test Event', event_year: 2026,
      total_sales: 2, voided_sales: 0, gross_revenue: 190,
      mysl_total: 57, seller_total: 133,
      cash_total: 150, check_total: 40, cc_total: 0,
      donate_proceeds_total: 0, generated_at: '2026-04-04T10:00:00',
    })
  ),
  /** GET /reports/:eventId/donations — returns a donations report with one stub donated item. */
  http.get('/reports/:eventId/donations', () =>
    HttpResponse.json({
      event_id: 1, event_name: 'Test Event',
      items: [
        { seller_code: 'A001', seller_name: 'Jane Smith', item_code: 'A001-004', description: 'Blue helmet', price: 30, donation_type: 'donate_unsold' },
      ],
      total_items: 1, total_value: 30, generated_at: '2026-04-04T10:00:00',
    })
  ),
  /** GET /reports/:eventId/unsold — returns an unsold-items report with one stub unsold item. */
  http.get('/reports/:eventId/unsold', () =>
    HttpResponse.json({
      event_id: 1, event_name: 'Test Event',
      items: [
        { seller_code: 'A001', seller_name: 'Jane Smith', item_code: 'A001-005', description: 'Red jacket', category: 'Jackets', price: 45 },
      ],
      total_items: 1, total_value: 45, generated_at: '2026-04-04T10:00:00',
    })
  ),
  /** GET /reports/:eventId/end-of-day — returns an end-of-day summary with sales counts and payment totals. */
  http.get('/reports/:eventId/end-of-day', () =>
    HttpResponse.json({
      event_id: 1, event_name: 'Test Event', date_generated: '2026-04-04',
      sales_count: 5, voided_count: 0, gross_revenue: 250,
      mysl_total: 75, seller_total: 175, cash_total: 200, check_total: 50, cc_total: 0,
      generated_at: '2026-04-04T10:00:00',
    })
  ),

  /** POST /admin/backup — returns a stub ZIP blob response for the database backup download. */
  http.post('/admin/backup', () => new HttpResponse(new Blob(['zip'], { type: 'application/zip' }), { status: 200 })),
]
