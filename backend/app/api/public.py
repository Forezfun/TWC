"""Публичное API: то, что дёргает сайт-навигатор."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import Session
from app.models import (
    Audience,
    ConsultationRequest,
    ConsultationSlot,
    RequestStatus,
    ScenarioNode,
    Setting,
)
from app.schemas.consultation import RequestCreate, RequestOut, SlotOut
from app.schemas.content import NodeOut, NodeTree, SettingOut

router = APIRouter(tags=["public"])


@router.get("/scenarios/{audience}", response_model=list[NodeTree])
async def scenario_tree(audience: Audience, session: Session) -> list[ScenarioNode]:
    """Опубликованное дерево одной аудитории целиком. Фронт ходит по нему сам."""
    rows = (
        await session.scalars(
            select(ScenarioNode)
            .where(ScenarioNode.audience == audience, ScenarioNode.is_published.is_(True))
            .order_by(ScenarioNode.position, ScenarioNode.id)
        )
    ).all()
    # NodeOut не трогает relationship-поля, иначе async-сессия падает на lazy load
    by_id = {n.id: NodeTree(**NodeOut.model_validate(n).model_dump()) for n in rows}
    roots: list[NodeTree] = []
    for n in rows:
        node = by_id[n.id]
        if n.parent_id and n.parent_id in by_id:
            by_id[n.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


@router.get("/nodes/{node_id}", response_model=NodeOut)
async def node(node_id: int, session: Session) -> ScenarioNode:
    n = await session.get(ScenarioNode, node_id)
    if not n or not n.is_published:
        raise HTTPException(404, "Узел не найден")
    return n


@router.get("/settings", response_model=dict[str, str])
async def settings(session: Session) -> dict[str, str]:
    rows = (await session.scalars(select(Setting))).all()
    return {s.key: s.value for s in rows}


@router.get("/slots", response_model=list[SlotOut])
async def free_slots(session: Session) -> list[SlotOut]:
    """Открытые и ещё не занятые слоты."""
    rows = (
        await session.scalars(
            select(ConsultationSlot)
            .options(selectinload(ConsultationSlot.request))
            .where(ConsultationSlot.is_open.is_(True))
            .order_by(ConsultationSlot.starts_at)
        )
    ).all()
    return [
        SlotOut(id=s.id, starts_at=s.starts_at, ends_at=s.ends_at, is_open=s.is_open)
        for s in rows
        if s.request is None or s.request.status == RequestStatus.cancelled
    ]


@router.post("/requests", response_model=RequestOut, status_code=201)
async def create_request(payload: RequestCreate, session: Session) -> ConsultationRequest:
    flag = await session.get(Setting, "registration_open")
    if flag is not None and flag.value.strip().lower() in {"0", "false", "off", "no"}:
        raise HTTPException(409, "Запись на консультацию сейчас закрыта")

    if payload.slot_id is not None:
        slot = await session.get(
            ConsultationSlot, payload.slot_id, with_for_update=True, populate_existing=True
        )
        if not slot or not slot.is_open:
            raise HTTPException(404, "Слот не найден")
        taken = await session.scalar(
            select(ConsultationRequest.id).where(
                ConsultationRequest.slot_id == slot.id,
                ConsultationRequest.status != RequestStatus.cancelled,
            )
        )
        if taken:
            raise HTTPException(409, "Это время уже занято")

    req = ConsultationRequest(**payload.model_dump())
    session.add(req)
    await session.commit()
    await session.refresh(req, attribute_names=["slot"])
    # TODO: уведомить координатора (email / telegram) о новой заявке
    return req


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


_ = SettingOut  # экспорт схемы в OpenAPI
