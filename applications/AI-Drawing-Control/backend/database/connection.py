"""
Postgres (Supabase) connection and per-request session handling.

Beanie made the database implicitly global: `await User.find_one(...)`
worked anywhere, with no session to pass around. SQLAlchemy normally wants
an AsyncSession threaded through every call, which would mean touching the
signature of every route and every service function.

Instead the session is held in a ContextVar for the duration of one request
(or one background job) and reached through `db()`. Service code therefore
keeps the shape it already had, and the unit of work still has a clear,
explicit boundary - `session_scope()` - which commits on success and rolls
back on any exception.
"""

import asyncio
import logging
import ssl
import uuid
from contextlib import asynccontextmanager
from contextvars import ContextVar
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config.settings import settings
from models.base import Base

# Importing every model module registers its tables on Base.metadata.
# create_all() and Alembic both need that, so keep this list complete.
from models import (          # noqa: F401
    audit,
    drawing,
    email_log,
    notification,
    user,
)

engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None

# The session belonging to the request (or job) currently being handled.
_session: ContextVar[AsyncSession | None] = ContextVar("drawing_db_session", default=None)

# Work queued to run once the current unit of work has committed - e.g.
# handoff emails. Kept per scope, so a rolled-back request sends nothing.
_after_commit: ContextVar[list | None] = ContextVar("drawing_after_commit", default=None)

# Strong references to running background jobs; asyncio only keeps weak ones.
_background: set[asyncio.Task] = set()

log = logging.getLogger("drawing")


# ---------------------------------------------------------------------------
#  URL handling
# ---------------------------------------------------------------------------

def _ssl_arg():
    """
    Builds what asyncpg should be given for `ssl`, from DB_SSL_MODE.

    Supabase's Postgres endpoint presents a certificate signed by Supabase's
    own CA rather than a public one, so the default trust store rejects it
    with "self-signed certificate in certificate chain". The connection is
    still encrypted; what is missing is proof of who is on the other end.

    `require` accepts that and is the default, because it is the only mode
    that works without downloading anything. Point DB_CA_CERT at
    Supabase's CA file and switch to `verify-full` to close the gap - that
    is what production should run.
    """
    mode = (settings.DB_SSL_MODE or "require").strip().lower()

    if mode == "disable":
        return False

    if mode == "verify-full":
        if not settings.DB_CA_CERT:
            raise RuntimeError(
                "DB_SSL_MODE=verify-full needs DB_CA_CERT set to "
                "Supabase's CA certificate (Project Settings > Database > SSL Configuration)."
            )
        ca = Path(settings.DB_CA_CERT)
        if not ca.is_file():
            raise RuntimeError(f"DB_CA_CERT does not point at a file: {ca}")
        ctx = ssl.create_default_context(cafile=str(ca))
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED
        return ctx

    if mode != "require":
        raise RuntimeError(
            f"DB_SSL_MODE must be 'require', 'verify-full' or 'disable', not {mode!r}."
        )

    # Encrypted, certificate not verified.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _normalise_url(raw: str) -> tuple[str, dict]:
    """
    Turns the URI Supabase hands you into one asyncpg accepts, and works out
    the connect-time arguments that go with it.

    Two things need fixing:

    * the scheme - Supabase gives `postgresql://`, SQLAlchemy needs the
      driver named explicitly as `postgresql+asyncpg://`;

    * `?sslmode=require` - that is a libpq option. asyncpg rejects it
      outright, and wants `ssl=True` passed as a connect argument instead.
    """
    if not raw:
        raise RuntimeError(
            "DATABASE_URL is not set in backend/.env. Copy it from "
            "Supabase > Project Settings > Database > Connection string > URI."
        )

    parts = urlsplit(raw)

    scheme = parts.scheme
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql+asyncpg"

    query = dict(parse_qsl(parts.query))
    # A libpq option; asyncpg rejects it outright and takes `ssl=` instead.
    # DB_SSL_MODE is what decides, so this is dropped either way.
    query.pop("sslmode", None)

    connect_args: dict = {"ssl": _ssl_arg()}

    # The pooler on 6543 runs in transaction mode, where a connection is
    # handed to a different client between statements. asyncpg's prepared
    # statements are per-connection, so caching them there produces
    # "prepared statement _pg_N already exists" under load. Disabling the
    # cache costs a little planning time and removes the failure mode.
    if parts.port == 6543:
        connect_args["statement_cache_size"] = 0
        connect_args["prepared_statement_cache_size"] = 0
        # Unique statement names, so two clients sharing one server
        # connection through the pooler can never collide.
        connect_args["prepared_statement_name_func"] = lambda: f"__asyncpg_{uuid.uuid4()}__"

    url = urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    return url, connect_args


# ---------------------------------------------------------------------------
#  Lifecycle
# ---------------------------------------------------------------------------

async def init_db() -> None:
    """Called from the FastAPI lifespan handler on startup."""
    global engine, _sessionmaker

    url, connect_args = _normalise_url(settings.DATABASE_URL)

    # A small pool of connections kept open and reused.
    #
    # This used to be NullPool on port 6543, which meant EVERY request opened
    # a brand-new TLS connection to the database - several hundred ms before
    # the first query even ran, and the main cause of the app feeling slow.
    # Reusing connections is safe on the transaction pooler as long as the
    # prepared-statement cache is off, which _normalise_url() already does.
    #
    # 5 + 5 covers the dashboard's parallel requests plus the background
    # jobs (user sync, email log) without queueing. Raise pool_size if many
    # people use the app at the same time.
    engine = create_async_engine(
        url,
        echo=settings.SQL_ECHO,
        connect_args=connect_args,
        pool_size=5,
        max_overflow=5,
        pool_timeout=15,
        pool_pre_ping=True,
        pool_recycle=300,     # the pooler drops idle clients; recycle before it does
    )

    _sessionmaker = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,     # keep attributes readable after commit
        autoflush=True,
    )

    # Fail loudly at startup rather than on the first request.
    async with engine.connect():
        pass

    await _ensure_columns()
    await create_all()
    await _seed()


# Small, safe additions the app makes to an existing database on start-up,
# so a new setting works without anyone having to run SQL by hand. Each one
# is "add if missing" - running it again changes nothing.
_ENSURE: list[str] = []


async def _ensure_columns() -> None:
    from sqlalchemy import text
    for sql in _ENSURE:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(sql))
        except Exception as exc:          # no ALTER right - the app still starts
            log.warning("Could not apply '%s': %s", sql, exc)


async def close_db() -> None:
    global engine, _sessionmaker
    if engine is not None:
        await engine.dispose()
    engine = None
    _sessionmaker = None


# ---------------------------------------------------------------------------
#  Sessions
# ---------------------------------------------------------------------------

def db() -> AsyncSession:
    """
    The session for the request being handled right now.

    Raises rather than quietly opening a new one: a missing session means
    the caller is running outside both the HTTP middleware and
    `session_scope()`, and silently giving it a fresh session would let the
    caller commit work that the surrounding unit of work believes it can
    still roll back.
    """
    session = _session.get()
    if session is None:
        raise RuntimeError(
            "No database session in this context. Background jobs and scripts "
            "must wrap their work in `async with session_scope():`."
        )
    return session


@asynccontextmanager
async def session_scope():
    """
    One unit of work: commits if the block succeeds, rolls back if it does not.

    Nesting is a no-op and reuses the session already in context, so a
    service that opens a scope defensively still takes part in the caller's
    transaction instead of committing half of it early.
    """
    existing = _session.get()
    if existing is not None:
        yield existing
        return

    if _sessionmaker is None:
        raise RuntimeError("init_db() has not run yet.")

    session = _sessionmaker()
    token = _session.set(session)
    hooks: list = []
    hooks_token = _after_commit.set(hooks)
    committed = False
    try:
        yield session
        if session.info.get("failed"):
            # The request answered with an error and was already rolled
            # back by the middleware - nothing to commit, nothing to run.
            await session.rollback()
        else:
            await session.commit()
            committed = True
    except Exception:
        await session.rollback()
        raise
    finally:
        _after_commit.reset(hooks_token)
        _session.reset(token)
        await session.close()

    if committed:
        for job in hooks:
            _spawn(job)


def after_commit(job) -> None:
    """
    Runs `job` (a no-argument async function) once the current request has
    committed, in its own session, without making the user wait for it.

    Used for handoff emails: SMTP takes seconds, and the save should not.
    If the request rolls back, the job never runs.
    """
    hooks = _after_commit.get()
    if hooks is None:
        # Outside a request (a script, the scheduler): nothing to wait for.
        _spawn(job)
    else:
        hooks.append(job)


def _spawn(job) -> None:
    async def runner():
        # Start clean: never reuse the (already closed) request session.
        _session.set(None)
        _after_commit.set(None)
        try:
            async with session_scope():
                await job()
        except Exception:
            log.exception("Background job failed")

    try:
        task = asyncio.get_running_loop().create_task(runner())
    except RuntimeError:
        return
    _background.add(task)
    task.add_done_callback(_background.discard)


@asynccontextmanager
async def independent_scope():
    """
    A separate transaction, committed on its own, ignoring the request's.

    Needed for records that must survive whatever happens to the request that
    produced them - specifically the email log. It is both the audit trail
    and the dedupe guard, so if a request sends a handoff mail and then fails
    for an unrelated reason, rolling the log back with it would leave the
    mail delivered and no record of it. The next run would then send it
    again.

    Uses its own session and its own connection, so it neither sees nor
    disturbs the uncommitted work of the surrounding request.
    """
    if _sessionmaker is None:
        raise RuntimeError("init_db() has not run yet.")

    session = _sessionmaker()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def create_all() -> None:
    """
    Creates the `drawing` schema and any missing tables from the model metadata.

    001_schema.sql remains the source of truth - it carries the partial
    indexes and the REST-API grants that the ORM metadata cannot express.
    This exists for tests and for a quick local spin-up.
    """
    from sqlalchemy import text

    if engine is None:
        raise RuntimeError("init_db() has not run yet.")

    async with engine.begin() as conn:
        await conn.execute(text("create schema if not exists drawing"))
        await conn.run_sync(Base.metadata.create_all)


async def _seed() -> None:
    """Starting product tree (top level from the R&D sketch), only when the tree is empty; trigram search index."""
    from sqlalchemy import text
    async with engine.begin() as conn:
        await conn.execute(text(
            "insert into drawing.dc_folders (id, name, created_by) "
            "select gen_random_uuid(), v.name, 'system' "
            "from (values ('GBD'), ('NBD'), ('Outsourced')) as v(name) "
            "where not exists (select 1 from drawing.dc_folders)"
        ))
    try:
        async with engine.begin() as conn:
            await conn.execute(text("create extension if not exists pg_trgm"))
            await conn.execute(text(
                "create index if not exists dc_drawings_search_trgm on drawing.dc_drawings "
                "using gin ((lower(drawing_no || ' ' || item_code || ' ' || description)) gin_trgm_ops)"
            ))
    except Exception as exc:
        log.info("Trigram search index not created (search still works): %s", exc)
