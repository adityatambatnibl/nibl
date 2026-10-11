class Role:
    ADMIN = "admin"
    USER = "user"
    ALL = [ADMIN, USER]

class AccountStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Permission:
    DASHBOARD_VIEW = "dashboard_view"

    APQP_VIEW = "apqp_view"
    TRACKING_VIEW = "tracking_view"
    ANALYTICS_VIEW = "analytics_view"

    EXCEL_EXPORT = "excel_export"
    ATTACHMENT_UPLOAD = "attachment_upload"

    APQP_EDIT = "apqp_edit"
    TRACKING_EDIT = "tracking_edit"

    TIMELINE_CREATE = "timeline_create"

class AuditAction:
    USER_SIGNED_UP = "user_signed_up"
    USER_APPROVED = "user_approved"
    USER_REJECTED = "user_rejected"
    USER_ROLE_CHANGED = "user_role_changed"
    USER_PERMISSIONS_CHANGED = "user_permissions_changed"
    USER_ACTIVATED = "user_activated"
    USER_DEACTIVATED = "user_deactivated"
    USER_DELETED = "user_deleted"
    ORDER_DELETED = "order_deleted"
    APQP_DELETED = "apqp_deleted"
    PASSWORD_RESET_REQUESTED = "password_reset_requested"
    PASSWORD_RESET_COMPLETED = "password_reset_completed"
    PASSWORD_CHANGED = "password_changed"
    PASSWORD_RESET_BY_ADMIN = "password_reset_by_admin"

class NotificationType:
    SIGNUP_REQUEST = "signup_request"
    PASSWORD_RESET = "password_reset"

# DEFAULT_USER_PERMISSIONS = [
#     Permission.DASHBOARD_VIEW,
#     Permission.ORDERS_VIEW,
#     Permission.TRACKING_VIEW,
#     Permission.TRACKING_EDIT,
#     Permission.APQP_VIEW,
# ]
DEFAULT_USER_PERMISSIONS = [
    Permission.DASHBOARD_VIEW,
    Permission.APQP_VIEW,
    Permission.TRACKING_VIEW,
    Permission.APQP_EDIT,
    Permission.TRACKING_EDIT,
]

MAX_UPLOAD_BYTES = 100 * 1024 * 1024   # 100 MB

ALLOWED_UPLOAD_EXTENSIONS = {
    ".pdf",
    ".xlsx", ".xls", ".xlsm", ".xlsb", ".csv",
    ".doc", ".docx", ".txt",
    ".png", ".jpg", ".jpeg", ".gif", ".webp",

    # AutoCAD
    ".dwg", ".dxf",

    # STEP / IGES
    ".step", ".stp", ".igs", ".iges",

    # Creo
    ".prt", ".asm", ".drw", ".frm", ".lay", ".sec",

    # Archives
    ".zip",
}