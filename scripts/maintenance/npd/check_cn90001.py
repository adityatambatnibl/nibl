import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect(
        "postgresql://postgres:root@127.0.0.1:5432/apqp"
    )

    rows = await conn.fetch(
        """
        SELECT
            id,
            original_filename,
            storage_path,
            project_id
        FROM apqp.attachments
        WHERE storage_path LIKE 'apqp_activity/CN90001/%'
        ORDER BY storage_path
        """
    )

    print()
    print("LOCAL CN90001 ATTACHMENTS")
    print("=" * 80)

    if not rows:
        print("NO RECORDS FOUND")
    else:
        for row in rows:
            print()
            print("ID       :", row["id"])
            print("Filename :", row["original_filename"])
            print("Path     :", row["storage_path"])
            print("Project  :", row["project_id"])

    print()
    print("TOTAL:", len(rows))

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())