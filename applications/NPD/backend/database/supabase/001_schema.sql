-- =============================================================================
--  APQP / Order Development Tracking System - Postgres schema
--  Target: a Supabase project SHARED with another application.
--
--  Everything this app owns lives in the `apqp` schema. The other app's
--  tables (public.users, public.improvements) are never touched or altered.
--  That keeps the two projects independent: either one can be lifted out
--  later by dumping a single schema.
--
--  Run once, in the Supabase SQL Editor, or with:
--      psql "$SUPABASE_DB_URL" -f 001_schema.sql
--  It is idempotent - re-running it is safe.
-- =============================================================================

create schema if not exists apqp;

-- gen_random_uuid(). On Supabase this is already installed in `extensions`.
create extension if not exists pgcrypto;


-- -----------------------------------------------------------------------------
--  user_apqp
--
--  Our own copy of an account. Rows arrive here by sync from the shared
--  public.users table that the common signup screen writes to - see
--  services/user_sync_service.py.
--
--  `id` deliberately REUSES public.users.id so the two rows are the same
--  person by construction and the sync can never duplicate anyone. There is
--  no foreign key to public.users on purpose: a delete over there must not
--  cascade into this app's audit trail.
--
--  Only uuid / name / email / password_hash are copied. Everything below
--  those is this app's own business - role, permissions and approval status
--  are decided by THIS app's admin section and are not shared.
-- -----------------------------------------------------------------------------
create table if not exists apqp.user_apqp (
    id                      uuid primary key default gen_random_uuid(),
    name                    text        not null,
    email                   text        not null,
    password_hash           text        not null default '',

    -- Constrained, not just documented. The login check and the session
    -- check test different things, so a typo like 'approve' lets a user log
    -- in and then throws them straight back out on the next request - a
    -- confusing failure that these two lines make impossible.
    role                    text        not null default 'user'
                                check (role in ('admin', 'user')),
    status                  text        not null default 'pending'
                                check (status in ('pending', 'approved', 'rejected')),
    permissions             jsonb       not null default '[]'::jsonb,
    is_active               boolean     not null default true,

    last_login              timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz,
    approved_by             text,
    approved_at             timestamptz,
    rejected_by             text,
    rejected_at             timestamptz,

    reset_token_hash        text,
    reset_expires_at        timestamptz,
    must_change_password    boolean     not null default false,

    department              text,
    -- The public.users row this was synced from. Equal to id for synced
    -- accounts; null for anyone created directly inside this app.
    supabase_id             uuid
);

-- Case-insensitive uniqueness. The Mongo version lower()ed on write; doing it
-- in the index means a stray mixed-case insert can no longer slip through.
create unique index if not exists user_apqp_email_key   on apqp.user_apqp (lower(email));
create        index if not exists user_apqp_status_idx  on apqp.user_apqp (status);
create unique index if not exists user_apqp_supabase_id_key
    on apqp.user_apqp (supabase_id) where supabase_id is not null;


-- -----------------------------------------------------------------------------
--  notifications - the in-app bell
-- -----------------------------------------------------------------------------
create table if not exists apqp.notifications (
    id          uuid primary key default gen_random_uuid(),
    type        text        not null,
    title       text        not null,
    message     text        not null,
    link        text,
    ref_id      text,
    is_read     boolean     not null default false,
    created_at  timestamptz not null default now(),
    read_at     timestamptz
);

create index if not exists notifications_unread_idx
    on apqp.notifications (is_read, created_at desc);


-- -----------------------------------------------------------------------------
--  audit_logs
-- -----------------------------------------------------------------------------
create table if not exists apqp.audit_logs (
    id            uuid primary key default gen_random_uuid(),
    action        text        not null,
    actor_id      text        not null,
    actor_name    text        not null,
    target_type   text,
    target_id     text,
    target_label  text,
    before        jsonb,
    after         jsonb,
    note          text,
    created_at    timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on apqp.audit_logs (created_at desc);
create index if not exists audit_logs_target_idx  on apqp.audit_logs (target_type, target_id);


-- -----------------------------------------------------------------------------
--  templates
--
--  Singleton-per-kind configuration: the 29 production stages and the 64
--  APQP activities. The nested stage/phase structures stay as jsonb - they
--  are read and written whole, never queried field by field, so normalising
--  them into child tables would buy nothing and cost a lot of joins.
-- -----------------------------------------------------------------------------
create table if not exists apqp.templates (
    id                   uuid primary key default gen_random_uuid(),
    kind                 text        not null,      -- 'production_stages' | 'apqp_phases' | 'lookups'
    version              integer     not null default 1,
    is_active            boolean     not null default true,
    stages               jsonb       not null default '[]'::jsonb,
    phases               jsonb       not null default '[]'::jsonb,
    bearing_types        jsonb       not null default '[]'::jsonb,
    rpd_statuses         jsonb       not null default '[]'::jsonb,
    delay_reasons        jsonb       not null default '[]'::jsonb,
    responsibilities     jsonb       not null default '[]'::jsonb,
    check_point_options  jsonb       not null default '[]'::jsonb,
    updated_at           timestamptz not null default now(),
    updated_by           text
);

create index if not exists templates_kind_active_idx on apqp.templates (kind, is_active);


-- -----------------------------------------------------------------------------
--  orders
-- -----------------------------------------------------------------------------
create table if not exists apqp.orders (
    id                        uuid primary key default gen_random_uuid(),
    order_no                  text        not null,
    -- The identity people see and the key in every link. Unique.
    product_name              text        not null,
    order_date                date        not null,
    customer_name             text        not null,
    planned_delivery_sample   date,
    planned_delivery_batch    date,
    rpd_status                text        not null default 'Not received',
    notes                     text,

    -- Business key of the linked APQP project, not a row id.
    apqp_project_id           text,

    created_by                text        not null,
    created_at                timestamptz not null default now(),
    updated_at                timestamptz,
    updated_by                text
);

create unique index if not exists orders_order_no_key   on apqp.orders (order_no);
create unique index if not exists orders_product_name_key on apqp.orders (product_name);
create        index if not exists orders_customer_idx   on apqp.orders (customer_name);
create        index if not exists orders_created_idx    on apqp.orders (created_at desc);


-- -----------------------------------------------------------------------------
--  order_items - one bearing size within an order.
--  Items sharing a schedule_group share one 29-stage schedule.
-- -----------------------------------------------------------------------------
create table if not exists apqp.order_items (
    id                uuid primary key default gen_random_uuid(),
    order_no          text        not null
                          references apqp.orders (order_no) on update cascade on delete cascade,
    item_description  text        not null,
    bearing_type      text        not null,
    po_qty            text,                        -- free text: "200+200", "500"
    value             double precision,

    schedule_group    text        not null,
    anchor_a0         date,
    anchor_a          date        not null,

    created_at        timestamptz not null default now(),
    updated_at        timestamptz
);

create index if not exists order_items_order_idx  on apqp.order_items (order_no);
create index if not exists order_items_group_idx  on apqp.order_items (schedule_group);
create unique index if not exists order_items_order_desc_key
    on apqp.order_items (order_no, item_description);


-- -----------------------------------------------------------------------------
--  order_stages - one of the 29 stages, for one schedule group
-- -----------------------------------------------------------------------------
create table if not exists apqp.order_stages (
    id              uuid primary key default gen_random_uuid(),
    order_no        text        not null
                        references apqp.orders (order_no) on update cascade on delete cascade,
    schedule_group  text        not null,
    stage_code      text        not null,
    stage_name      text        not null,
    sequence        integer     not null,

    plan_date       date,
    actual_date     date,
    remark          text,
    delay_reason    text,

    updated_at      timestamptz,
    updated_by      text
);

create index if not exists order_stages_order_idx on apqp.order_stages (order_no);
create index if not exists order_stages_plan_idx  on apqp.order_stages (plan_date);
create unique index if not exists order_stages_group_code_key
    on apqp.order_stages (schedule_group, stage_code);


-- -----------------------------------------------------------------------------
--  apqp_projects
-- -----------------------------------------------------------------------------
create table if not exists apqp.apqp_projects (
    id                      uuid primary key default gen_random_uuid(),
    project_id              text        not null,     -- business key, e.g. "APQP-0007"
    order_no                text,                     -- optional link to a production order
    customer                text        not null,
    product_name            text,
    customer_part_no        text,
    program_name            text,
    application             text,
    supply_condition        text,
    enquiry_date            date,
    order_date              date,
    original_date           date,
    ppap_date               date,
    sample_submission_date  date,

    -- Timing-plan grid window: 5 consecutive months as "YYYY-MM".
    months                  jsonb       not null default '[]'::jsonb,

    template_version        integer     not null default 1,
    created_by              text        not null,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz,
    updated_by              text
);

create unique index if not exists apqp_projects_project_id_key on apqp.apqp_projects (project_id);
create        index if not exists apqp_projects_order_idx      on apqp.apqp_projects (order_no);
create        index if not exists apqp_projects_product_name_idx on apqp.apqp_projects (product_name);
create        index if not exists apqp_projects_customer_idx   on apqp.apqp_projects (customer);
create        index if not exists apqp_projects_created_idx    on apqp.apqp_projects (created_at desc);


-- -----------------------------------------------------------------------------
--  apqp_activities - the 64 timing-plan rows of one project
-- -----------------------------------------------------------------------------
create table if not exists apqp.apqp_activities (
    id                 uuid primary key default gen_random_uuid(),
    project_id         text        not null
                           references apqp.apqp_projects (project_id) on update cascade on delete cascade,
    activity_id        text        not null,     -- stable template id, e.g. "P0-001"
    phase_code         text        not null,
    no_label           text        not null default '',
    activity_name      text        not null,
    sequence           integer     not null,

    check_point        text,                     -- controlled doc reference, NOT a file path
    responsibility     text,
    is_heading         boolean     not null default false,

    plan_start         date,
    plan_end           date,
    actual_start       date,
    actual_end         date,

    week_flags         jsonb       not null default '{}'::jsonb,   -- planned
    actual_week_flags  jsonb       not null default '{}'::jsonb,   -- actual
    remark             text,

    updated_at         timestamptz,
    updated_by         text
);

create index if not exists apqp_activities_project_idx on apqp.apqp_activities (project_id);
create index if not exists apqp_activities_phase_idx   on apqp.apqp_activities (phase_code);
create unique index if not exists apqp_activities_project_activity_key
    on apqp.apqp_activities (project_id, activity_id);


-- -----------------------------------------------------------------------------
--  apqp_signoffs - one row per project
-- -----------------------------------------------------------------------------
create table if not exists apqp.apqp_signoffs (
    id            uuid primary key default gen_random_uuid(),
    project_id    text        not null
                      references apqp.apqp_projects (project_id) on update cascade on delete cascade,
    team          jsonb       not null default '{}'::jsonb,   -- "1".."12" -> name
    prepared_by   text,
    reviewed_by   text,
    approved_by   text,
    updated_at    timestamptz
);

create unique index if not exists apqp_signoffs_project_key on apqp.apqp_signoffs (project_id);


-- -----------------------------------------------------------------------------
--  attachments
--
--  The bytes live in the Supabase Storage bucket `apqp-attachments`;
--  `storage_path` is the object key inside it. This replaces the GridFS
--  object id the Mongo version stored.
-- -----------------------------------------------------------------------------
create table if not exists apqp.attachments (
    id                 uuid primary key default gen_random_uuid(),
    original_filename  text        not null,
    content_type       text        not null,
    size_bytes         bigint      not null,
    storage_path       text        not null,
    sha256             text        not null,

    entity_type        text        not null,   -- 'apqp_activity' | 'order_stage' | 'order'
    entity_id          text        not null,
    project_id         text,                   -- denormalised for fast lookup
    order_no           text,

    description        text,
    uploaded_by        text        not null,
    uploaded_by_name   text        not null,
    uploaded_at        timestamptz not null default now()
);

create index if not exists attachments_entity_idx   on apqp.attachments (entity_type, entity_id);
create index if not exists attachments_project_idx  on apqp.attachments (project_id);
create index if not exists attachments_order_idx    on apqp.attachments (order_no);
create index if not exists attachments_uploaded_idx on apqp.attachments (uploaded_at desc);
create unique index if not exists attachments_storage_path_key on apqp.attachments (storage_path);


-- -----------------------------------------------------------------------------
--  notification_config - a single row holding stage owners and mail settings
-- -----------------------------------------------------------------------------
create table if not exists apqp.notification_config (
    id                           uuid primary key default gen_random_uuid(),
    key                          text        not null default 'order_stage_owners',
    owners                       jsonb       not null default '[]'::jsonb,
    cc_emails                    jsonb       not null default '[]'::jsonb,
    handoff_enabled              boolean     not null default true,
    overdue_enabled              boolean     not null default true,
    apqp_owners                  jsonb       not null default '[]'::jsonb,
    apqp_handoff_enabled         boolean     not null default true,
    apqp_overdue_enabled         boolean     not null default true,
    signup_alert_enabled         boolean     not null default true,
    password_reset_alert_enabled boolean     not null default true,
    password_email_enabled       boolean     not null default true,
    approval_email_enabled       boolean     not null default true,
    overdue_hour                 integer     not null default 9,
    overdue_minute               integer     not null default 0,
    updated_at                   timestamptz,
    updated_by                   text
);

create unique index if not exists notification_config_key_key on apqp.notification_config (key);


-- -----------------------------------------------------------------------------
--  email_logs - audit trail of every mail, and the dedupe guard for handoffs
-- -----------------------------------------------------------------------------
create table if not exists apqp.email_logs (
    id          uuid primary key default gen_random_uuid(),
    email_type  text        not null,
    to_emails   jsonb       not null default '[]'::jsonb,
    cc_emails   jsonb       not null default '[]'::jsonb,
    subject     text        not null,
    order_no    text,
    stage_code  text,
    dedupe_key  text,
    status      text        not null default 'sent',   -- 'sent' | 'failed'
    error       text,
    sent_at     timestamptz not null default now()
);

-- Partial index, so the many rows with no dedupe_key never collide with
-- each other - only real keys are constrained to be unique.
create unique index if not exists email_logs_dedupe_key
    on apqp.email_logs (dedupe_key) where dedupe_key is not null;
create index if not exists email_logs_sent_idx  on apqp.email_logs (sent_at desc);
create index if not exists email_logs_order_idx on apqp.email_logs (order_no);


-- -----------------------------------------------------------------------------
--  Access control
--
--  This app reaches Postgres over a direct connection as the `postgres`
--  role, never through PostgREST, so the `apqp` schema is deliberately NOT
--  exposed to the Supabase auto-generated REST API. Nothing here is
--  reachable with the project's anon key, which is what we want: all reads
--  and writes go through the FastAPI backend, where the permission checks
--  live.
--
--  RLS is therefore not enabled on these tables. If you ever expose the
--  schema over PostgREST, enable RLS on every table above FIRST.
--
--  The revokes below name each table individually rather than saying
--  "all tables in schema apqp". The schema is shared: it already held
--  user_meta, user_permissions and the v_app_users view before this
--  application arrived, and a blanket revoke would silently change the
--  permissions on someone else's objects.
-- -----------------------------------------------------------------------------
revoke all on apqp.user_apqp             from anon, authenticated;
revoke all on apqp.notifications       from anon, authenticated;
revoke all on apqp.audit_logs          from anon, authenticated;
revoke all on apqp.templates           from anon, authenticated;
revoke all on apqp.orders              from anon, authenticated;
revoke all on apqp.order_items         from anon, authenticated;
revoke all on apqp.order_stages        from anon, authenticated;
revoke all on apqp.apqp_projects       from anon, authenticated;
revoke all on apqp.apqp_activities     from anon, authenticated;
revoke all on apqp.apqp_signoffs       from anon, authenticated;
revoke all on apqp.attachments         from anon, authenticated;
revoke all on apqp.notification_config from anon, authenticated;
revoke all on apqp.email_logs          from anon, authenticated;
