"""Portal settings, read from portal/backend/.env."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env", override=False)


def _bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


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
    APP_NAME = os.getenv("APP_NAME", "NIBL Application Portal")
    ENVIRONMENT = os.getenv("ENVIRONMENT", "development").strip().lower()

    # Database: nibl_portal (portal users only - each application has its own database)
    DB_HOST = os.getenv("DB_HOST", "127.0.0.1").strip()
    DB_PORT = int(os.getenv("DB_PORT", "5432").strip())
    DB_NAME = os.getenv("DB_NAME", "nibl_portal").strip()
    DB_USER = os.getenv("DB_USER", "postgres").strip()
    DB_PASSWORD = os.getenv("DB_PASSWORD", "").strip()

    # Tokens. JWT_SECRET_KEY MUST be the same value as
    #   OIPM  JWT_SECRET_KEY, NPD OIPM_JWT_SECRET, AI Drawing PORTAL_JWT_SECRET
    # so every application accepts the portal sign-in.
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "").strip()
    JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256").strip()
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480").strip())
    REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30").strip())

    # Server-to-server key the portal sends to every application (X-Portal-Key).
    PORTAL_SERVICE_KEY = os.getenv("PORTAL_SERVICE_KEY", "").strip()

    # Where the list of applications (cards) is kept.
    PROJECTS_FILE = os.getenv(
        "PROJECTS_FILE", str(BACKEND_DIR.parents[1] / "shared" / "configuration" / "projects.json")
    ).strip()

    # Who may register
    ALLOWED_EMAIL_DOMAINS = tuple(
        d.strip().lower() for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "nibl.in,nibc.in,niblkorta.in").split(",") if d.strip()
    )

    # Mail (same as OIPM)
    SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587").strip())
    SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
    SMTP_USE_TLS = _bool("SMTP_USE_TLS", "true")
    SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "").strip()

    CORS_ORIGINS = [o.strip() for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

    @property
    def database_url(self) -> str:
        from urllib.parse import quote_plus
        return (f"postgresql+psycopg2://{quote_plus(self.DB_USER)}:{quote_plus(self.DB_PASSWORD)}"
                f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}")


settings = Settings()
