import asyncio
from pathlib import Path
from urllib.parse import urlsplit, unquote
import asyncpg


MISSING_PROJECT_ID = "NPO0227000196"


def get_supabase_url():
    line = next(
        x for x in Path(".env.before-deploy")
        .read_text(encoding="utf-8")
        .splitlines()
        if x.startswith("SUPABASE_DB_URL=")
    )

    url = line.split("=", 1)[1].strip().split(" #", 1)[0]
    return urlsplit(url)


async def get_columns(conn, schema, table):
    rows = await conn.fetch("""
        SELECT
            column_name,
            ordinal_position,
            is_identity,
            is_generated
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
        ORDER BY ordinal_position
    """, schema, table)

    return [
        r["column_name"]
        for r in rows
        if r["is_generated"] == "NEVER"
    ]


async def copy_table_rows(
    source,
    target,
    schema,
    table,
    where_clause,
    where_value,
):
    source_columns = await get_columns(source, schema, table)
    target_columns = await get_columns(target, schema, table)

    if source_columns != target_columns:
        print(f"\nCOLUMN CHECK FAILED FOR {schema}.{table}")
        print("Supabase columns:")
        print(source_columns)
        print("\nLocal columns:")
        print(target_columns)
        raise RuntimeError(
            f"Column mismatch in {schema}.{table}. "
            "Migration stopped before modifying data."
        )

    columns = source_columns

    rows = await source.fetch(
        f"""
        SELECT {", ".join('"' + c + '"' for c in columns)}
        FROM "{schema}"."{table}"
        WHERE "{where_clause}" = $1
        """,
        where_value,
    )

    if not rows:
        return 0

    column_sql = ", ".join(f'"{c}"' for c in columns)
    placeholders = ", ".join(
        f"${i + 1}" for i in range(len(columns))
    )

    sql = f"""
        INSERT INTO "{schema}"."{table}"
        ({column_sql})
        VALUES ({placeholders})
        ON CONFLICT DO NOTHING
    """

    inserted = 0

    for row in rows:
        result = await target.execute(
            sql,
            *[row[c] for c in columns]
        )

        if result.endswith("1"):
            inserted += 1

    return inserted


async def main():

    u = get_supabase_url()

    supabase_user = unquote(u.username)
    supabase_password = unquote(u.password)

    print()
    print("==============================================")
    print(" SUPABASE → LOCAL APQP DATA MIGRATION")
    print("==============================================")
    print()
    print("Project:", MISSING_PROJECT_ID)
    print("Product : CN90001")
    print()

    print("Connecting to Supabase...")

    source = await asyncpg.connect(
        host=u.hostname,
        port=u.port or 5432,
        user=supabase_user,
        password=supabase_password,
        database=u.path.lstrip("/"),
        ssl="require",
        statement_cache_size=0,
    )

    print("Supabase connected.")

    print()
    print("Connecting to LOCAL PostgreSQL...")

    target = await asyncpg.connect(
        host="127.0.0.1",
        port=5432,
        user="postgres",
        password="root",
        database="apqp",
    )

    print("Local PostgreSQL connected.")
    print()

    try:

        # ---------------------------------------------------------
        # 1. Verify Supabase project exists
        # ---------------------------------------------------------

        project = await source.fetchrow("""
            SELECT *
            FROM apqp.apqp_projects
            WHERE project_id = $1
        """, MISSING_PROJECT_ID)

        if not project:
            raise RuntimeError(
                f"Project {MISSING_PROJECT_ID} was not found in Supabase."
            )

        print("SOURCE PROJECT")
        print("------------------------------")
        print("Project ID :", project["project_id"])
        print("Product    :", project["product_name"])
        print("Customer   :", project["customer"])
        print()

        # ---------------------------------------------------------
        # 2. Verify local project does not already exist
        # ---------------------------------------------------------

        local_project = await target.fetchrow("""
            SELECT project_id, product_name, customer
            FROM apqp.apqp_projects
            WHERE project_id = $1
        """, MISSING_PROJECT_ID)

        if local_project:
            print("Project already exists locally.")
            print("Nothing will be inserted for the project.")
        else:
            print("Project does NOT exist locally.")
            print("It will be inserted.")

        # ---------------------------------------------------------
        # 3. Start transaction
        # ---------------------------------------------------------

        async with target.transaction():

            # -----------------------------------------------------
            # Copy project
            # -----------------------------------------------------

            if not local_project:

                columns = await get_columns(
                    source,
                    "apqp",
                    "apqp_projects"
                )

                column_sql = ", ".join(
                    f'"{c}"' for c in columns
                )

                placeholders = ", ".join(
                    f"${i + 1}"
                    for i in range(len(columns))
                )

                project_sql = f"""
                    INSERT INTO apqp.apqp_projects
                    ({column_sql})
                    VALUES ({placeholders})
                    ON CONFLICT DO NOTHING
                """

                await target.execute(
                    project_sql,
                    *[project[c] for c in columns]
                )

                print("✓ Project inserted.")

            # -----------------------------------------------------
            # Copy activities
            # -----------------------------------------------------

            source_activities = await source.fetch("""
                SELECT *
                FROM apqp.apqp_activities
                WHERE project_id = $1
                ORDER BY id
            """, MISSING_PROJECT_ID)

            print()
            print(
                "Activities found in Supabase:",
                len(source_activities)
            )

            activity_columns = await get_columns(
                source,
                "apqp",
                "apqp_activities"
            )

            column_sql = ", ".join(
                f'"{c}"' for c in activity_columns
            )

            placeholders = ", ".join(
                f"${i + 1}"
                for i in range(len(activity_columns))
            )

            activity_sql = f"""
                INSERT INTO apqp.apqp_activities
                ({column_sql})
                VALUES ({placeholders})
                ON CONFLICT DO NOTHING
            """

            inserted = 0

            for activity in source_activities:

                result = await target.execute(
                    activity_sql,
                    *[activity[c] for c in activity_columns]
                )

                if result.endswith("1"):
                    inserted += 1

            print("✓ Activities inserted:", inserted)

        # ---------------------------------------------------------
        # 4. Verify local data
        # ---------------------------------------------------------

        print()
        print("==============================================")
        print(" VERIFICATION")
        print("==============================================")

        local_project = await target.fetchrow("""
            SELECT
                project_id,
                product_name,
                customer
            FROM apqp.apqp_projects
            WHERE project_id = $1
        """, MISSING_PROJECT_ID)

        local_activity_count = await target.fetchval("""
            SELECT COUNT(*)
            FROM apqp.apqp_activities
            WHERE project_id = $1
        """, MISSING_PROJECT_ID)

        total_projects = await target.fetchval("""
            SELECT COUNT(*)
            FROM apqp.apqp_projects
        """)

        total_activities = await target.fetchval("""
            SELECT COUNT(*)
            FROM apqp.apqp_activities
        """)

        print()
        print("LOCAL PROJECT")
        print("------------------------------")
        print("Project ID :", local_project["project_id"])
        print("Product    :", local_project["product_name"])
        print("Customer   :", local_project["customer"])
        print()

        print("Activities for project:", local_activity_count)
        print("Total local projects   :", total_projects)
        print("Total local activities :", total_activities)

        print()

        if (
            local_activity_count == 65
            and total_projects == 6
            and total_activities == 390
        ):
            print("==============================================")
            print(" MIGRATION SUCCESSFUL")
            print("==============================================")
        else:
            print("==============================================")
            print(" MIGRATION COMPLETED - CHECK COUNTS ABOVE")
            print("==============================================")

    finally:
        await source.close()
        await target.close()


asyncio.run(main())
