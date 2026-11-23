async def test_custom_role_keeps_scenarios_and_audio_after_rename(admin):
    settings = (await admin.get("/api/site-display")).json()
    assert settings["donate"]["role_keys"] == ["parents", "specialists"]
    assert settings["volunteer"]["url"] is None

    audio = await admin.post(
        "/api/admin/instruction-media", content=b"ID3 test sample",
        headers={"Content-Type": "audio/mpeg"},
    )
    assert audio.status_code == 201, audio.text
    role = {
        "key": "role-family", "title": "Я помогаю семье", "audio_url": audio.json()["url"],
        "hint_audio_url": "/kolibri/recordings/family-description.mp3",
        "icon_url": "/kolibri/pictograms/family.svg",
    }
    settings["roles"].append(role)
    settings["donate"]["role_keys"] = ["parents", role["key"]]
    settings["volunteer"]["url"] = "https://example.org/volunteers"
    response = await admin.put("/api/admin/site-display", json=settings)
    assert response.status_code == 200, response.text
    settings["revision"] = response.json()["revision"]
    topic = await admin.post("/api/admin/instruction-topics", json={"title": "Знакомство"})
    assert topic.status_code == 201, topic.text
    scenario = await admin.post("/api/admin/instructions", json={
        "title": "Семья", "description": "", "audience": role["key"], "is_published": True,
        "topic_id": topic.json()["id"], "start_step_id": "start",
        "steps": [{"id": "start", "title": "Начало", "body": "", "next_id": None, "choices": []}],
    })
    assert scenario.status_code == 201, scenario.text

    role["title"] = "Я поддерживаю близкого"
    saved = await admin.put("/api/admin/site-display", json=settings)
    assert saved.status_code == 200, saved.text
    del admin.headers["Authorization"]
    assert (await admin.put("/api/admin/site-display", json=settings)).status_code == 401
    public = (await admin.get("/api/site-display")).json()
    assert public["roles"][-1]["title"] == role["title"]
    assert public["roles"][-1]["audio_url"] == audio.json()["url"]
    assert public["roles"][-1]["hint_audio_url"] == role["hint_audio_url"]
    assert public["roles"][-1]["icon_url"] == role["icon_url"]
    assert (await admin.get(audio.json()["url"])).headers["content-type"] == "audio/mpeg"
    partial = await admin.get(audio.json()["url"], headers={"Range": "bytes=0-2"})
    assert partial.status_code == 206 and partial.content == b"ID3"
    assert len((await admin.get("/api/instruction-topics?audience=role-family")).json()) == 1
    assert (await admin.get("/api/instructions?audience=self")).json() == []
    matches = (await admin.get("/api/instructions?audience=role-family")).json()
    assert [value["id"] for value in matches] == [scenario.json()["id"]]
    assert (await admin.post("/api/requests", json={
        "name": "Тест", "contact": "test", "audience": role["key"],
    })).status_code == 201


async def test_setting_rejects_unsafe_links_and_unknown_roles(admin):
    settings = (await admin.get("/api/site-display")).json()
    settings["donate"]["url"] = "javascript:alert(1)"
    assert (await admin.put("/api/admin/site-display", json=settings)).status_code == 422
    settings["donate"]["url"] = "https://anokolibri.ru/donate"
    settings["donate"]["role_keys"] = ["role-unknown"]
    assert (await admin.put("/api/admin/site-display", json=settings)).status_code == 422


async def test_hide_show_and_delete_standard_role_preserving_instruction(admin):
    settings = (await admin.get("/api/admin/site-display")).json()
    topic = await admin.post("/api/admin/instruction-topics", json={"title": "Тест роли"})
    assert topic.status_code == 201
    payload = {
        "title": "Инструкция", "description": "", "audience": "parents", "is_published": True,
        "topic_id": topic.json()["id"], "start_step_id": "start",
        "steps": [{"id": "start", "title": "Начало", "body": "", "next_id": None, "choices": []}],
    }
    created = await admin.post("/api/admin/instructions", json=payload)
    assert created.status_code == 201, created.text
    instruction_id = created.json()["id"]
    public_path = f"/api/instructions/{instruction_id}"
    admin_path = f"/api/admin/instructions/{instruction_id}"
    assert (await admin.get(public_path)).status_code == 200

    role = next(item for item in settings["roles"] if item["key"] == "parents")
    role["is_hidden"] = True
    hidden = await admin.put("/api/admin/site-display", json=settings)
    assert hidden.status_code == 200, hidden.text
    public = (await admin.get("/api/site-display")).json()
    assert "parents" not in {item["key"] for item in public["roles"]}
    assert "parents" not in public["donate"]["role_keys"]
    assert (await admin.get(public_path)).status_code == 404
    assert (await admin.get("/api/instructions?audience=parents")).json() == []
    assert (await admin.get("/api/instruction-topics?audience=parents")).json() == []
    assert (await admin.get(admin_path)).json()["is_published"] is True
    editor = (await admin.get("/api/admin/site-display")).json()
    assert next(item for item in editor["roles"] if item["key"] == "parents")["is_hidden"]
    assert (await admin.put(admin_path, json=payload)).status_code == 200
    assert (await admin.put("/api/admin/site-display", json=settings)).status_code == 409

    settings = hidden.json()
    next(item for item in settings["roles"] if item["key"] == "parents")["is_hidden"] = False
    visible = await admin.put("/api/admin/site-display", json=settings)
    assert visible.status_code == 200, visible.text
    assert (await admin.get(public_path)).status_code == 200

    settings = visible.json()
    settings["roles"] = []
    for name in ("donate", "volunteer"):
        settings[name]["role_keys"] = []
    deleted = await admin.put("/api/admin/site-display", json=settings)
    assert deleted.status_code == 200, deleted.text
    assert (await admin.get("/api/admin/site-display")).json()["roles"] == []
    assert (await admin.get("/api/site-display")).json()["roles"] == []
    assert (await admin.get(public_path)).status_code == 404
    preserved = (await admin.get(admin_path)).json()
    assert preserved["is_published"] is False
    assert preserved["steps"][0]["id"] == "start"
