from httpx import AsyncClient


async def node(admin: AsyncClient, **data: object) -> dict:
    payload = {"audience": "parents", "kind": "menu", "title": "Тема"} | data
    r = await admin.post("/api/admin/nodes", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


async def test_health(client: AsyncClient) -> None:
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


async def test_admin_requires_token(client: AsyncClient) -> None:
    assert (await client.get("/api/admin/nodes")).status_code == 401
    r = await client.get("/api/admin/nodes", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401


async def test_tree_is_nested_and_ordered(admin: AsyncClient) -> None:
    root_b = await node(admin, title="Б", position=2)
    root_a = await node(admin, title="А", position=1)
    child = await node(admin, title="Ответ", kind="answer", parent_id=root_a["id"], body="Текст")
    await node(admin, title="Другая аудитория", audience="self")

    r = await admin.get("/api/scenarios/parents")
    assert r.status_code == 200
    tree = r.json()
    assert [n["title"] for n in tree] == ["А", "Б"]
    assert tree[0]["children"][0]["id"] == child["id"]
    assert tree[0]["children"][0]["body"] == "Текст"
    assert tree[1]["id"] == root_b["id"] and tree[1]["children"] == []


async def test_unpublished_nodes_hidden_from_public(admin: AsyncClient) -> None:
    hidden = await node(admin, title="Черновик", is_published=False)
    shown = await node(admin, title="Готово")

    public = (await admin.get("/api/scenarios/parents")).json()
    assert [n["id"] for n in public] == [shown["id"]]
    assert (await admin.get(f"/api/nodes/{hidden['id']}")).status_code == 404
    assert (await admin.get(f"/api/nodes/{shown['id']}")).status_code == 200
    # в админке видно всё
    assert len((await admin.get("/api/admin/nodes")).json()) == 2


async def test_parent_must_match_audience(admin: AsyncClient) -> None:
    parent = await node(admin, audience="self")
    r = await admin.post(
        "/api/admin/nodes",
        json={"audience": "parents", "title": "x", "parent_id": parent["id"]},
    )
    assert r.status_code == 422
    r = await admin.post(
        "/api/admin/nodes", json={"audience": "self", "title": "x", "parent_id": 999}
    )
    assert r.status_code == 404


async def test_update_and_delete_cascade(admin: AsyncClient) -> None:
    root = await node(admin)
    child = await node(admin, parent_id=root["id"], title="Ребёнок")

    r = await admin.patch(f"/api/admin/nodes/{root['id']}", json={"title": "Новое", "position": 5})
    assert r.status_code == 200 and r.json()["title"] == "Новое" and r.json()["position"] == 5

    r = await admin.patch(f"/api/admin/nodes/{root['id']}", json={"parent_id": root["id"]})
    assert r.status_code == 422

    assert (await admin.delete(f"/api/admin/nodes/{root['id']}")).status_code == 204
    assert (await admin.get(f"/api/nodes/{child['id']}")).status_code == 404
    assert (await admin.delete(f"/api/admin/nodes/{root['id']}")).status_code == 404


async def test_settings_upsert_and_public_dict(admin: AsyncClient) -> None:
    r = await admin.put(
        "/api/admin/settings/welcome_text", json={"value": "Привет", "description": "x"}
    )
    assert r.status_code == 200 and r.json()["key"] == "welcome_text"
    r = await admin.put("/api/admin/settings/welcome_text", json={"value": "Привет 2"})
    assert r.json()["value"] == "Привет 2" and r.json()["description"] == "x"

    assert (await admin.get("/api/settings")).json() == {"welcome_text": "Привет 2"}
    assert len((await admin.get("/api/admin/settings")).json()) == 1
