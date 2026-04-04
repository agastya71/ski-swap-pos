import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class IntakeCreate(BaseModel):
    seller_id: int
    date_entered: Optional[datetime.date] = None
    date_received: Optional[datetime.date] = None
    donate_unsold: bool = False
    donate_proceeds: bool = False


class IntakeUpdate(BaseModel):
    date_received: Optional[datetime.date] = None
    donate_unsold: Optional[bool] = None
    donate_proceeds: Optional[bool] = None


class IntakeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    seller_id: int
    date_entered: datetime.date
    date_received: Optional[datetime.date] = None
    donate_unsold: bool
    donate_proceeds: bool
    total: float
    mysl_total: float
    seller_total: float
    created_at: datetime.datetime


from app.schemas.item import ItemResponse


class IntakeWithItemsResponse(IntakeResponse):
    items: list[ItemResponse] = []
