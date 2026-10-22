"""Сценарии навигатора: дерево узлов по трём аудиториям + редактируемые настройки."""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Audience(enum.StrEnum):
    parents = "parents"  # родители и близкие
    specialists = "specialists"  # специалисты и педагоги
    self = "self"  # сами люди с ментальными особенностями


class NodeKind(enum.StrEnum):
    menu = "menu"  # показывает дочерние узлы как кнопки
    answer = "answer"  # конечный ответ (текст/картинка/аудио)
    consult = "consult"  # переход к записи на консультацию
    donate = "donate"  # сообщение + ссылка на пожертвование
    volunteer = "volunteer"  # «Стать волонтёром»
    link = "link"  # произвольная внешняя ссылка


class ScenarioNode(Base):
    __tablename__ = "scenario_nodes"

    id: Mapped[int] = mapped_column(primary_key=True)
    audience: Mapped[Audience] = mapped_column(Enum(Audience, name="audience"), index=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("scenario_nodes.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[NodeKind] = mapped_column(Enum(NodeKind, name="node_kind"), default=NodeKind.menu)
    title: Mapped[str] = mapped_column(String(120))  # подпись кнопки
    body: Mapped[str | None] = mapped_column(Text)  # текст ответа / сообщения
    image_url: Mapped[str | None] = mapped_column(String(500))  # пиктограмма
    audio_url: Mapped[str | None] = mapped_column(String(500))  # озвучка
    link_url: Mapped[str | None] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    children: Mapped[list["ScenarioNode"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="ScenarioNode.position",
    )
    parent: Mapped["ScenarioNode | None"] = relationship(
        back_populates="children", remote_side=[id]
    )


class Setting(Base):
    """Ключ-значение: тексты, контакты, ссылки, флаг открытой записи."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str | None] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
