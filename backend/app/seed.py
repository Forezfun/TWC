"""Стартовое наполнение: три ветки из ответов НКО (12.10.2026) и базовые настройки.

Запуск: uv run python -m app.seed   (повторный запуск ничего не дублирует)
"""

import asyncio

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Audience, NodeKind, ScenarioNode, Setting

TREE: dict[Audience, list[str]] = {
    Audience.parents: [
        "Обучение и образование",
        "Поведение и общение",
        "Медицинская помощь и поиск специалистов",
        "Социальные льготы и поддержка",
        "Усталость, тревога и эмоциональное состояние близких",
    ],
    Audience.specialists: [
        "Методики работы с людьми с ментальными особенностями",
        "Адаптация занятий и учебных материалов",
        "Поддержка общения и самостоятельности",
    ],
    Audience.self: [
        "Повседневные навыки и самостоятельная жизнь",
        "Общение и обращение за помощью",
        "Бытовая и личная безопасность",
    ],
}

COMMON_ACTIONS = [
    (NodeKind.consult, "Записаться на консультацию", None),
    (NodeKind.volunteer, "Стать волонтёром", None),
    (NodeKind.donate, "Поддержать «Колибри»", "https://anokolibri.ru/donate"),
]

SETTINGS = {
    "registration_open": ("true", "Открыта ли запись на консультацию"),
    "donate_url": ("https://anokolibri.ru/donate", "Страница пожертвований"),
    "donate_message": (
        "Спасибо, что хотите поддержать «Колибри»! Ваша помощь позволяет нам развивать "
        "программы для людей с ментальными особенностями и их семей",
        "Сообщение перед переходом на пожертвование",
    ),
    "coordinator_contact": ("", "Контакт координатора для связи"),
    "welcome_text": (
        "Здравствуйте! Я помогу найти нужную информацию. Для кого вы ищете помощь?",
        "Приветствие на главном экране",
    ),
}


async def main() -> None:
    async with SessionLocal() as session:
        existing = await session.scalar(select(ScenarioNode.id).limit(1))
        if existing is None:
            for audience, topics in TREE.items():
                for i, title in enumerate(topics):
                    session.add(
                        ScenarioNode(audience=audience, kind=NodeKind.menu, title=title, position=i)
                    )
                for j, (kind, title, url) in enumerate(COMMON_ACTIONS, start=len(topics)):
                    session.add(
                        ScenarioNode(
                            audience=audience, kind=kind, title=title, link_url=url, position=j
                        )
                    )
        for key, (value, desc) in SETTINGS.items():
            if await session.get(Setting, key) is None:
                session.add(Setting(key=key, value=value, description=desc))
        await session.commit()
    print("seed: ok")


if __name__ == "__main__":
    asyncio.run(main())
