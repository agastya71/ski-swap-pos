from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SellerCreate(BaseModel):
    code: str
    first_name: str
    last_name: str
    company: Optional[str] = None
    is_vendor: bool = False
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None


class SellerUpdate(BaseModel):
    code: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    is_vendor: Optional[bool] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None


class SellerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    code: str
    first_name: str
    last_name: str
    company: Optional[str] = None
    is_vendor: bool
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    created_at: datetime
