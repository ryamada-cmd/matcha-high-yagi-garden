-- 0050_move_pg_trgm_extension.sql
-- Keep extensions out of the exposed public schema.

alter extension pg_trgm set schema extensions;
