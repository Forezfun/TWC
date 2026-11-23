import base64
import binascii
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.models import RequestStatus

VoiceField = Literal["name", "contact", "preferred_time", "comment"]


class VoiceAnswerInput(BaseModel):
    mime_type: Literal["audio/webm", "audio/ogg", "audio/mp4"]
    data_base64: str = Field(min_length=4, max_length=4 * ((1024 * 1024 + 2) // 3))

    @field_validator("data_base64")
    @classmethod
    def valid_audio(cls, value: str, info) -> str:
        try:
            data = base64.b64decode(value, validate=True)
        except (ValueError, binascii.Error) as error:
            raise ValueError("Неверный формат аудиоответа") from error
        mime = info.data.get("mime_type")
        valid_header = (
            data.startswith(b"\x1a\x45\xdf\xa3")
            if mime == "audio/webm"
            else data.startswith(b"OggS")
            if mime == "audio/ogg"
            else data[4:8] == b"ftyp"
        )
        if not valid_header or len(data) > 1024 * 1024:
            raise ValueError("Неверный или слишком большой аудиоответ")
        return value


class SlotCreate(BaseModel):
    starts_at: datetime
    ends_at: datetime
    is_open: bool = True
    specialist_id: int | None = None


class SlotAssignment(BaseModel):
    specialist_id: int


class SlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    starts_at: datetime
    ends_at: datetime
    is_open: bool
    is_booked: bool = False
    specialist_id: int | None = None
    specialist_name: str | None = None


class RequestCreate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    contact: str = Field(min_length=3, max_length=200)
    audience: str | None = Field(default=None, max_length=48)
    comment: str | None = None
    preferred_time: str | None = Field(default=None, max_length=200)
    slot_id: int | None = None
    voice_answers: dict[VoiceField, VoiceAnswerInput] = Field(default_factory=dict)


class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str | None = None
    contact: str
    audience: str | None
    comment: str | None
    closure_reason: str | None = None
    preferred_time: str | None
    slot_id: int | None
    slot: SlotOut | None = None
    status: RequestStatus
    specialist_id: int | None = None
    specialist_name: str | None = None
    created_at: datetime
    updated_at: datetime
    voice_fields: list[VoiceField] = Field(default_factory=list)


class AppointmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    starts_at: AwareDatetime
    specialist_id: int = Field(gt=0)


class RequestEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contact: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
    audience: Literal["self", "parents", "specialists"]
    comment: str | None = None
    expected_updated_at: datetime
    appointment: AppointmentInput


class RequestUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: RequestStatus | None = None
    specialist_id: int | None = None
    take: bool = False
    action: (
        Literal["clarify", "accept", "complete", "no_consultation", "cancel", "restore"] | None
    ) = None
    details: RequestEdit | None = None


class RequestEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    status: RequestStatus
    actor_id: int | None
    actor_name: str | None
    specialist_name: str | None
    changes: list[dict[str, str | None]] | None = None
    occurred_at: datetime
