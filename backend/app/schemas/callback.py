from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


class CallbackCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: str = Field(pattern=r"^\+[1-9][0-9]{9,14}$", min_length=11, max_length=16)
    consent: Literal[True]
    idempotency_key: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ]


class CallbackReceipt(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: Literal["received"] = "received"


class CallbackOut(CallbackReceipt):
    phone: str
    created_at: datetime
