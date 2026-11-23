"""Запись на консультацию: слоты календаря и заявки."""

import enum
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    and_,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.admin import AdminUser

NO_CONSULTATION_REASON = "Клиенту не нужна консультация"


class RequestStatus(enum.StrEnum):
    new = "new"
    clarifying = "clarifying"
    matched = "matched"
    confirmed = "confirmed"
    done = "done"
    cancelled = "cancelled"


class ConsultationSlot(Base):
    __tablename__ = "consultation_slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    specialist_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id"))
    specialist: Mapped[AdminUser | None] = relationship()

    @property
    def specialist_name(self) -> str | None:
        return (self.specialist.name or "Сотрудник") if self.specialist else None

    request: Mapped["ConsultationRequest | None"] = relationship(
        primaryjoin=lambda: and_(
            ConsultationSlot.id == ConsultationRequest.slot_id,
            ConsultationRequest.status != RequestStatus.cancelled,
        ),
        viewonly=True,
    )


class ConsultationRequest(Base):
    __tablename__ = "consultation_requests"
    __table_args__ = (
        # Слот может держать только одна активная заявка; отменённые его освобождают
        Index(
            "uq_consultation_requests_active_slot",
            "slot_id",
            unique=True,
            postgresql_where=text("status <> 'cancelled'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str | None] = mapped_column(String(120))
    contact: Mapped[str] = mapped_column(String(200))  # телефон / telegram / email
    audience: Mapped[str | None] = mapped_column(String(48))
    comment: Mapped[str | None] = mapped_column(Text)
    closure_reason: Mapped[str | None] = mapped_column(Text)
    preferred_time: Mapped[str | None] = mapped_column(String(200))  # если слот не выбран
    voice_fields: Mapped[list[str]] = mapped_column(JSON, default=list, server_default=text("'[]'"))
    voice_answers: Mapped[dict | None] = mapped_column(JSON, deferred=True)
    slot_id: Mapped[int | None] = mapped_column(
        ForeignKey("consultation_slots.id", ondelete="SET NULL")
    )
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus, name="request_status"), default=RequestStatus.new, index=True
    )
    specialist_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    slot: Mapped[ConsultationSlot | None] = relationship()
    specialist: Mapped[AdminUser | None] = relationship()

    @property
    def specialist_name(self) -> str | None:
        return (self.specialist.name or "Сотрудник") if self.specialist else None


class RequestEvent(Base):
    __tablename__ = "request_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("consultation_requests.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(12))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id", ondelete="SET NULL"))
    actor_name: Mapped[str | None] = mapped_column(String(200))
    specialist_name: Mapped[str | None] = mapped_column(String(200))
    changes: Mapped[list[dict] | None] = mapped_column(JSON)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
