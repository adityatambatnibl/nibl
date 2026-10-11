"""
Scheduled background jobs.

Every job here runs outside an HTTP request, so none of them inherits the
per-request session the middleware opens. Each one therefore opens its own
`session_scope()` - one transaction per job, committed when the job finishes
and rolled back if it raises. Without that, `db()` refuses to hand out a
session at all, which is deliberate: a background job quietly sharing (or
silently creating) a session is how work ends up committed at the wrong time.
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from config.settings import settings
from database.connection import session_scope

logger = logging.getLogger("cron")

JOB_ID = "overdue_digest"
scheduler: AsyncIOScheduler | None = None


async def overdue_job():
    from services import apqp_notification_service, order_notification_service, user_sync_service

    # Pull overnight signups from the shared table first, so anyone who
    # registered appears in /admin/user-approval alongside the morning's
    # emails.
    try:
        if not settings.USER_SYNC_ENABLED:
            raise RuntimeError("disabled - users are created by the portal")
        async with session_scope():
            synced = await user_sync_service.sync()
        if synced["created"]:
            logger.info("User sync imported %s account/s", synced["created"])
    except Exception as exc:
        logger.warning("User sync skipped: %s", exc)

    # Each digest gets its own transaction: a failure sending the APQP
    # digest must not roll back the order digest's email log, or the same
    # reminders would go out twice tomorrow.
    try:
        async with session_scope():
            await order_notification_service.send_overdue_digests()
    except Exception:
        logger.exception("Order overdue digest failed")

    try:
        async with session_scope():
            await apqp_notification_service.send_overdue_digests()
    except Exception:
        logger.exception("APQP overdue digest failed")

    # The management summary to the CC list - only when switched on.
    try:
        from services import summary_service
        async with session_scope():
            cfg = await order_notification_service.get_config()
            if getattr(cfg, "summary_enabled", False):
                await summary_service.send_daily_summary()
    except Exception:
        logger.exception("Daily summary failed")


async def _sync_user_job():
    """
    Runs on a timer so new signups on the shared page show up in
    /admin/user-approval without anyone clicking anything.
    """
    try:
        from services import user_sync_service

        async with session_scope():
            r = await user_sync_service.sync()
        if r["created"]:
            logger.info("User sync imported %s account/s: %s", r["created"], r["new_users"])
    except Exception as exc:
        logger.warning("User sync skipped: %s", exc)


def _schedule(hour: int, minute: int) -> None:
    if scheduler is None:
        return
    scheduler.add_job(
        overdue_job,
        CronTrigger(hour=hour, minute=minute),
        id=JOB_ID,
        replace_existing=True,
        misfire_grace_time=3600,
        coalesce=True,
    )
    logger.info("Overdue digest scheduled daily at %02d:%02d %s", hour, minute, settings.SCHEDULER_TIMEZONE)


async def start():
    global scheduler
    if not settings.SCHEDULER_ENABLED:
        logger.info("Scheduled jobs disabled by configuration.")
        return

    scheduler = AsyncIOScheduler(timezone=settings.SCHEDULER_TIMEZONE)
    scheduler.start()

    from services import order_notification_service

    # Startup runs before any request exists, so this needs its own scope
    # exactly as the jobs do.
    async with session_scope():
        cfg = await order_notification_service.get_config()
        hour, minute = cfg.overdue_hour, cfg.overdue_minute

    _schedule(hour, minute)

        # IntervalTrigger rather than CronTrigger: cron has no seconds field,
    # so anything under a minute has to be an interval.
    if settings.USER_SYNC_ENABLED:
        scheduler.add_job(
            _sync_user_job,
            IntervalTrigger(seconds=settings.USER_SYNC_SECONDS),
            id="user_sync",
            replace_existing=True,
            coalesce=True,
            max_instances=30,          # a slow run must not stack up behind itself
        )
        logger.info("User sync scheduled every %s seconds", settings.USER_SYNC_SECONDS)


    # scheduler.add_job(
    #     _sync_user_job,
    #     CronTrigger(minute=f"*/{settings.USER_SYNC_MINUTES}"),
    #     id="user_sync",
    #     replace_existing=True,
    #     coalesce=True,
    #     max_instances=1,          # a slow run must not stack up behind itself
    # )
    # logger.info("User sync scheduled every %s minute(s)", settings.USER_SYNC_MINUTES)


def reschedule(hour: int, minute: int) -> None:
    """Applies a new time immediately - no restart needed."""
    _schedule(hour, minute)


def next_run() -> str | None:
    if scheduler is None:
        return None
    job = scheduler.get_job(JOB_ID)
    return job.next_run_time.isoformat() if job and job.next_run_time else None


def shutdown():
    global scheduler
    if scheduler:
        scheduler.shutdown(wait=False)
        scheduler = None
