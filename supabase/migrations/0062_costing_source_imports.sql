-- Link approved expense / vendor invoice line items into annual costing.
-- Supports partial allocation across costing periods while preventing over-allocation.

alter table public.costing_cost_items
  add column if not exists source_type text,
  add column if not exists source_item_id uuid,
  add column if not exists source_parent_id uuid,
  add column if not exists source_ref text,
  add column if not exists source_date date,
  add column if not exists source_vendor text,
  add column if not exists source_total_amount_yen numeric(16,2);

alter table public.costing_cost_items drop constraint if exists costing_cost_items_source_type_check;
alter table public.costing_cost_items
  add constraint costing_cost_items_source_type_check
  check(source_type is null or source_type in ('EXPENSE_CLAIM','VENDOR_INVOICE'));

create unique index if not exists uq_costing_source_per_period
  on public.costing_cost_items(period_id,source_type,source_item_id)
  where source_type is not null and source_item_id is not null;

create index if not exists idx_costing_source_item
  on public.costing_cost_items(source_type,source_item_id)
  where source_type is not null and source_item_id is not null;

CREATE OR REPLACE FUNCTION public.save_costing_period(p_period_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid:=auth.uid();v_id uuid:=p_period_id;
 v_year integer:=coalesce(nullif(p_payload->>'fiscal_year','')::integer,extract(year from current_date)::integer);
 v_name text:=btrim(coalesce(p_payload->>'name',''));
 v_status text:=upper(coalesce(nullif(p_payload->>'status',''),'DRAFT'));
 v_planned_output numeric:=coalesce(nullif(p_payload->>'planned_output_kg','')::numeric,0);
 v_item jsonb;v_lot_item jsonb;v_lot uuid;v_qty_kg numeric;v_unit text;v_initial numeric;v_source text;v_category text;v_max_kg numeric;
 v_line integer:=0;v_planned_total numeric:=0;v_actual_total numeric:=0;v_actual_output numeric:=0;v_rate numeric:=0;v_before jsonb;
 v_cat text;v_desc text;v_planned numeric;v_actual numeric;v_cost_id uuid;
 v_source_type text;v_source_item uuid;v_source_parent uuid;v_source_ref text;v_source_date date;v_source_vendor text;
 v_source_total numeric;v_source_used numeric;v_source_status text;
begin
 perform public.require_app_permission_('costing.manage');
 if v_uid is null then raise exception 'ログインが必要です';end if;
 if v_name='' then raise exception '原価期間名を入力してください';end if;
 if v_status not in('DRAFT','FINAL') then raise exception '原価期間の状態が不正です';end if;
 if v_planned_output<0 then raise exception '予定出来高を確認してください';end if;
 if jsonb_typeof(coalesce(p_payload->'cost_items','[]'::jsonb))<>'array' then raise exception '費用明細が不正です';end if;
 if jsonb_typeof(coalesce(p_payload->'lots','[]'::jsonb))<>'array' then raise exception '対象ロットが不正です';end if;

 if v_id is null then
  insert into public.costing_periods(fiscal_year,name,scope_label,harvest_season,status,planned_output_kg,note,created_by,updated_by)
  values(v_year,v_name,nullif(btrim(p_payload->>'scope_label'),''),nullif(btrim(p_payload->>'harvest_season'),''),v_status,round(v_planned_output,3),nullif(btrim(p_payload->>'note'),''),v_uid,v_uid)
  returning id into v_id;
 else
  select to_jsonb(p) into v_before from public.costing_periods p where p.id=v_id and p.deleted_at is null for update;
  if v_before is null then raise exception '原価期間が見つかりません';end if;
  update public.production_lots set costing_allocated_cost_yen=0,costing_period_id=null,updated_at=now() where costing_period_id=v_id;
  delete from public.costing_cost_items where period_id=v_id;
  delete from public.costing_period_lots where period_id=v_id;
  update public.costing_periods set fiscal_year=v_year,name=v_name,scope_label=nullif(btrim(p_payload->>'scope_label'),''),
   harvest_season=nullif(btrim(p_payload->>'harvest_season'),''),status=v_status,planned_output_kg=round(v_planned_output,3),
   note=nullif(btrim(p_payload->>'note'),''),updated_by=v_uid,updated_at=now() where id=v_id;
 end if;

 for v_item in select value from jsonb_array_elements(coalesce(p_payload->'cost_items','[]'::jsonb)) loop
  v_desc:=btrim(coalesce(v_item->>'description',''));
  if v_desc='' then continue;end if;
  v_cat:=coalesce(nullif(btrim(v_item->>'category'),''),'OTHER');
  v_planned:=round(coalesce(nullif(v_item->>'planned_amount_yen','')::numeric,0),2);
  v_actual:=round(coalesce(nullif(v_item->>'actual_amount_yen','')::numeric,0),2);
  if v_planned<0 or v_actual<0 then raise exception '費用金額は0円以上で入力してください';end if;

  v_source_type:=nullif(upper(btrim(coalesce(v_item->>'source_type',''))),'');
  v_source_item:=nullif(v_item->>'source_item_id','')::uuid;
  v_source_parent:=null;v_source_ref:=null;v_source_date:=null;v_source_vendor:=null;v_source_total:=null;v_source_status:=null;

  if v_source_type is not null then
    if v_source_type not in('EXPENSE_CLAIM','VENDOR_INVOICE') or v_source_item is null then
      raise exception '原価取込元が不正です';
    end if;

    if v_source_type='EXPENSE_CLAIM' then
      select i.claim_id,c.claim_no,c.purchase_at::date,c.vendor,i.line_total_yen,c.status
      into v_source_parent,v_source_ref,v_source_date,v_source_vendor,v_source_total,v_source_status
      from public.expense_claim_items i
      join public.expense_claims c on c.id=i.claim_id
      where i.id=v_source_item;
      if v_source_parent is null then raise exception '経費明細が見つかりません';end if;
      if v_source_status<>'APPROVED' then raise exception '承認済みの経費だけ原価へ取り込めます';end if;
    else
      select i.invoice_id,v.invoice_no,v.invoice_date,v.vendor,i.line_total_yen,v.payment_status
      into v_source_parent,v_source_ref,v_source_date,v_source_vendor,v_source_total,v_source_status
      from public.vendor_invoice_items i
      join public.vendor_invoices v on v.id=i.invoice_id
      where i.id=v_source_item and v.deleted_at is null;
      if v_source_parent is null then raise exception '仕入請求書明細が見つかりません';end if;
    end if;

    if extract(year from v_source_date)::integer<>v_year then
      raise exception '取込元の年月と原価年度が一致しません';
    end if;

    select coalesce(sum(ci.actual_amount_yen),0)
    into v_source_used
    from public.costing_cost_items ci
    join public.costing_periods cp on cp.id=ci.period_id
    where cp.deleted_at is null
      and ci.source_type=v_source_type
      and ci.source_item_id=v_source_item;

    if v_actual>coalesce(v_source_total,0)-coalesce(v_source_used,0)+0.01 then
      raise exception '取込額が未配賦残額を超えています（元明細 % 円 / 配賦済 % 円 / 今回 % 円）',v_source_total,v_source_used,v_actual;
    end if;
  end if;

  insert into public.costing_cost_items(
    period_id,line_no,category,description,planned_amount_yen,actual_amount_yen,
    source_type,source_item_id,source_parent_id,source_ref,source_date,source_vendor,source_total_amount_yen
  ) values(
    v_id,v_line,v_cat,v_desc,v_planned,v_actual,
    v_source_type,v_source_item,v_source_parent,v_source_ref,v_source_date,v_source_vendor,v_source_total
  ) returning id into v_cost_id;
  v_line:=v_line+1;
 end loop;

 select coalesce(sum(planned_amount_yen),0),coalesce(sum(actual_amount_yen),0)
 into v_planned_total,v_actual_total from public.costing_cost_items where period_id=v_id;

 for v_lot_item in select value from jsonb_array_elements(coalesce(p_payload->'lots','[]'::jsonb)) loop
  v_lot:=nullif(v_lot_item->>'lot_id','')::uuid;v_qty_kg:=coalesce(nullif(v_lot_item->>'allocated_qty_kg','')::numeric,0);
  if v_lot is null or v_qty_kg<=0 then raise exception '対象ロットと配賦数量を確認してください';end if;
  select unit,initial_qty,source_type,category into v_unit,v_initial,v_source,v_category
  from public.production_lots where id=v_lot and deleted_at is null for update;
  if v_unit is null then raise exception '対象ロットが見つかりません';end if;
  if v_source='EXTERNAL_PURCHASE' then raise exception '外部調達茶は年度配賦の対象外です';end if;
  if v_category='製品' then raise exception '完成品ロットは年度配賦の対象外です';end if;
  if lower(v_unit) not in('kg','g') then raise exception '年度配賦はkg/gの茶ロットを選択してください';end if;
  v_max_kg:=case when lower(v_unit)='g' then v_initial/1000.0 else v_initial end;
  if v_qty_kg>v_max_kg+0.0005 then raise exception '配賦数量がロット初期数量を超えています';end if;
  insert into public.costing_period_lots(period_id,production_lot_id,allocated_qty_kg) values(v_id,v_lot,round(v_qty_kg,3));
 end loop;

 select coalesce(sum(allocated_qty_kg),0) into v_actual_output from public.costing_period_lots where period_id=v_id;
 if v_status='FINAL' then
   if v_actual_output<=0 then raise exception '確定するには対象ロットを選択してください';end if;
   v_rate:=case when v_actual_output>0 then v_actual_total/v_actual_output else 0 end;
 else
   v_rate:=case when v_planned_output>0 then v_planned_total/v_planned_output when v_actual_output>0 then v_planned_total/v_actual_output else 0 end;
 end if;

 update public.production_lots l
 set costing_allocated_cost_yen=round(x.allocated_qty_kg*v_rate,2),costing_period_id=v_id,updated_at=now()
 from public.costing_period_lots x where x.period_id=v_id and x.production_lot_id=l.id;

 insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(v_uid,case when p_period_id is null then 'CREATE' else 'UPDATE' end,'costing_period',v_id::text,v_before,
 jsonb_build_object('fiscal_year',v_year,'name',v_name,'status',v_status,'planned_total_yen',v_planned_total,'actual_total_yen',v_actual_total,
   'planned_output_kg',v_planned_output,'actual_output_kg',v_actual_output,'rate_yen_per_kg',round(v_rate,4),
   'linked_source_items',(select count(*) from public.costing_cost_items where period_id=v_id and source_type is not null)));
 return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.get_costing_dashboard(p_year integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_year integer:=coalesce(p_year,extract(year from current_date)::integer);v_result jsonb;
begin
 perform public.require_app_permission_('costing.view');
 if auth.uid() is null then raise exception 'ログインが必要です';end if;

 select jsonb_build_object(
 'year',v_year,
 'periods',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',p.id,'fiscalYear',p.fiscal_year,'name',p.name,'scopeLabel',coalesce(p.scope_label,''),'harvestSeason',coalesce(p.harvest_season,''),
    'status',p.status,'plannedOutputKg',p.planned_output_kg,'note',coalesce(p.note,''),
    'plannedTotalYen',coalesce((select sum(i.planned_amount_yen) from public.costing_cost_items i where i.period_id=p.id),0),
    'actualTotalYen',coalesce((select sum(i.actual_amount_yen) from public.costing_cost_items i where i.period_id=p.id),0),
    'actualOutputKg',coalesce((select sum(x.allocated_qty_kg) from public.costing_period_lots x where x.period_id=p.id),0),
    'rateYenPerKg',case when p.status='FINAL'
      then case when coalesce((select sum(x.allocated_qty_kg) from public.costing_period_lots x where x.period_id=p.id),0)>0
        then coalesce((select sum(i.actual_amount_yen) from public.costing_cost_items i where i.period_id=p.id),0)/
             (select sum(x.allocated_qty_kg) from public.costing_period_lots x where x.period_id=p.id) else 0 end
      else case when p.planned_output_kg>0
        then coalesce((select sum(i.planned_amount_yen) from public.costing_cost_items i where i.period_id=p.id),0)/p.planned_output_kg
        when coalesce((select sum(x.allocated_qty_kg) from public.costing_period_lots x where x.period_id=p.id),0)>0
        then coalesce((select sum(i.planned_amount_yen) from public.costing_cost_items i where i.period_id=p.id),0)/
             (select sum(x.allocated_qty_kg) from public.costing_period_lots x where x.period_id=p.id) else 0 end end,
    'costItems',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'category',i.category,'description',i.description,'plannedAmountYen',i.planned_amount_yen,'actualAmountYen',i.actual_amount_yen,
      'sourceType',coalesce(i.source_type,''),'sourceItemId',coalesce(i.source_item_id::text,''),'sourceParentId',coalesce(i.source_parent_id::text,''),
      'sourceRef',coalesce(i.source_ref,''),'sourceDate',coalesce(i.source_date::text,''),'sourceVendor',coalesce(i.source_vendor,''),
      'sourceTotalAmountYen',coalesce(i.source_total_amount_yen,0)
    ) order by i.line_no) from public.costing_cost_items i where i.period_id=p.id),'[]'::jsonb),
    'lots',coalesce((select jsonb_agg(jsonb_build_object(
      'lotId',x.production_lot_id,'allocatedQtyKg',x.allocated_qty_kg,'legacyId',l.legacy_id,'materialName',l.material_name,
      'sourceType',l.source_type,'receivedDate',l.received_date,'baseTotalCostYen',l.total_cost_yen,'allocatedCostYen',l.costing_allocated_cost_yen
    ) order by l.received_date,l.legacy_id)
      from public.costing_period_lots x join public.production_lots l on l.id=x.production_lot_id where x.period_id=p.id),'[]'::jsonb)
   ) order by p.created_at desc)
   from public.costing_periods p where p.deleted_at is null and p.fiscal_year=v_year
 ),'[]'::jsonb),
 'eligibleLots',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',l.id,'legacyId',l.legacy_id,'materialName',l.material_name,'sourceType',l.source_type,'receivedDate',l.received_date,
    'unit',l.unit,'initialQty',l.initial_qty,'initialQtyKg',case when lower(l.unit)='g' then l.initial_qty/1000.0 else l.initial_qty end,
    'baseTotalCostYen',l.total_cost_yen,'allocatedCostYen',l.costing_allocated_cost_yen,'costingPeriodId',l.costing_period_id,
    'teaType',coalesce(l.tea_type,''),'origin',coalesce(l.origin,''),'variety',coalesce(l.variety,'')
   ) order by l.received_date,l.legacy_id)
   from public.production_lots l
   where l.deleted_at is null and l.source_type<>'EXTERNAL_PURCHASE' and l.category<>'製品' and lower(l.unit) in('kg','g')
 ),'[]'::jsonb),
 'externalLots',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',l.id,'legacyId',l.legacy_id,'materialName',l.material_name,'teaType',coalesce(l.tea_type,''),'origin',coalesce(l.origin,''),
    'supplier',coalesce(l.supplier,''),'unit',l.unit,'initialQty',l.initial_qty,
    'baseUnitCostYen',case when l.initial_qty>0 then l.total_cost_yen/l.initial_qty else 0 end,'receivedDate',l.received_date
   ) order by l.received_date desc)
   from public.production_lots l where l.deleted_at is null and l.source_type='EXTERNAL_PURCHASE'
 ),'[]'::jsonb),
 'products',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',p.id,'sku',p.sku,'productName',p.product_name,'category',p.category,'netContent',p.net_content,'contentUnit',p.content_unit,
    'packagingCostYen',p.packaging_cost_yen,'wholesalePriceYen',p.wholesale_price_yen,'retailPriceYen',p.retail_price_yen,'otherPriceYen',p.other_price_yen
   ) order by p.product_name)
   from public.product_master p where p.deleted_at is null and p.status='ACTIVE'
 ),'[]'::jsonb),
 'sourceCandidates',coalesce((
   select jsonb_agg(jsonb_build_object(
    'sourceType',q.source_type,'sourceItemId',q.source_item_id,'sourceParentId',q.source_parent_id,'sourceRef',q.source_ref,
    'sourceDate',q.source_date,'vendor',q.vendor,'sourceCategory',q.source_category,'description',q.description,
    'totalAmountYen',q.total_amount_yen,'usedAmountYen',q.used_amount_yen,
    'remainingAmountYen',greatest(q.total_amount_yen-q.used_amount_yen,0),'suggestedCategory',q.suggested_category,'sourceStatus',q.source_status
   ) order by q.source_date desc,q.source_ref,q.description)
   from (
    select
      'EXPENSE_CLAIM'::text source_type,i.id source_item_id,c.id source_parent_id,c.claim_no source_ref,c.purchase_at::date source_date,
      c.vendor,''::text source_category,i.description,i.line_total_yen total_amount_yen,'APPROVED'::text source_status,
      case
       when concat_ws(' ',c.vendor,i.description,i.note) ~* '(肥料|堆肥|硫安|有機質)' then 'FERTILIZER'
       when concat_ws(' ',c.vendor,i.description,i.note) ~* '(農薬|防除|ダニサラバ|ダントツ|ファルコン|殺虫|殺菌)' then 'PESTICIDE'
       when concat_ws(' ',c.vendor,i.description,i.note) ~* '(ガソリン|軽油|燃料|給油|灯油)' then 'FUEL'
       when concat_ws(' ',c.vendor,i.description,i.note) ~* '(修理|整備|部品|メンテナンス)' then 'REPAIR'
       when concat_ws(' ',c.vendor,i.description,i.note) ~* '(被覆|寒冷紗|ネット|遮光|資材)' then 'COVERING'
       when concat_ws(' ',c.vendor,i.description,i.note) ~* '(電気|電力|水道|光熱)' then 'UTILITIES'
       when concat_ws(' ',c.vendor,i.description,i.note) ~* '(製茶|碾茶|抹茶加工|粉砕|加工賃|委託)' then 'PROCESSING'
       else 'OTHER' end suggested_category,
      coalesce((select sum(ci.actual_amount_yen) from public.costing_cost_items ci
        join public.costing_periods cp on cp.id=ci.period_id
        where cp.deleted_at is null and ci.source_type='EXPENSE_CLAIM' and ci.source_item_id=i.id),0) used_amount_yen
    from public.expense_claim_items i join public.expense_claims c on c.id=i.claim_id
    where c.status='APPROVED' and extract(year from c.purchase_at)=v_year
    union all
    select
      'VENDOR_INVOICE'::text,i.id,v.id,v.invoice_no,v.invoice_date,v.vendor,i.category,i.description,i.line_total_yen,v.payment_status,
      case
       when i.category='FERTILIZER' then 'FERTILIZER'
       when i.category='PESTICIDE' then 'PESTICIDE'
       when i.category in('TENCHA_PROCESSING','MATCHA_PROCESSING','OUTSOURCING') then 'PROCESSING'
       when i.category='REPAIR' then 'REPAIR'
       when concat_ws(' ',v.vendor,i.description,i.note) ~* '(ガソリン|軽油|燃料|給油|灯油)' then 'FUEL'
       when concat_ws(' ',v.vendor,i.description,i.note) ~* '(被覆|寒冷紗|ネット|遮光)' then 'COVERING'
       when concat_ws(' ',v.vendor,i.description,i.note) ~* '(電気|電力|水道|光熱)' then 'UTILITIES'
       else 'OTHER' end,
      coalesce((select sum(ci.actual_amount_yen) from public.costing_cost_items ci
        join public.costing_periods cp on cp.id=ci.period_id
        where cp.deleted_at is null and ci.source_type='VENDOR_INVOICE' and ci.source_item_id=i.id),0)
    from public.vendor_invoice_items i join public.vendor_invoices v on v.id=i.invoice_id
    where v.deleted_at is null and extract(year from v.invoice_date)=v_year
   ) q
 ),'[]'::jsonb),
 'references',jsonb_build_object(
   'approvedExpenseClaimsYen',coalesce((select sum(e.total_amount_yen) from public.expense_claims e where e.status='APPROVED' and extract(year from e.purchase_at)=v_year),0),
   'vendorInvoicesYen',coalesce((select sum(v.total_amount_yen) from public.vendor_invoices v where v.deleted_at is null and extract(year from v.invoice_date)=v_year),0)
 )
 ) into v_result;
 return v_result;
end
$function$;

revoke all on function public.save_costing_period(uuid,jsonb) from public,anon;
revoke all on function public.get_costing_dashboard(integer) from public,anon;
grant execute on function public.save_costing_period(uuid,jsonb) to authenticated;
grant execute on function public.get_costing_dashboard(integer) to authenticated;
