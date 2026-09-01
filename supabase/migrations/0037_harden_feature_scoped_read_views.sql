-- Harden feature-scoped read views without widening base-table RLS.
--
-- Public views remain the stable Data API surface and now run as SECURITY INVOKER.
-- The privileged cross-feature joins live in a non-exposed private schema, where
-- each view still requires the specific application permission before returning rows.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated, service_role;

-- Product options needed only while creating/editing packaging runs.
create or replace view private.packaging_product_options
with (security_invoker=false, security_barrier=true) as
select
  p.id,p.sku,p.product_name,p.category,p.brand_name,p.jan_code,p.net_content,p.content_unit,
  p.package_type,p.standard_price_yen,p.packaging_cost_yen,p.status,p.note,p.created_at,p.updated_at
from public.product_master p
where p.deleted_at is null
  and public.has_app_permission('packaging.manage');

-- Narrow production-lot projection for packaging source selection.
create or replace view private.packaging_source_lots
with (security_invoker=false, security_barrier=true) as
select
  l.id as lot_id,l.legacy_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,
  case when l.initial_qty>0 then round(l.total_cost_yen/l.initial_qty,4) else 0 end as unit_cost_yen,
  coalesce(sum(t.quantity),0)::numeric(16,3) as balance,
  round(coalesce(sum(t.quantity),0) * case when l.initial_qty>0 then l.total_cost_yen/l.initial_qty else 0 end,2) as inventory_value_yen,
  l.source_type,l.source_id,l.storage_location
from public.production_lots l
left join public.production_transactions t on t.lot_id=l.id
where l.deleted_at is null
  and public.has_app_permission('packaging.manage')
group by l.id,l.legacy_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,l.source_type,l.source_id,l.storage_location;

-- Packaging history/stock belong to the packaging feature. These private views
-- intentionally traverse production/product tables only after packaging.view passes.
create or replace view private.product_packaging_summary
with (security_invoker=false, security_barrier=true) as
with stock as (
  select
    l.id as lot_id,
    coalesce(sum(t.quantity),0)::numeric(16,3) as balance
  from public.production_lots l
  left join public.production_transactions t on t.lot_id=l.id
  group by l.id
)
select pp.id,pp.manufacturing_batch_id,mb.legacy_id,mb.manufacturing_date,pp.product_master_id,
       pp.product_sku_snapshot,pp.product_name_snapshot,pp.product_category_snapshot,
       pp.net_content_snapshot,pp.content_unit_snapshot,pp.package_type_snapshot,
       pp.standard_price_snapshot_yen,pp.packaging_cost_per_unit_snapshot_yen,pp.units_produced,
       pp.source_lot_id,src.legacy_id as source_lot_legacy_id,src.material_name as source_material_name,
       pp.content_input_qty,pp.content_input_unit,mb.processing_cost_yen,mb.packaging_cost_yen,mb.other_cost_yen,
       mb.inherited_input_cost_yen,mb.total_manufacturing_cost_yen,
       case when pp.units_produced>0 then round(mb.total_manufacturing_cost_yen/pp.units_produced,4) else 0 end as unit_cost_yen,
       mb.output_lot_id,coalesce(stock.balance,0) as stock_units,mb.facility,mb.operator_name_snapshot,mb.note,mb.deleted_at
from public.product_packaging_batches pp
join public.manufacturing_batches mb on mb.id=pp.manufacturing_batch_id
join public.production_lots src on src.id=pp.source_lot_id
left join stock on stock.lot_id=mb.output_lot_id
where public.has_app_permission('packaging.view');

create or replace view private.product_stock_lots
with (security_invoker=false, security_barrier=true) as
with balances as (
  select
    l.id as lot_id,l.legacy_id,l.product_master_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,
    case when l.initial_qty>0 then round(l.total_cost_yen/l.initial_qty,4) else 0 end as unit_cost_yen,
    coalesce(sum(t.quantity),0)::numeric(16,3) as balance,
    round(coalesce(sum(t.quantity),0) * case when l.initial_qty>0 then l.total_cost_yen/l.initial_qty else 0 end,2) as inventory_value_yen,
    l.storage_location,l.source_type,l.source_id,l.deleted_at
  from public.production_lots l
  left join public.production_transactions t on t.lot_id=l.id
  group by l.id,l.legacy_id,l.product_master_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,l.storage_location,l.source_type,l.source_id,l.deleted_at
)
select
  b.lot_id,b.legacy_id,b.product_master_id,
  coalesce(p.sku,pp.product_sku_snapshot) as sku,
  coalesce(p.product_name,pp.product_name_snapshot,b.material_name) as product_name,
  coalesce(p.category,pp.product_category_snapshot,b.category) as product_category,
  coalesce(p.package_type,pp.package_type_snapshot) as package_type,
  coalesce(p.net_content,pp.net_content_snapshot,0) as net_content,
  coalesce(p.content_unit,pp.content_unit_snapshot,'') as content_unit,
  coalesce(p.standard_price_yen,pp.standard_price_snapshot_yen,0) as standard_price_yen,
  b.balance as stock_units,b.unit_cost_yen,b.inventory_value_yen,
  round(b.balance*coalesce(p.standard_price_yen,pp.standard_price_snapshot_yen,0),2) as standard_sales_value_yen,
  b.received_date,b.storage_location,b.source_type,b.source_id,
  pp.manufacturing_batch_id,pp.units_produced,pp.content_input_qty,pp.content_input_unit
from balances b
left join public.product_master p on p.id=b.product_master_id
left join public.product_packaging_batches pp on pp.manufacturing_batch_id=b.source_id and b.source_type='MANUFACTURING'
where b.deleted_at is null and b.product_master_id is not null
  and public.has_app_permission('packaging.view');

-- Narrow production-lot projection required to register sales without exposing the
-- full production module.
create or replace view private.sales_saleable_lots
with (security_invoker=false, security_barrier=true) as
select
  l.id as lot_id,l.legacy_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,
  case when l.initial_qty>0 then round(l.total_cost_yen/l.initial_qty,4) else 0 end as unit_cost_yen,
  coalesce(sum(t.quantity),0)::numeric(16,3) as balance,
  round(coalesce(sum(t.quantity),0) * case when l.initial_qty>0 then l.total_cost_yen/l.initial_qty else 0 end,2) as inventory_value_yen,
  l.source_type,l.source_id
from public.production_lots l
left join public.production_transactions t on t.lot_id=l.id
where l.deleted_at is null
  and public.has_app_permission('sales.manage')
group by l.id,l.legacy_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,l.source_type,l.source_id
having coalesce(sum(t.quantity),0)>0.0005;

-- Sales traceability is part of sales.view. It may traverse production/harvest/field
-- lineage internally without granting direct access to those modules.
create or replace view private.sales_item_field_traceability
with (security_invoker=false, security_barrier=true) as
with recursive lot_ancestry as (
  select l.id as root_lot_id,l.id as ancestor_lot_id,1::numeric as share
  from public.production_lots l
  union all
  select a.root_lot_id,mi.lot_id,
         a.share * (mi.input_qty / nullif(sum(mi.input_qty) over(partition by mi.manufacturing_batch_id),0))
  from lot_ancestry a
  join public.manufacturing_batches mb on mb.output_lot_id=a.ancestor_lot_id and mb.deleted_at is null
  join public.manufacturing_batch_inputs mi on mi.manufacturing_batch_id=mb.id
), primary_sources as (
  select a.root_lot_id,a.share,l.source_id as processing_batch_id
  from lot_ancestry a
  join public.production_lots l on l.id=a.ancestor_lot_id
  where l.source_type='PRIMARY_PROCESSING' and l.source_id is not null
), harvest_share as (
  select x.processing_batch_id,x.harvest_record_id,x.input_kg,
         x.input_kg/nullif(sum(x.input_kg) over(partition by x.processing_batch_id),0) as share
  from public.tea_processing_batch_harvests x
)
select i.id as sales_item_id,i.sales_record_id,i.lot_id,h.field_id,
       f.legacy_id as field_legacy_id,f.name as field_name,
       sum(ps.share*hs.share) as source_share,
       round(i.quantity*sum(ps.share*hs.share),3) as attributed_sale_qty,
       i.unit_snapshot
from public.sales_record_items i
join primary_sources ps on ps.root_lot_id=i.lot_id
join harvest_share hs on hs.processing_batch_id=ps.processing_batch_id
join public.harvest_records h on h.id=hs.harvest_record_id and h.deleted_at is null
join public.fields f on f.id=h.field_id
where exists(select 1 from public.sales_records s where s.id=i.sales_record_id and s.status='ACTIVE')
  and public.has_app_permission('sales.view')
group by i.id,i.sales_record_id,i.lot_id,h.field_id,f.legacy_id,f.name,i.quantity,i.unit_snapshot;

revoke all on private.packaging_product_options from public, anon;
revoke all on private.packaging_source_lots from public, anon;
revoke all on private.product_packaging_summary from public, anon;
revoke all on private.product_stock_lots from public, anon;
revoke all on private.sales_saleable_lots from public, anon;
revoke all on private.sales_item_field_traceability from public, anon;

grant select on private.packaging_product_options to authenticated, service_role;
grant select on private.packaging_source_lots to authenticated, service_role;
grant select on private.product_packaging_summary to authenticated, service_role;
grant select on private.product_stock_lots to authenticated, service_role;
grant select on private.sales_saleable_lots to authenticated, service_role;
grant select on private.sales_item_field_traceability to authenticated, service_role;

-- Keep the existing public relation names so the frontend needs no API change.
create or replace view public.packaging_product_options
with (security_invoker=true, security_barrier=true) as
select * from private.packaging_product_options;

create or replace view public.packaging_source_lots
with (security_invoker=true, security_barrier=true) as
select * from private.packaging_source_lots;

create or replace view public.product_packaging_summary
with (security_invoker=true, security_barrier=true) as
select * from private.product_packaging_summary;

create or replace view public.product_stock_lots
with (security_invoker=true, security_barrier=true) as
select * from private.product_stock_lots;

create or replace view public.sales_saleable_lots
with (security_invoker=true, security_barrier=true) as
select * from private.sales_saleable_lots;

create or replace view public.sales_item_field_traceability
with (security_invoker=true, security_barrier=true) as
select * from private.sales_item_field_traceability;

revoke all on public.packaging_product_options from public, anon;
revoke all on public.packaging_source_lots from public, anon;
revoke all on public.product_packaging_summary from public, anon;
revoke all on public.product_stock_lots from public, anon;
revoke all on public.sales_saleable_lots from public, anon;
revoke all on public.sales_item_field_traceability from public, anon;

grant select on public.packaging_product_options to authenticated, service_role;
grant select on public.packaging_source_lots to authenticated, service_role;
grant select on public.product_packaging_summary to authenticated, service_role;
grant select on public.product_stock_lots to authenticated, service_role;
grant select on public.sales_saleable_lots to authenticated, service_role;
grant select on public.sales_item_field_traceability to authenticated, service_role;

-- Trigger helpers must never be callable through the Data API. Revoking EXECUTE does
-- not affect their use by database triggers.
revoke execute on function public.prevent_lapsed_official_fertilizer_link_() from public, anon, authenticated;
revoke execute on function public.sync_primary_processing_production_lot() from public, anon, authenticated;
