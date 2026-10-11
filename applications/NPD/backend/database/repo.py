"""
Thin helpers over the request's AsyncSession.

Beanie gave the services a handful of very short spellings - `Model.get(id)`,
`.find(...).to_list()`, `.count()`, `.insert()`. Written out in raw
SQLAlchemy each of those becomes three or four lines of `select(...)` and
`.scalars().all()`, which would bury the actual business logic in the
services. These wrappers keep the call sites roughly as short as they were,
without hiding what is really happening: every one of them takes an ordinary
SQLAlchemy statement and the session stays reachable through `db()` for
anything more involved.

Nothing here commits. The unit of work is the whole request, opened by the
middleware in main.py and committed once at the end.
"""

from contextlib import asynccontextmanager
from typing import Any, Sequence, TypeVar
from uuid import UUID

from sqlalchemy import Select, delete as sa_delete, func, select
from sqlalchemy.exc import IntegrityError

from database.connection import db

T = TypeVar("T")


def as_uuid(value: Any) -> UUID | None:
    """
    Coerces a path parameter to a UUID, or None when it simply is not one.

    Routes receive ids as strings straight from the URL. Returning None for
    a malformed id lets the caller answer 404, which is what a client that
    typed a bad id deserves - Beanie used to raise on a malformed ObjectId
    and surface it as a 500.
    """
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


async def get(model: type[T], pk: Any) -> T | None:
    """Fetch one row by primary key. None if the id is missing or malformed."""
    key = as_uuid(pk)
    if key is None:
        return None
    return await db().get(model, key)


async def find_one(stmt: Select) -> Any:
    """First matching row, or None. Applies LIMIT 1 so the database stops early."""
    result = await db().execute(stmt.limit(1))
    return result.scalars().first()


async def find_all(stmt: Select) -> Sequence[Any]:
    result = await db().execute(stmt)
    return result.scalars().all()


async def count(stmt: Select) -> int:
    """
    Row count for a select, without fetching the rows.

    Wrapping the statement in a subquery rather than swapping the columns
    for count(*) keeps any DISTINCT, GROUP BY, LIMIT or OFFSET meaningful -
    replacing the select list would silently change what is being counted.
    """
    sub = stmt.order_by(None).subquery()
    result = await db().execute(select(func.count()).select_from(sub))
    return result.scalar_one()


async def exists(stmt: Select) -> bool:
    return await find_one(stmt) is not None


async def add(obj: T, *, flush: bool = True) -> T:
    """
    Stage a new row.

    Flushes by default so that database-side constraints fire here, at the
    line that caused them, rather than at the end of the request where the
    traceback would point at the middleware. The primary key is generated in
    Python, so `obj.id` is readable either way.
    """
    session = db()
    session.add(obj)
    if flush:
        await session.flush()
    return obj


async def add_all(objs: Sequence[T], *, flush: bool = True) -> Sequence[T]:
    session = db()
    session.add_all(list(objs))
    if flush:
        await session.flush()
    return objs


async def remove(obj: Any) -> None:
    session = db()
    await session.delete(obj)
    await session.flush()


async def remove_where(model: type, *where) -> int:
    """Bulk delete without loading the rows. Returns how many went."""
    result = await db().execute(sa_delete(model).where(*where))
    return result.rowcount or 0


async def touch() -> None:
    """
    Push pending changes to the database now.

    Rarely needed - the session autoflushes before each query - but useful
    when the next thing to run is raw SQL, or an external call that must not
    happen if the write is going to fail.
    """
    await db().flush()


@asynccontextmanager
async def savepoint():
    """
    A nested transaction, so one expected failure need not lose the request.

    An IntegrityError aborts the whole Postgres transaction: after it, every
    later statement fails until a rollback. Where a service *expects* a
    unique violation and wants to turn it into a friendly 409 - signing up
    with an email that already exists, say - the insert goes inside a
    savepoint, and only that savepoint unwinds.
    """
    async with db().begin_nested():
        yield


__all__ = [
    "IntegrityError",
    "add",
    "add_all",
    "as_uuid",
    "count",
    "db",
    "exists",
    "find_all",
    "find_one",
    "get",
    "remove",
    "remove_where",
    "savepoint",
    "select",
    "touch",
]
