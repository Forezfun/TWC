import base64

from httpx import AsyncClient

REQ = {"name": "Иван", "contact": "@ivan", "audience": "parents"}
AUDIO = b"\x1a\x45\xdf\xa3test-audio-answer"
VOICE = {"mime_type": "audio/webm", "data_base64": base64.b64encode(AUDIO).decode()}


async def test_voice_answers_are_private_and_saved(admin: AsyncClient) -> None:
    response = await admin.post("/api/requests", json=REQ | {"voice_answers": {"name": VOICE}})
    assert response.status_code == 201, response.text
    record = response.json()
    assert record["voice_fields"] == ["name"]
    assert "data_base64" not in response.text
    listed = await admin.get("/api/admin/requests")
    assert listed.status_code == 200
    assert "data_base64" not in listed.text
    audio = await admin.get(f"/api/admin/requests/{record['id']}/voice/name")
    assert audio.status_code == 200 and audio.content == AUDIO
    assert audio.headers["cache-control"] == "no-store"
    del admin.headers["Authorization"]
    assert (await admin.get(f"/api/admin/requests/{record['id']}/voice/name")).status_code == 401


async def test_invalid_voice_answer_is_rejected(client: AsyncClient) -> None:
    for voice in (
        {"unknown": VOICE},
        {"name": VOICE | {"data_base64": "invalid"}},
        {"name": VOICE | {"mime_type": "text/html"}},
    ):
        response = await client.post("/api/requests", json=REQ | {"voice_answers": voice})
        assert response.status_code == 422, response.text
