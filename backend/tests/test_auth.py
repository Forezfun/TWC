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


async def test_archiving_and_restoring_employee(admin: AsyncClient, admin_user: AdminUser) -> None:
    credentials = {"email": "archive@example.com", "password": "password-1"}
    other = await admin.post("/api/admin/users", json={**credentials, "name": "Сотрудник"})
    assert other.status_code == 201
    user_id = other.json()["id"]
    path = f"/api/admin/users/{user_id}"
    token = (await admin.post("/api/admin/login", json=credentials)).json()["token"]
    staff_session = {"Authorization": f"Bearer {token}"}

    archived = await admin.patch(path + "/archive", params={"archived": "true"})
    assert archived.status_code == 200
    assert archived.json()["is_archived"] is True
    assert archived.json()["is_active"] is False
    assert user_id not in {user["id"] for user in (await admin.get("/api/admin/users")).json()}
    archive = await admin.get("/api/admin/users", params={"archived": "true"})
    assert [user["id"] for user in archive.json()] == [user_id]
    assert (await admin.get("/api/admin/me", headers=staff_session)).status_code == 401
    assert (await admin.post("/api/admin/login", json=credentials)).status_code == 401
    assert (await admin.patch(path + "/active", params={"active": "true"})).status_code == 409

    restored = await admin.patch(path + "/archive", params={"archived": "false"})
    assert restored.status_code == 200
    assert restored.json()["is_archived"] is False
    assert restored.json()["is_active"] is True
    assert (await admin.get("/api/admin/users?archived=true")).json() == []
    assert (await admin.post("/api/admin/login", json=credentials)).status_code == 200

    own = await admin.patch(
        f"/api/admin/users/{admin_user.id}/archive", params={"archived": "true"}
    )
    assert own.status_code == 400
