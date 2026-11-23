import asyncio

from httpx import AsyncClient

CALLBACK = {"phone": "+79990000001", "consent": True, "idempotency_key": "callback-test"}


async def test_callback_needs_no_account_and_list_is_private(client: AsyncClient) -> None:
    response = await client.post("/api/callback-requests", json=CALLBACK)
    assert response.status_code == 201, response.text
    assert response.json() == {"id": 1, "status": "received"}
    assert (await client.get("/api/admin/requests")).status_code == 401


async def test_callback_is_visible_to_staff_without_private_key(admin: AsyncClient) -> None:
    for index in range(2):
        assert (
            await admin.post(
                "/api/callback-requests", json=CALLBACK | {"idempotency_key": f"callback-{index}"}
            )
        ).status_code == 201
    response = await admin.get("/api/admin/requests")
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    rows = response.json()
    assert [row["id"] for row in rows] == [2, 1]
    assert rows[0]["contact"] == CALLBACK["phone"]
    assert rows[0]["status"] == "new"
    assert all(rows[0][field] is None for field in ("name", "audience", "slot", "comment"))
    assert rows[0]["created_at"]
    assert "idempotency_key" not in response.text


async def test_simultaneous_retries_create_one_callback(admin: AsyncClient) -> None:
    responses = await asyncio.gather(
        *[admin.post("/api/callback-requests", json=CALLBACK) for _ in range(4)]
    )
    assert sorted(response.status_code for response in responses) == [200, 200, 200, 201]
    assert {response.json()["id"] for response in responses} == {1}
    assert len((await admin.get("/api/admin/requests")).json()) == 1
    conflict = await admin.post("/api/callback-requests", json=CALLBACK | {"phone": "+79990000002"})
    assert conflict.status_code == 409


async def test_callback_workflow_records_closure_reason_or_schedules_meeting(admin, admin_user):
    for key in ("close-directly", "schedule-meeting"):
        response = await admin.post(
            "/api/callback-requests", json=CALLBACK | {"idempotency_key": key}
        )
        assert response.status_code == 201
    scheduled, closed = (await admin.get("/api/admin/requests")).json()
    close_path = f"/api/admin/requests/{closed['id']}"
    result = await admin.patch(close_path, json={"action": "no_consultation"})
    assert result.status_code == 200, result.text
    reason = "Клиенту не нужна консультация"
    assert result.json()["status"] == "done"
    assert result.json()["closure_reason"] == reason
    assert result.json()["slot"] is None
    history = (await admin.get(close_path + "/history")).json()
    assert [entry["status"] for entry in history] == ["new", "done"]
    assert history[-1]["actor_id"] == admin_user.id
    assert {"field": "closure_reason", "before": None, "after": reason} in history[-1]["changes"]
    assert (await admin.patch(close_path, json={"action": "no_consultation"})).status_code == 409
    assert reason in (await admin.get("/api/admin/requests/export.csv")).text

    meeting_path = f"/api/admin/requests/{scheduled['id']}"
    result = await admin.patch(meeting_path, json={"action": "clarify"})
    assert result.status_code == 200, result.text
    details = {
        "contact": "+79990000009",
        "audience": "self",
        "comment": "Вопрос по инструкции",
        "expected_updated_at": result.json()["updated_at"],
        "appointment": {"starts_at": "2030-11-18T15:30:00Z", "specialist_id": admin_user.id},
    }
    result = await admin.patch(meeting_path, json={"action": "accept", "details": details})
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "confirmed"
    assert result.json()["slot"]["starts_at"] == "2030-11-18T15:30:00Z"
    assert result.json()["closure_reason"] is None
    retry = await admin.post(
        "/api/callback-requests", json=CALLBACK | {"idempotency_key": "schedule-meeting"}
    )
    assert retry.status_code == 200
    assert len((await admin.get("/api/admin/requests")).json()) == 2


async def test_callback_requires_a_valid_phone_and_explicit_consent(client: AsyncClient) -> None:
    for change in (
        {"phone": "+7"},
        {"phone": "номер"},
        {"consent": False},
        {"idempotency_key": ""},
    ):
        response = await client.post("/api/callback-requests", json=CALLBACK | change)
        assert response.status_code == 422, response.text
    assert (
        await client.post(
            "/api/callback-requests",
            json={"phone": CALLBACK["phone"], "idempotency_key": "no-consent"},
        )
    ).status_code == 422
