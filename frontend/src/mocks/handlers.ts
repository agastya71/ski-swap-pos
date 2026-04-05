import { http, HttpResponse } from 'msw'
import { ADMIN_TOKEN } from './tokens'

const SELLER = {
  id: 1, code: 'A001', first_name: 'Jane', last_name: 'Doe',
  company: null, is_vendor: false, phone: null, email: null,
  address: null, city: null, state: null, zip: null,
  event_id: 1, created_at: '2026-04-04T10:00:00',
}

const ITEM = {
  id: 1, intake_id: 1, seller_id: 1, code: 'A001-001',
  category: 'Skis', brand: null, type: null, description: null,
  color: null, size: null, uom: null, gender_age: null, year: null,
  used: true, price: 50, quantity: 1,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false,
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
  // Auth
  http.post('/auth/login', () =>
    HttpResponse.json({ access_token: ADMIN_TOKEN, role: 'admin', event_id: 1 })
  ),

  // Events
  http.get('/events', () => HttpResponse.json([
    { id: 1, name: 'Swap 2025', year: 2025, commission_rate: 0.3, is_active: false },
    { id: 2, name: 'Swap 2026', year: 2026, commission_rate: 0.3, is_active: true },
  ])),
  http.post('/events', () =>
    HttpResponse.json({ id: 3, name: 'Swap 2027', year: 2027, commission_rate: 0.3, is_active: false })
  ),
  http.post('/events/:id/activate', ({ params }) =>
    HttpResponse.json({ id: Number(params['id']), name: 'Swap 2026', year: 2026, commission_rate: 0.3, is_active: true })
  ),

  // Users
  http.get('/users', () => HttpResponse.json([])),
  http.post('/users', () => HttpResponse.json({ id: 1, username: 'user1', role: 'intake', is_active: true, event_id: 1 })),
  http.patch('/users/:id/deactivate', () => HttpResponse.json({ id: 1, username: 'user1', role: 'intake', is_active: false, event_id: 1 })),

  // Sellers — specific routes before /:id to avoid shadowing
  http.get('/sellers', () => HttpResponse.json([])),
  http.post('/sellers', () => HttpResponse.json(SELLER)),
  http.get('/sellers/:id/intakes', () => HttpResponse.json([INTAKE])),
  http.get('/sellers/:id', () => HttpResponse.json(SELLER)),
  http.patch('/sellers/:id', () => HttpResponse.json(SELLER)),

  // Intakes
  http.post('/intakes', () => HttpResponse.json(INTAKE)),
  http.get('/intakes/:id', () => HttpResponse.json({ ...INTAKE, items: [] })),
  http.patch('/intakes/:id', () => HttpResponse.json(INTAKE)),
  http.post('/intakes/:id/items', () => HttpResponse.json(ITEM)),
  http.post('/intakes/:id/labels', () => HttpResponse.json({ intake_id: 1, printed: 5 })),

  // Items — specific routes MUST be before /:id to prevent route shadowing
  http.get('/items/lookup', () => HttpResponse.json({ ...ITEM, seller_code: 'A001' })),
  http.get('/items/search', () => HttpResponse.json([])),
  http.get('/items/:id', () => HttpResponse.json(ITEM)),
  http.patch('/items/:id', () => HttpResponse.json(ITEM)),
  http.delete('/items/:id', () => new HttpResponse(null, { status: 204 })),
  http.post('/items/:id/label', () => HttpResponse.json(ITEM)),

  // Sales
  http.post('/sales', () => HttpResponse.json(SALE)),
  http.get('/sales/:id', () => HttpResponse.json(SALE)),
  http.post('/sales/:id/void', () => HttpResponse.json({ ...SALE, is_voided: true })),

  // Reports
  http.get('/reports/:eventId/seller/:sellerId', () =>
    HttpResponse.json({
      event_id: 1, event_name: 'Test Event', seller_id: 1, seller_code: 'A001',
      seller_name: 'Jane Doe', seller_email: 'jane@example.com',
      items_consigned: 4, items_sold: 3, items_unsold: 1, items_donated: 0,
      gross_sales: 150, mysl_total: 45, seller_total: 105,
      line_items: [
        { item_code: 'A001-001', description: 'Ski boots', price: 50, sell_price: 50, status: 'sold' },
      ],
      generated_at: '2026-04-04T10:00:00',
    })
  ),
  http.get('/reports/:eventId/revenue', () =>
    HttpResponse.json({
      event_id: 1, event_name: 'Test Event', event_year: 2026,
      total_sales: 2, voided_sales: 0, gross_revenue: 190,
      mysl_total: 57, seller_total: 133,
      cash_total: 150, check_total: 40, cc_total: 0,
      donate_proceeds_total: 0, generated_at: '2026-04-04T10:00:00',
    })
  ),
  http.get('/reports/:eventId/donations', () =>
    HttpResponse.json({
      event_id: 1, event_name: 'Test Event',
      items: [
        { seller_code: 'A001', item_code: 'A001-004', description: 'Blue helmet', price: 30, donation_type: 'donate_unsold' },
      ],
      total_items: 1, total_value: 30, generated_at: '2026-04-04T10:00:00',
    })
  ),
  http.get('/reports/:eventId/unsold', () =>
    HttpResponse.json({
      event_id: 1, event_name: 'Test Event',
      items: [
        { seller_code: 'A001', item_code: 'A001-005', description: 'Red jacket', category: 'Jackets', price: 45 },
      ],
      total_items: 1, total_value: 45, generated_at: '2026-04-04T10:00:00',
    })
  ),
  http.get('/reports/:eventId/end-of-day', () =>
    HttpResponse.json({
      event_id: 1, event_name: 'Test Event', date_generated: '2026-04-04',
      sales_count: 5, voided_count: 0, gross_revenue: 250,
      mysl_total: 75, seller_total: 175, cash_total: 200, check_total: 50, cc_total: 0,
      generated_at: '2026-04-04T10:00:00',
    })
  ),

  // Admin backup
  http.post('/admin/backup', () => new HttpResponse(new Blob(['zip'], { type: 'application/zip' }), { status: 200 })),
]
