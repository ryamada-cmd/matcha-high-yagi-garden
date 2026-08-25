-- Connect product master to production lots through packaging runs.
-- Applied to production on 2026-08-25.

alter table public.production_lots
  add column if not exists product_master_id uuid references public.product_master(id);

create index if not exists idx_production_lots_product_master
  on public.production_lots(product_master_id) where deleted_at is null and product_master_id is not null;

create table if not exists public.product_packaging_batches (
  id uuid primary key default gen_random_uuid(),
  manufacturing_batch_id uuid not null unique references public.manufacturing_batches(id),
  product_master_id uuid not null references public.product_master(id),
  product_sku_snapshot text not null,
  product_name_snapshot text not null,
  product_category_snapshot text not null,
  net_content_snapshot numeric(12,3) not null check(net_content_snapshot > 0),
  content_unit_snapshot text not null,
  package_type_snapshot text,
  standard_price_snapshot_yen numeric(12,2) not null default 0,
  packaging_cost_per_unit_snapshot_yen numeric(12,2) not null default 0,
  units_produced integer not null check(units_produced > 0),
  source_lot_id uuid not null references public.production_lots(id),
  content_input_qty numeric(16,3) not null check(content_input_qty > 0),
  content_input_unit text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_packaging_product on public.product_packaging_batches(product_master_id, created_at desc);
create index if not exists idx_product_packaging_source_lot on public.product_packaging_batches(source_lot_id);

alter table public.product_packaging_batches enable row level security;
drop policy if exists product_packaging_batches_read on public.product_packaging_batches;
create policy product_packaging_batches_read on public.product_packaging_batches for select to authenticated using(true);
grant select on public.product_packaging_batches to authenticated;

create or replace view public.product_stock_lots with(security_invoker=true) as
select
  l.id as lot_id,l.legacy_id,l.product_master_id,
  coalesce(p.sku,pp.product_sku_snapshot) as sku,
  coalesce(p.product_name,pp.product_name_snapshot,l.material_name) as product_name,
  coalesce(p.category,pp.product_category_snapshot,l.category) as product_category,
  coalesce(p.package_type,pp.package_type_snapshot) as package_type,
  coalesce(p.net_content,pp.net_content_snapshot,0) as net_content,
  coalesce(p.content_unit,pp.content_unit_snapshot,'') as content_unit,
  coalesce(p.standard_price_yen,pp.standard_price_snapshot_yen,0) as standard_price_yen,
  b.balance as stock_units,b.unit_cost_yen,b.inventory_value_yen,
  round(b.balance*coalesce(p.standard_price_yen,pp.standard_price_snapshot_yen,0),2) as standard_sales_value_yen,
  b.received_date,b.storage_location,b.source_type,b.source_id,
  pp.manufacturing_batch_id,pp.units_produced,pp.content_input_qty,pp.content_input_unit
from public.production_inventory_balances b
join public.production_lots l on l.id=b.lot_id
left join public.product_master p on p.id=l.product_master_id
left join public.product_packaging_batches pp on pp.manufacturing_batch_id=l.source_id and l.source_type='MANUFACTURING'
where l.deleted_at is null and l.product_master_id is not null;
grant select on public.product_stock_lots to authenticated;

create or replace view public.product_packaging_summary with(security_invoker=true) as
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
left join public.production_inventory_balances stock on stock.lot_id=mb.output_lot_id;
grant select on public.product_packaging_summary to authenticated;

create or replace function public.admin_save_product_packaging(p_batch_id uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_product uuid;v_source uuid;v_units integer;v_net numeric;v_content_unit text;v_source_unit text;v_input numeric;v_pack_per numeric;v_pack_total numeric;v_product_name text;v_sku text;v_category text;v_package text;v_standard numeric;v_batch uuid;v_output_lot uuid;v_date date;
begin
  perform public.require_admin_();
  v_product:=nullif(p_payload->>'product_id','')::uuid;v_source:=nullif(p_payload->>'source_lot_id','')::uuid;v_units:=coalesce(nullif(p_payload->>'units','')::integer,0);v_date:=coalesce(nullif(p_payload->>'manufacturing_date','')::date,current_date);
  if v_product is null then raise exception '商品を選択してください';end if;if v_source is null then raise exception '原料ロットを選択してください';end if;if v_units<=0 then raise exception '商品数量は1個以上で入力してください';end if;
  select product_name,sku,category,net_content,content_unit,package_type,standard_price_yen,packaging_cost_yen into v_product_name,v_sku,v_category,v_net,v_content_unit,v_package,v_standard,v_pack_per from public.product_master where id=v_product and deleted_at is null;
  if not found then raise exception '商品マスタが見つかりません';end if;if coalesce(v_net,0)<=0 then raise exception '商品マスタの内容量を設定してください';end if;
  select unit into v_source_unit from public.production_lots where id=v_source and deleted_at is null for update;if not found then raise exception '原料ロットが見つかりません';end if;
  if lower(v_content_unit)='g' and lower(v_source_unit)='kg' then v_input:=v_units*v_net/1000.0;
  elsif lower(v_content_unit)='g' and lower(v_source_unit)='g' then v_input:=v_units*v_net;
  elsif lower(v_content_unit)='kg' and lower(v_source_unit)='kg' then v_input:=v_units*v_net;
  elsif lower(v_content_unit)='kg' and lower(v_source_unit)='g' then v_input:=v_units*v_net*1000.0;
  else raise exception '自動商品化は重量単位 g / kg の原料に対応しています（商品:% / 原料:%）',v_content_unit,v_source_unit;end if;
  v_input:=round(v_input,3);if v_input<=0 then raise exception '必要原料量を計算できません';end if;v_pack_total:=round(coalesce(v_pack_per,0)*v_units,2);
  v_batch:=public.save_manufacturing_batch(jsonb_build_object('id',coalesce(p_batch_id::text,''),'manufacturing_date',v_date::text,'process_type','商品化・包装','output_material',v_product_name,'output_qty',v_units,'output_unit','個','category','製品','facility',coalesce(p_payload->>'facility',''),'processing_cost_yen',coalesce(nullif(p_payload->>'processing_cost_yen','')::numeric,0),'packaging_cost_yen',v_pack_total,'other_cost_yen',coalesce(nullif(p_payload->>'other_cost_yen','')::numeric,0),'operator_name',coalesce(p_payload->>'operator_name',''),'note',coalesce(p_payload->>'note',''),'inputs',jsonb_build_array(jsonb_build_object('lot_id',v_source,'input_qty',v_input))));
  select output_lot_id into v_output_lot from public.manufacturing_batches where id=v_batch;
  update public.production_lots set product_master_id=v_product,material_name=v_product_name,category='製品',unit='個',updated_at=now() where id=v_output_lot;
  insert into public.product_packaging_batches(manufacturing_batch_id,product_master_id,product_sku_snapshot,product_name_snapshot,product_category_snapshot,net_content_snapshot,content_unit_snapshot,package_type_snapshot,standard_price_snapshot_yen,packaging_cost_per_unit_snapshot_yen,units_produced,source_lot_id,content_input_qty,content_input_unit,created_by)
  values(v_batch,v_product,v_sku,v_product_name,v_category,v_net,v_content_unit,v_package,v_standard,v_pack_per,v_units,v_source,v_input,v_source_unit,auth.uid())
  on conflict(manufacturing_batch_id) do update set product_master_id=excluded.product_master_id,product_sku_snapshot=excluded.product_sku_snapshot,product_name_snapshot=excluded.product_name_snapshot,product_category_snapshot=excluded.product_category_snapshot,net_content_snapshot=excluded.net_content_snapshot,content_unit_snapshot=excluded.content_unit_snapshot,package_type_snapshot=excluded.package_type_snapshot,standard_price_snapshot_yen=excluded.standard_price_snapshot_yen,packaging_cost_per_unit_snapshot_yen=excluded.packaging_cost_per_unit_snapshot_yen,units_produced=excluded.units_produced,source_lot_id=excluded.source_lot_id,content_input_qty=excluded.content_input_qty,content_input_unit=excluded.content_input_unit,updated_at=now();
  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data) values(auth.uid(),case when p_batch_id is null then 'CREATE' else 'UPDATE' end,'product_packaging',v_batch::text,jsonb_build_object('product_id',v_product,'sku',v_sku,'units',v_units,'content_input_qty',v_input,'content_input_unit',v_source_unit,'output_lot_id',v_output_lot));
  return v_batch;
end $$;
revoke all on function public.admin_save_product_packaging(uuid,jsonb) from public,anon;grant execute on function public.admin_save_product_packaging(uuid,jsonb) to authenticated;

create or replace function public.admin_delete_product(p_product_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_before jsonb;
begin
  perform public.require_admin_();select to_jsonb(x) into v_before from public.product_master x where x.id=p_product_id and x.deleted_at is null for update;if v_before is null then raise exception '商品が見つかりません';end if;
  if exists(select 1 from public.production_lots l join public.production_transactions t on t.lot_id=l.id where l.product_master_id=p_product_id and l.deleted_at is null group by l.id having coalesce(sum(t.quantity),0)>0.0005) then raise exception 'この商品には製品在庫があります。在庫を0にしてから削除してください';end if;
  update public.product_master set deleted_at=now(),deleted_by=auth.uid(),updated_by=auth.uid(),updated_at=now() where id=p_product_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'DELETE','product_master',p_product_id::text,v_before,(select to_jsonb(x) from public.product_master x where x.id=p_product_id));
end $$;
revoke all on function public.admin_delete_product(uuid) from public,anon;grant execute on function public.admin_delete_product(uuid) to authenticated;