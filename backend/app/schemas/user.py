from typing import Literal

from pydantic import BaseModel, ConfigDict


class UserCreate(BaseModel):
    username: str
    password: str
    role: Literal["admin", "intake", "cashier"]


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    username: str
    role: str
    is_active: bool
