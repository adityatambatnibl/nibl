"""
Split the old shared database into one database per part of the system.

    source (old, left UNTOUCHED)          new databases
    ─────────────────────────────         ──────────────────────────────────────────
    public.users                     ──►  nibl_portal   users  (identity + password)
    public.users / improvements /    ──►  nibl_oipm     same tables, same data
      improvement_drafts
    schema apqp (minus dc_*)         ──►  nibl_npd      schema apqp, same data
    apqp.dc_* + drawing audit rows   ──►  nibl_drawing  schema drawing + drawing.users

Every step runs only if its target is still empty, so running the script
again never duplicates or overwrites data. Nothing in the source database
is changed or deleted.

The live server keeps OIPM and NPD in TWO databases ("oipm" and "apqp").
Give them separately with --oipm-source / --npd-source; --source is used for
both when they are one shared database.

Usage (Windows, from the repository root):
    applications\\NPD\\backend\\venv\\Scripts\\python.exe scripts\\split_databases.py ^
        --pg-bin "C:\\Program Files\\PostgreSQL\\18\\bin" --port 5433 --password root --source nibl_workspace
    Live server (two databases):
        ... --oipm-source oipm --npd-source apqp
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import Json

ROOT = Path(__file__).resolve().parents[1]
TARGETS = {"portal": "nibl_portal", "oipm": "nibl_oipm", "npd": "nibl_npd", "drawing": "nibl_drawing"}
DRAWING_AUDIT_TYPES = ("drawing", "drawing_folder", "drawing_access")


def say(msg: str) -> None:
    print(msg, flush=True)


class Pg:
    def __init__(self, a):
        self.a = a
        self.bin = Path(a.pg_bin) if a.pg_bin else None
        self.env = {**os.environ, "PGPASSWORD": a.password}

    def exe(self, name: str) -> str:
        if self.bin:
            for cand in (self.bin / f"{name}.exe", self.bin / name):
                if cand.exists():
                    return str(cand)
        found = shutil.which(name)
        if not found:
            sys.exit(f"Cannot find {name}. Pass --pg-bin <PostgreSQL bin folder>.")
        return found

    def conn(self, db: str):
        c = psycopg2.connect(host=self.a.host, port=self.a.port, user=self.a.user, password=self.a.password, dbname=db)
        c.autocommit = True
        return c

    def scalar(self, db: str, sql: str, args=()):
        c = self.conn(db)
        try:
            with c.cursor() as cur:
                cur.execute(sql, args)
                row = cur.fetchone()
                return row[0] if row else None
        finally:
            c.close()

    def run(self, db: str, sql: str, args=()):
        c = self.conn(db)
        try:
            with c.cursor() as cur:
                cur.execute(sql, args)
        finally:
            c.close()

    def copy(self, src: str, dst: str, dump_args: list[str], label: str) -> None:
        """pg_dump | psql, errors collected (expected ones like 'schema public already exists' ignored)."""
        base = ["-h", self.a.host, "-p", str(self.a.port), "-U", self.a.user]
        dump = subprocess.run([self.exe("pg_dump"), *base, "--no-owner", "--no-privileges", *dump_args, src],
                              env=self.env, capture_output=True)
        if dump.returncode != 0:
            sys.exit(f"pg_dump failed for {label}: {dump.stderr.decode(errors='replace')}")
        sql = dump.stdout.decode("utf-8", errors="replace")
        # pg_dump 17.6+/18 writes \restrict lines; older psql cannot read them.
        sql = "\n".join(l for l in sql.splitlines() if not l.startswith("\\restrict") and not l.startswith("\\unrestrict"))
        res = subprocess.run([self.exe("psql"), *base, "-X", "-q", "-d", dst], input=sql.encode("utf-8"),
                             env=self.env, capture_output=True)
        errors = [l for l in res.stderr.decode(errors="replace").splitlines()
                  if "ERROR" in l and "already exists" not in l and "transaction_timeout" not in l]
        say(f"   {label}: copied" + (f" ({len(errors)} warning(s): {errors[:3]})" if errors else ""))


def table_exists(pg: Pg, db: str, qualified: str) -> bool:
    return bool(pg.scalar(db, "select to_regclass(%s) is not null", (qualified,)))


def count(pg: Pg, db: str, qualified: str) -> int:
    return pg.scalar(db, f"select count(*) from {qualified}") if table_exists(pg, db, qualified) else 0


def create_tables_from_models(pg: Pg, db: str, app: str) -> None:
    """Create a new app's tables with its own SQLAlchemy models (portal / AI Drawing)."""
    from sqlalchemy import create_engine, text
    from urllib.parse import quote_plus

    url = (f"postgresql+psycopg2://{quote_plus(pg.a.user)}:{quote_plus(pg.a.password)}"
           f"@{pg.a.host}:{pg.a.port}/{db}")
    engine = create_engine(url)
    saved = list(sys.path)
    try:
        if app == "portal":
            sys.path.insert(0, str(ROOT / "portal" / "backend"))
            from app.db.models import Base, import_all_models
            import_all_models()
            Base.metadata.create_all(engine)
        else:
            sys.path.insert(0, str(ROOT / "applications" / "AI-Drawing-Control" / "backend"))
            for m in [k for k in sys.modules if k == "models" or k.startswith("models.")]:
                del sys.modules[m]
            from models import audit, drawing, email_log, user  # noqa: F401
            from models.base import Base
            with engine.begin() as c:
                c.execute(text("create schema if not exists drawing"))
                c.execute(text("create extension if not exists pg_trgm"))
            Base.metadata.create_all(engine)
    finally:
        sys.path[:] = saved
        engine.dispose()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5432)
    ap.add_argument("--user", default="postgres")
    ap.add_argument("--password", required=True)
    ap.add_argument("--source", default="nibl_workspace", help="old shared database (read only)")
    ap.add_argument("--oipm-source", default="", help="old OIPM database (public.users ...), default --source")
    ap.add_argument("--npd-source", default="", help="old NPD database (schema apqp), default --source")
    ap.add_argument("--pg-bin", default="", help="PostgreSQL bin folder (pg_dump / psql)")
    a = ap.parse_args()
    pg = Pg(a)

    oipm_src = a.oipm_source or a.source
    npd_src = a.npd_source or a.source
    for db in sorted({oipm_src, npd_src}):
        if not pg.scalar("postgres", "select 1 from pg_database where datname=%s", (db,)):
            sys.exit(f"Source database '{db}' not found.")
    say(f">> Source: OIPM from '{oipm_src}', NPD from '{npd_src}' (read only, never changed)")

    say(">> 1/5  Creating databases")
    for name in TARGETS.values():
        if pg.scalar("postgres", "select 1 from pg_database where datname=%s", (name,)):
            say(f"   {name}: exists")
        else:
            pg.run("postgres", f'create database "{name}"')
            say(f"   {name}: created")
    pg.run("postgres", """DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
        END $$;""")

    say(">> 2/5  OIPM  -> nibl_oipm")
    if table_exists(pg, TARGETS["oipm"], "public.users"):
        say("   already has data - skipped")
    elif table_exists(pg, oipm_src, "public.users"):
        pg.copy(oipm_src, TARGETS["oipm"], ["--schema=public"], "OIPM tables")
    else:
        say("   no OIPM tables in the source - skipped (OIPM creates empty tables on start)")

    say(">> 3/5  NPD   -> nibl_npd")
    if table_exists(pg, TARGETS["npd"], "apqp.user_apqp"):
        say("   already has data - skipped")
    elif table_exists(pg, npd_src, "apqp.user_apqp"):
        pg.copy(npd_src, TARGETS["npd"], ["--schema=apqp", "--exclude-table=apqp.dc_*"], "NPD schema apqp")
    else:
        say("   no NPD tables in the source - skipped")

    say(">> 4/5  AI Drawing Control -> nibl_drawing")
    create_tables_from_models(pg, TARGETS["drawing"], "drawing")
    if count(pg, TARGETS["drawing"], "drawing.dc_drawings") or count(pg, TARGETS["drawing"], "drawing.users"):
        say("   already has data - skipped")
    else:
        src = pg.conn(npd_src)
        osrc = pg.conn(oipm_src)
        dst = pg.conn(TARGETS["drawing"])
        with src.cursor() as s, osrc.cursor() as so, dst.cursor() as d:
            # tables created by the models; copy rows table by table, parents first
            for t in ("dc_folders", "dc_drawings", "dc_revisions", "dc_reviews", "dc_reviewer_list", "dc_access_log"):
                if table_exists(pg, npd_src, f"apqp.{t}"):
                    if t == "dc_folders":
                        d.execute("delete from drawing.dc_folders where not exists (select 1 from drawing.dc_drawings)")
                    s.execute(f"select * from apqp.{t}")
                    cols = [c.name for c in s.description]
                    rows = s.fetchall()
                    if t == "dc_folders":
                        rows.sort(key=lambda r: r[cols.index("parent_id")] is not None)
                        # parents before children
                        done, ordered, pending = set(), [], rows
                        while pending:
                            nxt = [r for r in pending if r[cols.index("parent_id")] is None or r[cols.index("parent_id")] in done]
                            if not nxt:
                                ordered += pending; break
                            ordered += nxt; done |= {r[cols.index("id")] for r in nxt}
                            pending = [r for r in pending if r not in nxt]
                        rows = ordered
                    for r in rows:
                        d.execute(f"insert into drawing.{t} ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))}) on conflict do nothing", r)
                    say(f"   drawing.{t}: {len(rows)} row(s)")
            # Who may use AI Drawing Control: same people as before the split.
            #   approved = had drawing_view / drawing_admin, or was an NPD admin
            #   admin    = had drawing_admin, or was an NPD admin
            npd_access = {}
            if table_exists(pg, npd_src, "apqp.user_apqp"):
                s.execute("select id, role, permissions, status, is_active from apqp.user_apqp")
                for uid, role, perms, st, active in s.fetchall():
                    perms = perms or []
                    ok = st == "approved" and active and (role == "admin" or "drawing_view" in perms or "drawing_admin" in perms)
                    npd_access[uid] = (ok, ok and (role == "admin" or "drawing_admin" in perms))
            n = 0
            if table_exists(pg, oipm_src, "public.users"):
                so.execute("select id, full_name, email, employee_code from public.users where email is not null")
                for uid, name, email, code in so.fetchall():
                    ok, adm = npd_access.get(uid, (False, False))
                    d.execute("""insert into drawing.users (id, name, email, employee_code, role, status, is_active)
                                 values (%s,%s,lower(%s),%s,%s,%s,true) on conflict do nothing""",
                              (uid, name, email, code, "admin" if adm else "user", "approved" if ok else "pending"))
                    n += 1
            say(f"   drawing.users: {n} user(s) ({sum(1 for v in npd_access.values() if v[0])} approved from the old drawing access)")
            if table_exists(pg, npd_src, "apqp.audit_logs"):
                s.execute("""select id, action, actor_id, actor_name, target_type, target_id, target_label, before, after, note, created_at
                             from apqp.audit_logs where target_type = any(%s)""", (list(DRAWING_AUDIT_TYPES),))
                rows = s.fetchall()
                for r in rows:
                    d.execute("""insert into drawing.audit_logs (id, action, actor_id, actor_name, target_type, target_id,
                                 target_label, before, after, note, created_at) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                                 on conflict do nothing""", (*r[:7], Json(r[7]) if r[7] is not None else None,
                                                             Json(r[8]) if r[8] is not None else None, *r[9:]))
                say(f"   drawing.audit_logs: {len(rows)} row(s)")
        src.close(); osrc.close(); dst.close()

    say(">> 5/5  Portal -> nibl_portal (one identity and password per person)")
    create_tables_from_models(pg, TARGETS["portal"], "portal")
    if count(pg, TARGETS["portal"], "public.users"):
        say("   already has users - skipped")
    elif table_exists(pg, oipm_src, "public.users"):
        src = pg.conn(oipm_src)
        nsrc = pg.conn(npd_src)
        dst = pg.conn(TARGETS["portal"])
        with src.cursor() as s, nsrc.cursor() as sn, dst.cursor() as d:
            s.execute("""select id, full_name, employee_code, email, password_hash, role::text, hod_id, created_at
                         from public.users where email is not null""")
            rows = s.fetchall()
            for uid, name, code, email, pw, role, hod, created in rows:
                d.execute("""insert into public.users (id, full_name, employee_code, email, password_hash, profile,
                                 is_active, is_admin, created_at)
                             values (%s,%s,%s,lower(%s),%s,%s,true,%s,%s) on conflict do nothing""",
                          (uid, name, code, email, pw or "", Json({"role": role, "hod_id": str(hod) if hod else None}),
                           role == "admin", created))
            say(f"   users: {len(rows)} person(s); OIPM admins are portal admins")
            d.execute("select lower(email) from public.users")
            have = {r[0] for r in d.fetchall()}
            dupes = len(rows) - len(have)
            if dupes:
                say(f"   NOTE: {dupes} duplicate email(s) in the OIPM users table - the first account was kept.")
            if table_exists(pg, npd_src, "apqp.user_apqp"):
                # NPD accounts that never signed up through OIPM (created inside NPD before
                # single sign-on). They keep their NPD password and NPD status; their
                # employee code is a placeholder the portal admin can correct.
                # OIPM and NPD may be two databases, so the "already has an OIPM
                # account" test is done here in Python, not in one SQL join.
                s.execute("select id from public.users")
                oipm_ids = {str(r[0]) for r in s.fetchall()}
                sn.execute("""select u.id, u.supabase_id, u.name, u.email, u.password_hash, u.department, u.created_at
                              from apqp.user_apqp u
                              where u.email is not null and position('@' in u.email) > 1""")
                extra = 0
                for uid, sup_id, name, email, pw, dept, created in sn.fetchall():
                    if str(uid) in oipm_ids or (sup_id and str(sup_id) in oipm_ids) or email.lower() in have:
                        continue
                    d.execute("""insert into public.users (id, full_name, employee_code, email, password_hash, department,
                                     profile, is_active, is_admin, created_at)
                                 values (%s,%s,%s,lower(%s),%s,%s,%s,true,false,%s) on conflict do nothing""",
                              (uid, name, f"NPD-{str(uid)[:8]}", email, pw or "", dept, Json({"source": "npd"}), created))
                    have.add(email.lower())
                    extra += 1
                if extra:
                    say(f"   + {extra} NPD-only account(s) added (employee code 'NPD-xxxxxxxx' - correct it in Portal admin).")
        src.close(); nsrc.close(); dst.close()

    say("")
    for k, db in TARGETS.items():
        q = {"portal": "public.users", "oipm": "public.users", "npd": "apqp.user_apqp", "drawing": "drawing.users"}[k]
        say(f"   {db:14s} {q:18s} {count(pg, db, q)} row(s)")
    say("DONE - the source database was not changed.")


if __name__ == "__main__":
    main()
