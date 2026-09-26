-- Applied to production on 2026-09-27.
-- Support imported tea inventory where exact field/date can be unknown
-- and preserve stem/by-product weight separately from usable leaf output.

alter table public.harvest_records alter column harvest_date drop not null;
alter table public.harvest_records alter column field_id drop not null;
alter table public.harvest_records add column if not exists source_lot_no text;
alter table public.harvest_records add column if not exists variety_snapshot text;

alter table public.tea_processing_batches add column if not exists source_lot_no text;
alter table public.tea_processing_batches add column if not exists variety_snapshot text;
alter table public.tea_processing_batches add column if not exists stem_output_kg numeric not null default 0
  check (stem_output_kg >= 0);

create index if not exists idx_harvest_records_source_lot
  on public.harvest_records(source_lot_no)
  where source_lot_no is not null and deleted_at is null;

create index if not exists idx_tea_processing_source_lot
  on public.tea_processing_batches(source_lot_no)
  where source_lot_no is not null and deleted_at is null;
