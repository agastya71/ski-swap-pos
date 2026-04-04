import { http, HttpResponse } from 'msw'
import { ADMIN_TOKEN } from './tokens'

export const handlers = [
  // Auth
  http.post('/auth/token', () =>
    HttpResponse.json({ access_token: ADMIN_TOKEN, token_type: 'bearer' })
  ),

  // Events — stubs (expanded in Phase 6d)
  http.get('/events', () => HttpResponse.json([])),
  http.post('/events', () => HttpResponse.json({ id: 1, name: 'Test Event', year: 2026, commission_rate: 0.3, is_active: true })),
  http.post('/events/:id/activate', () => HttpResponse.json({ id: 1, name: 'Test Event', year: 2026, commission_rate: 0.3, is_active: true })),

  // Users — stubs
  http.get('/users', () => HttpResponse.json([])),
  http.post('/users', () => HttpResponse.json({ id: 1, username: 'user1', role: 'intake', is_active: true, event_id: 1 })),
  http.patch('/users/:id/deactivate', () => HttpResponse.json({ id: 1, username: 'user1', role: 'intake', is_active: false, event_id: 1 })),

  // Sellers — stubs (expanded in Phase 6b)
  http.get('/sellers', () => HttpResponse.json([])),
  http.post('/sellers', () => HttpResponse.json({ id: 1, seller_code: 'A001', first_name: 'Jane', last_name: 'Doe', company: null, is_vendor: false, phone: null, email: null, event_id: 1 })),
  http.get('/sellers/:id', () => HttpResponse.json({ id: 1, seller_code: 'A001', first_name: 'Jane', last_name: 'Doe', company: null, is_vendor: false, phone: null, email: null, event_id: 1 })),
  http.patch('/sellers/:id', () => HttpResponse.json({ id: 1, seller_code: 'A001', first_name: 'Jane', last_name: 'Doe', company: null, is_vendor: false, phone: null, email: null, event_id: 1 })),

  // Intakes — stubs (expanded in Phase 6b)
  http.post('/intakes', () => HttpResponse.json({ id: 1, seller_id: 1, event_id: 1, donate_proceeds: false, donate_unsold: false, notes: null, date_entered: '2026-04-04' })),
  http.get('/intakes/:id', () => HttpResponse.json({ id: 1, seller_id: 1, event_id: 1, donate_proceeds: false, donate_unsold: false, notes: null, date_entered: '2026-04-04', items: [] })),
  http.patch('/intakes/:id', () => HttpResponse.json({ id: 1, seller_id: 1, event_id: 1, donate_proceeds: false, donate_unsold: false, notes: null, date_entered: '2026-04-04' })),
  http.post('/intakes/:id/items', () => HttpResponse.json({ id: 1, item_code: 'A001-001', category: 'Skis', brand: null, item_type: null, description: null, color: null, size: null, gender_age: null, year: null, condition: null, price: 50, quantity: 1, status: 'available', label_printed: false, donate_item: false, intake_id: 1 })),
  http.post('/intakes/:id/labels', () => new HttpResponse(null, { status: 204 })),

  // Items — stubs (expanded in Phase 6b/6c)
  http.get('/items/lookup', () => HttpResponse.json({ id: 1, item_code: 'A001-001', seller_code: 'A001', description: null, price: 50, status: 'available' })),
  http.get('/items/:id', () => HttpResponse.json({ id: 1, item_code: 'A001-001', category: 'Skis', brand: null, item_type: null, description: null, color: null, size: null, gender_age: null, year: null, condition: null, price: 50, quantity: 1, status: 'available', label_printed: false, donate_item: false, intake_id: 1 })),
  http.patch('/items/:id', () => HttpResponse.json({ id: 1, item_code: 'A001-001', category: 'Skis', brand: null, item_type: null, description: null, color: null, size: null, gender_age: null, year: null, condition: null, price: 50, quantity: 1, status: 'available', label_printed: false, donate_item: false, intake_id: 1 })),
  http.delete('/items/:id', () => new HttpResponse(null, { status: 204 })),
  http.post('/items/:id/label', () => new HttpResponse(null, { status: 204 })),

  // Sales — stubs (expanded in Phase 6c)
  http.post('/sales', () => HttpResponse.json({ id: 1, event_id: 1, sale_total: 50, mysl_total: 15, seller_total: 35, cash_tendered: 50, check_tendered: 0, square_tendered: 0, square_payment_id: null, is_voided: false, created_at: '2026-04-04T10:00:00', items: [] })),
  http.get('/sales/:id', () => HttpResponse.json({ id: 1, event_id: 1, sale_total: 50, mysl_total: 15, seller_total: 35, cash_tendered: 50, check_tendered: 0, square_tendered: 0, square_payment_id: null, is_voided: false, created_at: '2026-04-04T10:00:00', items: [] })),
  http.post('/sales/:id/void', () => HttpResponse.json({ id: 1, event_id: 1, sale_total: 50, mysl_total: 15, seller_total: 35, cash_tendered: 50, check_tendered: 0, square_tendered: 0, square_payment_id: null, is_voided: true, created_at: '2026-04-04T10:00:00', items: [] })),

  // Reports — stubs (expanded in Phase 6d)
  http.get('/reports/seller-payouts', () => HttpResponse.json({ event_id: 1, generated_at: '2026-04-04T10:00:00', sellers: [] })),
  http.get('/reports/event-revenue', () => HttpResponse.json({ event_id: 1, generated_at: '2026-04-04T10:00:00', gross_sales: 0, mysl_total: 0, seller_total: 0, total_transactions: 0, cash_total: 0, check_total: 0, square_total: 0 })),
  http.get('/reports/donations', () => HttpResponse.json({ event_id: 1, generated_at: '2026-04-04T10:00:00', proceeds_donated: 0, items_donated_count: 0, items_donated_value: 0, sellers: [] })),
  http.get('/reports/unsold-items', () => HttpResponse.json({ event_id: 1, generated_at: '2026-04-04T10:00:00', items: [] })),
  http.post('/end-of-day/mark-unsold', () => HttpResponse.json({ marked_donated: 0, marked_returned: 5 })),
  http.post('/admin/backup', () => new HttpResponse(new Blob(['zip'], { type: 'application/zip' }), { status: 200 })),
]
