from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from models.user import User
from services import audit_service
from utils.deps import require_admin

router = APIRouter(prefix="/audit", tags=["Audit History"])


class AuditOut(BaseModel):
    id: str
    action: str
    actor_id: str
    actor_name: str
    target_type: str | None
    target_label: str | None
    before: dict | None
    after: dict | None
    note: str | None
    created_at: str


class AuditCount(BaseModel):
    total: int
    without_sign_ins: int


@router.get("/count", response_model=AuditCount)
async def count_logs(_: User = Depends(require_admin)):
    return AuditCount(
        total=await audit_service.count_logs(True),
        without_sign_ins=await audit_service.count_logs(False),
    )


@router.get("", response_model=list[AuditOut])
async def list_logs(
    target_type: str | None = Query(default=None),
    actor_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=100000),
    _: User = Depends(require_admin),
):
    logs = await audit_service.list_logs(target_type, limit, actor_id)
    return [
        AuditOut(
            id=str(l.id), action=l.action, actor_id=l.actor_id, actor_name=l.actor_name,
            target_type=l.target_type, target_label=l.target_label,
            before=l.before, after=l.after, note=l.note,
            created_at=l.created_at.isoformat(),
        )
        for l in logs
    ]