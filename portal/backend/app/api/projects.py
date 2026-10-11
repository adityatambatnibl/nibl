"""/portal-api/projects - the cards the signed-in user sees, with their access in each application."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.permissions import require_portal_admin
from app.core.security import get_current_user
from app.db.database import get_db
from app.schemas.project import ProjectCard
from app.services import project_service

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get("", response_model=list[ProjectCard])
async def my_projects(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return await project_service.cards_for(db, user)


@router.get("/registry")
def registry(_=Depends(require_portal_admin)):
    """The raw registry (shared/configuration/projects.json), for the admin page."""
    return [{k: v for k, v in p.items() if k != "backend"} | {"backend_url": (p.get("backend") or {}).get("base_url")}
            for p in project_service.registry()]
