-- Allocate traceable sales across every field in a multi-field harvest lot.
-- Preserve existing column names/order for the feature-scoped public sales view.
create or replace view private.sales_item_field_traceability as
with recursive lot_ancestry as (
  select l.id as root_lot_id, l.id as ancestor_lot_id, 1::numeric as share
  from public.production_lots l
  union all
  select a.root_lot_id, mi.lot_id,
    a.share * (mi.input_qty / nullif(sum(mi.input_qty) over (partition by mi.manufacturing_batch_id),0))
  from lot_ancestry a
  join public.manufacturing_batches mb on mb.output_lot_id=a.ancestor_lot_id and mb.deleted_at is null
  join public.manufacturing_batch_inputs mi on mi.manufacturing_batch_id=mb.id
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
  select x.processing_batch_id,x.harvest_record_id,x.input_kg,
    x.input_kg / nullif(sum(x.input_kg) over (partition by x.processing_batch_id),0) as share
  from public.tea_processing_batch_harvests x
)
select i.id as sales_item_id,
  i.sales_record_id,
  i.lot_id,
  hf.field_id,
  f.legacy_id as field_legacy_id,
  f.name as field_name,
  sum(ps.share * hs.share * hf.fresh_leaf_kg / nullif(h.fresh_leaf_kg,0)) as source_share,
  round(i.quantity * sum(ps.share * hs.share * hf.fresh_leaf_kg / nullif(h.fresh_leaf_kg,0)),3) as attributed_sale_qty,
  i.unit_snapshot
from public.sales_record_items i
join primary_sources ps on ps.root_lot_id=i.lot_id
join harvest_share hs on hs.processing_batch_id=ps.processing_batch_id
join public.harvest_records h on h.id=hs.harvest_record_id and h.deleted_at is null
join public.harvest_record_fields hf on hf.harvest_record_id=h.id
join public.fields f on f.id=hf.field_id
where exists (select 1 from public.sales_records s where s.id=i.sales_record_id and s.status='ACTIVE')
  and public.has_app_permission('sales.view')
group by i.id,i.sales_record_id,i.lot_id,hf.field_id,f.legacy_id,f.name,i.quantity,i.unit_snapshot;
