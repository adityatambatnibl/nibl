import asyncio
from pathlib import Path
from urllib.parse import urlsplit, unquote
import asyncpg

line = next(
    x for x in Path(".env.before-deploy").read_text(encoding="utf-8").splitlines()
    if x.startswith("SUPABASE_DB_URL=")
)

supabase_url = line.split("=", 1)[1].strip().split(" #", 1)[0]
u = urlsplit(supabase_url)

supabase_user = unquote(u.username)
supabase_password = unquote(u.password)
supabase_host = u.hostname
supabase_port = u.port or 5432
supabase_db = u.path.lstrip("/")


async def main():
    print()
    print("========================================")
    print("       REAL SUPABASE DATABASE")
    print("========================================")
    print("Host:", supabase_host)
    print("Port:", supabase_port)
    print("Database:", supabase_db)
    print()

    print("Connecting to Supabase...")

    conn = await asyncpg.connect(
        host=supabase_host,
        port=supabase_port,
        user=supabase_user,
        password=supabase_password,
        database=supabase_db,
        ssl="require",
        statement_cache_size=0,
    )

    try:
        print("CONNECTED SUCCESSFULLY")
        print()

        projects = await conn.fetch("""
            SELECT
                project_id,
                product_name,
                customer
            FROM apqp.apqp_projects
            ORDER BY project_id
        """)

        print("========================================")
        print("        SUPABASE PROJECTS")
        print("========================================")
        print("Total projects:", len(projects))
        print()

        for p in projects:
            print(
                f"PROJECT ID   : {p['project_id']}\n"
                f"PRODUCT NAME : {p['product_name']}\n"
                f"CUSTOMER     : {p['customer']}\n"
                f"{'-' * 40}"
            )

        counts = await conn.fetch("""
            SELECT
                project_id,
                COUNT(*) AS activity_count
            FROM apqp.apqp_activities
            GROUP BY project_id
            ORDER BY project_id
        """)

        print()
        print("========================================")
        print("      SUPABASE ACTIVITY COUNTS")
        print("========================================")
        print()

        total_activities = 0

        for row in counts:
            count = row["activity_count"]
            total_activities += count

            print(
                f"{row['project_id']} : {count} activities"
            )

        print()
        print("TOTAL ACTIVITIES:", total_activities)

    finally:
        await conn.close()


asyncio.run(main())
