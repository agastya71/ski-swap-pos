# Ski Swap POS — User Guide

A practical guide to the Ski Swap point-of-sale system for **Admins**, **Intake personnel**, and **Cashiers**.

The system supports the full consignment flow for a MYSL Ski Swap: sellers bring equipment at **intake** (everything is labelled with a barcoded tag), the tagged items are sold at the **checkout** during the swap, and afterwards reports settle what was sold, what is still on hand, and what is **due to each seller**. MYSL retains a commission (30% by default) on every sale.

| Role | Lands on | Can do |
| --- | --- | --- |
| **Intake** | Intake | Register sellers, check in items, print labels, bulk-import, search items, seller payouts |
| **Cashier** | Checkout | Look up items by code, build a cart, take payment, complete sales |
| **Admin** | Admin (Event Setup) | Everything, plus Events, Users, Reports, End of Day, and full seller payouts/ZIP exports |

---

## 1. Getting started

### 1.1 Signing in

Open the app at **<https://mysl-pos.duckdns.org>** (or `http://<server>:8000` on the LAN). Enter your username and password and press **Sign In**.

```text
+--------------------------------------------------------------+
|                    Ski Swap POS                              |
|                                                              |
|  Username  [____________________]                            |
|  Password  [____________________]                            |
|                                                              |
|              [         Sign In         ]                     |
+--------------------------------------------------------------+
```

Demo accounts (seeded): `admin / admin123`, `intake1 / intake123`, `cashier1 / cashier1`. Change these before going live.

### 1.2 Getting around

After signing in, the **top navigation bar** shows the pages your role can access:

- **Intake** — seller check-in and item entry (Intake + Admin roles)
- **Checkout** — the point of sale (Cashier + Admin roles)
- **Admin** — Event Setup, Users, Sellers, Reports, End of Day (Admin only)

The right side of the bar shows who you are, your role badge, and buttons for **Change Password** and **Sign Out**. The landing page depends on your role (Admins land on Admin, cashiers on Checkout, intake staff on Intake).

### 1.3 Your account

- **Change Password** (top-right) — change your own password at any time.
- **Sign Out** — ends your session. Do this at the end of a shift, especially on shared computers.

---

## 2. For Intake personnel

Intake staff run the check-in: every consignor (seller) is registered, every item they consign is recorded and labelled, and everything is tracked so payouts and donations are correct at the end of the swap.

### 2.1 The intake workflow

Open the **Intake** page. The module has three tabs: **Intake** (the check-in workflow), **Sellers** (the full seller list), and **Search** (find any item by any field).

The check-in workflow is step-by-step:

```text

1. SEARCH          find the seller by name or code
2. REGISTER        new seller? capture their details here
3. INTAKE SESSION  one session per drop-off (donation elections)
4. ADD ITEMS       enter each item (category, brand, size, price, quantity)
5. ITEM LIST       review, edit, print labels, totals

```

### 2.2 Find or register the seller

Start typing a name or code in **Seller Search**. Pick the returning seller, or choose to **register a new one** — the registration form captures name, phone/email, address, and the vendor flag (commercial dealers use the company name).

### 2.3 Create the intake session

Each drop-off gets an intake session. On the session you set the seller's donation elections:

- **Donate unsold items** — anything not sold is donated to charity instead of returned.
- **Donate proceeds** — the money from sold items is donated to MYSL (the seller receives nothing for sold units).

These elections pre-fill new items and drive the end-of-event reports. They can be overridden per item.

### 2.4 Adding items

Use the **Add Item** form. Fields adapt as you go:

- **Category** — e.g. Skis, Ski Boots, Ski Poles, Snowboard, Helmet, Clothing. Required.
- **Type** — narrows to the category: Skis offers Classic / Skate / Combi / Other; Ski Boots offers Classic / Skate / Combi / Touring / Other; Clothing offers Base Layer Bottom / Base Layer Top / Gloves / Hat / Head band / Jacket / Ski Pants / Ski suit (+ Other).
- **Brand** — a typeahead suggests known brands for the category (for Skis: Atomic, Fischer, Karhu, Kastle, Madshus, Peltonen, Rossignol, Salomon, Yoko; for Ski Poles: 4KAAD, KV+, Leki, Madshus, One Way, Rossignol, Salomon, Swix, Yoko; for Ski Boots: Alpina, Atomic, Fischer, Madshus, Rossignol, Salomon; for Clothing: Daehlie, Swix, Craft, KV+, Patagonia) plus every brand already used in the event. Custom brands can still be typed.
- **Size** — a dropdown with sizes appropriate to the type (cm lengths for skis, mondo for boots, letter sizes for clothing); types without a known size list use a free-text field.
- **Price** — whole dollars, rounded up automatically.
- **Quantity** — how many identical units this row covers (each unit gets its own tag at checkout of the label printer).
- **Used** — untick for brand-new items.
- **Donate if unsold** — per-item override of the intake election.

The item **code is generated automatically** — it combines the seller's code and a sequence number (e.g. seller `JSMI1` → items `JSMI11`, `JSMI12`, …), and it is what the barcode label prints.

### 2.5 The item list

Every item in the intake is listed with Code, Category, Description (brand — description), Price, Qty, **Total Price** (price x full quantity), On Hand, and label status, plus a **totals footer** (item count, total units, total value, on-hand).

Per-item actions:

- **Edit** — opens an inline panel to fix description, price, brand, type, size, gender/age, colour. Save or Cancel.
- **Print All Labels** — prints one tag per on-hand unit for that item.
- **Print** (with the count box) — prints an exact number of labels for that item.
- **Delete** — removes an item that has not yet been labelled or sold (a confirmation is shown; labelled or sold items cannot be deleted).

The header button **Print Labels for All Items** prints tags for every item in the intake at once.

### 2.6 Printing labels

Labels are Zebra tags (Code 39 barcode, seller code + price, description) printed on the configured label printer. Printing marks the item as *label printed* — after that, the item can no longer be deleted (its tags are already on the merchandise).

- **Print All Labels** (per item) — one tag per on-hand unit.
- **Print N** (per item) — an exact number of tags.
- **Print Labels for All Items** (header) — tags for the whole intake.

If the printer is unavailable, a red message explains it; nothing is marked printed.

### 2.7 Importing items from Excel

For large consignments, use **Import from Excel** on the intake tab:

1. **Download Template** — fetch the blank 12-column template.
2. Fill one row per item: Description, Category, Brand, Type, Color, Size, Gender/Age, Year, Price, Used, Donate if Unsold, Quantity.
3. **Import** the file. Every row is validated; valid rows are created and invalid rows are listed with row numbers and reasons (fix the file and re-import).

Prices round UP to whole dollars. Brand names are matched to existing brands when they are close (typos snap to the known brand).

### 2.8 The Search tab

The **Search** tab finds items across the whole event by any field: code, description, category, brand, type, colour, size, gender/age, year, price, quantity, status, and seller name/code. Filter by status and download the results as Excel.

### 2.9 The Sellers tab

Browse every seller in the event, open a seller for their detail (items, sales), and reach their **Due Seller** payout report.

---

## 3. Cashiers — the checkout

### 3.1 Looking up items

On the **Checkout** page, scan the item's barcode or type the item code and press Enter. Partial codes work too — the lookup matches **item codes only** and shows an autocomplete list; pick the item from the list or press Enter for an exact match.

Sold-out items are flagged and cannot be added.

### 3.2 The cart

Each scanned item becomes a cart line with its quantity, sell price (editable for negotiated prices), and optional notes. Remove lines with Remove. The total updates as you go.

### 3.3 Taking payment

The payment form splits the tender across:

- **Cash ($)** — the cash amount.
- **Check ($)** — plus a **Check Number** (required when a check is used).
- **Credit Card ($)** — the card amount, entered manually.

The tendered total must meet the sale total before the sale can complete. The Square card-reader integration is pending and hidden.

### 3.4 Completing the sale

Press **Complete Sale**. A green confirmation banner shows the receipt (sale number, total, tender breakdown, cashier). Press **New Transaction** to clear the cart for the next customer, or **Cancel** to abandon a checkout before completing it.

---

## 4. Admins

Admins can use everything above (Intake and Checkout), plus the **Admin** page with five tabs: **Event Setup**, **Users**, **Sellers**, **Reports**, and **End of Day**.

### 4.1 Event Setup

- Create an event (name, year, commission rates for individuals and vendors) and make it the **active** event — everything else in the app works against the active event.
- **Delete** an event: permanent and cascading (it removes the event's items, intakes, sellers, sales, and user accounts). The active event and the event you are signed into cannot be deleted.

### 4.2 Users

Create cashier and intake accounts (username, password, role), **reset passwords**, and **deactivate** users. Deactivated users cannot sign in.

### 4.3 Sellers

The seller directory: search, open a seller, see their items and payout status, and open their **Due Seller** payout.

### 4.4 Reports

All reports support **CSV / Markdown / PDF / Excel** downloads.

- **Due Seller** (per seller) — search a seller and download their statement as XLSX or PDF. The statement includes the seller's contact information, a **Sales** section (every sale line with date, prices, and the amount due), and an **Unsold Items** section (everything still on hand, including donated and returned items). Sellers whose intake elected **Donate Proceeds** show $0 due — their proceeds went to MYSL.
- **Generate All Due Sellers** — payouts for every seller at once, with grand totals, per-seller **Download XLSX / PDF** buttons, **Download CSV (all)**, and **Download ZIP (Excel + PDF per seller)** — one Excel workbook and one PDF per seller, ready to hand out individually.
- **Event Revenue** — totals by payment type (cash / check / credit card), MYSL vs seller shares, voided sales.
- **Donations** — items and proceeds donated to MYSL.
- **Unsold Items** — everything still on hand at close.
- **Transactions by User** — every sale grouped by the cashier who recorded it.

### 4.5 End of Day

The daily summary (sales, voided, revenue by payment type) plus a full **database backup download** (a ZIP with the SQLite database and a JSON export).

### 4.6 Deleting an event

From Event Setup, inactive events can be permanently deleted. The active event, and the event your own account belongs to, are protected. Treat deletion as a year-end cleanup action only.

---

## 5. Notes and troubleshooting

| Situation | What happens / what to do |
| --- | --- |
| Item shows sold out | All on-hand units are sold. Check On Hand on the item in the intake list. |
| "Amount due $0.00" on a payout | The seller's intake elected **Donate Proceeds** — the gross went to MYSL as a donation. |
| Check payment rejected | Enter the **Check Number**; it is required whenever a check amount is used. |
| "Printer unavailable" when printing labels | The label printer is not reachable at the configured device. Retry after checking the printer/USB connection. |
| Cannot delete an item | Items that are label-printed or sold cannot be deleted (tags are in the field). |
| Need yesterday's data | Backups run every 6 hours to `~/skiswap-backups/`; recovery steps are in `docs/backup-recovery.md`. |

---

- Ski Swap POS — Minnesota Youth Ski League. Questions: contact the admin on duty.*
