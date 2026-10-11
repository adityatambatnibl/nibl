from pathlib import Path
import os

from dotenv import load_dotenv


load_dotenv()



def cookie_secure() -> bool:
    """Send the sign-in cookie only over https?

    COOKIE_SECURE=true / false forces it. Left empty ("auto") it is on only when
    ENVIRONMENT=production AND the site address (FRONTEND_URL) starts with
    https:// - so a production server still on http://nibl keeps working
    (a "secure" cookie is never sent over plain http, which would log users out).
    """
    v = os.getenv("COOKIE_SECURE", "auto").strip().lower()
    if v in {"1", "true", "yes", "on"}:
        return True
    if v in {"0", "false", "no", "off"}:
        return False
    return (os.getenv("ENVIRONMENT", "development").strip().lower() == "production"
            and os.getenv("FRONTEND_URL", "").strip().lower().startswith("https://"))


def is_production() -> bool:
    return os.getenv("ENVIRONMENT", "development").strip().lower() == "production"


class Settings:

    APP_NAME = os.getenv(
        "APP_NAME",
        "NIBL OIPM",
    )

    ENVIRONMENT = os.getenv(
        "ENVIRONMENT",
        "development",
    )

    # ============================================================
    # DATABASE
    # ============================================================

    DB_HOST = os.getenv(
        "DB_HOST",
        "",
    ).strip()

    DB_PORT = int(
        os.getenv(
            "DB_PORT",
            "5432",
        ).strip()
    )

    DB_NAME = os.getenv(
        "DB_NAME",
        "postgres",
    ).strip()

    DB_USER = os.getenv(
        "DB_USER",
        "",
    ).strip()

    DB_PASSWORD = os.getenv(
        "DB_PASSWORD",
        "",
    ).strip()

    # ============================================================
    # JWT
    # ============================================================

    JWT_SECRET_KEY = os.getenv(
        "JWT_SECRET_KEY",
        "",
    ).strip()

    JWT_ALGORITHM = os.getenv(
        "JWT_ALGORITHM",
        "HS256",
    ).strip()

    ACCESS_TOKEN_EXPIRE_MINUTES = int(
        os.getenv(
            "ACCESS_TOKEN_EXPIRE_MINUTES",
            "480",
        ).strip()
    )

    # ============================================================
    # NIBL PORTAL
    # ============================================================

    # Shared secret the portal sends as X-Portal-Key.
    PORTAL_SERVICE_KEY = os.getenv(
        "PORTAL_SERVICE_KEY",
        "",
    ).strip()

    # Portal backend, for passwords changed by the OIPM admin.
    PORTAL_INTERNAL_URL = os.getenv(
        "PORTAL_INTERNAL_URL",
        "http://127.0.0.1:8010/portal-api",
    ).strip()

    # ============================================================
    # IMAGE STORAGE (local)
    # Default: applications/OIPM/data - everything OIPM stores stays inside
    # the OIPM application folder. Set OIPM_DATA_DIR to move it.
    # ============================================================

    OIPM_DATA_DIR = os.getenv(
        "OIPM_DATA_DIR",
        str(Path(__file__).resolve().parents[3] / "data"),
    ).strip()


settings = Settings()