from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EventCreate(BaseModel):
    name: str
    year: int
    commission_rate: float = 0.30


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    year: int
    commission_rate: float
    is_active: bool
    created_at: datetime
