-- 0054_historical_lot_traceability_bridge.sql
-- Bridge detailed historical tea inventory lots back to their JA processing batches.

create table if not exists private.production_lot_processing_origins (
  lot_id uuid primary key references public.production_lots(id) on delete cascade,
  processing_batch_id uuid not null references public.tea_processing_batches(id) on delete cascade,
  component text not null check (component in ('LEAF','STEM')),
  source_lot_no text,
  created_at timestamptz not null default now()
);

insert into private.production_lot_processing_origins(lot_id,processing_batch_id,component,source_lot_no)
select
  l.id,
  b.id,
  case when l.legacy_id like '%-BONE' then 'STEM' else 'LEAF' end,
  b.source_lot_no
from public.production_lots l
join public.tea_processing_batches b
  on b.source_lot_no = split_part(l.legacy_id,'-',4)
where l.source_type='TEA_INVENTORY'
  and l.legacy_id like 'LOT-TEA-2026-%'
  and b.legacy_id like 'IMP-2026-PROC-%'
on conflict(lot_id) do update
set processing_batch_id=excluded.processing_batch_id,
    component=excluded.component,
    source_lot_no=excluded.source_lot_no;

create or replace view private.sales_item_field_traceability
with (security_barrier=true, security_invoker=false)
as
with recursive lot_ancestry as (
  select l.id as root_lot_id,l.id as ancestor_lot_id,1::numeric as share
  from public.production_lots l
  union all
  select
    a.root_lot_id,
    mi.lot_id,
    a.share * (
      mi.input_qty /
      nullif(sum(mi.input_qty) over(partition by mi.manufacturing_batch_id),0::numeric)
    )
  from lot_ancestry a
  join public.manufacturing_batches mb
    on mb.output_lot_id=a.ancestor_lot_id and mb.deleted_at is null
  join public.manufacturing_batch_inputs mi
    on mi.manufacturing_batch_id=mb.id
),
primary_sources as (
  select a.root_lot_id,a.share,l.source_id as processing_batch_id
  from lot_ancestry a
  join public.production_lots l on l.id=a.ancestor_lot_id
  where l.source_type='PRIMARY_PROCESSING' and l.source_id is not null

  union all

  select a.root_lot_id,a.share,o.processing_batch_id
  from lot_ancestry a
  join private.production_lot_processing_origins o on o.lot_id=a.ancestor_lot_id
),
harvest_share as (
  select
    x.processing_batch_id,
    x.harvest_record_id,
    x.input_kg,
    x.input_kg / nullif(sum(x.input_kg) over(partition by x.processing_batch_id),0::numeric) as share
  from public.tea_processing_batch_harvests x
)
select
  i.id as sales_item_id,
  i.sales_record_id,
  i.lot_id,
  h.field_id,
  f.legacy_id as field_legacy_id,
  f.name as field_name,
  sum(ps.share*hs.share) as source_share,
  round(i.quantity*sum(ps.share*hs.share),3) as attributed_sale_qty,
  i.unit_snapshot
from public.sales_record_items i
join primary_sources ps on ps.root_lot_id=i.lot_id
join harvest_share hs on hs.processing_batch_id=ps.processing_batch_id
join public.harvest_records h on h.id=hs.harvest_record_id and h.deleted_at is null
join public.fields f on f.id=h.field_id
where exists(
  select 1
  from public.sales_records s
  where s.id=i.sales_record_id and s.status='ACTIVE'
)
and public.has_app_permission('sales.view')
group by i.id,i.sales_record_id,i.lot_id,h.field_id,f.legacy_id,f.name,i.quantity,i.unit_snapshot;
