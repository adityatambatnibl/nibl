import asyncio
import hashlib
import os
import shutil
from pathlib import Path
from urllib.parse import urlsplit, unquote, quote

import asyncpg
import httpx


PROJECT_ID = "NPO0227000196"
PRODUCT_NAME = "CN90001"
BUCKET = "apqp-attachments"

LOCAL_DB_HOST = "127.0.0.1"
LOCAL_DB_PORT = 5432
LOCAL_DB_USER = "postgres"
LOCAL_DB_PASSWORD = "root"
LOCAL_DB_NAME = "apqp"

LOCAL_STORAGE_ROOT = Path(r"D:\Internal Workspace\apqp\data")
LOCAL_PRODUCT_FOLDER = LOCAL_STORAGE_ROOT / "apqp_activity" / PRODUCT_NAME


def get_supabase_config():
    env = {}

    for line in Path(".env.before-deploy").read_text(
        encoding="utf-8"
    ).splitlines():

        line = line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)

        # Remove inline comments where applicable.
        value = value.strip()

        if " #" in value:
            value = value.split(" #", 1)[0].strip()

        env[key.strip()] = value

    db_url = env["SUPABASE_DB_URL"]
    u = urlsplit(db_url)

    return {
        "db_host": u.hostname,
        "db_port": u.port or 5432,
        "db_user": unquote(u.username),
        "db_password": unquote(u.password),
        "db_name": u.path.lstrip("/"),
        "url": env["SUPABASE_URL"].rstrip("/"),
        "service_key": env["SUPABASE_SERVICE_KEY"],
        "bucket": env.get("SUPABASE_BUCKET", BUCKET),
    }


def safe_filename(filename):
    """
    Keep the original filename where possible, but prevent path traversal.
    """
    filename = Path(filename).name

    if not filename:
        raise ValueError("Attachment has an empty filename.")

    return filename


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


async def copy_project(source, target):

    project = await source.fetchrow("""
        SELECT *
        FROM apqp.apqp_projects
        WHERE project_id = $1
    """, PROJECT_ID)

    if not project:
        raise RuntimeError(
            f"Project {PROJECT_ID} was not found in Supabase."
        )

    columns = await get_columns(
        source,
        "apqp",
        "apqp_projects"
    )

    column_sql = ", ".join(
        f'"{c}"'
        for c in columns
    )

    placeholders = ", ".join(
        f"${i + 1}"
        for i in range(len(columns))
    )

    sql = f"""
        INSERT INTO apqp.apqp_projects
        ({column_sql})
        VALUES ({placeholders})
        ON CONFLICT (project_id) DO NOTHING
    """

    await target.execute(
        sql,
        *[project[c] for c in columns]
    )

    return project


async def copy_activities(source, target):

    activities = await source.fetch("""
        SELECT *
        FROM apqp.apqp_activities
        WHERE project_id = $1
        ORDER BY id
    """, PROJECT_ID)

    if len(activities) != 65:
        print(
            f"WARNING: Supabase returned {len(activities)} activities, "
            "not 65."
        )

    columns = await get_columns(
        source,
        "apqp",
        "apqp_activities"
    )

    column_sql = ", ".join(
        f'"{c}"'
        for c in columns
    )

    placeholders = ", ".join(
        f"${i + 1}"
        for i in range(len(columns))
    )

    sql = f"""
        INSERT INTO apqp.apqp_activities
        ({column_sql})
        VALUES ({placeholders})
        ON CONFLICT DO NOTHING
    """

    inserted = 0

    for activity in activities:

        result = await target.execute(
            sql,
            *[activity[c] for c in columns]
        )

        if result.endswith("1"):
            inserted += 1

    return activities, inserted


async def get_attachments(source):

    rows = await source.fetch("""
        SELECT
            a.*
        FROM apqp.attachments a
        LEFT JOIN apqp.apqp_activities act
            ON a.entity_id = act.id::text
        WHERE
            a.project_id = $1
            OR act.project_id = $1
        ORDER BY a.uploaded_at
    """, PROJECT_ID)

    return rows


async def download_file(
    client,
    supabase_url,
    service_key,
    bucket,
    storage_path,
    destination,
):
    """
    Download an object from Supabase Storage using the authenticated
    object endpoint.
    """

    encoded_path = quote(
        storage_path,
        safe="/"
    )

    url = (
        f"{supabase_url}/storage/v1/object/"
        f"{bucket}/{encoded_path}"
    )

    headers = {
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
    }

    response = await client.get(
        url,
        headers=headers,
        timeout=120.0,
    )

    response.raise_for_status()

    destination.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    temp = destination.with_suffix(
        destination.suffix + ".tmp"
    )

    temp.write_bytes(response.content)

    temp.replace(destination)

    return len(response.content)


async def migrate_attachments(
    source,
    target,
    supabase_config,
):

    attachments = await get_attachments(source)

    print()
    print("Supabase attachment records:", len(attachments))

    if len(attachments) != 23:
        raise RuntimeError(
            f"Expected 23 attachments but found {len(attachments)}. "
            "Migration stopped."
        )

    LOCAL_PRODUCT_FOLDER.mkdir(
        parents=True,
        exist_ok=True
    )

    columns = await get_columns(
        source,
        "apqp",
        "attachments"
    )

    column_sql = ", ".join(
        f'"{c}"'
        for c in columns
    )

    placeholders = ", ".join(
        f"${i + 1}"
        for i in range(len(columns))
    )

    update_columns = [
        "original_filename",
        "content_type",
        "size_bytes",
        "storage_path",
        "sha256",
        "entity_type",
        "entity_id",
        "project_id",
        "order_no",
        "description",
        "uploaded_by",
        "uploaded_by_name",
        "uploaded_at",
    ]

    update_sql = ", ".join(
        f'"{c}" = EXCLUDED."{c}"'
        for c in update_columns
    )

    sql = f"""
        INSERT INTO apqp.attachments
        ({column_sql})
        VALUES ({placeholders})
        ON CONFLICT (id)
        DO UPDATE SET
            {update_sql}
    """

    downloaded = 0
    total_bytes = 0

    async with httpx.AsyncClient(
        follow_redirects=True
    ) as client:

        for index, attachment in enumerate(
            attachments,
            start=1
        ):

            filename = safe_filename(
                attachment["original_filename"]
            )

            # ------------------------------------------------
            # PRODUCT-BASED STORAGE
            #
            # Every attachment for this product goes into:
            #
            #   apqp_activity/<PRODUCT_NAME>/
            #
            # Duplicate original filenames are given a unique
            # physical filename using the attachment UUID.
            # ------------------------------------------------

            destination = LOCAL_PRODUCT_FOLDER / filename

            if destination.exists():
                stem = destination.stem
                suffix = destination.suffix

                destination = (
                    LOCAL_PRODUCT_FOLDER /
                    f"{stem}_{attachment['id']}{suffix}"
                )

                counter = 2

                while destination.exists():
                    destination = (
                        LOCAL_PRODUCT_FOLDER /
                        f"{stem}_{attachment['id']}_{counter}"
                        f"{suffix}"
                    )
                    counter += 1

            if not destination.exists():

                print(
                    f"[{index}/23] Downloading: "
                    f"{filename}"
                )

                size = await download_file(
                    client,
                    supabase_config["url"],
                    supabase_config["service_key"],
                    supabase_config["bucket"],
                    attachment["storage_path"],
                    destination,
                )

                downloaded += 1
                total_bytes += size

            else:
                total_bytes += destination.stat().st_size

            # IMPORTANT:
            # Keep the DB record's original attachment UUID/entity
            # information, but point storage_path to the NEW local
            # product-folder location.
            new_storage_path = (
                f"apqp_activity/"
                f"{PRODUCT_NAME}/"
                f"{destination.name}"
            )

            values = []

            for column in columns:

                if column == "storage_path":
                    values.append(new_storage_path)
                else:
                    values.append(
                        attachment[column]
                    )

            await target.execute(
                sql,
                *values
            )

    return attachments, downloaded, total_bytes


async def verify(target):

    project = await target.fetchrow("""
        SELECT
            project_id,
            product_name,
            customer
        FROM apqp.apqp_projects
        WHERE project_id = $1
    """, PROJECT_ID)

    activity_count = await target.fetchval("""
        SELECT COUNT(*)
        FROM apqp.apqp_activities
        WHERE project_id = $1
    """, PROJECT_ID)

    attachment_count = await target.fetchval("""
        SELECT COUNT(*)
        FROM apqp.attachments
        WHERE project_id = $1
    """, PROJECT_ID)

    total_projects = await target.fetchval("""
        SELECT COUNT(*)
        FROM apqp.apqp_projects
    """)

    total_activities = await target.fetchval("""
        SELECT COUNT(*)
        FROM apqp.apqp_activities
    """)

    total_attachments = await target.fetchval("""
        SELECT COUNT(*)
        FROM apqp.attachments
    """)

    physical_files = list(
        LOCAL_PRODUCT_FOLDER.iterdir()
    ) if LOCAL_PRODUCT_FOLDER.exists() else []

    physical_files = [
        p for p in physical_files
        if p.is_file()
    ]

    print()
    print("==============================================")
    print(" FINAL LOCAL VERIFICATION")
    print("==============================================")

    print()
    print("PROJECT")
    print("----------------------------------------------")
    print("Project ID :", project["project_id"])
    print("Product    :", project["product_name"])
    print("Customer   :", project["customer"])

    print()
    print("PROJECT DATA")
    print("----------------------------------------------")
    print("Activities :", activity_count)
    print("Attachments:", attachment_count)

    print()
    print("TOTAL LOCAL DATABASE")
    print("----------------------------------------------")
    print("Projects   :", total_projects)
    print("Activities :", total_activities)
    print("Attachments:", total_attachments)

    print()
    print("LOCAL FILES")
    print("----------------------------------------------")
    print("Folder     :", LOCAL_PRODUCT_FOLDER)
    print("Files      :", len(physical_files))

    print()
    print("==============================================")

    if (
        project
        and project["product_name"] == PRODUCT_NAME
        and activity_count == 65
        and attachment_count == 23
        and len(physical_files) == 23
        and total_projects == 6
        and total_activities == 390
    ):
        print("MIGRATION SUCCESSFUL")
    else:
        print("MIGRATION COMPLETED - REVIEW COUNTS ABOVE")

    print("==============================================")


async def main():

    config = get_supabase_config()

    print()
    print("==============================================")
    print(" SUPABASE -> LOCAL APQP MIGRATION")
    print("==============================================")
    print()
    print("Project :", PROJECT_ID)
    print("Product :", PRODUCT_NAME)
    print("Bucket  :", config["bucket"])
    print()
    print("Local storage:")
    print(LOCAL_PRODUCT_FOLDER)
    print()

    print("Connecting to Supabase...")

    source = await asyncpg.connect(
        host=config["db_host"],
        port=config["db_port"],
        user=config["db_user"],
        password=config["db_password"],
        database=config["db_name"],
        ssl="require",
        statement_cache_size=0,
    )

    print("Supabase connected.")

    print()
    print("Connecting to local PostgreSQL...")

    target = await asyncpg.connect(
        host=LOCAL_DB_HOST,
        port=LOCAL_DB_PORT,
        user=LOCAL_DB_USER,
        password=LOCAL_DB_PASSWORD,
        database=LOCAL_DB_NAME,
    )

    print("Local PostgreSQL connected.")

    try:

        print()
        print("Checking source project...")

        project = await source.fetchrow("""
            SELECT
                project_id,
                product_name,
                customer
            FROM apqp.apqp_projects
            WHERE project_id = $1
        """, PROJECT_ID)

        if not project:
            raise RuntimeError(
                f"Project {PROJECT_ID} not found in Supabase."
            )

        print("✓ Project found")
        print("  Product :", project["product_name"])
        print("  Customer:", project["customer"])

        print()
        print("Starting local database transaction...")

        async with target.transaction():

            copied_project = await copy_project(
                source,
                target
            )

            print("✓ Project copied/verified")

            activities, inserted_activities = (
                await copy_activities(
                    source,
                    target
                )
            )

            print(
                f"✓ Activities copied/verified: "
                f"{len(activities)} "
                f"(newly inserted: {inserted_activities})"
            )

            attachments, downloaded, bytes_downloaded = (
                await migrate_attachments(
                    source,
                    target,
                    config,
                )
            )

            print()
            print(
                f"✓ Attachments copied/verified: "
                f"{len(attachments)}"
            )

            print(
                f"✓ New files downloaded: "
                f"{downloaded}"
            )

            print(
                f"✓ Bytes downloaded: "
                f"{bytes_downloaded}"
            )

        print()
        print("Database transaction committed.")

        await verify(target)

    finally:

        await source.close()
        await target.close()


asyncio.run(main())
