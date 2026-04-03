from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from app.models.user import User
from app.schemas.item import ItemResponse, ItemUpdate

router = APIRouter(prefix="/items", tags=["items"])

_INTAKE_ADMIN = require_roles("admin", "intake")


def _item_for_active_event(item_id: int, db: Session) -> Item:
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    item = (
        db.query(Item)
        .join(Intake)
        .join(Seller)
        .filter(Item.id == item_id, Seller.event_id == event.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    return _item_for_active_event(item_id, db)


@router.patch("/{item_id}", response_model=ItemResponse)
def update_item(
    item_id: int,
    body: ItemUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    item = _item_for_active_event(item_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    item = _item_for_active_event(item_id, db)
    if item.label_printed:
        raise HTTPException(status_code=409, detail="Cannot delete item after label has been printed")
    db.delete(item)
    db.commit()
    return Response(status_code=204)
