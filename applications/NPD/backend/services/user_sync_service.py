"""
Copies people from the shared signup table into this application's own.

NPD and OPIM share one landing page and one signup screen, which writes a
single row into `public.users`. They do NOT share accounts: each project has
its own admins, and an approval or rejection made by one set of admins must
not decide anything for the other. So each project keeps its own user table,
and this is what fills ours.

Only four things come across - id, name, email and password hash. Role,
permissions and above all `status` are ours alone, and start at PENDING so a
newly synced person lands on the /admin/user-approval screen exactly like
someone who signed up here directly.

`apqp.user_apqp.id` deliberately reuses `public.users.id`. Because the two
tables are keyed by the same value, "have we already got this person?" is
answered by the primary key rather than by a heuristic, and the sync is
idempotent by construction - running it twice cannot create anyone twice.

Both tables live in the same Postgres database, so this is one statement
against `public.users`, not a REST round trip per row as the earlier
Supabase-over-HTTP version did.
"""

from sqlalchemy import text

from database.connection import db
from utils.constants import DEFAULT_USER_PERMISSIONS, AccountStatus, Role

# One insert-select, so the "who is missing?" test and the insert cannot
# disagree in between. ON CONFLICT DO NOTHING covers both unique indexes -
# the primary key and lower(email) - which means a person who signed up on
# BOTH screens is matched on email and left alone rather than duplicated.
#
# RETURNING tells us exactly who was new, which is what the notifications
# below are raised from. A plain rowcount could not do that.
_SYNC_SQL = text(
    """
    insert into apqp.user_apqp (
        id, name, email, password_hash,
        role, status, permissions, must_change_password, supabase_id
    )
    select
        src.id,
        coalesce(nullif(btrim(src.full_name), ''), split_part(src.email, '@', 1)),
        lower(btrim(src.email)),
        coalesce(src.password_hash, ''),
        :role,
        :status,
        cast(:permissions as jsonb),
        false,
        src.id
    from public.users as src
    where src.email is not null
      and position('@' in src.email) > 1
    on conflict do nothing
    returning id, name, email
    """
)


async def sync() -> dict:
    """
    Pulls in everyone from the shared table we do not already have.

    Existing accounts are never touched - not their password, not their
    status. A password set by one of our admins when approving must survive
    the next sync, and someone we rejected must not quietly come back as
    PENDING.
    """
    import json

    result = await db().execute(
        _SYNC_SQL,
        {
            "role": Role.USER,
            "status": AccountStatus.PENDING,
            "permissions": json.dumps(list(DEFAULT_USER_PERMISSIONS)),
        },
    )
    created = result.mappings().all()

    total = await db().execute(text("select count(*) from public.users where email is not null"))
    found = total.scalar_one()

    # Raise the same notification a direct signup raises, so the bell and the
    # approvals screen behave identically however the person arrived.
    from services import notification_service

    for row in created:
        try:
            await notification_service.notify_signup(str(row["id"]), row["name"], row["email"])
        except Exception:
            pass          # a notification failure must not lose the imported user

    return {
        "found": found,
        "created": len(created),
        "already_present": found - len(created),
        "new_users": [r["email"] for r in created],
    }


async def backfill_supabase_ids() -> int:
    """
    Links accounts that were created here first, before the shared signup existed.

    Those rows have their own generated id and no `supabase_id`, so the
    primary-key match above cannot see them. Matching on email once and
    recording the link means later syncs recognise them without falling back
    to email again.
    """
    result = await db().execute(
        text(
            """
            update apqp.user_apqp as u
               set supabase_id = src.id
              from public.users as src
             where u.supabase_id is null
               and lower(btrim(src.email)) = lower(u.email)
            """
        )
    )
    return result.rowcount or 0
