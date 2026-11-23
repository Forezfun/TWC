"""Админка: конструктор сценариев, заявки, слоты, настройки. Нужен Bearer-токен (см. auth.py)."""

import base64
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.deps import Admin, Session, current_admin
from app.api.site_display import setting_key
from app.models import (
    AdminUser,
    Audience,
    ConsultationRequest,
    ConsultationSlot,
    RequestStatus,
    ScenarioNode,
    Setting,
)
from app.models.consultation import NO_CONSULTATION_REASON, RequestEvent
from app.schemas.consultation import (
    AppointmentInput,
    RequestEventOut,
    RequestOut,
    RequestUpdate,
    SlotAssignment,
    SlotCreate,
    SlotOut,
)
from app.schemas.content import NodeCreate, NodeOut, NodeUpdate, SettingOut, SettingUpdate

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(current_admin)])


@router.get("/requests/{request_id}/voice/{field}")
async def request_voice_answer(request_id: int, field: str, session: Session) -> Response:
    """Отдаёт аудиоответ заявки только вошедшему сотруднику."""
    answers = await session.scalar(
        select(ConsultationRequest.voice_answers).where(ConsultationRequest.id == request_id)
    )
    answer = (answers or {}).get(field)
    if not answer:
        raise HTTPException(404, "Аудиоответ не найден")
    return Response(
        base64.b64decode(answer["data_base64"]),
        media_type=answer["mime_type"],
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


# ---- сценарии ---------------------------------------------------------------


@router.get("/nodes", response_model=list[NodeOut])
async def list_nodes(session: Session, audience: Audience | None = None) -> list[ScenarioNode]:
    q = select(ScenarioNode).order_by(ScenarioNode.audience, ScenarioNode.position, ScenarioNode.id)
    if audience:
        q = q.where(ScenarioNode.audience == audience)
    return (await session.scalars(q)).all()


@router.post("/nodes", response_model=NodeOut, status_code=201)
async def create_node(payload: NodeCreate, session: Session) -> ScenarioNode:
    if payload.parent_id is not None:
        parent = await session.get(ScenarioNode, payload.parent_id)
        if not parent:
            raise HTTPException(404, "Родительский узел не найден")
        if parent.audience != payload.audience:
            raise HTTPException(422, "Родитель относится к другой аудитории")
    n = ScenarioNode(**payload.model_dump())
    session.add(n)
    await session.commit()
    await session.refresh(n)
    return n


@router.patch("/nodes/{node_id}", response_model=NodeOut)
async def update_node(node_id: int, payload: NodeUpdate, session: Session) -> ScenarioNode:
    n = await session.get(ScenarioNode, node_id)
    if not n:
        raise HTTPException(404, "Узел не найден")
    data = payload.model_dump(exclude_unset=True)
    if data.get("parent_id") == node_id:
        raise HTTPException(422, "Узел не может быть родителем самого себя")
    for k, v in data.items():
        setattr(n, k, v)
    await session.commit()
    await session.refresh(n)
    return n


@router.delete("/nodes/{node_id}", status_code=204)
async def delete_node(node_id: int, session: Session) -> Response:
    n = await session.get(ScenarioNode, node_id)
    if not n:
        raise HTTPException(404, "Узел не найден")
    await session.delete(n)
    await session.commit()
    return Response(status_code=204)


# ---- настройки --------------------------------------------------------------


@router.get("/settings", response_model=list[SettingOut])
async def list_settings(session: Session) -> list[Setting]:
    return (
        await session.scalars(
            select(Setting).where(Setting.key != setting_key).order_by(Setting.key)
        )
    ).all()


@router.put("/settings/{key}", response_model=SettingOut)
async def upsert_setting(key: str, payload: SettingUpdate, session: Session) -> Setting:
    if key == setting_key:
        raise HTTPException(422, "Используйте настройки ролей и кнопок")
    s = await session.get(Setting, key)
    if s is None:
        s = Setting(key=key)
        session.add(s)
    s.value = payload.value
    if payload.description is not None:
        s.description = payload.description
    await session.commit()
    await session.refresh(s)
    return s


# ---- слоты ------------------------------------------------------------------


@router.get("/slots", response_model=list[SlotOut])
async def list_slots(session: Session) -> list[SlotOut]:
    rows = (
        await session.scalars(
            select(ConsultationSlot)
            .options(
                selectinload(ConsultationSlot.request), selectinload(ConsultationSlot.specialist)
            )
            .order_by(ConsultationSlot.starts_at)
        )
    ).all()
    return [
        SlotOut.model_validate(s).model_copy(update={"is_booked": s.request is not None})
        for s in rows
    ]


@router.post("/slots", response_model=SlotOut, status_code=201)
async def create_slot(payload: SlotCreate, session: Session) -> ConsultationSlot:
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(422, "Конец слота должен быть позже начала")
    specialist = None
    if payload.specialist_id is not None:
        specialist = await active_specialist(session, payload.specialist_id, lock=True)
        await check_slot_overlap(session, specialist.id, payload.starts_at, payload.ends_at)
    s = ConsultationSlot(**payload.model_dump(exclude={"specialist_id"}), specialist=specialist)
    session.add(s)
    await session.commit()
    return s


async def active_specialist(
    session: Session, specialist_id: int, *, lock: bool = False
) -> AdminUser:
    person = await session.get(
        AdminUser,
        specialist_id,
        with_for_update={"key_share": True} if lock else None,
    )
    if not person or not person.is_active:
        raise HTTPException(422, "Выберите действующего сотрудника")
    return person


async def check_slot_overlap(session: Session, person_id: int, start, end, ignored_id=None):
    if await slot_overlaps(session, person_id, start, end, ignored_id):
        raise HTTPException(409, "У этого специалиста уже есть слот в это время")


async def slot_overlaps(session: Session, person_id: int, start, end, ignored_id=None) -> bool:
    query = select(ConsultationSlot.id).where(
        ConsultationSlot.specialist_id == person_id,
        ConsultationSlot.starts_at < end,
        ConsultationSlot.ends_at > start,
        or_(ConsultationSlot.is_open, ConsultationSlot.request.has()),
    )
    if ignored_id is not None:
        query = query.where(ConsultationSlot.id != ignored_id)
    return (await session.scalar(query.limit(1))) is not None


@router.patch("/slots/{slot_id}", response_model=SlotOut)
async def assign_slot(slot_id: int, payload: SlotAssignment, session: Session) -> SlotOut:
    person = await active_specialist(session, payload.specialist_id, lock=True)
    slot = await session.get(
        ConsultationSlot,
        slot_id,
        with_for_update=True,
        options=[
            selectinload(ConsultationSlot.request),
        ],
    )
    if not slot:
        raise HTTPException(404, "Слот не найден")
    if slot.specialist_id is not None and slot.request:
        raise HTTPException(409, "За этим слотом уже закреплена запись")
    await check_slot_overlap(session, person.id, slot.starts_at, slot.ends_at, slot.id)
    slot.specialist = person
    await session.commit()
    return SlotOut.model_validate(slot).model_copy(update={"is_booked": slot.request is not None})


@router.delete("/slots/{slot_id}", status_code=204)
async def delete_slot(slot_id: int, session: Session) -> Response:
    s = await session.get(
        ConsultationSlot,
        slot_id,
        with_for_update=True,
        options=[
            selectinload(ConsultationSlot.request),
        ],
    )
    if not s:
        raise HTTPException(404, "Слот не найден")
    if s.request:
        raise HTTPException(409, "Это время уже занято")
    await session.delete(s)
    await session.commit()
    return Response(status_code=204)


# ---- заявки -----------------------------------------------------------------


request_details = (
    selectinload(ConsultationRequest.slot).selectinload(ConsultationSlot.specialist),
    selectinload(ConsultationRequest.specialist),
)
workflow_steps = {
    "clarify": ({RequestStatus.new}, RequestStatus.clarifying),
    "accept": ({RequestStatus.clarifying, RequestStatus.matched}, RequestStatus.confirmed),
    "complete": ({RequestStatus.confirmed}, RequestStatus.done),
    "no_consultation": (
        {RequestStatus.new, RequestStatus.clarifying, RequestStatus.matched},
        RequestStatus.done,
    ),
}


async def available_slot(session: Session, slot_id: int) -> ConsultationSlot | None:
    slot = await session.get(
        ConsultationSlot,
        slot_id,
        with_for_update=True,
        populate_existing=True,
        options=[selectinload(ConsultationSlot.request), selectinload(ConsultationSlot.specialist)],
    )
    if (
        slot
        and (slot.is_open or slot.is_private)
        and not slot.request
        and (not slot.specialist or slot.specialist.is_active)
    ):
        return slot
    return None


async def reserve_appointment(
    session: Session,
    current: ConsultationSlot | None,
    appointment: AppointmentInput,
) -> tuple[ConsultationSlot, AdminUser]:
    person = await active_specialist(session, appointment.specialist_id, lock=True)
    start = appointment.starts_at
    if current and current.starts_at == start and current.specialist_id == person.id:
        return current, person
    existing_id = await session.scalar(
        select(ConsultationSlot.id)
        .where(
            ConsultationSlot.specialist_id == person.id,
            ConsultationSlot.starts_at == start,
            ConsultationSlot.is_open.is_(True),
        )
        .order_by(ConsultationSlot.id)
        .limit(1)
    )
    if existing_id is not None:
        existing = await available_slot(session, existing_id)
        if not existing:
            raise HTTPException(409, "Это время у специалиста уже занято")
        return existing, person
    duration = current.ends_at - current.starts_at if current else timedelta(minutes=30)
    end = start + duration
    ignored_id = current.id if current and not current.is_open else None
    if await slot_overlaps(session, person.id, start, end, ignored_id):
        raise HTTPException(409, "Это время у специалиста уже занято")
    return ConsultationSlot(
        starts_at=start,
        ends_at=end,
        is_open=False,
        is_private=True,
        specialist=person,
    ), person


def request_snapshot(request: ConsultationRequest) -> dict[str, str | None]:
    return {
        "status": request.status.value,
        "contact": request.contact,
        "audience": request.audience,
        "time": request.slot.starts_at.astimezone(UTC).isoformat()
        if request.slot
        else request.preferred_time,
        "specialist": request.specialist_name,
        "comment": request.comment,
        "closure_reason": request.closure_reason,
    }


def requests_query(statuses: list[RequestStatus] | None = None, specialist_id: int | None = None):
    q = (
        select(ConsultationRequest)
        .options(*request_details)
        .order_by(ConsultationRequest.created_at.desc(), ConsultationRequest.id.desc())
    )
    if statuses:
        q = q.where(ConsultationRequest.status.in_(statuses))
    if specialist_id is not None:
        q = q.where(ConsultationRequest.specialist_id == specialist_id)
    return q


@router.get("/requests", response_model=list[RequestOut])
async def list_requests(
    session: Session,
    admin: Admin,
    response: Response,
    status: Annotated[list[RequestStatus] | None, Query()] = None,
    scope: Literal["all", "mine"] = "all",
) -> list[ConsultationRequest]:
    response.headers["Cache-Control"] = "no-store"
    return (
        await session.scalars(requests_query(status, admin.id if scope == "mine" else None))
    ).all()


@router.patch("/requests/{request_id}", response_model=RequestOut)
async def update_request(
    request_id: int,
    payload: RequestUpdate,
    session: Session,
    admin: Admin,
) -> ConsultationRequest:
    r = await session.get(
        ConsultationRequest, request_id, options=request_details, with_for_update=True
    )
    if not r:
        raise HTTPException(404, "Заявка не найдена")
    fields = payload.model_fields_set
    explicit = "specialist_id" in fields
    action = payload.action
    if (action == "accept" and fields - {"action", "details"}) or (
        action != "accept"
        and fields & {"action", "details"}
        and (len(fields) != 1 or (action is None and payload.details is None))
    ):
        raise HTTPException(422, "Передайте одно действие с заявкой")
    if ("status" in fields and payload.status is None) or (explicit and payload.take):
        raise HTTPException(422, "Укажите статус или способ назначения")
    if payload.take and r.specialist_id not in (None, admin.id):
        raise HTTPException(409, "Заявку уже принял другой сотрудник")

    if payload.status == RequestStatus.confirmed and r.status != RequestStatus.confirmed:
        raise HTTPException(422, "Заполните данные заявки и назначьте встречу")

    before = request_snapshot(r)
    status = payload.status
    if r.closure_reason and status is not None and status != RequestStatus.done:
        raise HTTPException(409, "Завершённую заявку нельзя вернуть в работу")
    if r.status == RequestStatus.done and (action == "cancel" or status == RequestStatus.cancelled):
        raise HTTPException(409, "Завершённую заявку нельзя отменить")
    if action in workflow_steps:
        allowed, status = workflow_steps[action]
        if r.status not in allowed:
            raise HTTPException(409, "Статус заявки уже изменился")
        if action == "accept" and payload.details is None:
            raise HTTPException(422, "Заполните данные заявки и назначьте встречу")
        if action == "no_consultation":
            r.closure_reason = NO_CONSULTATION_REASON
            r.slot = None
    elif action == "cancel":
        if r.status == RequestStatus.cancelled:
            return r
        status = RequestStatus.cancelled
    elif action == "restore":
        if r.status not in {RequestStatus.cancelled, RequestStatus.done}:
            raise HTTPException(409, "Вернуть можно только завершённую или отменённую заявку")
        previous = await session.scalar(
            select(RequestEvent.status)
            .where(RequestEvent.request_id == r.id, RequestEvent.status != r.status)
            .order_by(RequestEvent.occurred_at.desc(), RequestEvent.id.desc())
            .limit(1)
        )
        status = RequestStatus(previous or RequestStatus.new)
        r.closure_reason = None
        if r.status == RequestStatus.cancelled and r.slot:
            if r.slot.is_private and r.slot.specialist_id is not None:
                await session.get(
                    AdminUser, r.slot.specialist_id, with_for_update={"key_share": True}
                )
            restored_slot = await available_slot(session, r.slot.id)
            if not restored_slot or (
                restored_slot.is_private
                and await slot_overlaps(
                    session,
                    restored_slot.specialist_id,
                    restored_slot.starts_at,
                    restored_slot.ends_at,
                    restored_slot.id,
                )
            ):
                r.slot = None

    details_changed = False
    person = None
    if edit := payload.details:
        if action != "accept" and r.status != RequestStatus.confirmed:
            raise HTTPException(409, "Данные можно изменить, пока заявка ожидает встречи")
        if r.updated_at != edit.expected_updated_at:
            raise HTTPException(409, "Заявка уже обновилась. Откройте её данные заново")
        slot, person = await reserve_appointment(session, r.slot, edit.appointment)
        if r.slot is not slot:
            r.slot = slot
            details_changed = True
        values = edit.model_dump(exclude={"expected_updated_at", "appointment"})
        for key, value in values.items():
            if getattr(r, key) != value:
                setattr(r, key, value)
                details_changed = True

    assigned_id = person.id if person else admin.id if payload.take else payload.specialist_id
    assigned = (explicit or payload.take or person is not None) and r.specialist_id != assigned_id
    status_changed = status is not None and r.status != status
    if not assigned and not status_changed and not details_changed:
        return r
    if assigned:
        r.specialist = (
            (person or await active_specialist(session, assigned_id))
            if assigned_id is not None
            else None
        )
    if status_changed:
        r.status = status
    kind = "updated" if assigned and status_changed else "assignment" if assigned else "status"
    if action == "restore":
        kind = "restored"
    elif details_changed and not status_changed:
        kind = "edited"
    now = datetime.now(UTC)
    r.updated_at = now
    session.add(
        RequestEvent(
            request_id=r.id,
            kind=kind,
            status=r.status,
            actor_id=admin.id,
            actor_name=admin.name or admin.email,
            specialist_name=r.specialist_name,
            changes=[
                {"field": key, "before": before[key], "after": value}
                for key, value in request_snapshot(r).items()
                if before[key] != value
            ],
            occurred_at=now,
        )
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "Время этой заявки уже занято") from None
    return r


@router.get("/requests/{request_id}/history", response_model=list[RequestEventOut])
async def request_history(request_id: int, session: Session) -> list[RequestEvent]:
    if await session.get(ConsultationRequest, request_id) is None:
        raise HTTPException(404, "Заявка не найдена")
    return (
        await session.scalars(
            select(RequestEvent)
            .where(RequestEvent.request_id == request_id)
            .order_by(RequestEvent.occurred_at, RequestEvent.id)
        )
    ).all()


@router.get("/requests/calendar.ics")
async def export_calendar(
    session: Session,
    admin: Admin,
    status: Annotated[list[RequestStatus] | None, Query()] = None,
):
    query = requests_query(status, admin.id).where(
        ConsultationRequest.slot_id.is_not(None),
        ConsultationRequest.status != RequestStatus.cancelled,
    )
    rows = (await session.scalars(query)).all()
    if not rows:
        raise HTTPException(404, "У вас нет записей с выбранным временем для экспорта")

    def utc(value):
        return value.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Kolibri//Calendar//RU",
        "CALSCALE:GREGORIAN",
    ]
    for r in rows:
        if r.slot:
            lines.extend(
                [
                    "BEGIN:VEVENT",
                    f"UID:consultation-{r.id}@anokolibri.ru",
                    f"DTSTAMP:{utc(r.updated_at)}",
                    f"DTSTART:{utc(r.slot.starts_at)}",
                    f"DTEND:{utc(r.slot.ends_at)}",
                    "SUMMARY:Консультация Колибри",
                    "STATUS:"
                    + (
                        "CONFIRMED"
                        if r.status in (RequestStatus.confirmed, RequestStatus.done)
                        else "TENTATIVE"
                    ),
                    "END:VEVENT",
                ]
            )
    return Response(
        content="\r\n".join([*lines, "END:VCALENDAR", ""]),
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="kolibri.ics"'},
    )


@router.get("/requests/export.csv")
async def export_requests(session: Session) -> Response:
    import csv
    import io

    def csv_text(value: str) -> str:
        # Контакты с +7 и @ должны открываться в таблицах как текст.
        return "'" + value if value.startswith(("=", "+", "-", "@", "\t", "\r", "\n")) else value

    rows = (
        await session.scalars(
            select(ConsultationRequest)
            .options(*request_details)
            .order_by(ConsultationRequest.created_at)
        )
    ).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "id",
            "создана",
            "контакт",
            "аудитория",
            "слот",
            "желаемое время",
            "статус",
            "специалист",
            "комментарий",
            "причина закрытия",
        ]
    )
    for r in rows:
        w.writerow(
            [
                r.id,
                r.created_at.isoformat(),
                csv_text(r.contact),
                r.audience or "",
                r.slot.starts_at.isoformat() if r.slot else "",
                r.preferred_time or "",
                r.status,
                csv_text(r.specialist_name or ""),
                csv_text(r.comment or ""),
                r.closure_reason or "",
            ]
        )
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="requests.csv"',
            "Cache-Control": "no-store",
        },
    )
