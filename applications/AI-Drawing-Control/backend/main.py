"""
Drawing Control - backend (independent application, database nibl_drawing).

    /api/drawings/*   the application
    /api/portal/*     NIBL portal integration (create users, report access)
    /api/health

Start (from this folder):  uvicorn main:app --port 8002
Behind IIS it is reached as /ai-drawing-control/api/... (rewritten to :8002/api/...).
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from config.settings import settings
from database.connection import close_db, init_db, session_scope
from routes import drawing_routes, portal_routes

log = logging.getLogger("drawing")
scheduler = None


async def _reminder_job():
    from services import drawing_email_service
    try:
        async with session_scope():
            await drawing_email_service.send_reminders()
    except Exception:
        log.exception("Drawing reminders failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global scheduler
    await init_db()
    if settings.SCHEDULER_ENABLED:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
        try:
            hh, mm = (int(x) for x in settings.DRAWING_REMINDER_TIME.split(":", 1))
        except ValueError:
            hh, mm = 9, 0
        scheduler = AsyncIOScheduler(timezone=settings.SCHEDULER_TIMEZONE)
        # Every day at 09:00 (India time by default) - one reminder email per person.
        scheduler.add_job(_reminder_job, CronTrigger(hour=hh, minute=mm), id="drawing_reminders",
                          coalesce=True, max_instances=1, replace_existing=True, misfire_grace_time=3 * 3600)
        scheduler.start()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)
    await close_db()


# API pages (/docs) are for development only - hidden when ENVIRONMENT=production.
_docs = settings.ENVIRONMENT.strip().lower() != "production"
app = FastAPI(title="Drawing Control", version="1.0.0", lifespan=lifespan,
              docs_url="/api/docs" if _docs else None, redoc_url=None,
              openapi_url="/api/openapi.json" if _docs else None)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition"])


@app.middleware("http")
async def db_session(request: Request, call_next):
    """One transaction per request; anything answered with 400+ is rolled back (same as NPD)."""
    async with session_scope() as session:
        response = await call_next(request)
        if response.status_code >= 400:
            session.info["failed"] = True
            await session.rollback()
    return response


app.include_router(drawing_routes.router, prefix="/api")
app.include_router(portal_routes.router, prefix="/api")


@app.get("/api/health", tags=["System"])
def health():
    return {"status": "ok", "app": "ai-drawing-control"}
