import asyncio

from sqlalchemy import select

from database import repo
from database.connection import init_db, session_scope
from models.apqp import ApqpActivityRecord, ApqpProject


async def main():
    await init_db()

    async with session_scope():
        result = await repo.db().execute(
            select(ApqpActivityRecord)
        )

        activities = result.scalars().all()

        for activity in activities:
            project = await repo.get(ApqpProject, activity.project_id)

            print(f"ACTIVITY = {activity.activity_id}")
            print(f"PROJECT  = {activity.project_id}")
            print(f"PRODUCT  = {project.product_name if project else 'PROJECT NOT FOUND'}")
            print("-" * 80)


if __name__ == "__main__":
    asyncio.run(main())
