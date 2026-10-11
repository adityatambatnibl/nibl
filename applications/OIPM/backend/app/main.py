from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import os
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.middleware.cors import CORSMiddleware

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.api.email import router as email_router


# ============================================================
# API ROUTERS
# ============================================================

from app.api.plant_head import (
    router as plant_head_router
)

from app.api.hod import (
    router as hod_router,
)

from app.api.accounts import (
    router as accounts_router,
)

from app.api.auth import (
    router as auth_router
)

from app.api.improvements import (
    router as improvements_router
)

from app.api.admin import (
    router as admin_router
)

from app.api.drafts import router as drafts_router
from app.api.local_storage import router as local_storage_router
from app.api.portal import router as portal_router


# ============================================================
# MODELS
# ============================================================

from app.models.user import User
from app.models.improvement import Improvement
from app.models.draft import Draft


# ============================================================
# DATABASE
# ============================================================

from app.db.base import Base
from app.db.database import (
    engine,
    SessionLocal,
    ensure_improvement_activity_and_benefit_schema,
)


# ============================================================
# CONFIG
# ============================================================

from app.core.config import settings


# ============================================================
# NOTIFICATION SERVICE
# ============================================================

from app.services.notification_service import (
    send_daily_plant_head_summary,
)


# ============================================================
# DAILY SUMMARY SCHEDULER
# ============================================================

scheduler = BackgroundScheduler(
    timezone="Asia/Kolkata"
)


def run_daily_plant_head_summary():
    """
    Sends the previous day's OIPM activity summary
    to all active Plant Heads.
    """

    db = SessionLocal()

    try:

        # ----------------------------------------------------
        # Calculate yesterday according to IST.
        # ----------------------------------------------------

        india_now = datetime.now(
            ZoneInfo("Asia/Kolkata")
        )

        yesterday = (
            india_now.date()
            - timedelta(days=1)
        )


        print(
            "Running OIPM daily Plant Head summary "
            f"for {yesterday}"
        )


        # ----------------------------------------------------
        # Send summary
        # ----------------------------------------------------

        sent_count = (
            send_daily_plant_head_summary(
                db=db,
                target_date=yesterday,
            )
        )


        print(
            "OIPM daily Plant Head summary completed. "
            f"Emails sent: {sent_count}"
        )


    except Exception as error:

        print(
            "OIPM daily Plant Head summary failed:",
            error,
        )


    finally:

        db.close()


# ============================================================
# APPLICATION LIFESPAN
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    # --------------------------------------------------------
    # START DAILY SUMMARY SCHEDULER
    # --------------------------------------------------------

    if not scheduler.running:

        scheduler.add_job(

            run_daily_plant_head_summary,

            trigger=CronTrigger(

                hour=9,

                minute=0,

                timezone="Asia/Kolkata",
            ),

            id="daily_plant_head_summary",

            replace_existing=True,

            misfire_grace_time=3600,
        )


        scheduler.start()


        print(
            "OIPM daily Plant Head summary scheduler started."
        )


    yield


    # --------------------------------------------------------
    # SHUTDOWN SCHEDULER
    # --------------------------------------------------------

    if scheduler.running:

        scheduler.shutdown(
            wait=False
        )


        print(
            "OIPM daily Plant Head summary scheduler stopped."
        )


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(

    title=settings.APP_NAME,

    version="1.0.0",

    description=(
        "NIBL One Person One Improvement API"
    ),

    lifespan=lifespan,

    # API pages (/docs) are for development only - hidden when ENVIRONMENT=production.
    docs_url=None if os.getenv("ENVIRONMENT", "development").strip().lower() == "production" else "/docs",
    redoc_url=None,
    openapi_url=None if os.getenv("ENVIRONMENT", "development").strip().lower() == "production" else "/openapi.json",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        os.getenv(
            "FRONTEND_URL",
            "http://nibl",
        ),
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)


# ============================================================
# DATABASE TABLES
# ============================================================

Base.metadata.create_all(
    bind=engine
)

ensure_improvement_activity_and_benefit_schema()


# ============================================================
# ROUTERS
# ============================================================

app.include_router(
    auth_router
)

app.include_router(
    improvements_router
)

app.include_router(
    hod_router
)

app.include_router(
    accounts_router
)

app.include_router(
    plant_head_router
)

app.include_router(
    admin_router
)

app.include_router(
    email_router,
    prefix="/api/v1",
)

app.include_router(
    drafts_router
)

app.include_router(
    local_storage_router
)

# NIBL portal: create users here / report their OIPM approval.
app.include_router(
    portal_router
)


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "message": "NIBL OIPM API is running",

        "environment": settings.ENVIRONMENT,
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "healthy",
    }


# ============================================================
# CUSTOM OPENAPI
#
# Fix Swagger UI file-upload rendering.
#
# FastAPI can generate file schemas using:
#
#     contentMediaType:
#         application/octet-stream
#
# Swagger UI expects:
#
#     type: string
#     format: binary
#
# This converts the generated schemas so that
# multiple UploadFile fields appear as actual
# file upload controls in Swagger.
# ============================================================

def custom_openapi():

    # --------------------------------------------------------
    # Do not regenerate the schema every request.
    # --------------------------------------------------------

    if app.openapi_schema:

        return app.openapi_schema


    # --------------------------------------------------------
    # Generate the normal FastAPI OpenAPI schema.
    # --------------------------------------------------------

    schema = get_openapi(

        title=app.title,

        version=app.version,

        description=app.description,

        routes=app.routes,
    )


    # --------------------------------------------------------
    # Force OpenAPI 3.0.3.
    # --------------------------------------------------------

    schema["openapi"] = "3.0.3"


    # --------------------------------------------------------
    # Get component schemas.
    # --------------------------------------------------------

    components = schema.get(
        "components",
        {}
    )

    schemas = components.get(
        "schemas",
        {}
    )


    # --------------------------------------------------------
    # Walk through every generated schema.
    # --------------------------------------------------------

    for schema_name, schema_definition in schemas.items():

        if not isinstance(
            schema_definition,
            dict
        ):

            continue


        properties = schema_definition.get(
            "properties",
            {}
        )


        if not isinstance(
            properties,
            dict
        ):

            continue


        # ----------------------------------------------------
        # Check every property.
        # ----------------------------------------------------

        for property_name, property_definition in properties.items():

            if not isinstance(
                property_definition,
                dict
            ):

                continue


            # ==================================================
            # SINGLE FILE
            # ==================================================

            if (
                property_definition.get("type")
                == "string"
                and
                property_definition.get(
                    "contentMediaType"
                )
                == "application/octet-stream"
            ):

                property_definition.pop(
                    "contentMediaType",
                    None
                )

                property_definition[
                    "format"
                ] = "binary"


            # ==================================================
            # MULTIPLE FILES
            #
            # files: list[UploadFile]
            # ==================================================

            if (
                property_definition.get("type")
                == "array"
            ):

                items = property_definition.get(
                    "items"
                )


                if isinstance(
                    items,
                    dict
                ):

                    if (
                        items.get(
                            "contentMediaType"
                        )
                        == "application/octet-stream"
                    ):

                        items.pop(
                            "contentMediaType",
                            None
                        )

                        items[
                            "type"
                        ] = "string"

                        items[
                            "format"
                        ] = "binary"


    # --------------------------------------------------------
    # Save modified schema.
    # --------------------------------------------------------

    app.openapi_schema = schema


    return app.openapi_schema


# ============================================================
# OVERRIDE FASTAPI OPENAPI GENERATOR
# ============================================================

app.openapi = custom_openapi
