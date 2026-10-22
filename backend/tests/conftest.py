"""Тесты ходят в отдельную базу twc_test на локальном Postgres.

Схема создаётся один раз на сессию, таблицы очищаются перед каждым тестом.
"""

import os
from collections.abc import AsyncIterator

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://twc:twc@127.0.0.1:5432/twc_test"
)
os.environ["JWT_SECRET"] = "test-secret"

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.auth import hash_password  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import AdminUser  # noqa: E402

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "secret-123"


@pytest.fixture(scope="session", autouse=True)
async def _schema() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean() -> None:
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def admin_user() -> AdminUser:
    async with SessionLocal() as session:
        user = AdminUser(
            email=ADMIN_EMAIL, name="Тест", password_hash=hash_password(ADMIN_PASSWORD)
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


@pytest.fixture
async def admin(client: AsyncClient, admin_user: AdminUser) -> AsyncClient:
    """Клиент, вошедший в админку."""
    r = await client.post(
        "/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    assert r.status_code == 200, r.text
    client.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return client
