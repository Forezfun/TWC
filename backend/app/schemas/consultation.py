from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import Audience, RequestStatus


class SlotCreate(BaseModel):
    starts_at: datetime
    ends_at: datetime
    is_open: bool = True


class SlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    starts_at: datetime
    ends_at: datetime
    is_open: bool
    is_booked: bool = False


class RequestCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    contact: str = Field(min_length=3, max_length=200)
    audience: Audience | None = None
    comment: str | None = None
    preferred_time: str | None = Field(default=None, max_length=200)
    slot_id: int | None = None


class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    contact: str
    audience: Audience | None
    comment: str | None
    preferred_time: str | None
    slot_id: int | None
    slot: SlotOut | None = None
    status: RequestStatus
    created_at: datetime
    updated_at: datetime


class RequestStatusUpdate(BaseModel):
    status: RequestStatus
