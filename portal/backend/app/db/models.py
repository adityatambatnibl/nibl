"""Declarative base + the place every model is imported, so create_all sees them all."""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def import_all_models() -> None:
    from app.models import project, user  # noqa: F401
