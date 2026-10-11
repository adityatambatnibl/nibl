"""
NIBL Application Portal - backend.

    /portal-api/auth/*       register, sign in, refresh, sign out, forgot / change password
    /portal-api/projects     the application cards for the signed-in user
    /portal-api/users/*      portal admin
    /portal-api/internal/*   called by applications

Start (from portal/backend):  uvicorn app.main:app --port 8010
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, internal, projects, users
from app.core.config import is_production, settings
from app.db.database import SessionLocal, engine
from app.db.models import Base, import_all_models

log = logging.getLogger("portal")
PREFIX = "/portal-api"


async def _retry_loop():
    """Every 5 minutes, create users in any application that was down when they registered."""
    from app.services import project_service
    while True:
        await asyncio.sleep(300)
        try:
            with SessionLocal() as db:
                n = await project_service.retry_pending(db)
            if n:
                log.info("Provisioned %s pending application account(s)", n)
        except Exception as exc:
            log.warning("Provisioning retry failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    import_all_models()
    Base.metadata.create_all(bind=engine)      # creates portal tables only if missing
    task = asyncio.create_task(_retry_loop())
    yield
    task.cancel()


# API pages (/docs) are for development only - hidden when ENVIRONMENT=production.
_docs = not is_production()
app = FastAPI(title=settings.APP_NAME, version="1.0.0", lifespan=lifespan,
              docs_url=f"{PREFIX}/docs" if _docs else None, redoc_url=None,
              openapi_url=f"{PREFIX}/openapi.json" if _docs else None)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

api = APIRouter(prefix=PREFIX)
api.include_router(auth.router)
api.include_router(projects.router)
api.include_router(users.router)
api.include_router(internal.router)
app.include_router(api)


@app.get(f"{PREFIX}/health", tags=["System"])
def health():
    return {"status": "ok", "app": "portal"}
