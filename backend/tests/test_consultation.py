from httpx import AsyncClient

REQ = {"name": "Иван", "contact": "@ivan", "audience": "parents"}


async def slot(admin: AsyncClient, day: int = 27) -> dict:
    r = await admin.post(
        "/api/admin/slots",
        json={
            "starts_at": f"2026-10-{day}T10:00:00+03:00",
            "ends_at": f"2026-10-{day}T10:30:00+03:00",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_slot_validation(admin: AsyncClient) -> None:
    r = await admin.post(
        "/api/admin/slots",
        json={"starts_at": "2026-10-27T10:30:00+03:00", "ends_at": "2026-10-27T10:00:00+03:00"},
    )
    assert r.status_code == 422


async def test_request_without_slot(client: AsyncClient) -> None:
    r = await client.post("/api/requests", json=REQ | {"preferred_time": "вечером"})
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "new" and body["slot"] is None and body["preferred_time"] == "вечером"


async def test_request_validation(client: AsyncClient) -> None:
    assert (
        await client.post("/api/requests", json={"name": "", "contact": "@x"})
    ).status_code == 422
    assert (
        await client.post("/api/requests", json={"name": "A", "contact": "@x"})
    ).status_code == 422


async def test_booking_takes_slot_and_blocks_double_booking(admin: AsyncClient) -> None:
    s = await slot(admin)
    assert [x["id"] for x in (await admin.get("/api/slots")).json()] == [s["id"]]

    r = await admin.post("/api/requests", json=REQ | {"slot_id": s["id"]})
    assert r.status_code == 201 and r.json()["slot"]["id"] == s["id"]

    assert (await admin.get("/api/slots")).json() == []
    assert (await admin.get("/api/admin/slots")).json()[0]["is_booked"] is True

    r = await admin.post("/api/requests", json=REQ | {"slot_id": s["id"]})
    assert r.status_code == 409

    r = await admin.post("/api/requests", json=REQ | {"slot_id": 999})
    assert r.status_code == 404


async def test_cancelling_frees_slot(admin: AsyncClient) -> None:
    s = await slot(admin)
    req = (await admin.post("/api/requests", json=REQ | {"slot_id": s["id"]})).json()
    assert (await admin.get("/api/slots")).json() == []

    r = await admin.patch(f"/api/admin/requests/{req['id']}", json={"status": "cancelled"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert [x["id"] for x in (await admin.get("/api/slots")).json()] == [s["id"]]

    r = await admin.post("/api/requests", json=REQ | {"slot_id": s["id"]})
    assert r.status_code == 201


async def test_closed_registration(admin: AsyncClient) -> None:
    await admin.put("/api/admin/settings/registration_open", json={"value": "false"})
    r = await admin.post("/api/requests", json=REQ)
    assert r.status_code == 409

    await admin.put("/api/admin/settings/registration_open", json={"value": "true"})
    assert (await admin.post("/api/requests", json=REQ)).status_code == 201


async def test_list_filter_and_export(admin: AsyncClient) -> None:
    a = (await admin.post("/api/requests", json=REQ)).json()
    b = (await admin.post("/api/requests", json=REQ | {"name": "Мария"})).json()
    await admin.patch(f"/api/admin/requests/{b['id']}", json={"status": "done"})

    all_ = (await admin.get("/api/admin/requests")).json()
    assert [x["id"] for x in all_] == [b["id"], a["id"]]  # новые сверху
    new = (await admin.get("/api/admin/requests", params={"status": "new"})).json()
    assert [x["id"] for x in new] == [a["id"]]

    r = await admin.get("/api/admin/requests/export.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    lines = r.text.lstrip("﻿").splitlines()
    assert lines[0].startswith("id,")
    assert len(lines) == 3 and "Мария" in lines[2]

    assert (
        await admin.patch("/api/admin/requests/999", json={"status": "done"})
    ).status_code == 404
