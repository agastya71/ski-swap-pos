from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller
from app.schemas.sale import SaleCreate


def compute_commission(
    item_price: float, donate_proceeds: bool, commission_rate: float
) -> tuple[float, float]:
    """Return (mysl_share, seller_share) rounded to 2 decimal places."""
    if donate_proceeds:
        return round(item_price, 2), 0.0
    mysl = round(item_price * commission_rate, 2)
    return mysl, round(item_price - mysl, 2)


def create_sale_atomic(
    db: Session, payload: SaleCreate, event: Event, username: str
) -> Sale:
    """Create a sale with all line items in a single transaction."""
    # Dedup check
    item_ids = [line.item_id for line in payload.items]
    if len(item_ids) != len(set(item_ids)):
        raise HTTPException(status_code=422, detail="Duplicate item_id in request")

    # Validate all items upfront before any mutations
    items_and_intakes: list[tuple] = []
    for line in payload.items:
        item = (
            db.query(Item)
            .join(Intake)
            .join(Seller)
            .filter(Item.id == line.item_id, Seller.event_id == event.id)
            .first()
        )
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {line.item_id} not found")
        if item.status != "available":
            raise HTTPException(
                status_code=422, detail=f"Item {item.code} is not available"
            )
        intake = db.query(Intake).filter(Intake.id == item.intake_id).first()
        items_and_intakes.append((line, item, intake))

    # Create sale row
    sale = Sale(
        event_id=event.id,
        date_of_sale=date.today(),
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        notes=payload.notes,
        cash_amount=payload.cash_amount,
        check_amount=payload.check_amount,
        check_number=payload.check_number,
        cc_amount=payload.cc_amount,
        created_by=username,
    )
    db.add(sale)
    db.flush()  # get sale.id without committing

    # Create sale_item rows, mark items sold, accumulate totals
    sale_total = 0.0
    mysl_total = 0.0
    seller_total = 0.0

    for line_number, (line, item, intake) in enumerate(items_and_intakes, start=1):
        sell_price = line.sell_price if line.sell_price is not None else item.price
        extended_price = round(sell_price * item.quantity, 2)
        mysl_share, seller_share = compute_commission(
            extended_price, intake.donate_proceeds, event.commission_rate
        )
        db.add(SaleItem(
            sale_id=sale.id,
            item_id=item.id,
            line_number=line_number,
            quantity=item.quantity,
            sell_price=sell_price,
            extended_price=extended_price,
            notes=line.notes,
            created_by=username,
        ))
        item.status = "sold"
        sale_total += extended_price
        mysl_total += mysl_share
        seller_total += seller_share

    sale.sale_total = round(sale_total, 2)
    sale.mysl_total = round(mysl_total, 2)
    sale.seller_total = round(seller_total, 2)
    sale.total_paid = round(
        payload.cash_amount + payload.check_amount + payload.cc_amount, 2
    )
    sale.balance_due = round(sale.sale_total - sale.total_paid, 2)

    db.commit()
    db.refresh(sale)
    return sale
