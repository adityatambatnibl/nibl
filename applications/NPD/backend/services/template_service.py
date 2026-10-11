from fastapi import HTTPException, status
from sqlalchemy import select

from database import repo
from models.template import Template, TemplateKind


async def get_active(kind: str) -> Template:
    tpl = await repo.find_one(
        select(Template).where(Template.kind == kind, Template.is_active.is_(True))
    )
    if not tpl:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"No active '{kind}' template found. Run the template seed script.",
        )
    return tpl


async def get_stages() -> Template:
    return await get_active(TemplateKind.PRODUCTION_STAGES)


async def get_lookups() -> Template:
    return await get_active(TemplateKind.LOOKUPS)
