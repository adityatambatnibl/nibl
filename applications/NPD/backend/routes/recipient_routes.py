"""
Per-project email recipients - set on "Create new timeline" and later on the
project. Allowed for anyone who may create a timeline, and for admins.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from models.user import User
from services import recipient_service
from utils.constants import Permission
from utils.deps import require_permission

router = APIRouter(prefix="/recipients", tags=["Email recipients"])


class RecipientsIn(BaseModel):
    stage_owners: dict[str, list[str]] = Field(default_factory=dict)   # stage_code -> emails
    dept_owners: dict[str, list[str]] = Field(default_factory=dict)    # department -> emails


@router.get("/options")
async def options(_: User = Depends(require_permission(Permission.TIMELINE_CREATE))):
    return await recipient_service.options()


@router.get("/project/{key}")
async def get_project(key: str, _: User = Depends(require_permission(Permission.TIMELINE_CREATE))):
    return await recipient_service.get_for_project(key)


@router.put("/project/{key}")
async def put_project(key: str, data: RecipientsIn, user: User = Depends(require_permission(Permission.TIMELINE_CREATE))):
    return await recipient_service.save_for_project(key, data.stage_owners, data.dept_owners, user)


class PreviewIn(BaseModel):
    project: str | None = None       # empty on Create new timeline -> latest project as example
    kind: str                        # "stage" | "dept"
    code: str                        # stage code or department
    emails: list[str] = Field(default_factory=list)


@router.post("/preview")
async def preview(data: PreviewIn, _: User = Depends(require_permission(Permission.TIMELINE_CREATE))):
    """The real emails these people would get - built, never sent."""
    return await recipient_service.preview(data.project, data.kind, data.code, data.emails)
