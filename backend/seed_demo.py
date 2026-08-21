"""
Demo data seeder — populates the database with realistic Ski Swap demo data.

Usage (from the backend/ directory):
    python seed_demo.py

Safe to run multiple times — skips existing records, never duplicates.

What gets created:
  - 1 active event: Ski Swap 2026 (30% commission)
  - 3 users: admin / intake1 / cashier1
  - 15 sellers: A001–A012 individual, V001–V003 vendor
  - 15 intakes: one per seller
  - 83 items: 4–8 per seller, all categories, mix of statuses
  - 10 sales: Oct 4–5, cash / check / CC transactions
"""
import os
import sys
from datetime import date, datetime

# Allow running from repo root as well as backend/
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal, engine, Base
from app.models.event import Event
from app.models.user import User
from app.models.seller import Seller
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.services.auth import hash_password

# Ensure all tables exist (no-op if Alembic already created them)
import app.models.event      # noqa: F401
import app.models.user       # noqa: F401
import app.models.seller     # noqa: F401
import app.models.intake     # noqa: F401
import app.models.item       # noqa: F401
import app.models.sale       # noqa: F401
import app.models.sale_item  # noqa: F401
Base.metadata.create_all(bind=engine)

# ── counters ────────────────────────────────────────────────────────────────
created = {"events": 0, "users": 0, "sellers": 0, "intakes": 0, "items": 0, "sales": 0}
skipped = {"events": 0, "users": 0, "sellers": 0, "intakes": 0, "items": 0, "sales": 0}

db = SessionLocal()
try:
    # ── 1. Event ────────────────────────────────────────────────────────────
    EVENT_NAME      = "Ski Swap 2026"
    COMMISSION_RATE = 0.30

    event = db.query(Event).filter(Event.name == EVENT_NAME).first()
    if not event:
        event = Event(name=EVENT_NAME, year=2026, commission_rate=COMMISSION_RATE, is_active=True)
        db.add(event)
        db.commit()
        db.refresh(event)
        created["events"] += 1
        print(f"  [+] Event: {event.name} (id={event.id})")
    else:
        skipped["events"] += 1
        print(f"  [=] Event exists: {event.name} (id={event.id})")
        if not event.is_active:
            event.is_active = True
            db.commit()

    # ── 2. Users ─────────────────────────────────────────────────────────────
    def _ensure_user(username: str, password: str, role: str) -> User:
        existing = db.query(User).filter(
            User.event_id == event.id, User.username == username
        ).first()
        if existing:
            skipped["users"] += 1
            print(f"  [=] User exists: {username}")
            return existing
        u = User(
            event_id=event.id,
            username=username,
            password_hash=hash_password(password),
            role=role,
            is_active=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        created["users"] += 1
        print(f"  [+] User: {username} / {password}  ({role})")
        return u

    _ensure_user("admin",    "admin123",   "admin")
    _ensure_user("intake1",  "intake123",  "intake")
    _ensure_user("cashier1", "cashier123", "cashier")

    # ── 3. Sellers ───────────────────────────────────────────────────────────
    # (code, first_name, last_name, phone, email, is_vendor, company)
    SELLERS = [
        ("A001", "Erik",     "Johansson", "612-555-0101", "erik.j@example.com",     False, None),
        ("A002", "Ingrid",   "Larsen",    "651-555-0202", None,                     False, None),
        ("A003", "Lars",     "Bergstrom", "763-555-0303", "lars.b@example.com",     False, None),
        ("A004", "Astrid",   "Olsen",     None,           "astrid.o@example.com",   False, None),
        ("A005", "Bjorn",    "Gustafson", "952-555-0505", None,                     False, None),
        ("A006", "Sigrid",   "Hanson",    "218-555-0606", "sigrid.h@example.com",   False, None),
        ("A007", "Magnus",   "Eriksson",  "320-555-0707", None,                     False, None),
        ("A008", "Freya",    "Magnusson", "507-555-0808", "freya.m@example.com",    False, None),
        ("A009", "Olaf",     "Nilsson",   "612-555-0909", None,                     False, None),
        ("A010", "Helga",    "Peterson",  "651-555-1010", "helga.p@example.com",    False, None),
        ("A011", "Gunnar",   "Anderson",  None,           None,                     False, None),
        ("A012", "Ragnhild", "Thorsen",   "763-555-1212", "ragnhild.t@example.com", False, None),
        ("V001", "Nordic",   "Ski Shop",  "612-555-2001", "sales@nordicski.com",    True,  "Nordic Ski Shop LLC"),
        ("V002", "Summit",   "Outfitters","651-555-2002", "info@summitout.com",     True,  "Summit Outfitters Inc"),
        ("V003", "Powder",   "House",     "952-555-2003", "gear@powderhouse.com",   True,  "Powder House Sports"),
    ]

    sellers_by_code: dict[str, Seller] = {}
    for (code, first, last, phone, email, is_vendor, company) in SELLERS:
        existing = db.query(Seller).filter(
            Seller.event_id == event.id, Seller.code == code
        ).first()
        if existing:
            skipped["sellers"] += 1
            sellers_by_code[code] = existing
            continue
        s = Seller(
            event_id=event.id,
            code=code,
            first_name=first,
            last_name=last,
            phone=phone,
            email=email,
            is_vendor=is_vendor,
            company=company,
            city="Minneapolis" if not is_vendor else None,
            state="MN" if not is_vendor else None,
        )
        db.add(s)
        db.commit()
        db.refresh(s)
        created["sellers"] += 1
        sellers_by_code[code] = s
    print(f"  Sellers: {created['sellers']} created, {skipped['sellers']} skipped")

    # ── 4. Intakes ───────────────────────────────────────────────────────────
    INTAKE_DATE = date(2026, 10, 3)

    intakes_by_seller_code: dict[str, Intake] = {}
    for seller_code, seller in sellers_by_code.items():
        existing = db.query(Intake).filter(Intake.seller_id == seller.id).first()
        if existing:
            skipped["intakes"] += 1
            intakes_by_seller_code[seller_code] = existing
            continue
        intake = Intake(
            seller_id=seller.id,
            date_entered=INTAKE_DATE,
            date_received=INTAKE_DATE,
            donate_unsold=seller_code in ("A002", "A007", "A010"),
            donate_proceeds=seller_code in ("A004", "A011"),
        )
        db.add(intake)
        db.commit()
        db.refresh(intake)
        created["intakes"] += 1
        intakes_by_seller_code[seller_code] = intake
    print(f"  Intakes: {created['intakes']} created, {skipped['intakes']} skipped")

    # ── 5. Items ─────────────────────────────────────────────────────────────
    # (seller_code, seq, category, brand, description, size, gender_age,
    #  price, used, donate_unsold, status)
    ITEMS = [
        # A001 – Erik Johansson (6 items: 3 sold, 3 available)
        ("A001",1,"Skis",   "Rossignol","All-mountain skis",        "170cm","Adult Male",  195.00,True, False,"sold"),
        ("A001",2,"Boots",  "Salomon",  "Ski boots mondo 27",       "27",   "Adult Male",  120.00,True, False,"sold"),
        ("A001",3,"Poles",  "Scott",    "Aluminum poles",           "115cm","Adult",        25.00,True, False,"sold"),
        ("A001",4,"Helmet", "Smith",    "Adult ski helmet",         "M",    "Adult",        55.00,True, False,"available"),
        ("A001",5,"Jacket", "Patagonia","Waterproof shell",         "L",    "Adult Male",  145.00,False,False,"available"),
        ("A001",6,"Goggles","Oakley",   "OTG ski goggles",          "One",  "Adult",        40.00,True, False,"available"),

        # A002 – Ingrid Larsen (5 items: 2 sold, 3 available; donate_unsold on intake)
        ("A002",1,"Skis",   "K2",       "Womens carving skis",      "155cm","Adult Female",175.00,True, True, "sold"),
        ("A002",2,"Boots",  "Nordica",  "Womens boots mondo 24",    "24",   "Adult Female", 95.00,True, True, "sold"),
        ("A002",3,"Helmet", "Giro",     "Womens helmet",            "S",    "Adult Female", 45.00,True, True, "available"),
        ("A002",4,"Gloves", "Hestra",   "Leather ski gloves",       "7",    "Adult Female", 35.00,False,True, "available"),
        ("A002",5,"Pants",  "Columbia", "Insulated ski pants",      "S",    "Adult Female", 65.00,True, True, "available"),

        # A003 – Lars Bergstrom (7 items: 2 sold, 1 donated, 4 available)
        ("A003",1,"Skis",   "Atomic",   "Race carving skis",        "165cm","Adult",       225.00,True, False,"sold"),
        ("A003",2,"Boots",  "Atomic",   "Race boots mondo 26",      "26",   "Adult Male",  110.00,True, False,"sold"),
        ("A003",3,"Poles",  "Leki",     "Titanal poles",            "110cm","Adult",        45.00,False,False,"available"),
        ("A003",4,"Helmet", "POC",      "Race helmet MIPS",         "M/L",  "Adult",       115.00,False,False,"available"),
        ("A003",5,"Jacket", "Arc'teryx","Gore-Tex jacket",          "M",    "Adult Male",  280.00,False,False,"available"),
        ("A003",6,"Pants",  "Arc'teryx","Gore-Tex pants",           "M",    "Adult Male",  240.00,False,False,"available"),
        ("A003",7,"Goggles","Dragon",   "Older model goggles",      "One",  "Adult",        10.00,True, False,"donated"),

        # A004 – Astrid Olsen (5 items: 1 sold, 4 available; donate_proceeds on intake)
        ("A004",1,"Skis",   "Head",     "Womens all-mtn skis",      "158cm","Adult Female",160.00,True, False,"sold"),
        ("A004",2,"Boots",  "Lange",    "Womens boots mondo 23",    "23",   "Adult Female", 85.00,True, False,"available"),
        ("A004",3,"Gloves", "Black Diamond","Lightweight gloves",   "S",    "Adult Female", 28.00,True, False,"available"),
        ("A004",4,"Goggles","Anon",     "Womens goggles",           "One",  "Adult Female", 30.00,True, False,"available"),
        ("A004",5,"Jacket", "North Face","Insulated ski jacket",    "S",    "Adult Female", 95.00,True, False,"available"),

        # A005 – Bjorn Gustafson (6 items: 2 sold, 4 available)
        ("A005",1,"Skis",   "Blizzard", "Powder skis",              "180cm","Adult Male",  245.00,True, False,"sold"),
        ("A005",2,"Boots",  "Tecnica",  "Freeride boots mondo 28",  "28",   "Adult Male",  135.00,True, False,"sold"),
        ("A005",3,"Poles",  "Komperdell","Carbon poles",            "120cm","Adult",        55.00,False,False,"available"),
        ("A005",4,"Helmet", "Uvex",     "Freeride helmet",          "L",    "Adult Male",   70.00,True, False,"available"),
        ("A005",5,"Jacket", "Spyder",   "Race jacket",              "L",    "Adult Male",   85.00,True, False,"available"),
        ("A005",6,"Pants",  "Spyder",   "Race pants",               "L",    "Adult Male",   75.00,True, False,"available"),

        # A006 – Sigrid Hanson (4 items: 1 returned, 3 available)
        ("A006",1,"Skis",   "Fischer",  "Nordic cross-country skis","195cm","Adult",        80.00,True, False,"returned"),
        ("A006",2,"Boots",  "Fischer",  "Nordic boots EU 42",       "42",   "Adult",        40.00,True, False,"available"),
        ("A006",3,"Poles",  "Swix",     "Nordic poles",             "140cm","Adult",        20.00,True, False,"available"),
        ("A006",4,"Gloves", "Swix",     "Nordic gloves",            "M",    "Adult",        15.00,True, False,"available"),

        # A007 – Magnus Eriksson (5 items: 1 sold, 4 available; donate_unsold on intake)
        ("A007",1,"Boots",  "Dalbello", "Kids boots mondo 20",      "20",   "Youth",        55.00,True, True, "sold"),
        ("A007",2,"Skis",   "Elan",     "Kids skis with bindings",  "120cm","Youth",        75.00,True, True, "available"),
        ("A007",3,"Helmet", "Giro",     "Kids helmet",              "XS/S", "Youth",        30.00,True, True, "available"),
        ("A007",4,"Gloves", "Kombi",    "Kids ski gloves",          "S",    "Youth",        12.00,True, True, "available"),
        ("A007",5,"Goggles","Bolle",    "Kids ski goggles",         "One",  "Youth",        18.00,True, True, "available"),

        # A008 – Freya Magnusson (6 items: 2 sold, 4 available)
        ("A008",1,"Skis",   "Volkl",    "All-mtn skis 163cm",       "163cm","Adult Female",210.00,True, False,"sold"),
        ("A008",2,"Boots",  "Rossignol","Womens boots mondo 24.5",  "24.5", "Adult Female",100.00,True, False,"sold"),
        ("A008",3,"Jacket", "Marmot",   "Gore-Tex pro jacket",      "M",    "Adult Female",175.00,False,False,"available"),
        ("A008",4,"Pants",  "Marmot",   "Gore-Tex pro pants",       "M",    "Adult Female",155.00,False,False,"available"),
        ("A008",5,"Helmet", "Marker",   "Adjustable helmet",        "M/L",  "Adult Female", 50.00,True, False,"available"),
        ("A008",6,"Goggles","Smith",    "ChromaPop goggles",        "One",  "Adult Female", 65.00,True, False,"available"),

        # A009 – Olaf Nilsson (5 items: 1 sold, 1 returned, 3 available)
        ("A009",1,"Skis",   "Dynastar", "Speed Zone carving",       "168cm","Adult Male",  185.00,True, False,"sold"),
        ("A009",2,"Boots",  "Salomon",  "Boots mondo 26.5",         "26.5", "Adult Male",   90.00,True, False,"returned"),
        ("A009",3,"Poles",  "Atomic",   "Alloy poles",              "115cm","Adult",        22.00,True, False,"available"),
        ("A009",4,"Helmet", "Bern",     "Audio helmet",             "L",    "Adult Male",   60.00,True, False,"available"),
        ("A009",5,"Gloves", "Gordini",  "Waterproof gloves",        "L",    "Adult Male",   25.00,True, False,"available"),

        # A010 – Helga Peterson (4 items: 1 donated, 3 available; donate_unsold on intake)
        ("A010",1,"Jacket", "REI",      "Ski shell jacket",         "L",    "Adult Female", 55.00,True, True, "donated"),
        ("A010",2,"Pants",  "REI",      "Insulated ski pants",      "L",    "Adult Female", 45.00,True, True, "available"),
        ("A010",3,"Gloves", "Outdoor Research","Gripper gloves",    "M",    "Adult Female", 20.00,True, True, "available"),
        ("A010",4,"Goggles","Zeal",     "Z3 goggles",               "One",  "Adult Female", 35.00,True, True, "available"),

        # A011 – Gunnar Anderson (5 items: 1 sold, 4 available; donate_proceeds on intake)
        ("A011",1,"Skis",   "Kastle",   "MX89 All-Mountain",        "174cm","Adult Male",  320.00,False,False,"sold"),
        ("A011",2,"Boots",  "Surefoot", "Custom fit boots M28",     "28",   "Adult Male",  190.00,False,False,"available"),
        ("A011",3,"Jacket", "Bogner",   "Designer ski jacket",      "L",    "Adult Male",  280.00,False,False,"available"),
        ("A011",4,"Pants",  "Bogner",   "Designer ski pants",       "L",    "Adult Male",  240.00,False,False,"available"),
        ("A011",5,"Helmet", "Dainese",  "Carbon helmet L",          "L",    "Adult Male",  180.00,False,False,"available"),

        # A012 – Ragnhild Thorsen (6 items: 2 sold, 4 available)
        ("A012",1,"Skis",   "Line",     "Blade Optic 96",           "179cm","Adult Male",  275.00,True, False,"sold"),
        ("A012",2,"Boots",  "Full Tilt","Descendant 8 mondo 27",    "27",   "Adult Male",  125.00,True, False,"sold"),
        ("A012",3,"Poles",  "Black Crows","Cork grip poles",        "120cm","Adult",        38.00,True, False,"available"),
        ("A012",4,"Jacket", "Norrona",  "Lofoten Gore-Tex",         "M",    "Adult Male",  360.00,False,False,"available"),
        ("A012",5,"Pants",  "Norrona",  "Lofoten Gore-Tex pants",   "M",    "Adult Male",  320.00,False,False,"available"),
        ("A012",6,"Helmet", "Sweet Protection","Switcher MIPS",     "M/L",  "Adult Male",  140.00,False,False,"available"),

        # V001 – Nordic Ski Shop (8 new vendor items: 3 sold, 5 available)
        ("V001",1,"Skis",   "Rossignol","Experience 86 Ti 176cm",   "176cm","Adult",       399.00,False,False,"sold"),
        ("V001",2,"Skis",   "Rossignol","Experience 78 CA 168cm",   "168cm","Adult",       299.00,False,False,"available"),
        ("V001",3,"Boots",  "Salomon",  "X Pro 100 mondo 27",       "27",   "Adult Male",  249.00,False,False,"sold"),
        ("V001",4,"Boots",  "Salomon",  "X Access 80 W mondo 24",   "24",   "Adult Female",199.00,False,False,"available"),
        ("V001",5,"Helmet", "Smith",    "Vantage MIPS new",         "M",    "Adult",       199.00,False,False,"sold"),
        ("V001",6,"Goggles","Smith",    "4D MAG ChromaPop new",     "One",  "Adult",       249.00,False,False,"available"),
        ("V001",7,"Gloves", "Hestra",   "Fall Line 3-finger new",   "8",    "Adult",        89.00,False,False,"available"),
        ("V001",8,"Jacket", "Patagonia","PowSlayer GTX new",        "M",    "Adult Male",  549.00,False,False,"available"),

        # V002 – Summit Outfitters (6 new vendor items: 2 sold, 4 available)
        ("V002",1,"Skis",   "Blizzard", "Brahma 88 180cm new",      "180cm","Adult Male",  699.00,False,False,"sold"),
        ("V002",2,"Boots",  "Tecnica",  "Mach1 HV 110 new",         "27",   "Adult Male",  399.00,False,False,"available"),
        ("V002",3,"Helmet", "POC",      "Obex BC MIPS new",         "M/L",  "Adult",       299.00,False,False,"available"),
        ("V002",4,"Poles",  "Leki",     "Spitfire 3D Speed new",    "120cm","Adult",       149.00,False,False,"sold"),
        ("V002",5,"Pants",  "Kjus",     "Formula Pants new",        "M",    "Adult Male",  399.00,False,False,"available"),
        ("V002",6,"Jacket", "Kjus",     "Formula Jacket new",       "M",    "Adult Male",  499.00,False,False,"available"),

        # V003 – Powder House Sports (5 new vendor items: 1 sold, 4 available)
        ("V003",1,"Boots",  "Scarpa",   "Maestrale RS new",         "27",   "Adult Male",  549.00,False,False,"sold"),
        ("V003",2,"Skis",   "Dynafit",  "Blacklight 88 new",        "178cm","Adult",       699.00,False,False,"available"),
        ("V003",3,"Boots",  "Dynafit",  "Speed W womens new",       "24",   "Adult Female",449.00,False,False,"available"),
        ("V003",4,"Jacket", "Ortovox",  "3L Merino Shell new",      "M",    "Adult Male",  399.00,False,False,"available"),
        ("V003",5,"Helmet", "Mammut",   "Crag Sender MIPS new",     "M/L",  "Adult",       199.00,False,False,"available"),
    ]

    items_by_code: dict[str, Item] = {}
    item_seller_code: dict[str, str] = {}  # code -> seller_code for sales lookup
    for (seller_code, seq, category, brand, description, size, gender_age,
         price, used, donate_unsold, status) in ITEMS:
        code = f"{seller_code}-{seq}"
        existing = db.query(Item).filter(Item.code == code).first()
        if existing:
            skipped["items"] += 1
            items_by_code[code] = existing
            item_seller_code[code] = seller_code
            continue
        seller = sellers_by_code[seller_code]
        intake = intakes_by_seller_code[seller_code]
        item = Item(
            intake_id=intake.id,
            seller_id=seller.id,
            code=code,
            barcode_39=code,
            category=category,
            brand=brand,
            description=description,
            size=size,
            gender_age=gender_age,
            price=price,
            quantity=1,
            used=used,
            donate_unsold=donate_unsold,
            status=status,
            label_printed=True,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        created["items"] += 1
        items_by_code[code] = item
        item_seller_code[code] = seller_code
    print(f"  Items: {created['items']} created, {skipped['items']} skipped")

    # ── 6. Sales ─────────────────────────────────────────────────────────────
    def _commission(price: float, qty: float, donate_proceeds: bool) -> tuple[float, float]:
        """Return (mysl_share, seller_share) matching checkout.py logic."""
        extended = round(price * qty, 2)
        if donate_proceeds:
            return extended, 0.0
        mysl = round(extended * COMMISSION_RATE, 2)
        return mysl, round(extended - mysl, 2)

    seed_sale_exists = db.query(Sale).filter(
        Sale.event_id == event.id,
        Sale.created_by == "seed_demo",
    ).first()

    if seed_sale_exists:
        n = db.query(Sale).filter(
            Sale.event_id == event.id, Sale.created_by == "seed_demo"
        ).count()
        skipped["sales"] = n
        print(f"  Sales: 0 created, {n} skipped (already seeded)")
    else:
        # (date_str, customer_name, customer_email, [item_codes], cash, check_number, cc)
        SALES = [
            ("2026-10-04", "Mike Thompson",   "mike.t@example.com",
             ["A001-1", "A001-2", "A001-3"],        340.00, None,    0.0),

            ("2026-10-04", "Sarah Williams",  None,
             ["A002-1", "A002-2"],                    0.0,  None,  270.00),

            ("2026-10-04", "David Chen",      "david.c@example.com",
             ["A003-1", "A003-2"],                    0.0,  "1042",  0.0),

            ("2026-10-04", "Emily Johnson",   None,
             ["A004-1"],                            160.00, None,    0.0),

            ("2026-10-05", "James Murphy",    "james.m@example.com",
             ["A005-1", "A005-2"],                  380.00, None,    0.0),

            ("2026-10-05", "Anna Kowalski",   None,
             ["A008-1", "A008-2"],                    0.0,  None,  310.00),

            ("2026-10-05", "Robert Nelson",   "robert.n@example.com",
             ["A009-1", "A011-1", "A012-1", "A012-2"], 0.0, None, 905.00),

            ("2026-10-05", "Linda Park",      None,
             ["V001-1", "V001-3", "V001-5", "V002-1", "V002-4"],
                                                       0.0,  None, 1895.00),

            ("2026-10-05", "Chris Rasmussen", "chris.r@example.com",
             ["A007-1"],                             55.00, None,    0.0),

            ("2026-10-05", None, None,
             ["V003-1"],                            549.00, None,    0.0),
        ]

        for (sale_date_str, cust_name, cust_email,
             item_codes, cash, check_num, cc) in SALES:
            # For check payments, amount = sum of item prices
            check_amt = (
                round(sum(items_by_code[c].price for c in item_codes), 2)
                if check_num else 0.0
            )

            sale = Sale(
                event_id=event.id,
                # date_of_sale is a DateTime column — must be a datetime, not a
                # date. Passing date(...) made SQLite store the bare year (2026)
                # as an integer, which crashes SQLAlchemy's datetime parser on
                # read-back. datetime.fromisoformat('YYYY-MM-DD') → midnight datetime.
                date_of_sale=datetime.fromisoformat(sale_date_str),
                customer_name=cust_name,
                customer_email=cust_email,
                cash_amount=cash,
                check_amount=check_amt,
                check_number=check_num,
                cc_amount=cc,
                is_voided=False,
                created_by="seed_demo",
            )
            db.add(sale)
            db.flush()  # get sale.id without full commit

            sale_total = mysl_total = seller_total = 0.0
            for ln, code in enumerate(item_codes, start=1):
                item = items_by_code[code]
                sc   = item_seller_code[code]
                intake = intakes_by_seller_code[sc]
                ext = round(item.price * item.quantity, 2)
                mysl_s, seller_s = _commission(item.price, item.quantity, intake.donate_proceeds)
                db.add(SaleItem(
                    sale_id=sale.id,
                    item_id=item.id,
                    line_number=ln,
                    quantity=item.quantity,
                    sell_price=item.price,
                    extended_price=ext,
                ))
                sale_total   += ext
                mysl_total   += mysl_s
                seller_total += seller_s

            sale.sale_total   = round(sale_total, 2)
            sale.mysl_total   = round(mysl_total, 2)
            sale.seller_total = round(seller_total, 2)
            sale.total_paid   = round(cash + check_amt + cc, 2)
            sale.balance_due  = round(sale.sale_total - sale.total_paid, 2)
            db.commit()
            created["sales"] += 1

        print(f"  Sales: {created['sales']} created, 0 skipped")

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n── Seed complete ───────────────────────────────────────────────")
    for key in ("events", "users", "sellers", "intakes", "items", "sales"):
        print(f"  {key:<10}  created: {created[key]:>3}   skipped: {skipped[key]:>3}")
    print()
    print("  Login credentials:")
    print("    admin    / admin123   (admin)")
    print("    intake1  / intake123  (intake volunteer)")
    print("    cashier1 / cashier123 (cashier)")
    print()
    print("  Active event : Ski Swap 2026  (30% commission)")
    print("  Sellers      : 12 individual + 3 vendor")
    print("  Items        : mix of available / sold / donated / returned")
    print("  Sales        : 10 transactions across 2 days (Oct 4–5)")
    print("──────────────────────────────────────────────────────────────────")

finally:
    db.close()
