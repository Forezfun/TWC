"""Обратный звонок без аккаунта заявителя; список доступен только сотрудникам."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.api.deps import Session, current_admin
from app.models.callback import CallbackRequest
from app.models.consultation import ConsultationRequest, RequestEvent
from app.schemas.callback import CallbackCreate, CallbackOut, CallbackReceipt

router = APIRouter(tags=["callbacks"])


@router.post("/callback-requests", response_model=CallbackReceipt, status_code=201)
async def create_callback(
    payload: CallbackCreate, session: Session, response: Response
) -> CallbackRequest:
    request = ConsultationRequest(contact=payload.phone)
    session.add(request)
    await session.flush()
    # Уникальный ключ защищает в том числе от двух одновременных запросов.
    saved = await session.scalar(
        insert(CallbackRequest)
        .values(**payload.model_dump(), request_id=request.id)
        .on_conflict_do_nothing(constraint="uq_callback_requests_idempotency_key")
        .returning(CallbackRequest)
    )
    if saved is not None:
        session.add(
            RequestEvent(
                request_id=request.id, kind="created", status=request.status,
                occurred_at=request.created_at,
            )
        )
        await session.commit()
        return saved

    # При повторе откатываем создание второй заявки вместе с этой транзакцией.
    await session.rollback()
    existing = await session.scalar(
        select(CallbackRequest).where(CallbackRequest.idempotency_key == payload.idempotency_key)
    )
    if existing is None or existing.phone != payload.phone:
        raise HTTPException(409, "Этот запрос уже был отправлен с другим номером.")
    response.status_code = 200
    return existing


@router.get(
    "/admin/callback-requests",
    response_model=list[CallbackOut],
    dependencies=[Depends(current_admin)],
)
async def list_callbacks(session: Session, response: Response) -> list[CallbackRequest]:
    response.headers["Cache-Control"] = "no-store"
    return (
        await session.scalars(select(CallbackRequest).order_by(CallbackRequest.id.desc()))
    ).all()
