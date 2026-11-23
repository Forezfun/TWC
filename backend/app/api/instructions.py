"""Themes, branching instructions and media used by the public assistant."""

from datetime import datetime
from re import fullmatch
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import Session, current_admin
from app.api.site_display import MediaUrl, RoleKey, public_role_keys, read_display
from app.models.instructions import Instruction, InstructionMedia, InstructionTopic

router = APIRouter(tags=["instructions"])
staff = [Depends(current_admin)]
StepId = Annotated[str, StringConstraints(min_length=1, max_length=100)]

media_types = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
}


class TopicInput(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)] = ""


class TopicOut(TopicInput):
    model_config = ConfigDict(from_attributes=True)
    id: int


class Choice(BaseModel):
    id: StepId
    label: str = Field(max_length=160)
    next_id: StepId | None
    image_url: MediaUrl | None = None
    audio_url: MediaUrl | None = None


class Step(BaseModel):
    id: StepId
    title: str = Field(max_length=160)
    body: str = Field(max_length=4000)
    image_url: MediaUrl | None = None
    audio_url: MediaUrl | None = None
    title_audio_url: MediaUrl | None = None
    audio_body_start: float | None = Field(default=None, gt=0, lt=1)
    next_id: StepId | None
    choices: list[Choice] = Field(max_length=20)


class InstructionInput(BaseModel):
    title: str = Field(max_length=120)
    description: str = Field(max_length=500)
    title_audio_url: MediaUrl | None = None
    description_audio_url: MediaUrl | None = None
    audience: RoleKey
    topic_id: int
    is_published: bool
    start_step_id: StepId | None
    steps: list[Step] = Field(max_length=100)


class InstructionOut(InstructionInput):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


def validate_graph(payload: InstructionInput):
    if len({step.id for step in payload.steps}) != len(payload.steps):
        raise HTTPException(422, "Идентификаторы шагов должны различаться")
    for step in payload.steps:
        if len({choice.id for choice in step.choices}) != len(step.choices):
            raise HTTPException(422, "Идентификаторы ответов должны различаться в пределах шага")
    if not payload.is_published:
        return
    edges = {
        step.id: [choice.next_id for choice in step.choices] if step.choices else [step.next_id]
        for step in payload.steps
    }
    if not payload.title.strip() or payload.start_step_id not in edges:
        raise HTTPException(422, "Введите название и укажите первый шаг")
    for step in payload.steps:
        if not step.title.strip() or any(not choice.label.strip() for choice in step.choices):
            raise HTTPException(422, "Подпишите шаги и все варианты ответа")
    if any(
        target is not None and target not in edges
        for next_ids in edges.values()
        for target in next_ids
    ):
        raise HTTPException(422, "Один из переходов ведёт на отсутствующий шаг")

    visited = set()
    pending = [payload.start_step_id]
    while pending:
        current = pending.pop()
        if current in visited:
            continue
        visited.add(current)
        pending.extend(target for target in edges[current] if target is not None)
    if len(visited) != len(edges):
        raise HTTPException(422, "До одного из шагов нельзя добраться от начала")

    can_finish = {None}
    while next_to_finish := {
        step_id
        for step_id, next_ids in edges.items()
        if step_id not in can_finish and can_finish.intersection(next_ids)
    }:
        can_finish.update(next_to_finish)
    if len(can_finish) != len(edges) + 1:
        raise HTTPException(422, "У одного из шагов нет пути к завершению")


@router.get("/instruction-topics", response_model=list[TopicOut])
async def public_topics(session: Session, audience: RoleKey | None = None):
    topics = select(Instruction.topic_id).where(
        Instruction.is_published.is_(True),
        Instruction.audience.in_(await public_role_keys(session)),
    )
    if audience:
        topics = topics.where(Instruction.audience == audience)
    return (
        await session.scalars(
            select(InstructionTopic)
            .where(InstructionTopic.id.in_(topics))
            .order_by(InstructionTopic.id)
        )
    ).all()


@router.get("/instructions")
async def list_public(
    session: Session, audience: RoleKey | None = None, topic_id: int | None = None
):
    query = (
        select(Instruction)
        .where(
            Instruction.is_published.is_(True),
            Instruction.audience.in_(await public_role_keys(session)),
        )
        .order_by(Instruction.id)
    )
    if audience:
        query = query.where(Instruction.audience == audience)
    if topic_id is not None:
        query = query.where(Instruction.topic_id == topic_id)
    return [
        {
            "id": i.id,
            "title": i.title,
            "description": i.description,
            "audience": i.audience,
            "title_audio_url": i.title_audio_url,
            "description_audio_url": i.description_audio_url,
            "image_url": next(
                (step.get("image_url") for step in i.steps if step["id"] == i.start_step_id), None
            ),
        }
        for i in (await session.scalars(query)).all()
    ]


async def instruction_or_404(session: Session, instruction_id: int):
    row = await session.get(Instruction, instruction_id)
    if row is None:
        raise HTTPException(404, "Инструкция не найдена")
    return row


@router.get(
    "/instructions/{instruction_id}",
    response_model=InstructionOut,
    response_model_exclude_none=False,
)
async def get_public(instruction_id: int, session: Session):
    row = await instruction_or_404(session, instruction_id)
    if not row.is_published or row.audience not in await public_role_keys(session):
        raise HTTPException(404, "Инструкция не найдена")
    return row


@router.get("/admin/instruction-topics", dependencies=staff, response_model=list[TopicOut])
async def all_topics(session: Session):
    return (await session.scalars(select(InstructionTopic).order_by(InstructionTopic.id))).all()


@router.post(
    "/admin/instruction-topics", dependencies=staff, response_model=TopicOut, status_code=201
)
async def create_topic(payload: TopicInput, session: Session):
    row = InstructionTopic(**payload.model_dump(), title_key=payload.title.lower())
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "Тема с таким названием уже есть") from None
    return row


@router.get("/admin/instructions", dependencies=staff, response_model=list[InstructionOut])
async def all_instructions(session: Session, audience: RoleKey | None = None):
    query = select(Instruction).order_by(Instruction.id)
    if audience:
        query = query.where(Instruction.audience == audience)
    return (await session.scalars(query)).all()


@router.get(
    "/admin/instructions/{instruction_id}", dependencies=staff, response_model=InstructionOut
)
async def get_admin(instruction_id: int, session: Session):
    return await instruction_or_404(session, instruction_id)


async def save_instruction(payload: InstructionInput, session: Session, row: Instruction):
    if not any(
        role.key == payload.audience for role in (await read_display(session, lock=True)).roles
    ):
        raise HTTPException(422, "Выберите существующую роль")
    if not await session.get(InstructionTopic, payload.topic_id):
        raise HTTPException(422, "Выберите существующую тему")
    validate_graph(payload)
    values = payload.model_dump()
    values["steps"] = [
        {
            key: value
            for key, value in step.items()
            if key != "audio_body_start" or value is not None
        }
        for step in values["steps"]
    ]
    for key, value in values.items():
        setattr(row, key, value)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.post(
    "/admin/instructions", dependencies=staff, response_model=InstructionOut, status_code=201
)
async def create_instruction(payload: InstructionInput, session: Session):
    return await save_instruction(payload, session, Instruction())


@router.put(
    "/admin/instructions/{instruction_id}", dependencies=staff, response_model=InstructionOut
)
async def update_instruction(instruction_id: int, payload: InstructionInput, session: Session):
    return await save_instruction(
        payload, session, await instruction_or_404(session, instruction_id)
    )


@router.delete("/admin/instructions/{instruction_id}", dependencies=staff, status_code=204)
async def delete_instruction(instruction_id: int, session: Session):
    await session.delete(await instruction_or_404(session, instruction_id))
    await session.commit()


def valid_media(kind: str, data: bytearray) -> bool:
    if kind == "audio/mpeg":
        return data.startswith(b"ID3") or len(data) > 1 and data[0] == 255 and data[1] & 224 == 224
    if kind == "audio/mp4":
        return data[4:8] == b"ftyp"
    if kind in ("audio/wav", "audio/x-wav", "image/webp"):
        signature = b"WEBP" if kind == "image/webp" else b"WAVE"
        return data.startswith(b"RIFF") and data[8:12] == signature
    return data.startswith(
        {
            "audio/ogg": b"OggS",
            "audio/webm": b"\x1a\x45\xdf\xa3",
            "image/png": b"\x89PNG\r\n\x1a\n",
            "image/jpeg": b"\xff\xd8\xff",
            "image/gif": b"GIF8",
        }[kind]
    )


@router.post("/admin/instruction-media", dependencies=staff, status_code=201)
async def upload_media(request: Request, session: Session):
    kind = request.headers.get("content-type", "").split(";")[0]
    extension = media_types.get(kind)
    if not extension:
        raise HTTPException(422, "Выберите файл изображения или аудио")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > 8 * 1024 * 1024:
            raise HTTPException(413, "Файл должен занимать не более 8 МБ")
        data.extend(chunk)
    if not valid_media(kind, data):
        raise HTTPException(422, "Содержимое файла не соответствует формату")
    media_id = f"{uuid4().hex}.{extension}"
    session.add(InstructionMedia(id=media_id, media_type=kind, content=bytes(data)))
    await session.commit()
    return {"url": f"/api/instruction-media/{media_id}"}


@router.get("/instruction-media/{media_id}")
async def read_media(media_id: str, request: Request, session: Session):
    row = await session.get(InstructionMedia, media_id)
    if row is None:
        raise HTTPException(404, "Файл не найден")
    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Accept-Ranges": "bytes",
    }
    content = row.content
    size = len(content)
    requested = fullmatch(r"bytes=(\d{0,20})-(\d{0,20})", request.headers.get("range", ""))
    if requested and any(requested.groups()):
        first, last = requested.groups()
        start = int(first) if first else max(0, size - int(last))
        end = min(size - 1, int(last)) if first and last else size - 1
        if start > end:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        return Response(
            content[start : end + 1], status_code=206, media_type=row.media_type, headers=headers
        )
    return Response(content, media_type=row.media_type, headers=headers)
