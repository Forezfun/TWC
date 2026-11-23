from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class InstructionTopic(Base):
    __tablename__ = "instruction_topics"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(80))
    title_key: Mapped[str] = mapped_column(String(160), unique=True)
    description: Mapped[str] = mapped_column(String(160))


class Instruction(Base):
    __tablename__ = "instructions"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(500))
    title_audio_url: Mapped[str | None] = mapped_column(String(2048))
    description_audio_url: Mapped[str | None] = mapped_column(String(2048))
    audience: Mapped[str] = mapped_column(String(48), index=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("instruction_topics.id"), index=True)
    is_published: Mapped[bool] = mapped_column(Boolean)
    start_step_id: Mapped[str | None] = mapped_column(String(100))
    steps: Mapped[list[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class InstructionMedia(Base):
    __tablename__ = "instruction_media"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    media_type: Mapped[str] = mapped_column(String(40))
    content: Mapped[bytes] = mapped_column(LargeBinary)
