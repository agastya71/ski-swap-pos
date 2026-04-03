import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.schemas.intake import IntakeResponse


class ItemCreate(BaseModel):
    code: str
    category: Optional[str] = None
    brand: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    uom: Optional[str] = None
    gender_age: Optional[str] = None
    year: Optional[int] = None
    used: bool = True
    price: float
    quantity: float = 1.0
    barcode_39: Optional[str] = None
    label_line_2: Optional[str] = None
    label_line_3: Optional[str] = None
    donate_unsold: bool = False
    vendor_item_id: Optional[str] = None


class ItemUpdate(BaseModel):
    category: Optional[str] = None
    brand: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    uom: Optional[str] = None
    gender_age: Optional[str] = None
    year: Optional[int] = None
    used: Optional[bool] = None
    price: Optional[float] = None
    quantity: Optional[float] = None
    barcode_39: Optional[str] = None
    label_line_2: Optional[str] = None
    label_line_3: Optional[str] = None
    donate_unsold: Optional[bool] = None
    vendor_item_id: Optional[str] = None


class ItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    intake_id: int
    seller_id: int
    code: str
    category: Optional[str] = None
    brand: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    uom: Optional[str] = None
    gender_age: Optional[str] = None
    year: Optional[int] = None
    used: bool
    price: float
    quantity: float
    barcode_39: Optional[str] = None
    label_line_2: Optional[str] = None
    label_line_3: Optional[str] = None
    donate_unsold: bool
    status: str
    label_printed: bool
    vendor_item_id: Optional[str] = None
    created_at: datetime.datetime


class IntakeWithItemsResponse(IntakeResponse):
    items: list[ItemResponse] = []
