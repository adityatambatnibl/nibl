from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from services import cron_service
from config.settings import settings
from sqlalchemy import select

from database import repo
from models.notification_config import StageOwner, EmailLog, ApqpOwner
from models.user import User
from schemas.auth import MessageResponse
from schemas.notification import (
    NotificationConfigOut, StageOwnerOut, UpdateConfigRequest, EmailLogOut, ApqpOwnerOut,
    ApqpOwnerIn, PreviewRequest, PreviewOut, PreviewMail,
)
from services import(
    order_notification_service, template_service, audit_service, 
    apqp_notification_service,
)    
from utils.deps import require_admin

router = APIRouter(prefix="/notification-config", tags=["Notification Config"])
# The ten departments that can own an APQP activity. Kept in step with
# RESPONSIBILITIES in database/seed_templates.py and the dropdown in
# ApqpDetails.tsx.
APQP_DEPARTMENTS = [
    "MKTG", "R&D", "MKTG & R&D", "CFT", "QA",
    "TOOL ROOM", "MFG GBD", "MFG NBD", "SOURCING", "TL",
]

async def _build_out() -> NotificationConfigOut:
    cfg = await order_notification_service.get_config()
    tpl = await template_service.get_stages()

    existing = {o.stage_code: o for o in cfg.owners}

    owners = [
        StageOwnerOut(
            stage_code=s.code,
            stage_name=s.name,
            sequence=s.sequence,
            emails=existing[s.code].emails if s.code in existing else [],
            label=existing[s.code].label if s.code in existing else None,
        )
        for s in sorted(tpl.stages, key=lambda x: x.sequence)
    ]

    saved_apqp = {o.responsibility.strip().upper(): o for o in cfg.apqp_owners}
    apqp_owners = [
        ApqpOwnerOut(
            responsibility=d,
            emails=saved_apqp[d].emails if d in saved_apqp else [],
            label=saved_apqp[d].label if d in saved_apqp else None,
        )
        for d in APQP_DEPARTMENTS
    ]

    return NotificationConfigOut(
        owners=owners,
        cc_emails=cfg.cc_emails,
        handoff_enabled=cfg.handoff_enabled,
        overdue_enabled=cfg.overdue_enabled,
        overdue_hour=cfg.overdue_hour,
        overdue_minute=cfg.overdue_minute,
        email_sending_live=settings.EMAIL_ENABLED,
        apqp_owners=apqp_owners,
        **{k: bool(getattr(cfg, k, d)) for k, d in SWITCHES.items()},
    )


# Every on/off switch on the Email Settings page, with its default.
SWITCHES = {
    "apqp_handoff_enabled": True,
    "apqp_overdue_enabled": True,
    "signup_alert_enabled": True,
    "password_reset_alert_enabled": True,
    "password_email_enabled": True,
    "approval_email_enabled": True,
    "summary_enabled": False,
}
SWITCH_NAMES = {
    "handoff_enabled": "Tracking handoff", "overdue_enabled": "Tracking overdue",
    "apqp_handoff_enabled": "APQP handoff", "apqp_overdue_enabled": "APQP overdue",
    "signup_alert_enabled": "Access request alert",
    "password_reset_alert_enabled": "Password reset alert",
    "password_email_enabled": "New password email",
    "approval_email_enabled": "Approved / rejected email",
    "summary_enabled": "Daily summary",
}


@router.put("", response_model=NotificationConfigOut)
async def update_config(data: UpdateConfigRequest, admin: User = Depends(require_admin)):
    cfg = await order_notification_service.get_config()

    before = {o.stage_code: o.emails for o in cfg.owners}
    time_changed = (cfg.overdue_hour, cfg.overdue_minute) != (data.overdue_hour, data.overdue_minute)

    cfg.owners = [
        StageOwner(stage_code=o.stage_code, emails=[str(e) for e in o.emails], label=o.label)
        for o in data.owners
        if o.emails or o.label
    ]
    cfg.cc_emails = [str(e) for e in data.cc_emails]
    switched: list[str] = []
    for name in ("handoff_enabled", "overdue_enabled", *SWITCHES):
        value = getattr(data, name)
        if value is None:
            continue
        if bool(getattr(cfg, name, None)) != value:
            switched.append(f"{SWITCH_NAMES[name]} {'on' if value else 'off'}")
        setattr(cfg, name, value)
    cfg.overdue_hour = data.overdue_hour
    cfg.overdue_minute = data.overdue_minute
    cfg.updated_at = datetime.now(timezone.utc)
    cfg.updated_by = str(admin.id)

    if time_changed:
        cron_service.reschedule(cfg.overdue_hour, cfg.overdue_minute)

    after = {o.stage_code: o.emails for o in cfg.owners}
    changed = {k: v for k, v in after.items() if before.get(k) != v}
    if changed or switched:
        note = audit_service.summarise(
            switched + [f"{k}: {', '.join(v) or 'none'}" for k, v in changed.items()]
        )
        await audit_service.log(
            "stage_owners_changed", admin, "notification_config", cfg.key, "Email settings",
            before={k: before.get(k) for k in changed} or None, after=changed or None, note=note,
        )

    return await _build_out()


@router.post("/send/{stage_code}")
async def send_now(stage_code: str, _: User = Depends(require_admin)):
    return await order_notification_service.send_overdue_for_stage(stage_code)


@router.post("/test/{stage_code}")
async def send_test(stage_code: str, _: User = Depends(require_admin)):
    return await order_notification_service.send_test_email(stage_code)


@router.get("/next-run")
async def next_run(_: User = Depends(require_admin)):
    return {"next_run": cron_service.next_run()}

@router.get("", response_model=NotificationConfigOut)
async def get_config(_: User = Depends(require_admin)):
    return await _build_out()

@router.get("/logs", response_model=list[EmailLogOut])
async def logs(
    limit: int = Query(default=100, ge=1, le=500),
    _: User = Depends(require_admin),
):
    records = list(
        await repo.find_all(select(EmailLog).order_by(EmailLog.sent_at.desc()).limit(limit))
    )
    return [
        EmailLogOut(
            id=str(r.id), email_type=r.email_type, to_emails=r.to_emails,
            subject=r.subject, order_no=r.order_no, stage_code=r.stage_code,
            status=r.status, error=r.error, sent_at=r.sent_at.isoformat(),
        )
        for r in records
    ]


@router.post("/run-overdue-check")
async def run_overdue_check(_: User = Depends(require_admin)):
    """The "Send now" button: always sends, even if the 9 AM job already ran today."""
    return await order_notification_service.send_overdue_digests(force=True)


@router.put("/apqp-owners", response_model=MessageResponse)
async def set_apqp_owners(
    owners: list[ApqpOwnerIn],
    _: User = Depends(require_admin),
):
    # EmailStr above rejects a mistyped address (422) instead of saving it.
    cfg = await order_notification_service.get_config()
    cfg.apqp_owners = [
        ApqpOwner(responsibility=o.responsibility, label=o.label, emails=[str(e) for e in o.emails])
        for o in owners
    ]
    cfg.updated_at = datetime.now(timezone.utc)
    return MessageResponse(message="APQP department addresses saved.")

@router.post("/apqp-send/{responsibility}")
async def apqp_send(responsibility: str, _: User = Depends(require_admin)):
    return await apqp_notification_service.send_overdue_for_department(responsibility)

@router.post("/apqp-test/{responsibility}")
async def apqp_test(responsibility: str, _: User = Depends(require_admin)):
    return await apqp_notification_service.send_test_email(responsibility)


@router.post("/run-apqp-overdue-check")
async def run_apqp_overdue(_: User = Depends(require_admin)):
    return await apqp_notification_service.send_overdue_digests(force=True)



@router.post("/preview", response_model=PreviewOut)
async def preview(data: PreviewRequest, _: User = Depends(require_admin)):
    """
    Shows exactly the emails a button would send - built by the real code,
    with today's data - but sends nothing and records nothing.
    """
    from database.connection import db
    from services import email_service, summary_service

    box = email_service.start_preview()
    kind, key = data.kind, (data.key or "").strip()
    result = None
    if kind == "stage_overdue":
        result = await order_notification_service.send_overdue_for_stage(key)
    elif kind == "stage_test":
        result = await order_notification_service.send_test_email(key)
    elif kind == "apqp_overdue":
        result = await apqp_notification_service.send_overdue_for_department(key)
    elif kind == "apqp_test":
        result = await apqp_notification_service.send_test_email(key)
    elif kind == "tracking_digest":
        result = await order_notification_service.send_overdue_digests()
    elif kind == "apqp_digest":
        result = await apqp_notification_service.send_overdue_digests()
    elif kind == "summary":
        result = await summary_service.send_daily_summary()
    else:
        from fastapi import HTTPException
        raise HTTPException(400, f"Unknown preview '{kind}'.")

    # Nothing from a preview is kept.
    db().info["failed"] = True

    note = None
    if not box:
        r = result or {}
        note = (r.get("reason") or r.get("skipped")
                or "Nothing to send right now - no email would go out.")
    return PreviewOut(mails=[PreviewMail(**m) for m in box[:20]], note=note)


@router.post("/send-summary")
async def send_summary(_: User = Depends(require_admin)):
    """Sends today's management summary to the CC list now (always, even if already sent)."""
    from services import summary_service
    return await summary_service.send_daily_summary(force=True)
