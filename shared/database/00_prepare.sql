-- =============================================================================
--  00_prepare.sql  - run BEFORE oipm_only_backup.sql   (used by setup-database.ps1)
--
--  The Supabase backups expect a few things that a fresh PostgreSQL does not have:
--    * roles anon / authenticated / service_role  (the dumps GRANT to them)
--    * enum type public.user_role                 (column public.users.role)
--  Values match oipm/app/models/user.py -> class UserRole.
--  Safe to run again.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role')  THEN CREATE ROLE service_role NOLOGIN;  END IF;

    IF NOT EXISTS (SELECT FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'user_role' AND n.nspname = 'public') THEN
        CREATE TYPE public.user_role AS ENUM ('admin', 'plant_head', 'hod', 'employee', 'accounts');
    END IF;
END
$$;
