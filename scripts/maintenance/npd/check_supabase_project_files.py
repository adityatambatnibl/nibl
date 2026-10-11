import asyncio
from pathlib import Path
from urllib.parse import urlsplit, unquote
import asyncpg

PROJECT_ID = "NPO0227000196"


def get_supabase_url():
    line = next(
        x for x in Path(".env.before-deploy")
        .read_text(encoding="utf-8")
        .splitlines()
        if x.startswith("SUPABASE_DB_URL=")
    )

    return line.split("=", 1)[1].strip().split(" #", 1)[0]


async def main():

    u = urlsplit(get_supabase_url())

    conn = await asyncpg.connect(
        host=u.hostname,
        port=u.port or 5432,
        user=unquote(u.username),
        password=unquote(u.password),
        database=u.path.lstrip("/"),
        ssl="require",
        statement_cache_size=0,
    )

    try:

        print()
        print("==============================================")
        print(" SUPABASE FILES FOR PROJECT")
        print("==============================================")
        print()
        print("Project:", PROJECT_ID)
        print()

        rows = await conn.fetch("""
            SELECT
                a.id,
                a.original_filename,
                a.content_type,
                a.size_bytes,
                a.storage_path,
                a.sha256,
                a.entity_type,
                a.entity_id,
                a.project_id,
                a.order_no,
                a.description,
                a.uploaded_by,
                a.uploaded_by_name,
                a.uploaded_at,
                act.activity_name
            FROM apqp.attachments a
            LEFT JOIN apqp.apqp_activities act
                ON a.entity_id = act.id::text
            WHERE
                a.project_id = $1
                OR act.project_id = $1
            ORDER BY a.uploaded_at
        """, PROJECT_ID)

        print("ATTACHMENT RECORDS:", len(rows))
        print()

        total_bytes = 0

        for i, row in enumerate(rows, 1):

            total_bytes += row["size_bytes"] or 0

            print(f"========== FILE {i} ==========")
            print("ID              :", row["id"])
            print("Filename        :", row["original_filename"])
            print("Content Type    :", row["content_type"])
            print("Size            :", row["size_bytes"], "bytes")
            print("Storage Path    :", row["storage_path"])
            print("SHA256          :", row["sha256"])
            print("Entity Type     :", row["entity_type"])
            print("Entity ID       :", row["entity_id"])
            print("Project ID      :", row["project_id"])
            print("Activity        :", row["activity_name"])
            print("Uploaded By     :", row["uploaded_by"])
            print("Uploaded By Name:", row["uploaded_by_name"])
            print("Uploaded At     :", row["uploaded_at"])
            print()

        print("==============================================")
        print(" TOTAL FILES :", len(rows))
        print(" TOTAL SIZE  :", total_bytes, "bytes")
        print("==============================================")

    finally:
        await conn.close()


asyncio.run(main())
