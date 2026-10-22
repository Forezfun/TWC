"""Админка: конструктор сценариев, заявки, слоты, настройки. Нужен Bearer-токен (см. auth.py)."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import Session, current_admin
from app.models import (
    Audience,
    ConsultationRequest,
    ConsultationSlot,
    RequestStatus,
    ScenarioNode,
    Setting,
)
from app.schemas.consultation import RequestOut, RequestStatusUpdate, SlotCreate, SlotOut
from app.schemas.content import NodeCreate, NodeOut, NodeUpdate, SettingOut, SettingUpdate

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(current_admin)])


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
    return (await session.scalars(select(Setting).order_by(Setting.key))).all()


@router.put("/settings/{key}", response_model=SettingOut)
async def upsert_setting(key: str, payload: SettingUpdate, session: Session) -> Setting:
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
            .options(selectinload(ConsultationSlot.request))
            .order_by(ConsultationSlot.starts_at)
        )
    ).all()
    return [
        SlotOut(
            id=s.id,
            starts_at=s.starts_at,
            ends_at=s.ends_at,
            is_open=s.is_open,
            is_booked=s.request is not None and s.request.status != RequestStatus.cancelled,
        )
        for s in rows
    ]


@router.post("/slots", response_model=SlotOut, status_code=201)
async def create_slot(payload: SlotCreate, session: Session) -> ConsultationSlot:
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(422, "Конец слота должен быть позже начала")
    s = ConsultationSlot(**payload.model_dump())
    session.add(s)
    await session.commit()
    await session.refresh(s)
    return s


@router.delete("/slots/{slot_id}", status_code=204)
async def delete_slot(slot_id: int, session: Session) -> Response:
    s = await session.get(ConsultationSlot, slot_id)
    if not s:
        raise HTTPException(404, "Слот не найден")
    await session.delete(s)
    await session.commit()
    return Response(status_code=204)


# ---- заявки -----------------------------------------------------------------


@router.get("/requests", response_model=list[RequestOut])
async def list_requests(
    session: Session, status: RequestStatus | None = None
) -> list[ConsultationRequest]:
    q = (
        select(ConsultationRequest)
        .options(selectinload(ConsultationRequest.slot))
        .order_by(ConsultationRequest.created_at.desc())
    )
    if status:
        q = q.where(ConsultationRequest.status == status)
    return (await session.scalars(q)).all()


@router.patch("/requests/{request_id}", response_model=RequestOut)
async def set_request_status(
    request_id: int, payload: RequestStatusUpdate, session: Session
) -> ConsultationRequest:
    r = await session.get(
        ConsultationRequest, request_id, options=[selectinload(ConsultationRequest.slot)]
    )
    if not r:
        raise HTTPException(404, "Заявка не найдена")
    r.status = payload.status
    await session.commit()
    await session.refresh(r)
    return r


@router.get("/requests/export.csv")
async def export_requests(session: Session) -> Response:
    import csv
    import io

    rows = (
        await session.scalars(
            select(ConsultationRequest)
            .options(selectinload(ConsultationRequest.slot))
            .order_by(ConsultationRequest.created_at)
        )
    ).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "id",
            "создана",
            "имя",
            "контакт",
            "аудитория",
            "слот",
            "желаемое время",
            "статус",
            "комментарий",
        ]
    )
    for r in rows:
        w.writerow(
            [
                r.id,
                r.created_at.isoformat(),
                r.name,
                r.contact,
                r.audience or "",
                r.slot.starts_at.isoformat() if r.slot else "",
                r.preferred_time or "",
                r.status,
                r.comment or "",
            ]
        )
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="requests.csv"'},
    )
