from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.base import Base


# ============================================================
# DATABASE CONNECTION
# ============================================================
#
# SQLAlchemy URL.create() safely handles special characters
# in the username/password.
#
# This is important for Supabase passwords containing:
# @  :  /  #  ?  &  etc.
# ============================================================

database_url = URL.create(
    drivername="postgresql+psycopg2",

    username=settings.DB_USER,

    password=settings.DB_PASSWORD,

    host=settings.DB_HOST,

    port=settings.DB_PORT,

    database=settings.DB_NAME,
)


# ============================================================
# ENGINE
# ============================================================

engine = create_engine(
    database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=0,
    pool_recycle=1800,
)


# ============================================================
# SESSION
# ============================================================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


# ============================================================
# DATABASE DEPENDENCY
# ============================================================

def get_db():

    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()

# ============================================================
# SAFE IMPROVEMENT SCHEMA UPDATE
# ============================================================

def ensure_improvement_activity_and_benefit_schema():
    """Add Activity and convert legacy Benefit to JSONB once."""
    with engine.begin() as connection:
        connection.execute(text(
            "ALTER TABLE improvements ADD COLUMN IF NOT EXISTS activity JSONB"
        ))
        column_type = connection.execute(text("""
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'improvements'
              AND column_name = 'benefit_type'
        """)).scalar()
        if column_type in {"character varying", "text"}:
            connection.execute(text("""
                ALTER TABLE improvements
                ALTER COLUMN benefit_type TYPE JSONB
                USING CASE
                    WHEN benefit_type IS NULL OR btrim(benefit_type) = '' THEN NULL
                    ELSE jsonb_build_array(benefit_type)
                END
            """))

