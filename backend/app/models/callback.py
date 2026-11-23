"""Просьбы перезвонить: номер и явное согласие на его передачу."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CallbackRequest(Base):
    __tablename__ = "callback_requests"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_callback_requests_idempotency_key"),
        UniqueConstraint("request_id", name="uq_callback_requests_request_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("consultation_requests.id", ondelete="CASCADE")
    )
    phone: Mapped[str] = mapped_column(String(16))
    consent: Mapped[bool] = mapped_column(Boolean)
    idempotency_key: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
