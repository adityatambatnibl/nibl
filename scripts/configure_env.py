"""
Write the four backend .env files from the settings you already have.

    portal/backend/.env                         nibl_portal, sign-in key, SMTP
    applications/OIPM/backend/.env              old OIPM settings  + nibl_oipm
    applications/NPD/backend/.env               old NPD settings   + nibl_npd
    applications/AI-Drawing-Control/backend/.env                    nibl_drawing

Rules
  * The SAME sign-in key is used everywhere (taken from the old OIPM
    JWT_SECRET_KEY), so existing sessions and the NPD single sign-on keep working.
  * A new random PORTAL_SERVICE_KEY is created once and shared by all four.
  * An existing value in a target .env is NEVER overwritten - only missing
    keys are added. Run it as often as you like.
  * Passwords are never printed.

Usage:
    python scripts\\configure_env.py --old-oipm-env "<path>\\.env" --old-npd-env "<path>\\.env" --pg-port 5433 --pg-password root
"""
from __future__ import annotations

import argparse
import secrets
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]


def read_env(path: Path | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path or not path.exists():
        return out
    for raw in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def write_env(path: Path, values: dict[str, str], header: str) -> tuple[int, int]:
    existing = read_env(path)
    lines = path.read_text(encoding="utf-8-sig").splitlines() if path.exists() else [f"# {header}", ""]
    added = 0
    for k, v in values.items():
        if k in existing:
            continue
        lines.append(f"{k}={v}")
        added += 1
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return added, len(existing)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--old-oipm-env", default="")
    ap.add_argument("--old-npd-env", default="")
    ap.add_argument("--pg-host", default="127.0.0.1")
    ap.add_argument("--pg-port", default="5432")
    ap.add_argument("--pg-user", default="postgres")
    ap.add_argument("--pg-password", required=True)
    ap.add_argument("--public-url", default="http://nibl", help="address users open, e.g. http://nibl")
    a = ap.parse_args()

    oipm = read_env(Path(a.old_oipm_env)) if a.old_oipm_env else {}
    npd = read_env(Path(a.old_npd_env)) if a.old_npd_env else {}

    targets = {
        "portal": ROOT / "portal" / "backend" / ".env",
        "oipm": ROOT / "applications" / "OIPM" / "backend" / ".env",
        "npd": ROOT / "applications" / "NPD" / "backend" / ".env",
        "drawing": ROOT / "applications" / "AI-Drawing-Control" / "backend" / ".env",
    }
    current = {k: read_env(p) for k, p in targets.items()}

    jwt = (current["portal"].get("JWT_SECRET_KEY") or oipm.get("JWT_SECRET_KEY")
           or npd.get("OIPM_JWT_SECRET") or secrets.token_urlsafe(48))
    service_key = next((c["PORTAL_SERVICE_KEY"] for c in current.values() if c.get("PORTAL_SERVICE_KEY")),
                       secrets.token_urlsafe(32))
    pw = quote(a.pg_password, safe="")
    db = dict(DB_HOST=a.pg_host, DB_PORT=a.pg_port, DB_USER=a.pg_user, DB_PASSWORD=a.pg_password)
    url = lambda name: f"postgresql://{a.pg_user}:{pw}@{a.pg_host}:{a.pg_port}/{name}"
    pub = a.public_url.rstrip("/")
    cors = f"{pub},http://localhost:5173,http://127.0.0.1:5173"

    portal = {
        "APP_NAME": "NIBL Application Portal", "ENVIRONMENT": oipm.get("ENVIRONMENT", "development"),
        **db, "DB_NAME": "nibl_portal",
        "JWT_SECRET_KEY": jwt, "JWT_ALGORITHM": oipm.get("JWT_ALGORITHM", "HS256"),
        "ACCESS_TOKEN_EXPIRE_MINUTES": oipm.get("ACCESS_TOKEN_EXPIRE_MINUTES", "480"),
        "PORTAL_SERVICE_KEY": service_key, "FRONTEND_URL": pub, "CORS_ORIGINS": cors,
        **{k: oipm[k] for k in ("SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_USE_TLS", "SMTP_FROM_EMAIL") if k in oipm},
    }
    oipm_new = {**oipm, **db, "DB_NAME": "nibl_oipm", "JWT_SECRET_KEY": jwt,
                "PORTAL_SERVICE_KEY": service_key, "PORTAL_INTERNAL_URL": "http://127.0.0.1:8010/portal-api"}
    npd_new = {**npd, "STORAGE_BACKEND": "local", "STORAGE_DIR": "../data", "SUPABASE_DB_URL": url("nibl_npd"), "SUPABASE_DB_SSL_MODE": "disable",
               "OIPM_JWT_SECRET": jwt, "OIPM_JWT_ALGORITHM": oipm.get("JWT_ALGORITHM", "HS256"),
               "PORTAL_SERVICE_KEY": service_key, "USER_SYNC_ENABLED": "false"}
    drawing = {
        "DATABASE_URL": url("nibl_drawing"), "DB_SSL_MODE": "disable",
        "PORTAL_JWT_SECRET": jwt, "JWT_ALGORITHM": oipm.get("JWT_ALGORITHM", "HS256"),
        "PORTAL_SERVICE_KEY": service_key, "PORTAL_URL": pub,
        # Every application keeps its files in its own applications/<app>/data folder.
        "STORAGE_BACKEND": "local", "STORAGE_DIR": "../data",
        **{k: npd[k] for k in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_ENABLED") if k in npd},
        "SMTP_FROM_NAME": "Drawing Control", "APP_BASE_URL": f"{pub}/drawing-control",
        "CORS_ORIGINS": cors, "DRAWING_REMINDER_HOURS": "24",
    }
    for key, values, header in (
        ("portal", portal, "NIBL portal backend settings - never commit this file"),
        ("oipm", oipm_new, "OIPM backend settings - never commit this file"),
        ("npd", npd_new, "NPD backend settings - never commit this file"),
        ("drawing", drawing, "Drawing Control backend settings - never commit this file"),
    ):
        added, kept = write_env(targets[key], values, header)
        print(f"   {str(targets[key].relative_to(ROOT)):46s} {added} added, {kept} kept")

    # The old .env files may hold different DB names - tell the user when they do.
    for key, want in (("oipm", ("DB_NAME", "nibl_oipm")), ("npd", ("SUPABASE_DB_URL", "nibl_npd"))):
        got = read_env(targets[key]).get(want[0], "")
        if want[1] not in got:
            print(f"   CHECK: {targets[key].relative_to(ROOT)} {want[0]} does not point at {want[1]}")
    print("Done. The same sign-in key and service key are now in all four files.")


if __name__ == "__main__":
    main()
