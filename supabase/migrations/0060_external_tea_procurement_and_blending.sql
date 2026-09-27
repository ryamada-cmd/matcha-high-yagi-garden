-- External tea procurement and blending.
-- Adds traceable purchased-tea lots that can be packaged directly or blended first.

alter table public.production_lots
  add column if not exists tea_type text,
  add column if not exists origin text,
  add column if not exists variety text,
  add column if not exists grade text,
  add column if not exists supplier_lot_no text,
  add column if not exists purchase_document_no text;

alter table public.production_lots drop constraint if exists production_lots_source_type_check;
alter table public.production_lots
  add constraint production_lots_source_type_check
  check (source_type = any (array[
    'PRIMARY_PROCESSING'::text,'MANUFACTURING'::text,'MANUAL_RECEIPT'::text,'TEA_INVENTORY'::text,'EXTERNAL_PURCHASE'::text
  ]));

create or replace view public.production_inventory_balances as
select
  l.id as lot_id,l.legacy_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,
  case when l.initial_qty>0 then round(l.total_cost_yen/l.initial_qty,4) else 0 end as unit_cost_yen,
  coalesce(sum(t.quantity),0)::numeric(16,3) as balance,
  round(coalesce(sum(t.quantity),0)*case when l.initial_qty>0 then l.total_cost_yen/l.initial_qty else 0 end,2) as inventory_value_yen,
  l.source_type,l.source_id,l.supplier,l.storage_location,l.note,l.deleted_at,
  l.tea_type,l.origin,l.variety,l.grade,l.supplier_lot_no,l.purchase_document_no
from public.production_lots l
left join public.production_transactions t on t.lot_id=l.id
group by l.id,l.legacy_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,
  l.source_type,l.source_id,l.supplier,l.storage_location,l.note,l.deleted_at,l.tea_type,l.origin,l.variety,l.grade,l.supplier_lot_no,l.purchase_document_no;

create or replace view private.packaging_source_lots as
select
  l.id as lot_id,l.legacy_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,
  case when l.initial_qty>0 then round(l.total_cost_yen/l.initial_qty,4) else 0 end as unit_cost_yen,
  coalesce(sum(t.quantity),0)::numeric(16,3) as balance,
  round(coalesce(sum(t.quantity),0)*case when l.initial_qty>0 then l.total_cost_yen/l.initial_qty else 0 end,2) as inventory_value_yen,
  l.source_type,l.source_id,l.storage_location,l.supplier,l.tea_type,l.origin,l.variety,l.grade,l.supplier_lot_no,l.purchase_document_no
from public.production_lots l
left join public.production_transactions t on t.lot_id=l.id
where l.deleted_at is null and public.has_app_permission('packaging.manage')
group by l.id,l.legacy_id,l.material_name,l.category,l.unit,l.received_date,l.initial_qty,l.total_cost_yen,
  l.source_type,l.source_id,l.storage_location,l.supplier,l.tea_type,l.origin,l.variety,l.grade,l.supplier_lot_no,l.purchase_document_no;

create or replace view public.packaging_source_lots as
select lot_id,legacy_id,material_name,category,unit,received_date,initial_qty,total_cost_yen,unit_cost_yen,balance,
  inventory_value_yen,source_type,source_id,storage_location,supplier,tea_type,origin,variety,grade,supplier_lot_no,purchase_document_no
from private.packaging_source_lots;

create or replace view private.product_packaging_summary as
with stock as (
  select l.id as lot_id,coalesce(sum(t.quantity),0)::numeric(16,3) as balance
  from public.production_lots l left join public.production_transactions t on t.lot_id=l.id
  group by l.id
)
select
  pp.id,pp.manufacturing_batch_id,mb.legacy_id,mb.manufacturing_date,pp.product_master_id,pp.product_sku_snapshot,
  pp.product_name_snapshot,pp.product_category_snapshot,pp.net_content_snapshot,pp.content_unit_snapshot,
  pp.package_type_snapshot,pp.standard_price_snapshot_yen,pp.packaging_cost_per_unit_snapshot_yen,pp.units_produced,
  pp.source_lot_id,src.legacy_id as source_lot_legacy_id,src.material_name as source_material_name,
  pp.content_input_qty,pp.content_input_unit,mb.processing_cost_yen,mb.packaging_cost_yen,mb.other_cost_yen,
  mb.inherited_input_cost_yen,mb.total_manufacturing_cost_yen,
  case when pp.units_produced>0 then round(mb.total_manufacturing_cost_yen/pp.units_produced::numeric,4) else 0 end as unit_cost_yen,
  mb.output_lot_id,coalesce(stock.balance,0) as stock_units,mb.facility,mb.operator_name_snapshot,mb.note,mb.deleted_at,
  src.source_type as source_lot_source_type,src.tea_type as source_tea_type,src.origin as source_origin,
  src.variety as source_variety,src.grade as source_grade,src.supplier as source_supplier,src.supplier_lot_no as source_supplier_lot_no
from public.product_packaging_batches pp
join public.manufacturing_batches mb on mb.id=pp.manufacturing_batch_id
join public.production_lots src on src.id=pp.source_lot_id
left join stock on stock.lot_id=mb.output_lot_id
where public.has_app_permission('packaging.view');

create or replace view public.product_packaging_summary as
select id,manufacturing_batch_id,legacy_id,manufacturing_date,product_master_id,product_sku_snapshot,product_name_snapshot,
  product_category_snapshot,net_content_snapshot,content_unit_snapshot,package_type_snapshot,standard_price_snapshot_yen,
  packaging_cost_per_unit_snapshot_yen,units_produced,source_lot_id,source_lot_legacy_id,source_material_name,
  content_input_qty,content_input_unit,processing_cost_yen,packaging_cost_yen,other_cost_yen,inherited_input_cost_yen,
  total_manufacturing_cost_yen,unit_cost_yen,output_lot_id,stock_units,facility,operator_name_snapshot,note,deleted_at,
  source_lot_source_type,source_tea_type,source_origin,source_variety,source_grade,source_supplier,source_supplier_lot_no
from private.product_packaging_summary;

CREATE OR REPLACE FUNCTION public.admin_receive_procured_tea_lot(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid:=gen_random_uuid();
  v_qty numeric;
  v_cost numeric;
  v_unit text;
  v_material text;
  v_tea_type text;
  v_supplier text;
  v_legacy text;
begin
  perform public.require_app_permission_('production.inventory_manage');
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;

  v_qty:=coalesce(nullif(p_payload->>'quantity','')::numeric,0);
  v_cost:=coalesce(nullif(p_payload->>'total_cost_yen','')::numeric,0);
  v_unit:=lower(btrim(coalesce(p_payload->>'unit','kg')));
  v_material:=btrim(coalesce(p_payload->>'material_name',''));
  v_tea_type:=btrim(coalesce(p_payload->>'tea_type',''));
  v_supplier:=btrim(coalesce(p_payload->>'supplier',''));

  if v_material='' then raise exception '品目名を入力してください'; end if;
  if v_tea_type='' then raise exception '茶種を入力してください'; end if;
  if v_supplier='' then raise exception '仕入先を入力してください'; end if;
  if v_qty<=0 then raise exception '仕入数量は0より大きくしてください'; end if;
  if v_cost<0 then raise exception '仕入金額は0以上で入力してください'; end if;
  if v_unit not in ('kg','g') then raise exception '調達茶の在庫単位はkgまたはgで登録してください'; end if;

  v_legacy:='TEA-PUR-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,4));

  insert into public.production_lots(
    id,legacy_id,source_type,source_id,material_name,category,unit,received_date,initial_qty,total_cost_yen,
    supplier,storage_location,note,tea_type,origin,variety,grade,supplier_lot_no,purchase_document_no
  ) values(
    v_id,v_legacy,'EXTERNAL_PURCHASE',v_id,v_material,'原料',v_unit,
    coalesce(nullif(p_payload->>'received_date','')::date,current_date),round(v_qty,3),round(v_cost,2),
    nullif(v_supplier,''),nullif(btrim(p_payload->>'storage_location'),''),
    nullif(btrim(p_payload->>'note'),''),
    v_tea_type,nullif(btrim(p_payload->>'origin'),''),nullif(btrim(p_payload->>'variety'),''),
    nullif(btrim(p_payload->>'grade'),''),nullif(btrim(p_payload->>'supplier_lot_no'),''),
    nullif(btrim(p_payload->>'purchase_document_no'),'')
  );

  insert into public.production_transactions(
    lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by
  ) values(
    v_id,'RECEIPT',round(v_qty,3),'EXTERNAL_PURCHASE',v_id,'外部調達茶入庫',auth.uid()
  );

  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(
    auth.uid(),'CREATE','procured_tea_lot',v_id::text,
    (select to_jsonb(x) from public.production_lots x where x.id=v_id)
  );
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.save_tea_blend_batch(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_output_lot uuid;
  v_inputs jsonb:=coalesce(p_payload->'inputs','[]'::jsonb);
  v_item jsonb;
  v_lot uuid;
  v_qty numeric;
  v_unit text;
  v_output_unit text:=lower(btrim(coalesce(p_payload->>'output_unit','kg')));
  v_output_qty numeric:=coalesce(nullif(p_payload->>'output_qty','')::numeric,0);
  v_total_output_unit numeric:=0;
  v_tea_type text:=btrim(coalesce(p_payload->>'tea_type',''));
begin
  perform public.require_app_permission_('production.process_manage');
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if jsonb_typeof(v_inputs)<>'array' or jsonb_array_length(v_inputs)<2 then
    raise exception 'ブレンドは2ロット以上の原料を選択してください';
  end if;
  if v_tea_type='' then raise exception '出来上がりの茶種を入力してください'; end if;
  if v_output_unit not in ('kg','g') then raise exception 'ブレンド出来高の単位はkgまたはgで入力してください'; end if;
  if v_output_qty<=0 then raise exception 'ブレンド出来高を入力してください'; end if;

  for v_item in select value from jsonb_array_elements(v_inputs)
  loop
    v_lot:=nullif(v_item->>'lot_id','')::uuid;
    v_qty:=coalesce(nullif(v_item->>'input_qty','')::numeric,0);
    if v_lot is null or v_qty<=0 then raise exception '原料ロットと投入量を確認してください'; end if;
    select lower(unit) into v_unit from public.production_lots where id=v_lot and deleted_at is null;
    if v_unit not in ('kg','g') then raise exception 'ブレンド原料はkgまたはgの重量在庫を選択してください'; end if;
    if v_output_unit='kg' then
      v_total_output_unit:=v_total_output_unit + case when v_unit='kg' then v_qty else v_qty/1000.0 end;
    else
      v_total_output_unit:=v_total_output_unit + case when v_unit='g' then v_qty else v_qty*1000.0 end;
    end if;
  end loop;

  if v_output_qty>v_total_output_unit+0.0005 then
    raise exception 'ブレンド出来高が投入重量を超えています（投入換算 % % / 出来高 % %）',
      round(v_total_output_unit,3),v_output_unit,round(v_output_qty,3),v_output_unit;
  end if;

  v_id:=public.save_manufacturing_batch_core_(
    jsonb_build_object(
      'id',coalesce(p_payload->>'id',''),
      'manufacturing_date',coalesce(p_payload->>'manufacturing_date',current_date::text),
      'process_type','茶ブレンド',
      'output_material',p_payload->>'output_material',
      'output_qty',v_output_qty,
      'output_unit',v_output_unit,
      'category','原料',
      'facility',coalesce(p_payload->>'facility',''),
      'processing_cost_yen',coalesce(p_payload->>'processing_cost_yen','0'),
      'packaging_cost_yen','0',
      'other_cost_yen',coalesce(p_payload->>'other_cost_yen','0'),
      'operator_name',coalesce(p_payload->>'operator_name',''),
      'note',coalesce(p_payload->>'note',''),
      'inputs',v_inputs
    )
  );

  select output_lot_id into v_output_lot
  from public.manufacturing_batches
  where id=v_id and deleted_at is null;

  update public.production_lots
  set
    tea_type=v_tea_type,
    origin=coalesce(nullif(btrim(p_payload->>'origin'),''),'ブレンド'),
    variety=nullif(btrim(p_payload->>'variety'),''),
    grade=nullif(btrim(p_payload->>'grade'),''),
    supplier_lot_no=null,
    purchase_document_no=null,
    updated_at=now()
  where id=v_output_lot;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(
    auth.uid(),
    case when nullif(p_payload->>'id','') is null then 'CREATE' else 'UPDATE' end,
    'tea_blend_batch',
    v_id::text,
    jsonb_build_object(
      'output_lot_id',v_output_lot,
      'tea_type',v_tea_type,
      'origin',coalesce(nullif(btrim(p_payload->>'origin'),''),'ブレンド'),
      'input_count',jsonb_array_length(v_inputs)
    )
  );

  return v_id;
end
$function$;

revoke all on function public.admin_receive_procured_tea_lot(jsonb) from public,anon;
revoke all on function public.save_tea_blend_batch(jsonb) from public,anon;
grant execute on function public.admin_receive_procured_tea_lot(jsonb) to authenticated;
grant execute on function public.save_tea_blend_batch(jsonb) to authenticated;
