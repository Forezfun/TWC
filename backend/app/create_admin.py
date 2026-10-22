"""Создать первого сотрудника админки.

Запуск: uv run python -m app.create_admin admin@anokolibri.ru "Имя"
Пароль спрашивается в терминале (или берётся из ADMIN_PASSWORD для скриптов).
"""

import asyncio
import getpass
import os
import sys

from sqlalchemy import select

from app.auth import hash_password
from app.db import SessionLocal
from app.models import AdminUser


async def main(email: str, name: str, password: str) -> None:
    async with SessionLocal() as session:
        existing = await session.scalar(select(AdminUser).where(AdminUser.email == email))
        if existing:
            existing.password_hash = hash_password(password)
            existing.is_active = True
            print(f"пароль обновлён: {email}")
        else:
            session.add(AdminUser(email=email, name=name, password_hash=hash_password(password)))
            print(f"создан: {email}")
        await session.commit()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("использование: python -m app.create_admin EMAIL [ИМЯ]")
    email = sys.argv[1].lower()
    name = sys.argv[2] if len(sys.argv) > 2 else ""
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Пароль (мин. 8 символов): ")
    if len(password) < 8:
        sys.exit("пароль короче 8 символов")
    asyncio.run(main(email, name, password))
