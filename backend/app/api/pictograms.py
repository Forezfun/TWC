import base64
import binascii
import hashlib
import json
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError

from app.api.deps import Session, current_admin
from app.models import PictogramImage, PictogramSelection, PictogramSet

router = APIRouter(tags=["pictograms"])
admin = [Depends(current_admin)]
catalog_path = Path(__file__).resolve().parents[3] / "shared" / "pictograms"
ARASAAC_SET_ID = "arasaac-all"
max_bundle_bytes = 16 * 1024 * 1024
max_image_bytes = 512 * 1024

Category = Literal[
    "Действия", "Эмоции", "Места", "Предметы", "Люди", "Еда и напитки", "Транспорт", "Здоровье",
    "Общение", "Животные", "Природа", "Учёба", "Спорт", "Работа", "Другое",
]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Alias = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class ImportImage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mime_type: Literal["image/png", "image/jpeg", "image/webp"]
    base64: str = Field(min_length=1, max_length=4 * ((max_image_bytes + 2) // 3))


class ImportPictogram(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Title
    category: Category = "Другое"
    aliases: list[Alias] = Field(default_factory=list, max_length=20)
    image: ImportImage


class ImportBundle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    title: Title
    pictograms: list[ImportPictogram] = Field(min_length=1, max_length=250)


class SelectionInput(BaseModel):
    set_id: str = Field(max_length=50)
    pictogram_ids: list[str] = Field(max_length=30_000)


def image_bytes(image: ImportImage, position: int) -> bytes:
    try:
        content = base64.b64decode(image.base64, validate=True)
    except (ValueError, binascii.Error):
        content = b""
    matches = {
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/webp": content.startswith(b"RIFF") and content[8:12] == b"WEBP",
    }
    if (not matches[image.mime_type] or len(content) > max_image_bytes
            or base64.b64encode(content).decode() != image.base64):
        raise HTTPException(422, f"Проверьте формат и размер изображения №{position}.")
    return content


def describe_set(set_id: str, title: str, pictograms: list[dict]) -> dict:
    return {"id": set_id, "title": title, "pictogram_ids": [p["id"] for p in pictograms]}


@lru_cache(maxsize=1)
def built_in_catalog() -> tuple[list[dict], list[dict]]:
    def read(name):
        return json.loads((catalog_path / f"{name}.json").read_text(encoding="utf-8"))

    kolibri = [
        dict(id=id_, title=title, category=category, aliases=aliases,
             url=f"/kolibri/pictograms/{id_}.svg")
        for id_, title, category, aliases in read("kolibri")
    ]
    index = {entry[0]: entry for entry in read("arasaac-index")}
    arasaac = []
    for id_, title, category, aliases in read("arasaac-basic"):
        official = index.pop(id_, None)
        keywords = [official[1], *official[3]] if official else [str(id_)]
        arasaac.append(dict(
            id=f"arasaac-{id_}", title=title, category=category,
            aliases=list(dict.fromkeys([*aliases, *keywords])),
            url=f"/kolibri/pictograms/arasaac/{id_}.png",
        ))
    for id_, title, category, aliases in index.values():
        arasaac.append(dict(
            id=f"arasaac-{id_}", title=title, category=category, aliases=aliases,
            url=f"https://static.arasaac.org/pictograms/{id_}/{id_}_300.png",
        ))
    return [
        describe_set("kolibri-all", "Колибри · все пиктограммы", kolibri),
        describe_set("arasaac-all", "ARASAAC · все пиктограммы", arasaac),
    ], [*kolibri, *arasaac]


def imported_set(row: PictogramSet) -> dict:
    return {"set": describe_set(row.id, row.title, row.pictograms), "pictograms": row.pictograms}


def title_key(title: str) -> str:
    normalized = unicodedata.normalize("NFKC", title).lower()
    return hashlib.sha256(normalized.encode()).hexdigest()


@router.get("/admin/pictograms", dependencies=admin)
async def library(
    request: Request, session: Session,
    scope: Literal["all", "light", "selected"] = "all",
):
    """Каталог пиктограмм.

    `all` — всё, включая полный индекс ARASAAC (несколько мегабайт).
    `light` — без пиктограмм ARASAAC, пока выбран другой набор; тогда `partial: true`.
    `selected` — только отмеченные пиктограммы: их хватает редактору сценариев.
    """
    sets, pictograms = built_in_catalog()
    rows = (await session.scalars(select(PictogramSet).order_by(PictogramSet.title))).all()
    saved = await session.get(PictogramSelection, 1)
    selection = (
        {"set_id": saved.set_id, "pictogram_ids": saved.pictogram_ids}
        if saved else {"set_id": sets[0]["id"], "pictogram_ids": sets[0]["pictogram_ids"]}
    )
    all_sets = [*sets, *(describe_set(row.id, row.title, row.pictograms) for row in rows)]
    all_pictograms = [*pictograms, *(p for row in rows for p in row.pictograms)]
    partial = False
    if scope == "selected":
        chosen = set(selection["pictogram_ids"])
        all_sets, all_pictograms = [], [p for p in all_pictograms if p["id"] in chosen]
    elif scope == "light" and selection["set_id"] != ARASAAC_SET_ID:
        partial = True
        all_sets = [
            {**item, "pictogram_ids": []} if item["id"] == ARASAAC_SET_ID else item
            for item in all_sets
        ]
        all_pictograms = [p for p in all_pictograms if not p["id"].startswith("arasaac-")]
    body = json.dumps({
        "sets": all_sets, "pictograms": all_pictograms, "selection": selection, "partial": partial,
    }, ensure_ascii=False, separators=(",", ":")).encode()
    # Каталог весит несколько мегабайт и меняется редко: браузер перепроверяет
    # его по ETag и при совпадении получает пустой ответ 304.
    headers = {
        "ETag": f'W/"{hashlib.sha256(body).hexdigest()[:32]}"',
        "Cache-Control": "private, no-cache",
    }
    if request.headers.get("if-none-match") == headers["ETag"]:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)


@router.put("/admin/pictograms", dependencies=admin)
async def save_selection(payload: SelectionInput, session: Session):
    sets, _ = built_in_catalog()
    selected_set = next((item for item in sets if item["id"] == payload.set_id), None)
    if selected_set is None:
        row = await session.get(PictogramSet, payload.set_id)
        selected_set = describe_set(row.id, row.title, row.pictograms) if row else None
    ids = set(payload.pictogram_ids)
    if (selected_set is None or len(ids) != len(payload.pictogram_ids)
            or not ids.issubset(selected_set["pictogram_ids"])):
        raise HTTPException(422, "Выберите пиктограммы из указанного набора.")
    values = payload.model_dump()
    await session.execute(insert(PictogramSelection).values(id=1, **values).on_conflict_do_update(
        index_elements=["id"], set_=values,
    ))
    await session.commit()
    return values


@router.post("/admin/pictograms/import", dependencies=admin, status_code=201)
async def import_pictograms(request: Request, response: Response, session: Session):
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > max_bundle_bytes:
            raise HTTPException(413, "Набор должен занимать не более 16 МБ.")
        body.extend(chunk)
    try:
        bundle = ImportBundle.model_validate_json(body, strict=True)
    except ValidationError as exc:
        location = exc.errors(include_input=False, include_context=False)[0]["loc"]
        field = ".".join(str(part) for part in location)
        detail = f"Проверьте поле «{field}» в файле набора." if field else "Выберите файл JSON."
        raise HTTPException(422, detail) from None

    key = title_key(bundle.title)
    if any(title_key(item["title"]) == key for item in built_in_catalog()[0]):
        raise HTTPException(409, "Набор с таким названием уже существует.")
    fingerprint = hashlib.sha256(bundle.model_dump_json().encode()).hexdigest()
    set_id = f"import-{uuid4().hex}"
    pictograms = []
    images = []
    for position, item in enumerate(bundle.pictograms, start=1):
        image_id = uuid4().hex
        pictograms.append(dict(
            id=image_id, title=item.title, category=item.category, aliases=item.aliases,
            url=f"/api/pictogram-images/{image_id}",
        ))
        images.append(PictogramImage(
            id=image_id, set_id=set_id, media_type=item.image.mime_type,
            content=image_bytes(item.image, position),
        ))
    row = PictogramSet(
        id=set_id, title=bundle.title, title_key=key, fingerprint=fingerprint,
        pictograms=pictograms,
    )
    session.add(row)
    try:
        await session.flush()
        session.add_all(images)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(select(PictogramSet).where(PictogramSet.title_key == key))
        if not existing:
            raise
        if existing.fingerprint != fingerprint:
            raise HTTPException(409, "Набор с таким названием уже существует.") from None
        response.status_code = 200
        return imported_set(existing)
    return imported_set(row)


@router.get("/pictogram-images/{image_id}")
async def get_image(image_id: str, session: Session):
    image = await session.get(PictogramImage, image_id)
    if image is None:
        raise HTTPException(404, "Пиктограмма не найдена.")
    return Response(
        image.content, media_type=image.media_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable",
                 "X-Content-Type-Options": "nosniff"},
    )
