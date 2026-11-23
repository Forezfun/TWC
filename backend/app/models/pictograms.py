from sqlalchemy import JSON, ForeignKey, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PictogramSet(Base):
    __tablename__ = "pictogram_sets"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    title_key: Mapped[str] = mapped_column(String(64), unique=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    pictograms: Mapped[list[dict]] = mapped_column(JSON)


class PictogramImage(Base):
    __tablename__ = "pictogram_images"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    set_id: Mapped[str] = mapped_column(ForeignKey("pictogram_sets.id", ondelete="CASCADE"))
    media_type: Mapped[str] = mapped_column(String(20))
    content: Mapped[bytes] = mapped_column(LargeBinary)


class PictogramSelection(Base):
    __tablename__ = "pictogram_selection"

    id: Mapped[int] = mapped_column(primary_key=True)
    set_id: Mapped[str] = mapped_column(String(50))
    pictogram_ids: Mapped[list[str]] = mapped_column(JSON)
