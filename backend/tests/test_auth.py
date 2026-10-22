from httpx import AsyncClient

from app.auth import issue_token
from app.models import AdminUser
from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD


async def test_login_and_me(client: AsyncClient, admin_user: AdminUser) -> None:
    r = await client.post(
        "/api/admin/login", json={"email": ADMIN_EMAIL.upper(), "password": ADMIN_PASSWORD}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["email"] == ADMIN_EMAIL and "token" in body

    r = await client.get("/api/admin/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert r.status_code == 200 and r.json()["id"] == admin_user.id


async def test_login_rejects_bad_password_and_unknown_email(
    client: AsyncClient, admin_user: AdminUser
) -> None:
    r = await client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": "nope"})
    assert r.status_code == 401
    r = await client.post(
        "/api/admin/login", json={"email": "ghost@example.com", "password": ADMIN_PASSWORD}
    )
    assert r.status_code == 401
    r = await client.post("/api/admin/login", json={"email": "not-an-email", "password": "x"})
    assert r.status_code == 422


async def test_token_for_missing_or_inactive_user_is_rejected(
    admin: AsyncClient, admin_user: AdminUser
) -> None:
    ghost = issue_token(9999)
    r = await admin.get("/api/admin/me", headers={"Authorization": f"Bearer {ghost}"})
    assert r.status_code == 401

    other = (
        await admin.post(
            "/api/admin/users", json={"email": "b@example.com", "password": "password-1"}
        )
    ).json()
    r = await admin.patch(f"/api/admin/users/{other['id']}/active", params={"active": "false"})
    assert r.status_code == 200 and r.json()["is_active"] is False
    r = await admin.post(
        "/api/admin/login", json={"email": "b@example.com", "password": "password-1"}
    )
    assert r.status_code == 401

    r = await admin.patch(f"/api/admin/users/{admin_user.id}/active", params={"active": "false"})
    assert r.status_code == 400


async def test_create_user_and_change_password(admin: AsyncClient) -> None:
    r = await admin.post(
        "/api/admin/users",
        json={"email": "New@Example.com", "name": "Новый", "password": "password-1"},
    )
    assert r.status_code == 201 and r.json()["email"] == "new@example.com"
    r = await admin.post(
        "/api/admin/users", json={"email": "new@example.com", "password": "password-1"}
    )
    assert r.status_code == 409
    r = await admin.post("/api/admin/users", json={"email": "x@example.com", "password": "short"})
    assert r.status_code == 422
    assert len((await admin.get("/api/admin/users")).json()) == 2

    r = await admin.post(
        "/api/admin/me/password", json={"current_password": "wrong", "new_password": "new-password"}
    )
    assert r.status_code == 400
    r = await admin.post(
        "/api/admin/me/password",
        json={"current_password": ADMIN_PASSWORD, "new_password": "new-password"},
    )
    assert r.status_code == 204
    r = await admin.post(
        "/api/admin/login", json={"email": ADMIN_EMAIL, "password": "new-password"}
    )
    assert r.status_code == 200
