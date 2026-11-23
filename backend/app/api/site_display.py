"""Editable public roles and scenario support links."""

from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Response
from pydantic import AfterValidator, BaseModel, Field, StringConstraints, model_validator
from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert

from app.api.deps import Admin, Session
from app.models import ScenarioNode, Setting
from app.models.instructions import Instruction

router = APIRouter(tags=["site display"])
setting_key = "site_display"
defaults = Path(__file__).resolve().parents[3] / "shared/site/display.json"

RoleKey = Annotated[
    str, StringConstraints(pattern=r"^(self|parents|specialists|role-[a-z0-9-]{1,42})$")
]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


def web_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        if parsed.scheme in {"https", "http"} and parsed.hostname and not parsed.username:
            return value
    except ValueError:
        pass
    raise ValueError("Укажите ссылку с https:// или http://.")


def media_url(value: str) -> str:
    if value.startswith("/") and not value.startswith("//"):
        return value
    return web_url(value)


Url = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=2048, pattern=r"^[^\s\\]+$"),
    AfterValidator(web_url),
]
MediaUrl = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=2048, pattern=r"^[^\s\\]+$"),
    AfterValidator(media_url),
]


class SiteRole(BaseModel):
    key: RoleKey
    title: Name
    hint: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""
    audio_url: MediaUrl | None = None
    hint_audio_url: MediaUrl | None = None
    icon_url: MediaUrl | None = None
    is_hidden: bool = False


class SupportButton(BaseModel):
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    url: Url | None
    role_keys: list[RoleKey]


class SiteDisplay(BaseModel):
    roles: list[SiteRole]
    donate: SupportButton
    volunteer: SupportButton
    revision: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def check_roles(self):
        keys = {role.key for role in self.roles}
        titles = {role.title.casefold() for role in self.roles}
        if len(keys) != len(self.roles) or len(titles) != len(self.roles) or len(keys) > 100:
            raise ValueError("Укажите разные названия ролей.")
        for button in (self.donate, self.volunteer):
            if not set(button.role_keys).issubset(keys) or len(set(button.role_keys)) != len(
                button.role_keys
            ):
                raise ValueError("Выберите существующие роли без повторов.")
        return self

    def public(self) -> "SiteDisplay":
        roles = [role for role in self.roles if not role.is_hidden]
        keys = {role.key for role in roles}
        return SiteDisplay(
            roles=roles,
            revision=self.revision,
            donate=self.donate.model_copy(
                update={
                    "role_keys": [key for key in self.donate.role_keys if key in keys],
                }
            ),
            volunteer=self.volunteer.model_copy(
                update={
                    "role_keys": [key for key in self.volunteer.role_keys if key in keys],
                }
            ),
        )


default_display = SiteDisplay.model_validate_json(defaults.read_text(encoding="utf-8"))


async def lock_display(session: Session, *, shared: bool = False) -> Setting:
    await session.execute(
        insert(Setting)
        .values(key=setting_key, value=default_display.model_dump_json())
        .on_conflict_do_nothing(index_elements=[Setting.key])
    )
    return await session.get(
        Setting, setting_key, with_for_update={"read": True} if shared else True
    )


async def read_display(session: Session, *, lock: bool = False) -> SiteDisplay:
    saved = (
        await lock_display(session, shared=True)
        if lock
        else await session.get(Setting, setting_key)
    )
    return SiteDisplay.model_validate_json(saved.value) if saved else default_display


async def public_role_keys(session: Session) -> set[str]:
    return {role.key for role in (await read_display(session)).roles if not role.is_hidden}


@router.get("/site-display", response_model=SiteDisplay)
async def get_display(session: Session, response: Response) -> SiteDisplay:
    response.headers["Cache-Control"] = "no-store"
    return (await read_display(session)).public()


@router.get("/admin/site-display", response_model=SiteDisplay)
async def get_admin_display(_: Admin, session: Session, response: Response) -> SiteDisplay:
    response.headers["Cache-Control"] = "no-store"
    return await read_display(session)


@router.put("/admin/site-display", response_model=SiteDisplay)
async def save_display(payload: SiteDisplay, _: Admin, session: Session) -> SiteDisplay:
    saved = await lock_display(session)
    previous = SiteDisplay.model_validate_json(saved.value)
    if "revision" in payload.model_fields_set and payload.revision != previous.revision:
        raise HTTPException(409, "Настройки уже изменились. Обновите страницу и повторите.")
    removed = {role.key for role in previous.roles} - {role.key for role in payload.roles}
    if removed:
        await session.execute(
            update(Instruction)
            .where(
                Instruction.audience.in_(removed),
                Instruction.is_published.is_(True),
            )
            .values(is_published=False)
        )
        legacy = {key for key in removed if key in {"self", "parents", "specialists"}}
        if legacy:
            await session.execute(
                update(ScenarioNode)
                .where(
                    ScenarioNode.audience.in_(legacy),
                    ScenarioNode.is_published.is_(True),
                )
                .values(is_published=False)
            )
    result = payload.model_copy(update={"revision": previous.revision + 1})
    saved.value = result.model_dump_json()
    await session.commit()
    return result
