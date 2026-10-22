from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import read_token
from app.db import get_session
from app.models import AdminUser

Session = Annotated[AsyncSession, Depends(get_session)]


async def current_admin(request: Request, session: Session) -> AdminUser:
    """Достаёт сотрудника из заголовка Authorization: Bearer <jwt>."""
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    user_id = read_token(token) if scheme.lower() == "bearer" and token else None
    user = await session.get(AdminUser, user_id) if user_id else None
    if user is None or not user.is_active:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Нужно войти в админку",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


Admin = Annotated[AdminUser, Depends(current_admin)]
