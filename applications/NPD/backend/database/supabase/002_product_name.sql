-- =============================================================================
--  002 - Product name replaces Order No. as the identity of an order
--
--  Run ONCE in Supabase > SQL Editor. Safe to run again: every step checks
--  first, so nothing is duplicated or lost.
--
--  What it does
--    1. adds orders.product_name if it is missing
--    2. fills it for existing orders (from the linked APQP project, else the
--       order number), making duplicates unique by appending the order no.
--    3. makes it required and unique, like order_no was
--    4. copies it onto linked APQP projects that have no product name yet
--    5. adds indexes the app's lookups use
--    (also adds apqp_projects.order_date, used by the app but missing from 001)
-- =============================================================================

begin;

-- 0. columns the app already uses that 001_schema.sql never had
alter table apqp.apqp_projects add column if not exists order_date date;

alter table apqp.orders add column if not exists product_name text;

-- 2. back-fill blanks
update apqp.orders o
set    product_name = coalesce(nullif(trim(p.product_name), ''), o.order_no)
from   apqp.apqp_projects p
where  p.order_no = o.order_no
  and  (o.product_name is null or trim(o.product_name) = '');

update apqp.orders
set    product_name = order_no
where  product_name is null or trim(product_name) = '';

-- de-duplicate: the second and later orders sharing a name get "(order no)"
with d as (
    select id, row_number() over (partition by lower(product_name) order by created_at) as rn
    from apqp.orders
)
update apqp.orders o
set    product_name = o.product_name || ' (' || o.order_no || ')'
from   d
where  d.id = o.id and d.rn > 1;

-- 3. required + unique
alter table apqp.orders alter column product_name set not null;
create unique index if not exists orders_product_name_key on apqp.orders (product_name);

-- 4. keep the paired APQP project showing the same name
update apqp.apqp_projects p
set    product_name = o.product_name
from   apqp.orders o
where  p.order_no = o.order_no
  and  (p.product_name is null or trim(p.product_name) = '');

-- 5. indexes for product-name links and the attachment / email lookups
create index if not exists apqp_projects_product_name_idx on apqp.apqp_projects (product_name);

commit;
