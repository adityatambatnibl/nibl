from pydantic import BaseModel, EmailStr, Field


class StageOwnerOut(BaseModel):
    stage_code: str
    stage_name: str
    sequence: int
    emails: list[str]
    label: str | None


class StageOwnerIn(BaseModel):
    stage_code: str
    emails: list[EmailStr] = Field(default_factory=list)
    label: str | None = None

class ApqpOwnerOut(BaseModel):
    responsibility: str
    label: str | None = None
    emails: list[str] = []

class NotificationConfigOut(BaseModel):
    owners: list[StageOwnerOut]
    cc_emails: list[str]
    handoff_enabled: bool
    overdue_enabled: bool
    email_sending_live: bool
    overdue_hour: int
    overdue_minute: int
    apqp_owners: list[ApqpOwnerOut] = []
    # which emails are sent
    apqp_handoff_enabled: bool = True
    apqp_overdue_enabled: bool = True
    signup_alert_enabled: bool = True
    password_reset_alert_enabled: bool = True
    password_email_enabled: bool = True
    approval_email_enabled: bool = True
    summary_enabled: bool = False


class UpdateConfigRequest(BaseModel):
    owners: list[StageOwnerIn]
    cc_emails: list[EmailStr] = Field(default_factory=list)
    handoff_enabled: bool = True
    overdue_enabled: bool = True
    overdue_hour: int = Field(default=9, ge=0, le=23)
    overdue_minute: int = Field(default=0, ge=0, le=59)
    # None = leave as it is (older screens do not send these)
    apqp_handoff_enabled: bool | None = None
    apqp_overdue_enabled: bool | None = None
    signup_alert_enabled: bool | None = None
    password_reset_alert_enabled: bool | None = None
    password_email_enabled: bool | None = None
    approval_email_enabled: bool | None = None
    summary_enabled: bool | None = None


class EmailLogOut(BaseModel):
    id: str
    email_type: str
    to_emails: list[str]
    subject: str
    order_no: str | None
    stage_code: str | None
    status: str
    error: str | None
    sent_at: str


class ApqpOwnerIn(BaseModel):
    responsibility: str
    label: str | None = None
    emails: list[EmailStr] = Field(default_factory=list)


class PreviewRequest(BaseModel):
    kind: str          # stage_overdue | stage_test | apqp_overdue | apqp_test |
                       # tracking_digest | apqp_digest | summary
    key: str | None = None     # stage code or department


class PreviewMail(BaseModel):
    subject: str
    to: list[str]
    cc: list[str]
    html: str


class PreviewOut(BaseModel):
    mails: list[PreviewMail]
    note: str | None = None
