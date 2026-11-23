def appointment_details(request, specialist_id, start="2030-11-18T15:30:00Z"):
    return {
        "contact": request["contact"], "audience": "parents",
        "comment": request["comment"], "expected_updated_at": request["updated_at"],
        "appointment": {"starts_at": start, "specialist_id": specialist_id},
    }


async def test_assignment_and_status_history(admin, admin_user):
    person = await admin.post("/api/admin/users", json={
        "email": "other@example.com", "name": "Другой специалист", "password": "test-password-123",
    })
    assert person.status_code == 201, person.text
    assignee = person.json()["id"]
    created = await admin.post(
        "/api/requests", json={"name": "Тест", "contact": "test@example.com"}
    )
    assert created.status_code == 201, created.text
    path = f"/api/admin/requests/{created.json()['id']}"

    taken = await admin.patch(path, json={"take": True})
    assert taken.status_code == 200, taken.text
    assert taken.json()["specialist_id"] == admin_user.id
    assert len((await admin.get("/api/admin/requests?scope=mine")).json()) == 1
    moved = await admin.patch(path, json={"specialist_id": assignee, "status": "matched"})
    assert moved.status_code == 200, moved.text
    assert moved.json()["specialist_id"] == assignee
    assert (await admin.patch(path, json={"take": True})).status_code == 409
    assert (await admin.get("/api/admin/requests?scope=mine")).json() == []

    clarification = await admin.patch(path, json={"status": "clarifying"})
    assert clarification.status_code == 200
    accepted = await admin.patch(path, json={
        "action": "accept", "details": appointment_details(clarification.json(), assignee),
    })
    assert accepted.status_code == 200, accepted.text
    for status in ["cancelled", "cancelled"]:
        updated = await admin.patch(path, json={"status": status})
        assert updated.status_code == 200, updated.text

    history = (await admin.get(path + "/history")).json()
    assert [row["status"] for row in history] == [
        "new", "new", "matched", "clarifying", "confirmed", "cancelled",
    ]
    assert history[0]["kind"] == "created"
    assert history[0]["actor_name"] == "Тест"
    assert history[1]["kind"] == "assignment"
    assert history[2]["specialist_name"] == "Другой специалист"
    assert all(row["actor_id"] == admin_user.id and row["actor_name"] for row in history[1:])
    assert all(row["occurred_at"] for row in history)
    del admin.headers["Authorization"]
    assert (await admin.get(path + "/history")).status_code == 401


async def test_slot_specialist_is_used_for_new_request(admin, admin_user):
    slot = await admin.post("/api/admin/slots", json={
        "starts_at": "2030-11-18T15:30:00Z", "ends_at": "2030-11-18T16:00:00Z",
        "specialist_id": admin_user.id,
    })
    assert slot.status_code == 201, slot.text
    request = await admin.post("/api/requests", json={
        "name": "Тест", "contact": "test", "slot_id": slot.json()["id"],
    })
    assert request.status_code == 201, request.text
    assert request.json()["specialist_id"] == admin_user.id
    assert (await admin.get("/api/admin/requests/calendar.ics")).status_code == 200


async def test_request_actions_edit_and_restore(admin, admin_user):
    created = await admin.post("/api/requests", json={"name": "Имя", "contact": "test@example.com"})
    request = created.json()
    path = f"/api/admin/requests/{request['id']}"

    async def act(action, expected_status):
        response = await admin.patch(path, json={"action": action})
        assert response.status_code == 200, response.text
        assert response.json()["status"] == expected_status
        return response.json()

    assert (await admin.patch(path, json={"action": "accept"})).status_code == 409
    await act("clarify", "clarifying")
    await act("cancel", "cancelled")
    restored = await act("restore", "clarifying")
    assert (await admin.patch(path, json={"action": "accept"})).status_code == 422
    assert (await admin.patch(path, json={"status": "confirmed"})).status_code == 422
    details = appointment_details(restored, admin_user.id)
    missing = {**details, "appointment": {"starts_at": details["appointment"]["starts_at"]}}
    response = await admin.patch(path, json={"action": "accept", "details": missing})
    assert response.status_code == 422
    response = await admin.patch(path, json={"action": "accept", "details": details})
    assert response.status_code == 200, response.text
    accepted = response.json()
    assert accepted["status"] == "confirmed"
    assert accepted["specialist_id"] == admin_user.id
    assert accepted["comment"] is None
    assert accepted["slot"]["is_open"] is False
    assert (await admin.get("/api/slots")).json() == []

    details = {
        **appointment_details(accepted, admin_user.id),
        "contact": "new@example.com", "comment": "Другая тема",
    }
    changed = await admin.patch(path, json={"details": details})
    assert changed.status_code == 200, changed.text
    assert changed.json()["name"] == "Имя"
    assert changed.json()["slot_id"] == accepted["slot_id"]
    assert (await admin.patch(path, json={"details": details})).status_code == 409
    completed = await act("complete", "done")
    assert completed["slot_id"] == accepted["slot_id"]
    assert (await admin.patch(path, json={"action": "cancel"})).status_code == 409
    assert (await admin.patch(path, json={"status": "cancelled"})).status_code == 409

    fresh = await admin.post(
        "/api/requests", json={"name": "Новая", "contact": "other@example.com"}
    )
    another = await admin.post(
        "/api/requests", json={"name": "Уточняем", "contact": "x@example.com"}
    )
    another_path = f"/api/admin/requests/{another.json()['id']}"
    assert (await admin.patch(another_path, json={"action": "clarify"})).status_code == 200
    result = await admin.get("/api/admin/requests?status=new&status=done")
    assert result.status_code == 200
    assert {item["id"] for item in result.json()} == {fresh.json()["id"], request["id"]}

    history = (await admin.get(path + "/history")).json()
    assert [(event["kind"], event["status"]) for event in history] == [
        ("created", "new"), ("status", "clarifying"), ("status", "cancelled"),
        ("restored", "clarifying"), ("updated", "confirmed"), ("edited", "confirmed"),
        ("status", "done"),
    ]

    assert {change["field"] for change in history[4]["changes"]} == {
        "status", "audience", "time", "specialist",
    }
    assert {change["field"] for change in history[5]["changes"]} == {"contact", "comment"}


async def test_rescheduling_then_restoring_a_request_whose_slot_is_taken(admin, admin_user):
    async def create_slot(hour):
        result = await admin.post("/api/admin/slots", json={
            "starts_at": f"2030-11-18T{hour}:30:00Z", "ends_at": f"2030-11-18T{hour}:50:00Z",
            "specialist_id": admin_user.id,
        })
        assert result.status_code == 201, result.text
        return result.json()["id"]

    old_slot, new_slot = await create_slot("15"), await create_slot("16")
    data = {"name": "Имя", "contact": "test@example.com", "slot_id": old_slot}
    first = await admin.post("/api/requests", json=data)
    path = f"/api/admin/requests/{first.json()['id']}"
    clarification = await admin.patch(path, json={"action": "clarify"})
    assert clarification.status_code == 200
    accepted = await admin.patch(path, json={
        "action": "accept", "details": appointment_details(clarification.json(), admin_user.id),
    })
    assert accepted.status_code == 200, accepted.text
    changed = await admin.patch(path, json={"details": appointment_details(
        accepted.json(), admin_user.id, "2030-11-18T16:30:00Z",
    )})
    assert changed.status_code == 200, changed.text
    assert changed.json()["slot"]["id"] == new_slot
    assert [slot["id"] for slot in (await admin.get("/api/slots")).json()] == [old_slot]
    assert (await admin.patch(path, json={"action": "cancel"})).status_code == 200
    second = await admin.post("/api/requests", json={**data, "slot_id": new_slot})
    assert second.status_code == 201
    restored = await admin.patch(path, json={"action": "restore"})
    assert restored.status_code == 200, restored.text
    assert restored.json()["status"] == "confirmed"
    assert restored.json()["slot_id"] is None
    assert [slot["id"] for slot in (await admin.get("/api/slots")).json()] == [old_slot]
