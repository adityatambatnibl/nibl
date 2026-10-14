"""
Turn the four backend .env files into PRODUCTION settings, then check them.

Run on the SERVER through scripts\\PREPARE-PRODUCTION.bat (it asks the
questions and changes the PostgreSQL password first). Safe to run again.

What it changes (a copy of every .env is kept as .env.bak-<date> first):
  all four   ENVIRONMENT=production   -> /docs API pages hidden, secure cookie
                                         switched on automatically when the
                                         address is https://
  portal     FRONTEND_URL, CORS_ORIGINS = the public address only (no localhost)
  OIPM       FRONTEND_URL; unused SUPABASE_* lines removed
  NPD        CORS_ORIGINS, APP_BASE_URL, SQL_ECHO=false; unused SUPABASE_TABLE/BUCKET removed
  AI Drawing CORS_ORIGINS, PORTAL_URL, APP_BASE_URL
  password   the new database password in all four files (when given)
  IIS        the "Force HTTPS" rule in portal web.config is switched on when the
             address is https:// (and off again for http://)

What it checks (and reports, it never prints a password or key):
  same sign-in key in all four, same service key, keys long enough,
  database password not weak, e-mail settings present.

    python scripts\\prepare_production.py --public-url http://nibl
    (new DB password, optional, comes from the NIBL_NEW_PG_PASSWORD variable)
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
ENVS = {
    "Portal": ROOT / "portal" / "backend" / ".env",
    "OIPM": ROOT / "applications" / "OIPM" / "backend" / ".env",
    "NPD": ROOT / "applications" / "NPD" / "backend" / ".env",
    "AI Drawing": ROOT / "applications" / "AI-Drawing-Control" / "backend" / ".env",
}
WEAK = {"", "root", "admin", "postgres", "password", "1234", "12345", "123456", "nibl", "nibl123"}
problems: list[str] = []
notes: list[str] = []


def read(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8-sig").splitlines()


def values(lines: list[str]) -> dict[str, str]:
    out = {}
    for line in lines:
        s = line.strip()
        if s and not s.startswith("#") and "=" in s:
            k, v = s.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def set_key(lines: list[str], key: str, value: str) -> list[str]:
    pat = re.compile(rf"^\s*{re.escape(key)}\s*=")
    for i, line in enumerate(lines):
        if pat.match(line):
            lines[i] = f"{key}={value}"
            return lines
    lines.append(f"{key}={value}")
    return lines


def drop_keys(lines: list[str], keys: tuple[str, ...]) -> list[str]:
    return [l for l in lines if not any(re.match(rf"^\s*{re.escape(k)}\s*=", l) for k in keys)]


def url_with_password(url: str, password: str) -> str:
    """postgresql://user:old@host:port/db -> same URL with the new password."""
    p = urlsplit(url)
    if not p.username:
        return url
    host = p.hostname + (f":{p.port}" if p.port else "")
    return urlunsplit((p.scheme, f"{p.username}:{quote(password, safe='')}@{host}", p.path, p.query, p.fragment))


def password_in_url(url: str) -> str:
    from urllib.parse import unquote
    p = urlsplit(url)
    return unquote(p.password or "")


def switch_https_rule(on: bool) -> None:
    files = [ROOT / "portal" / "frontend" / "public" / "web.config",
             ROOT / "portal" / "frontend" / "dist" / "web.config"]
    for f in files:
        if not f.exists():
            continue
        s = f.read_text(encoding="utf-8")
        start = "<!-- HTTPS-REDIRECT:"
        if start not in s and "<!-- HTTPS-REDIRECT-ON:" not in s:
            continue
        if on:
            s = re.sub(r"<!-- HTTPS-REDIRECT:(.*?)\(needs an https binding on the site\)\.\n",
                       r"<!-- HTTPS-REDIRECT-ON:\1(needs an https binding on the site). -->\n", s, flags=re.S)
            s = s.replace("        HTTPS-REDIRECT-END -->", "        <!-- HTTPS-REDIRECT-END -->")
        else:
            s = re.sub(r"<!-- HTTPS-REDIRECT-ON:(.*?)\(needs an https binding on the site\)\. -->\n",
                       r"<!-- HTTPS-REDIRECT:\1(needs an https binding on the site).\n", s, flags=re.S)
            s = s.replace("        <!-- HTTPS-REDIRECT-END -->", "        HTTPS-REDIRECT-END -->")
        f.write_text(s, encoding="utf-8")
    notes.append("IIS: 'Force HTTPS' rule is " + ("ON - http:// is sent to https://" if on else "off (site stays on http)"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--public-url", default="http://nibl", help="address users open: http://nibl or https://nibl")
    a = ap.parse_args()
    pub = a.public_url.strip().rstrip("/")
    if not re.match(r"^https?://[^/\s]+$", pub):
        print(f"STOPPED: --public-url must look like http://nibl or https://nibl (got {pub!r})")
        return 1
    https = pub.lower().startswith("https://")
    new_pw = os.environ.get("NIBL_NEW_PG_PASSWORD", "")

    missing = [n for n, p in ENVS.items() if not p.exists()]
    if missing:
        print("STOPPED: these .env files are missing - run scripts\\SETUP.bat first: " + ", ".join(missing))
        return 1

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    data = {}
    for name, path in ENVS.items():
        shutil.copy2(path, path.with_name(f".env.bak-{stamp}"))
        data[name] = read(path)

    # ---- changes -----------------------------------------------------------
    for name in ENVS:
        data[name] = set_key(data[name], "ENVIRONMENT", "production")

    p = data["Portal"]
    p = set_key(p, "FRONTEND_URL", pub)
    p = set_key(p, "CORS_ORIGINS", pub)
    if new_pw:
        p = set_key(p, "DB_PASSWORD", new_pw)
    data["Portal"] = p

    o = data["OIPM"]
    o = set_key(o, "FRONTEND_URL", pub)
    o = drop_keys(o, ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"))
    if new_pw:
        o = set_key(o, "DB_PASSWORD", new_pw)
    data["OIPM"] = o

    n = data["NPD"]
    n = set_key(n, "CORS_ORIGINS", pub)
    n = set_key(n, "APP_BASE_URL", f"{pub}/npd")
    n = set_key(n, "SQL_ECHO", "false")
    n = drop_keys(n, ("SUPABASE_TABLE", "SUPABASE_BUCKET"))
    if new_pw and values(n).get("SUPABASE_DB_URL"):
        n = set_key(n, "SUPABASE_DB_URL", url_with_password(values(n)["SUPABASE_DB_URL"], new_pw))
    data["NPD"] = n

    d = data["AI Drawing"]
    d = set_key(d, "CORS_ORIGINS", pub)
    d = set_key(d, "PORTAL_URL", pub)
    d = set_key(d, "APP_BASE_URL", f"{pub}/drawing-control")
    if new_pw and values(d).get("DATABASE_URL"):
        d = set_key(d, "DATABASE_URL", url_with_password(values(d)["DATABASE_URL"], new_pw))
    data["AI Drawing"] = d

    for name, path in ENVS.items():
        path.write_text("\n".join(data[name]) + "\n", encoding="utf-8")
    switch_https_rule(https)

    # ---- checks ------------------------------------------------------------
    v = {name: values(lines) for name, lines in data.items()}
    jwt = {"Portal": v["Portal"].get("JWT_SECRET_KEY", ""), "OIPM": v["OIPM"].get("JWT_SECRET_KEY", ""),
           "NPD": v["NPD"].get("OIPM_JWT_SECRET", ""), "AI Drawing": v["AI Drawing"].get("PORTAL_JWT_SECRET", "")}
    if len(set(jwt.values())) != 1:
        problems.append("The sign-in key is not the same in all four .env files - users will be asked to sign in again "
                        "in some apps. Run scripts\\configure_env.py or copy Portal JWT_SECRET_KEY into the others.")
    if any(len(x) < 32 for x in jwt.values()):
        problems.append("A sign-in key is shorter than 32 characters.")
    if len(v["NPD"].get("JWT_SECRET", "")) < 32:
        problems.append("NPD JWT_SECRET is missing or shorter than 32 characters.")
    svc = {k: x.get("PORTAL_SERVICE_KEY", "") for k, x in v.items()}
    if len(set(svc.values())) != 1 or any(len(x) < 32 for x in svc.values()):
        problems.append("PORTAL_SERVICE_KEY must be the same (32+ characters) in all four .env files.")

    pws = {"Portal": v["Portal"].get("DB_PASSWORD", ""), "OIPM": v["OIPM"].get("DB_PASSWORD", ""),
           "NPD": password_in_url(v["NPD"].get("SUPABASE_DB_URL", "")),
           "AI Drawing": password_in_url(v["AI Drawing"].get("DATABASE_URL", ""))}
    if len(set(pws.values())) != 1:
        problems.append("The database password is not the same in all four .env files.")
    if any(x.lower() in WEAK or len(x) < 12 for x in pws.values()):
        problems.append("The database password is weak (e.g. 'root') or shorter than 12 characters - "
                        "run PREPARE-PRODUCTION.bat again and give a strong one.")

    for name, user_key in (("Portal", "SMTP_USERNAME"), ("OIPM", "SMTP_USERNAME"), ("NPD", "SMTP_USER"), ("AI Drawing", "SMTP_USER")):
        if not v[name].get("SMTP_HOST") or not v[name].get(user_key) or not v[name].get("SMTP_PASSWORD"):
            notes.append(f"{name}: SMTP_HOST / {user_key} / SMTP_PASSWORD not all set - that app cannot send e-mail yet.")
    for name in ("NPD", "AI Drawing"):
        if v[name].get("EMAIL_ENABLED", "").lower() != "true":
            notes.append(f"{name}: EMAIL_ENABLED is not true - no e-mails will be sent.")
    if not https:
        notes.append("Address is http:// - sign-in works, but passwords cross the office network unencrypted. "
                     "Add an https certificate in IIS and run this again with https://nibl.")

    # ---- report ------------------------------------------------------------
    print()
    print(f"   Address           : {pub}")
    print(f"   Secure cookie     : {'ON (https)' if https else 'off (http - would break sign-in otherwise)'}")
    print(f"   Database password : {'changed in all four files' if new_pw else 'not changed'}")
    print(f"   Backups of .env   : .env.bak-{stamp} next to each file")
    for x in notes:
        print("   NOTE  " + x)
    for x in problems:
        print("   FIX   " + x)
    print()
    print("Done - restart the four services (install-services.ps1 -Start) so they read the new settings."
          if not problems else "Settings written, but fix the FIX lines above before going live.")
    return 2 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
