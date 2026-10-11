-- =============================================================================
--  01_npd_columns.sql - run AFTER 001_schema.sql and BEFORE apqp_data_migration.sql
--
--  apqp_data_migration.sql was exported from a database that already had
--  apqp_projects.order_date. 001_schema.sql does not create it, so add it here.
--  002_product_name.sql runs AFTER the data, because it back-fills
--  orders.product_name and only then makes it NOT NULL.
--  Safe to run again.
-- =============================================================================

ALTER TABLE apqp.apqp_projects ADD COLUMN IF NOT EXISTS order_date date;

-- The exported orders have no product_name yet. Relax the rule while loading;
-- 002_product_name.sql fills every row and puts NOT NULL + UNIQUE back.
ALTER TABLE apqp.orders ALTER COLUMN product_name DROP NOT NULL;
DROP INDEX IF EXISTS apqp.orders_product_name_key;
