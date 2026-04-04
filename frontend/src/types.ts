// Auth
export interface TokenResponse { access_token: string; token_type: string }
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
  id: number; seller_code: string; first_name: string; last_name: string
  company: string | null; is_vendor: boolean; phone: string | null; email: string | null; event_id: number
}
export interface SellerCreate {
  first_name: string; last_name: string; company?: string
  is_vendor?: boolean; phone?: string; email?: string
}
export interface SellerUpdate {
  first_name?: string; last_name?: string; company?: string
  is_vendor?: boolean; phone?: string; email?: string
}

// Items
export interface Item {
  id: number; item_code: string; category: string; brand: string | null
  item_type: string | null; description: string | null; color: string | null
  size: string | null; gender_age: string | null; year: number | null
  condition: string | null; price: number; quantity: number
  status: 'available' | 'sold' | 'donated' | 'returned'
  label_printed: boolean; donate_item: boolean; intake_id: number
}
export interface ItemCreate {
  category: string; brand?: string; item_type?: string; description?: string
  color?: string; size?: string; gender_age?: string; year?: number
  condition?: string; price: number; quantity?: number; donate_item?: boolean
}
export interface ItemUpdate {
  category?: string; brand?: string; item_type?: string; description?: string
  color?: string; size?: string; gender_age?: string; year?: number
  condition?: string; price?: number; donate_item?: boolean
}

// Intakes
export interface Intake {
  id: number; seller_id: number; event_id: number
  donate_proceeds: boolean; donate_unsold: boolean; notes: string | null; date_entered: string
}
export interface IntakeWithItems extends Intake { items: Item[] }
export interface IntakeCreate { seller_id: number; donate_proceeds?: boolean; donate_unsold?: boolean; notes?: string }
export interface IntakeUpdate { donate_proceeds?: boolean; donate_unsold?: boolean; notes?: string }

// Lookup
export interface ItemLookupResponse {
  id: number; item_code: string; seller_code: string; description: string | null; price: number; status: string
}

// Sales
export interface SaleItemCreate { item_id: number; quantity: number; sell_price: number }
export interface SaleCreate {
  items: SaleItemCreate[]
  cash_tendered: number; check_tendered: number; square_tendered: number
  square_payment_id?: string
}
export interface SaleItem { id: number; item_id: number; quantity: number; sell_price: number; extended_price: number }
export interface Sale {
  id: number; event_id: number; sale_total: number; mysl_total: number; seller_total: number
  cash_tendered: number; check_tendered: number; square_tendered: number
  square_payment_id: string | null; is_voided: boolean; created_at: string; items: SaleItem[]
}

// Reports
export interface SellerPayout {
  seller_id: number; seller_code: string; seller_name: string
  items_sold: number; gross_sales: number; mysl_cut: number; seller_payout: number
}
export interface SellerPayoutReport { event_id: number; generated_at: string; sellers: SellerPayout[] }
export interface EventRevenueReport {
  event_id: number; generated_at: string; gross_sales: number; mysl_total: number
  seller_total: number; total_transactions: number; cash_total: number; check_total: number; square_total: number
}
export interface DonationBySeller {
  seller_code: string; seller_name: string
  proceeds_donated: number; items_donated_count: number; items_donated_value: number
}
export interface DonationsReport {
  event_id: number; generated_at: string
  proceeds_donated: number; items_donated_count: number; items_donated_value: number
  sellers: DonationBySeller[]
}
export interface UnsoldItem { seller_code: string; item_code: string; description: string | null; price: number; status: string }
export interface UnsoldItemsReport { event_id: number; generated_at: string; items: UnsoldItem[] }
export interface EndOfDayResult { marked_donated: number; marked_returned: number }
