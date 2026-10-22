"""Запись на консультацию: слоты календаря и заявки."""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.content import Audience


class RequestStatus(enum.StrEnum):
    new = "new"
    confirmed = "confirmed"
    done = "done"
    cancelled = "cancelled"


class ConsultationSlot(Base):
    __tablename__ = "consultation_slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)

    request: Mapped["ConsultationRequest | None"] = relationship(back_populates="slot")


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
    name: Mapped[str] = mapped_column(String(120))
    contact: Mapped[str] = mapped_column(String(200))  # телефон / telegram / email
    audience: Mapped[Audience | None] = mapped_column(Enum(Audience, name="audience"))
    comment: Mapped[str | None] = mapped_column(Text)
    preferred_time: Mapped[str | None] = mapped_column(String(200))  # если слот не выбран
    slot_id: Mapped[int | None] = mapped_column(
        ForeignKey("consultation_slots.id", ondelete="SET NULL")
    )
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus, name="request_status"), default=RequestStatus.new, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    slot: Mapped[ConsultationSlot | None] = relationship(back_populates="request")
