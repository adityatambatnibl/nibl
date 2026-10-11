from pathlib import Path

from pydantic_settings import BaseSettings

# Resolved from this file, not the working directory. A relative ".env" is
# silently missed when the app is started by systemd or Docker unless the
# WorkingDirectory happens to be backend/, and Settings() then dies on the
# required SUPABASE_DB_URL.
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    # ---- Database (Supabase Postgres) ---------------------------------
    # Project Settings > Database > Connection string > URI.
    # Port 5432 is the session pooler, 6543 the transaction pooler; the
    # connection layer adapts its pooling and statement cache to whichever
    # one this URL names.
    SUPABASE_DB_URL: str
    SQL_ECHO: bool = False
    # "production" on the server: hides the /docs API pages.
    ENVIRONMENT: str = "development"

    # How much to trust the database's TLS certificate.
    #
    #   require      encrypted, certificate not checked. Supabase's Postgres
    #                endpoint serves a certificate signed by their own CA,
    #                which is not in any public trust store, so this is the
    #                only mode that works out of the box. It stops passive
    #                eavesdropping but not an active man-in-the-middle.
    #
    #   verify-full  encrypted AND the certificate and hostname are checked.
    #                Requires SUPABASE_DB_CA_CERT to point at Supabase's CA
    #                file - download it from Project Settings > Database >
    #                SSL Configuration. Use this in production.
    #
    #   disable      no encryption. Local Postgres only, never Supabase.
    SUPABASE_DB_SSL_MODE: str = "require"
    SUPABASE_DB_CA_CERT: str = ""

    # ---- Supabase REST / Storage --------------------------------------
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    # The shared table the common NPD/OPIM signup screen writes into. Rows
    # are copied from here into apqp.user_apqp; see services/user_sync_service.
    SUPABASE_TABLE: str = "users"
    SUPABASE_BUCKET: str = "apqp-attachments"

    # ---- Where uploaded files are kept --------------------------------
    #   auto      Supabase Storage if SUPABASE_URL + SUPABASE_SERVICE_KEY are
    #             set, otherwise the local folder below (default)
    #   supabase  always Supabase Storage
    #   local     always the local folder - for your own server
    STORAGE_BACKEND: str = "auto"
    # Folder for local storage. Relative paths are from the backend folder;
    # the default "../data" is applications/NPD/data - everything NPD stores
    # lives inside the NPD application folder.
    STORAGE_DIR: str = "../data"

    # ---- Auth ----------------------------------------------------------
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"

    # OIPM SSO signing secret. Server-side only; it must match
    # OIPM backend JWT_SECRET_KEY.
    OIPM_JWT_SECRET: str = ""
    OIPM_JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480
    RESET_TOKEN_EXPIRE_MINUTES: int = 60

    # ---- Mail ----------------------------------------------------------
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_NAME: str = "APQP Tracking System"
    APP_BASE_URL: str = "http://localhost:5173"
    EMAIL_ENABLED: bool = False

    # ---- Misc ----------------------------------------------------------
    CORS_ORIGINS: str = "http://localhost:5173"
    SCHEDULER_ENABLED: bool = True
    # How often to pull new signups from the shared public.users table.
    # A webhook would be instant, but Supabase cannot reach a local dev
    # machine, so this polls instead.
    USER_SYNC_SECONDS: int = 30
    SCHEDULER_TIMEZONE: str = "Asia/Kolkata"

    # ---- NIBL portal --------------------------------------------------
    # Shared secret the portal backend sends (X-Portal-Key) to create users
    # here and to ask whether a user is approved. Same value in every app.
    PORTAL_SERVICE_KEY: str = ""
    # The old 30-second copy from public.users. With the portal, users are
    # created here by the portal (routes/portal_routes.py), so this is off.
    # Only switch it on if NPD shares a database with an OIPM users table.
    USER_SYNC_ENABLED: bool = False
    OVERDUE_CHECK_HOUR: int = 9

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        # The NPD app (5174) and the NIBL workspace launcher (5173) must always
        # be able to call this API, whether opened as localhost or 127.0.0.1.
        for host in ("localhost", "127.0.0.1"):
            for port in (5173, 5174):
                url = f"http://{host}:{port}"
                if url not in origins:
                    origins.append(url)
        return origins

    model_config = {
        "env_file": ENV_FILE,
        "extra": "ignore",
    }          # tolerate leftover MONGO_URI etc. in .env


settings = Settings()

