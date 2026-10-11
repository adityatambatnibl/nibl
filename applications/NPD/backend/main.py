from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from database.connection import close_db, init_db, session_scope, settings
from routes import (
    analytics_routes,
    apqp_routes,
    attachment_routes,
    audit_routes,
    auth_routes,
    dashboard_routes,
    excel_routes,
    notification_config_routes,
    notification_routes,
    order_routes,
    portal_routes,
    recipient_routes,
    template_routes,
    timeline_routes,
    user_routes,
)
from services import cron_service, read_cache


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Tables added after 001_schema.sql - created here so no manual SQL is needed.
    from database.connection import ensure_tables
    from models.project_recipients import ProjectRecipients
    await ensure_tables(ProjectRecipients.__table__)
    await cron_service.start()
    yield
    cron_service.shutdown()
    await close_db()


# API pages (/docs) are for development only - hidden when ENVIRONMENT=production.
_docs = settings.ENVIRONMENT.strip().lower() != "production"
app = FastAPI(title="APQP / Order Development Tracking System", version="1.0.0", lifespan=lifespan,
              docs_url="/docs" if _docs else None, redoc_url=None,
              openapi_url="/openapi.json" if _docs else None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def db_session(request: Request, call_next):
    """
    One database transaction per request.

    Opening the session here rather than as a FastAPI dependency means the
    service layer keeps the signatures it had under Beanie - it reaches the
    session through `db()` instead of receiving it as an argument. The
    request either commits as a whole or rolls back as a whole, which Mongo
    could not offer at all.

    A failed request must not leave half its writes behind. An unhandled
    exception is rolled back by session_scope itself, but an HTTPException is
    not an exception by the time it gets here - FastAPI has already turned it
    into an ordinary 4xx response, and the scope would happily commit
    whatever ran before the raise. So the status code is checked explicitly
    and anything from 400 up is rolled back.
    """
    async with session_scope() as session:
        response = await call_next(request)
        if response.status_code >= 400:
            session.info["failed"] = True
            await session.rollback()

    # Any write (even a failed one - cheap and always safe) clears the
    # cached dashboard / list results, after the commit above.
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        read_cache.bump()
    return response


app.include_router(auth_routes.router, prefix="/api")
app.include_router(user_routes.router, prefix="/api")
app.include_router(notification_routes.router, prefix="/api")
app.include_router(audit_routes.router, prefix="/api")
app.include_router(template_routes.router, prefix="/api")
app.include_router(order_routes.router, prefix="/api")
app.include_router(dashboard_routes.router, prefix="/api")
app.include_router(timeline_routes.router, prefix="/api")
app.include_router(excel_routes.router, prefix="/api")
app.include_router(apqp_routes.router, prefix="/api")
app.include_router(attachment_routes.router, prefix="/api")
app.include_router(notification_config_routes.router, prefix="/api")
app.include_router(analytics_routes.router, prefix="/api")
app.include_router(recipient_routes.router, prefix="/api")
app.include_router(portal_routes.router, prefix="/api")        # NIBL portal integration


@app.get("/api/health", tags=["System"])
def health():
    return {"status": "ok"}
