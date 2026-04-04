// Auth
export interface TokenResponse { access_token: string; role: string; event_id: number }
export interface DecodedToken {
  sub: string
  role: 'admin' | 'intake' | 'cashier'
  event_id: number
  exp: number
}

// Events
export interface Event { id: number; name: string; year: number; commission_rate: number; is_active: boolean }
export interface EventCreate { name: string; year: number; commission_rate: number }

// Users
export interface User { id: number; username: string; role: 'admin' | 'intake' | 'cashier'; is_active: boolean; event_id: number }
export interface UserCreate { username: string; password: string; role: 'admin' | 'intake' | 'cashier' }

// Sellers
export interface Seller {
  id: number; code: string; first_name: string; last_name: string
  company: string | null; is_vendor: boolean; phone: string | null; email: string | null
  address: string | null; city: string | null; state: string | null; zip: string | null
  event_id: number; created_at: string
}
export interface SellerCreate {
  code: string; first_name: string; last_name: string; company?: string
  is_vendor?: boolean; phone?: string; email?: string
  address?: string; city?: string; state?: string; zip?: string
}
export interface SellerUpdate {
  code?: string; first_name?: string; last_name?: string; company?: string
  is_vendor?: boolean; phone?: string; email?: string
  address?: string; city?: string; state?: string; zip?: string
}

// Items
export interface Item {
  id: number; intake_id: number; seller_id: number; code: string
  category: string | null; brand: string | null; type: string | null
  description: string | null; color: string | null; size: string | null
  uom: string | null; gender_age: string | null; year: number | null
  used: boolean; price: number; quantity: number
  barcode_39: string | null; label_line_2: string | null; label_line_3: string | null
  donate_unsold: boolean; status: 'available' | 'sold' | 'donated' | 'returned'
  label_printed: boolean; vendor_item_id: string | null; created_at: string
}
export interface ItemCreate {
  code: string; category?: string; brand?: string; type?: string
  description?: string; color?: string; size?: string; uom?: string
  gender_age?: string; year?: number; used?: boolean; price: number
  quantity?: number; barcode_39?: string; label_line_2?: string
  label_line_3?: string; donate_unsold?: boolean; vendor_item_id?: string
}
export interface ItemUpdate {
  category?: string; brand?: string; type?: string; description?: string
  color?: string; size?: string; uom?: string; gender_age?: string
  year?: number; used?: boolean; price?: number; quantity?: number
  barcode_39?: string; label_line_2?: string; label_line_3?: string
  donate_unsold?: boolean; vendor_item_id?: string
}
export interface ItemLookupResponse extends Item { seller_code: string }

// Intakes
export interface Intake {
  id: number; seller_id: number; date_entered: string; date_received: string | null
  donate_unsold: boolean; donate_proceeds: boolean
  total: number; mysl_total: number; seller_total: number; created_at: string
}
export interface IntakeWithItems extends Intake { items: Item[] }
export interface IntakeCreate {
  seller_id: number; date_entered?: string; date_received?: string
  donate_unsold?: boolean; donate_proceeds?: boolean
}
export interface IntakeUpdate { date_received?: string; donate_unsold?: boolean; donate_proceeds?: boolean }

// Sales
export interface SaleItemCreate { item_id: number; sell_price?: number; notes?: string }
export interface SaleCreate {
  items: SaleItemCreate[]
  cash_amount?: number; check_amount?: number; cc_amount?: number
  check_number?: string; customer_name?: string; customer_email?: string; notes?: string
}
export interface SaleItemResponse {
  id: number; sale_id: number; item_id: number; line_number: number | null
  quantity: number; sell_price: number; extended_price: number
  notes: string | null; created_at: string
}
export interface SaleWithItemsResponse {
  id: number; event_id: number; date_of_sale: string | null
  customer_name: string | null; customer_email: string | null
  sale_total: number; mysl_total: number; seller_total: number
  cash_amount: number; check_amount: number; cc_amount: number
  check_number: string | null; total_paid: number; balance_due: number
  notes: string | null; is_voided: boolean; created_at: string
  created_by: string | null; sale_items: SaleItemResponse[]
}

// Reports
export interface SellerPayoutLineItem {
  item_code: string; description: string | null; price: number; sell_price: number; status: string
}
export interface SellerPayoutReport {
  event_id: number; event_name: string; seller_id: number; seller_code: string
  seller_name: string; seller_email: string | null
  items_consigned: number; items_sold: number; items_unsold: number; items_donated: number
  gross_sales: number; mysl_total: number; seller_total: number
  line_items: SellerPayoutLineItem[]; generated_at: string
}
export interface EventRevenueReport {
  event_id: number; event_name: string; event_year: number
  total_sales: number; voided_sales: number; gross_revenue: number
  mysl_total: number; seller_total: number
  cash_total: number; check_total: number; cc_total: number
  donate_proceeds_total: number; generated_at: string
}
export interface DonationItem {
  seller_code: string; item_code: string; description: string | null
  price: number; donation_type: string
}
export interface DonationsReport {
  event_id: number; event_name: string
  items: DonationItem[]; total_items: number; total_value: number; generated_at: string
}
export interface UnsoldItem {
  seller_code: string; item_code: string; description: string | null
  category: string | null; price: number
}
export interface UnsoldItemsReport {
  event_id: number; event_name: string
  items: UnsoldItem[]; total_items: number; total_value: number; generated_at: string
}
export interface EndOfDayReport {
  event_id: number; event_name: string; date_generated: string
  sales_count: number; voided_count: number; gross_revenue: number
  mysl_total: number; seller_total: number
  cash_total: number; check_total: number; cc_total: number; generated_at: string
}
