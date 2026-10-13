"""Drawing Control settings, read from applications/AI-Drawing-Control/backend/.env."""
from pathlib import Path

from pydantic_settings import BaseSettings

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    # "production" on the server: hides the /api/docs pages.
    ENVIRONMENT: str = "development"
    # Database nibl_drawing, e.g. postgresql://postgres:<pw>@127.0.0.1:5432/nibl_drawing
    DATABASE_URL: str
    DB_SSL_MODE: str = "disable"          # disable | require | verify-full
    DB_CA_CERT: str = ""
    SQL_ECHO: bool = False

    # Sign-in comes from the NIBL portal. Same value as portal JWT_SECRET_KEY.
    PORTAL_JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    # Shared key the portal sends (X-Portal-Key) to create users / ask for access.
    PORTAL_SERVICE_KEY: str = ""
    PORTAL_URL: str = "http://nibl"       # where "Workspace" / sign-out go

    # PDF storage. Default "../data" = applications/AI-Drawing-Control/data
    # (relative paths are from the backend folder).
    STORAGE_BACKEND: str = "local"
    STORAGE_DIR: str = "../data"
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    SUPABASE_BUCKET: str = "ai-drawing-control"

    # Mail
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_NAME: str = "Drawing Control"
    EMAIL_ENABLED: bool = False
    APP_BASE_URL: str = "http://nibl/ai-drawing-control"   # email buttons
    APP_TIMEZONE: str = "Asia/Kolkata"

    # Jobs
    SCHEDULER_ENABLED: bool = True
    SCHEDULER_TIMEZONE: str = "Asia/Kolkata"
    DRAWING_REMINDER_HOURS: int = 24          # only used by older installs; see DRAWING_REMINDER_TIME
    # Daily reminder: one email per person listing every drawing still waiting
    # for their Confirm / Deny, at this time (SCHEDULER_TIMEZONE), every day.
    DRAWING_REMINDER_TIME: str = "09:00"

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    model_config = {"env_file": ENV_FILE, "extra": "ignore"}


settings = Settings()
