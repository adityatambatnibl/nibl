import asyncio

from sqlalchemy import func, select

from database import repo
from database.connection import init_db, close_db, session_scope
from models.user import User
from utils.constants import Role, AccountStatus, Permission, DEFAULT_USER_PERMISSIONS
from utils.security import hash_password

ALL_PERMISSIONS = sorted(v for k, v in vars(Permission).items() if not k.startswith("_"))

USERS = [
    {"name": "Administrator", "email": "admin@apqp.com", "password": "Admin@12345",
     "role": Role.ADMIN, "permissions": ALL_PERMISSIONS},
    {"name": "Demo User", "email": "user@apqp.com", "password": "User@12345",
     "role": Role.USER, "permissions": list(DEFAULT_USER_PERMISSIONS)},
]


async def seed():
    await init_db()
    async with session_scope():
        for u in USERS:
            found = await repo.find_one(
                select(User).where(func.lower(User.email) == u["email"].lower())
            )
            if found:
                print(f"skip   {u['email']} (already exists)")
                continue
            await repo.add(User(
                name=u["name"],
                email=u["email"],
                password_hash=hash_password(u["password"]),
                role=u["role"],
                status=AccountStatus.APPROVED,
                permissions=u["permissions"],
            ))
            print(f"created {u['email']}  /  {u['password']}  ({u['role']})")
    await close_db()


if __name__ == "__main__":
    asyncio.run(seed())