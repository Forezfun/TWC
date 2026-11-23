"""Вход в админку и управление сотрудниками."""

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from app.api.deps import Admin, Session
from app.auth import hash_password, issue_token, verify_password
from app.models import AdminUser
from app.schemas.admin import AdminCreate, AdminOut, LoginIn, LoginOut, PasswordChange

router = APIRouter(prefix="/admin", tags=["auth"])


@router.post("/login", response_model=LoginOut)
async def login(payload: LoginIn, session: Session) -> LoginOut:
    """Выдаёт JWT на JWT_TTL_HOURS часов. Дальше — заголовок Authorization: Bearer <token>."""
    user = await session.scalar(select(AdminUser).where(AdminUser.email == payload.email.lower()))
    if (
        user is None
        or not user.is_active
        or user.is_archived
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(401, "Неверная почта или пароль")
    return LoginOut(token=issue_token(user.id), user=AdminOut.model_validate(user))


@router.get("/me", response_model=AdminOut)
async def me(admin: Admin) -> AdminUser:
    return admin


@router.post("/me/password", status_code=204)
async def change_password(payload: PasswordChange, admin: Admin, session: Session) -> Response:
    if not verify_password(payload.current_password, admin.password_hash):
        raise HTTPException(400, "Текущий пароль неверный")
    admin.password_hash = hash_password(payload.new_password)
    await session.commit()
    return Response(status_code=204)


@router.get("/users", response_model=list[AdminOut])
async def list_users(_: Admin, session: Session, archived: bool = False) -> list[AdminUser]:
    query = select(AdminUser).where(AdminUser.is_archived == archived).order_by(AdminUser.id)
    return (await session.scalars(query)).all()


@router.post("/users", response_model=AdminOut, status_code=201)
async def create_user(payload: AdminCreate, _: Admin, session: Session) -> AdminUser:
    email = payload.email.lower()
    if await session.scalar(select(AdminUser.id).where(AdminUser.email == email)):
        raise HTTPException(409, "Сотрудник с такой почтой уже есть")
    user = AdminUser(email=email, name=payload.name, password_hash=hash_password(payload.password))
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.patch("/users/{user_id}/active", response_model=AdminOut)
async def set_active(user_id: int, active: bool, admin: Admin, session: Session) -> AdminUser:
    if user_id == admin.id:
        raise HTTPException(400, "Нельзя отключить самого себя")
    user = await session.get(AdminUser, user_id, with_for_update=True)
    if user is None:
        raise HTTPException(404, "Сотрудник не найден")
    if user.is_archived:
        raise HTTPException(409, "Сначала верните сотрудника из архива")
    user.is_active = active
    await session.commit()
    await session.refresh(user)
    return user


@router.patch("/users/{user_id}/archive", response_model=AdminOut)
async def set_archived(user_id: int, archived: bool, admin: Admin, session: Session) -> AdminUser:
    if user_id == admin.id:
        raise HTTPException(400, "Нельзя архивировать собственную учётную запись")
    user = await session.get(AdminUser, user_id, with_for_update=True)
    if user is None:
        raise HTTPException(404, "Сотрудник не найден")
    if user.is_archived != archived:
        user.is_archived = archived
        user.is_active = not archived
        await session.commit()
    return user
