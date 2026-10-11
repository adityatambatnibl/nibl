"""
Quick health check for the Supabase connection and the app's own tables.

    python check.py

Prints what the backend can actually see, which is usually enough to tell a
configuration problem (wrong SUPABASE_DB_URL, tables never created, seeds not
run) from an application one.
"""

import asyncio

from sqlalchemy import func, select, text

from database.connection import close_db, db, init_db, session_scope
from models.apqp import ApqpActivityRecord, ApqpProject
from models.attachment import Attachment
from models.order import Order, OrderItem, OrderStage
from models.template import Template
from models.user import User

COUNTS = [
    ("users (apqp.user_apqp)", User),
    ("orders", Order),
    ("order items", OrderItem),
    ("order stages", OrderStage),
    ("apqp projects", ApqpProject),
    ("apqp activities", ApqpActivityRecord),
    ("attachments", Attachment),
    ("templates", Template),
]


async def go() -> None:
    await init_db()
    async with session_scope():
        where = await db().execute(text("select current_database(), current_user"))
        database, user = where.one()
        print(f"connected to {database} as {user}\n")

        for label, model in COUNTS:
            n = (await db().execute(select(func.count()).select_from(model))).scalar_one()
            print(f"  {label:26s} {n}")

        print()
        rows = await db().execute(
            select(User.status, func.count()).group_by(User.status).order_by(func.count().desc())
        )
        for status, n in rows.all():
            print(f"  users {status:22s} {n}")

        print()
        rows = await db().execute(select(Template.kind, Template.version).order_by(Template.kind))
        for kind, version in rows.all():
            print(f"  template {kind:21s} v{version}")

    await close_db()


if __name__ == "__main__":
    asyncio.run(go())
