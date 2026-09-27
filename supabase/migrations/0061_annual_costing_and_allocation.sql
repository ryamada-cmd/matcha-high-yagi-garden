-- Annual costing and allocation for self-grown tea.
-- Self-grown lots receive a separate allocated cost layer; external purchases keep actual purchase cost.

insert into public.app_permission_definitions(permission_key,feature_key,feature_label,item_label,description,sort_order,locked,worker_default)
values
('costing.view','costing','原価計算・年度配賦','閲覧','自社茶の年度配賦原価と商品原価目安を閲覧',620,false,false),
('costing.manage','costing','原価計算・年度配賦','登録・編集・確定','年度原価プール、対象ロット、暫定・確定原価を変更',621,false,false)
on conflict(permission_key) do update set feature_key=excluded.feature_key,feature_label=excluded.feature_label,item_label=excluded.item_label,description=excluded.description,sort_order=excluded.sort_order,worker_default=excluded.worker_default;

insert into public.role_permissions(app_role,permission_key,allowed,updated_at)
values('admin','costing.view',true,now()),('admin','costing.manage',true,now()),('worker','costing.view',false,now()),('worker','costing.manage',false,now())
on conflict(app_role,permission_key) do update set allowed=excluded.allowed,updated_at=now();

create table if not exists public.costing_periods(
 id uuid primary key default gen_random_uuid(), fiscal_year integer not null check(fiscal_year between 2000 and 2100), name text not null,
 scope_label text, harvest_season text, status text not null default 'DRAFT' check(status in('DRAFT','FINAL')),
 planned_output_kg numeric(16,3) not null default 0 check(planned_output_kg>=0), note text,
 created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.costing_cost_items(
 id uuid primary key default gen_random_uuid(), period_id uuid not null references public.costing_periods(id) on delete cascade,
 line_no integer not null, category text not null, description text not null,
 planned_amount_yen numeric(16,2) not null default 0 check(planned_amount_yen>=0),
 actual_amount_yen numeric(16,2) not null default 0 check(actual_amount_yen>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(period_id,line_no)
);
create table if not exists public.costing_period_lots(
 id uuid primary key default gen_random_uuid(), period_id uuid not null references public.costing_periods(id) on delete cascade,
 production_lot_id uuid not null references public.production_lots(id), allocated_qty_kg numeric(16,3) not null check(allocated_qty_kg>0),
 created_at timestamptz not null default now(), unique(production_lot_id)
);
alter table public.production_lots
 add column if not exists costing_allocated_cost_yen numeric(16,2) not null default 0,
 add column if not exists costing_period_id uuid references public.costing_periods(id);

alter table public.costing_periods enable row level security;
alter table public.costing_cost_items enable row level security;
alter table public.costing_period_lots enable row level security;
revoke all on public.costing_periods,public.costing_cost_items,public.costing_period_lots from anon,authenticated,public;
drop policy if exists costing_periods_deny_direct on public.costing_periods;
drop policy if exists costing_cost_items_deny_direct on public.costing_cost_items;
drop policy if exists costing_period_lots_deny_direct on public.costing_period_lots;
create policy costing_periods_deny_direct on public.costing_periods as restrictive for all to anon,authenticated using(false) with check(false);
create policy costing_cost_items_deny_direct on public.costing_cost_items as restrictive for all to anon,authenticated using(false) with check(false);
create policy costing_period_lots_deny_direct on public.costing_period_lots as restrictive for all to anon,authenticated using(false) with check(false);
create index if not exists idx_costing_periods_year on public.costing_periods(fiscal_year,status) where deleted_at is null;
create index if not exists idx_costing_items_period on public.costing_cost_items(period_id,line_no);
create index if not exists idx_costing_lots_period on public.costing_period_lots(period_id);

CREATE OR REPLACE FUNCTION public.save_costing_period(p_period_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_id uuid:=p_period_id;v_year integer:=coalesce(nullif(p_payload->>'fiscal_year','')::integer,extract(year from current_date)::integer);
v_name text:=btrim(coalesce(p_payload->>'name',''));v_status text:=upper(coalesce(nullif(p_payload->>'status',''),'DRAFT'));v_planned_output numeric:=coalesce(nullif(p_payload->>'planned_output_kg','')::numeric,0);
v_item jsonb;v_lot_item jsonb;v_lot uuid;v_qty_kg numeric;v_unit text;v_initial numeric;v_source text;v_category text;v_max_kg numeric;v_line integer:=0;
v_planned_total numeric:=0;v_actual_total numeric:=0;v_actual_output numeric:=0;v_rate numeric:=0;v_before jsonb;
begin
 perform public.require_app_permission_('costing.manage');if v_uid is null then raise exception 'ログインが必要です';end if;
 if v_name='' then raise exception '原価期間名を入力してください';end if;if v_status not in('DRAFT','FINAL') then raise exception '原価期間の状態が不正です';end if;
 if v_planned_output<0 then raise exception '予定出来高を確認してください';end if;
 if jsonb_typeof(coalesce(p_payload->'cost_items','[]'::jsonb))<>'array' then raise exception '費用明細が不正です';end if;
 if jsonb_typeof(coalesce(p_payload->'lots','[]'::jsonb))<>'array' then raise exception '対象ロットが不正です';end if;
 if v_id is null then
  insert into public.costing_periods(fiscal_year,name,scope_label,harvest_season,status,planned_output_kg,note,created_by,updated_by)
  values(v_year,v_name,nullif(btrim(p_payload->>'scope_label'),''),nullif(btrim(p_payload->>'harvest_season'),''),v_status,round(v_planned_output,3),nullif(btrim(p_payload->>'note'),''),v_uid,v_uid) returning id into v_id;
 else
  select to_jsonb(p) into v_before from public.costing_periods p where p.id=v_id and p.deleted_at is null for update;if v_before is null then raise exception '原価期間が見つかりません';end if;
  update public.production_lots set costing_allocated_cost_yen=0,costing_period_id=null,updated_at=now() where costing_period_id=v_id;
  delete from public.costing_cost_items where period_id=v_id;delete from public.costing_period_lots where period_id=v_id;
  update public.costing_periods set fiscal_year=v_year,name=v_name,scope_label=nullif(btrim(p_payload->>'scope_label'),''),harvest_season=nullif(btrim(p_payload->>'harvest_season'),''),
   status=v_status,planned_output_kg=round(v_planned_output,3),note=nullif(btrim(p_payload->>'note'),''),updated_by=v_uid,updated_at=now() where id=v_id;
 end if;
 for v_item in select value from jsonb_array_elements(coalesce(p_payload->'cost_items','[]'::jsonb)) loop
  if btrim(coalesce(v_item->>'description',''))='' then continue;end if;
  insert into public.costing_cost_items(period_id,line_no,category,description,planned_amount_yen,actual_amount_yen)
  values(v_id,v_line,coalesce(nullif(btrim(v_item->>'category'),''),'OTHER'),btrim(v_item->>'description'),round(coalesce(nullif(v_item->>'planned_amount_yen','')::numeric,0),2),round(coalesce(nullif(v_item->>'actual_amount_yen','')::numeric,0),2));v_line:=v_line+1;
 end loop;
 select coalesce(sum(planned_amount_yen),0),coalesce(sum(actual_amount_yen),0) into v_planned_total,v_actual_total from public.costing_cost_items where period_id=v_id;
 for v_lot_item in select value from jsonb_array_elements(coalesce(p_payload->'lots','[]'::jsonb)) loop
  v_lot:=nullif(v_lot_item->>'lot_id','')::uuid;v_qty_kg:=coalesce(nullif(v_lot_item->>'allocated_qty_kg','')::numeric,0);
  if v_lot is null or v_qty_kg<=0 then raise exception '対象ロットと配賦数量を確認してください';end if;
  select unit,initial_qty,source_type,category into v_unit,v_initial,v_source,v_category from public.production_lots where id=v_lot and deleted_at is null for update;
  if v_unit is null then raise exception '対象ロットが見つかりません';end if;if v_source='EXTERNAL_PURCHASE' then raise exception '外部調達茶は年度配賦の対象外です';end if;
  if v_category='製品' then raise exception '完成品ロットは年度配賦の対象外です';end if;if lower(v_unit) not in('kg','g') then raise exception '年度配賦はkg/gの茶ロットを選択してください';end if;
  v_max_kg:=case when lower(v_unit)='g' then v_initial/1000.0 else v_initial end;if v_qty_kg>v_max_kg+0.0005 then raise exception '配賦数量がロット初期数量を超えています';end if;
  insert into public.costing_period_lots(period_id,production_lot_id,allocated_qty_kg) values(v_id,v_lot,round(v_qty_kg,3));
 end loop;
 select coalesce(sum(allocated_qty_kg),0) into v_actual_output from public.costing_period_lots where period_id=v_id;
 if v_status='FINAL' then if v_actual_output<=0 then raise exception '確定するには対象ロットを選択してください';end if;v_rate:=case when v_actual_output>0 then v_actual_total/v_actual_output else 0 end;
 else v_rate:=case when v_planned_output>0 then v_planned_total/v_planned_output when v_actual_output>0 then v_planned_total/v_actual_output else 0 end;end if;
 update public.production_lots l set costing_allocated_cost_yen=round(x.allocated_qty_kg*v_rate,2),costing_period_id=v_id,updated_at=now()
 from public.costing_period_lots x where x.period_id=v_id and x.production_lot_id=l.id;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(v_uid,case when p_period_id is null then 'CREATE' else 'UPDATE' end,'costing_period',v_id::text,v_before,
 jsonb_build_object('fiscal_year',v_year,'name',v_name,'status',v_status,'planned_total_yen',v_planned_total,'actual_total_yen',v_actual_total,'planned_output_kg',v_planned_output,'actual_output_kg',v_actual_output,'rate_yen_per_kg',round(v_rate,4)));
 return v_id;
end$function$;

CREATE OR REPLACE FUNCTION public.delete_costing_period(p_period_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid:=auth.uid();v_before jsonb;begin perform public.require_app_permission_('costing.manage');if v_uid is null then raise exception 'ログインが必要です';end if;
select to_jsonb(p) into v_before from public.costing_periods p where p.id=p_period_id and p.deleted_at is null for update;if v_before is null then raise exception '原価期間が見つかりません';end if;
update public.production_lots set costing_allocated_cost_yen=0,costing_period_id=null,updated_at=now() where costing_period_id=p_period_id;
update public.costing_periods set deleted_at=now(),updated_by=v_uid,updated_at=now(),note=concat_ws(E'\n',note,case when btrim(coalesce(p_reason,''))<>'' then '削除理由: '||btrim(p_reason) end) where id=p_period_id;
insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(v_uid,'DELETE','costing_period',p_period_id::text,v_before,jsonb_build_object('reason',coalesce(p_reason,'')));end$function$;

CREATE OR REPLACE FUNCTION public.get_costing_dashboard(p_year integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_year integer:=coalesce(p_year,extract(year from current_date)::integer);v_result jsonb;begin perform public.require_app_permission_('costing.view');if auth.uid() is null then raise exception 'ログインが必要です';end if;
select jsonb_build_object('year',v_year,
'periods',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'fiscalYear',p.fiscal_year,'name',p.name,'scopeLabel',coalesce(p.scope_label,''),'harvestSeason',coalesce(p.harvest_season,''),'status',p.status,'plannedOutputKg',p.planned_output_kg,'note',coalesce(p.note,''),
'plannedTotalYen',coalesce((select sum(i.planned_amount_yen) from public.costing_cost_items i where i.period_id=p.id),0),'actualTotalYen',coalesce((select sum(i.actual_amount_yen) from public.costing_cost_items i where i.period_id=p.id),0),
'actualOutputKg',coalesce((select sum(x.allocated_qty_kg) from public.costing_period_lots x where x.period_id=p.id),0),
'rateYenPerKg',case when p.status='FINAL' then case when coalesce((select sum(x.allocated_qty_kg) from public.costing_period_lots x where x.period_id=p.id),0)>0 then coalesce((select sum(i.actual_amount_yen) from public.costing_cost_items i where i.period_id=p.id),0)/(select sum(x.allocated_qty_kg) from public.costing_period_lots x where x.period_id=p.id) else 0 end else case when p.planned_output_kg>0 then coalesce((select sum(i.planned_amount_yen) from public.costing_cost_items i where i.period_id=p.id),0)/p.planned_output_kg when coalesce((select sum(x.allocated_qty_kg) from public.costing_period_lots x where x.period_id=p.id),0)>0 then coalesce((select sum(i.planned_amount_yen) from public.costing_cost_items i where i.period_id=p.id),0)/(select sum(x.allocated_qty_kg) from public.costing_period_lots x where x.period_id=p.id) else 0 end end,
'costItems',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'category',i.category,'description',i.description,'plannedAmountYen',i.planned_amount_yen,'actualAmountYen',i.actual_amount_yen) order by i.line_no) from public.costing_cost_items i where i.period_id=p.id),'[]'::jsonb),
'lots',coalesce((select jsonb_agg(jsonb_build_object('lotId',x.production_lot_id,'allocatedQtyKg',x.allocated_qty_kg,'legacyId',l.legacy_id,'materialName',l.material_name,'sourceType',l.source_type,'receivedDate',l.received_date,'baseTotalCostYen',l.total_cost_yen,'allocatedCostYen',l.costing_allocated_cost_yen) order by l.received_date,l.legacy_id) from public.costing_period_lots x join public.production_lots l on l.id=x.production_lot_id where x.period_id=p.id),'[]'::jsonb)) order by p.created_at desc) from public.costing_periods p where p.deleted_at is null and p.fiscal_year=v_year),'[]'::jsonb),
'eligibleLots',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'legacyId',l.legacy_id,'materialName',l.material_name,'sourceType',l.source_type,'receivedDate',l.received_date,'unit',l.unit,'initialQty',l.initial_qty,'initialQtyKg',case when lower(l.unit)='g' then l.initial_qty/1000.0 else l.initial_qty end,'baseTotalCostYen',l.total_cost_yen,'allocatedCostYen',l.costing_allocated_cost_yen,'costingPeriodId',l.costing_period_id,'teaType',coalesce(l.tea_type,''),'origin',coalesce(l.origin,''),'variety',coalesce(l.variety,'')) order by l.received_date,l.legacy_id) from public.production_lots l where l.deleted_at is null and l.source_type<>'EXTERNAL_PURCHASE' and l.category<>'製品' and lower(l.unit) in('kg','g')),'[]'::jsonb),
'externalLots',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'legacyId',l.legacy_id,'materialName',l.material_name,'teaType',coalesce(l.tea_type,''),'origin',coalesce(l.origin,''),'supplier',coalesce(l.supplier,''),'unit',l.unit,'initialQty',l.initial_qty,'baseUnitCostYen',case when l.initial_qty>0 then l.total_cost_yen/l.initial_qty else 0 end,'receivedDate',l.received_date) order by l.received_date desc) from public.production_lots l where l.deleted_at is null and l.source_type='EXTERNAL_PURCHASE'),'[]'::jsonb),
'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'sku',p.sku,'productName',p.product_name,'category',p.category,'netContent',p.net_content,'contentUnit',p.content_unit,'packagingCostYen',p.packaging_cost_yen,'wholesalePriceYen',p.wholesale_price_yen,'retailPriceYen',p.retail_price_yen,'otherPriceYen',p.other_price_yen) order by p.product_name) from public.product_master p where p.deleted_at is null and p.status='ACTIVE'),'[]'::jsonb),
'references',jsonb_build_object('approvedExpenseClaimsYen',coalesce((select sum(e.total_amount_yen) from public.expense_claims e where e.status='APPROVED' and extract(year from e.purchase_at)=v_year),0),'vendorInvoicesYen',coalesce((select sum(v.total_amount_yen) from public.vendor_invoices v where v.deleted_at is null and extract(year from v.invoice_date)=v_year),0))
) into v_result;return v_result;end$function$;

revoke all on function public.save_costing_period(uuid,jsonb) from public,anon;
revoke all on function public.delete_costing_period(uuid,text) from public,anon;
revoke all on function public.get_costing_dashboard(integer) from public,anon;
grant execute on function public.save_costing_period(uuid,jsonb) to authenticated;
grant execute on function public.delete_costing_period(uuid,text) to authenticated;
grant execute on function public.get_costing_dashboard(integer) to authenticated;

CREATE OR REPLACE FUNCTION public.save_manufacturing_batch_core_(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role text;v_display text;v_id uuid;v_output_lot uuid;v_before jsonb;v_after jsonb;v_legacy text;v_date date;v_output numeric;v_item jsonb;v_lot uuid;v_input numeric;v_balance numeric;v_old_input numeric;v_unit text;v_initial numeric;v_lot_cost numeric;v_unit_cost numeric;v_input_cost numeric;v_total_input_cost numeric:=0;v_direct numeric;v_pack numeric;v_other numeric;v_total_cost numeric;v_seen jsonb:='{}'::jsonb;v_old_output numeric;v_output_balance numeric;v_used numeric;v_old_inputs jsonb;v_input_units text[]:=array[]::text[];v_all_same boolean:=true;v_first_unit text:=null;v_sum_same_unit numeric:=0;
begin
  
 if auth.uid() is null then raise exception 'ログインが必要です';end if;select role,display_name into v_role,v_display from public.profiles where id=auth.uid();if coalesce(v_role,'') not in('admin','worker') then raise exception '権限がありません';end if;
 v_id:=nullif(p_payload->>'id','')::uuid;v_date:=coalesce(nullif(p_payload->>'manufacturing_date','')::date,current_date);v_output:=coalesce(nullif(p_payload->>'output_qty','')::numeric,0);v_direct:=coalesce(nullif(p_payload->>'processing_cost_yen','')::numeric,0);v_pack:=coalesce(nullif(p_payload->>'packaging_cost_yen','')::numeric,0);v_other:=coalesce(nullif(p_payload->>'other_cost_yen','')::numeric,0);
 if btrim(coalesce(p_payload->>'process_type',''))='' then raise exception '加工工程を入力してください';end if;if btrim(coalesce(p_payload->>'output_material',''))='' then raise exception '出来上がり品目を入力してください';end if;if v_output<=0 then raise exception '出来高は0より大きくしてください';end if;if btrim(coalesce(p_payload->>'output_unit',''))='' then raise exception '出来高単位を入力してください';end if;if jsonb_typeof(p_payload->'inputs')<>'array' or jsonb_array_length(p_payload->'inputs')=0 then raise exception '原料ロットを1件以上選択してください';end if;

 if v_id is not null then
   select jsonb_build_object('batch',to_jsonb(b),'inputs',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.manufacturing_batch_inputs i where i.manufacturing_batch_id=b.id)) into v_before from public.manufacturing_batches b where b.id=v_id and b.deleted_at is null for update;
   if v_before is null then raise exception '加工実績が見つかりません';end if;
   select output_lot_id,output_qty into v_output_lot,v_old_output from public.manufacturing_batches where id=v_id;
   v_used:=public.production_lot_downstream_used_qty(v_output_lot);select coalesce(balance,0) into v_output_balance from public.production_inventory_balances where lot_id=v_output_lot;
   if v_used>0.0005 then raise exception 'この加工出来高は後工程で使用中のため編集できません';end if;
   if abs(v_output_balance-v_old_output)>0.0005 then raise exception 'この加工出来高は在庫操作済みのため編集できません';end if;
 else
   v_legacy:='MFG-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,4));
   insert into public.manufacturing_batches(legacy_id,manufacturing_date,process_type,output_material,output_qty,output_unit,facility,processing_cost_yen,packaging_cost_yen,other_cost_yen,operator_id,operator_name_snapshot,note)
   values(v_legacy,v_date,btrim(p_payload->>'process_type'),btrim(p_payload->>'output_material'),round(v_output,3),btrim(p_payload->>'output_unit'),nullif(btrim(p_payload->>'facility'),''),v_direct,v_pack,v_other,auth.uid(),coalesce(nullif(btrim(p_payload->>'operator_name'),''),v_display),nullif(btrim(p_payload->>'note'),'')) returning id into v_id;
 end if;

 -- Validate all inputs against virtual stock (current balance + this batch's old consumption).
 for v_item in select * from jsonb_array_elements(p_payload->'inputs') loop
   v_lot:=nullif(v_item->>'lot_id','')::uuid;v_input:=coalesce(nullif(v_item->>'input_qty','')::numeric,0);if v_lot is null or v_input<=0 then raise exception '原料ロットと投入量を確認してください';end if;if v_seen ? v_lot::text then raise exception '同じ原料ロットが重複しています';end if;v_seen:=v_seen||jsonb_build_object(v_lot::text,true);
   select unit,initial_qty,total_cost_yen+coalesce(costing_allocated_cost_yen,0) into v_unit,v_initial,v_lot_cost from public.production_lots where id=v_lot and deleted_at is null for update;if v_unit is null then raise exception '原料ロットが見つかりません';end if;select coalesce(balance,0) into v_balance from public.production_inventory_balances where lot_id=v_lot;select coalesce(input_qty,0) into v_old_input from public.manufacturing_batch_inputs where manufacturing_batch_id=v_id and lot_id=v_lot;v_balance:=v_balance+coalesce(v_old_input,0);if v_input>v_balance+0.0005 then raise exception '原料ロットの在庫不足です（在庫 % % / 必要 % %）',v_balance,v_unit,v_input,v_unit;end if;
   v_unit_cost:=case when v_initial>0 then v_lot_cost/v_initial else 0 end;v_input_cost:=round(v_input*v_unit_cost,2);v_total_input_cost:=v_total_input_cost+v_input_cost;
   if v_first_unit is null then v_first_unit:=v_unit;elsif v_first_unit<>v_unit then v_all_same:=false;end if;if v_unit=btrim(p_payload->>'output_unit') then v_sum_same_unit:=v_sum_same_unit+v_input;end if;
 end loop;
 if v_all_same and v_first_unit=btrim(p_payload->>'output_unit') and v_output>v_sum_same_unit+0.0005 then raise exception '出来高が投入量を超えています';end if;
 v_total_cost:=round(v_total_input_cost+v_direct+v_pack+v_other,2);

 if v_before is not null then
   -- Restore old input quantities, then record new consumption. The ledger stays append-only.
   for v_item in select to_jsonb(i) from public.manufacturing_batch_inputs i where i.manufacturing_batch_id=v_id loop
     insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values((v_item->>'lot_id')::uuid,'RETURN',(v_item->>'input_qty')::numeric,'MANUFACTURING',v_id,'加工実績編集による原料戻入',auth.uid());
   end loop;
   delete from public.manufacturing_batch_inputs where manufacturing_batch_id=v_id;
 end if;

 for v_item in select * from jsonb_array_elements(p_payload->'inputs') loop
   v_lot:=(v_item->>'lot_id')::uuid;v_input:=(v_item->>'input_qty')::numeric;select unit,initial_qty,total_cost_yen+coalesce(costing_allocated_cost_yen,0) into v_unit,v_initial,v_lot_cost from public.production_lots where id=v_lot;v_unit_cost:=case when v_initial>0 then v_lot_cost/v_initial else 0 end;v_input_cost:=round(v_input*v_unit_cost,2);
   insert into public.manufacturing_batch_inputs(manufacturing_batch_id,lot_id,input_qty,input_unit_snapshot,unit_cost_snapshot_yen,input_cost_yen) values(v_id,v_lot,round(v_input,3),v_unit,round(v_unit_cost,4),v_input_cost);
   insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values(v_lot,'CONSUME',-round(v_input,3),'MANUFACTURING',v_id,'加工原料使用',auth.uid());
 end loop;

 if v_before is null then
   insert into public.production_lots(legacy_id,source_type,source_id,material_name,category,unit,received_date,initial_qty,total_cost_yen,supplier,note)
   values('LOT-'||v_legacy,'MANUFACTURING',v_id,btrim(p_payload->>'output_material'),coalesce(nullif(btrim(p_payload->>'category'),''),'製品'),btrim(p_payload->>'output_unit'),v_date,round(v_output,3),v_total_cost,nullif(btrim(p_payload->>'facility'),''),nullif(btrim(p_payload->>'note'),'')) returning id into v_output_lot;
   insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values(v_output_lot,'RECEIPT',round(v_output,3),'MANUFACTURING',v_id,'加工出来高',auth.uid());
 else
   if abs(v_output-v_old_output)>0.0005 then insert into public.production_transactions(lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by) values(v_output_lot,'ADJUSTMENT',round(v_output-v_old_output,3),'MANUFACTURING',v_id,'加工出来高変更',auth.uid());end if;
   update public.production_lots set material_name=btrim(p_payload->>'output_material'),category=coalesce(nullif(btrim(p_payload->>'category'),''),category),unit=btrim(p_payload->>'output_unit'),received_date=v_date,initial_qty=round(v_output,3),total_cost_yen=v_total_cost,supplier=nullif(btrim(p_payload->>'facility'),''),note=nullif(btrim(p_payload->>'note'),''),updated_at=now() where id=v_output_lot;
 end if;
 update public.manufacturing_batches set manufacturing_date=v_date,process_type=btrim(p_payload->>'process_type'),output_material=btrim(p_payload->>'output_material'),output_qty=round(v_output,3),output_unit=btrim(p_payload->>'output_unit'),facility=nullif(btrim(p_payload->>'facility'),''),processing_cost_yen=v_direct,packaging_cost_yen=v_pack,other_cost_yen=v_other,inherited_input_cost_yen=round(v_total_input_cost,2),total_manufacturing_cost_yen=v_total_cost,output_lot_id=v_output_lot,operator_name_snapshot=coalesce(nullif(btrim(p_payload->>'operator_name'),''),operator_name_snapshot),note=nullif(btrim(p_payload->>'note'),''),updated_at=now() where id=v_id;
 select jsonb_build_object('batch',to_jsonb(b),'inputs',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.manufacturing_batch_inputs i where i.manufacturing_batch_id=b.id),'output_lot',(select to_jsonb(l) from public.production_lots l where l.id=b.output_lot_id)) into v_after from public.manufacturing_batches b where b.id=v_id;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),case when v_before is null then 'CREATE' else 'UPDATE' end,'manufacturing_batch',v_id::text,v_before,v_after);
 return v_id;
end $function$;

create or replace view public.production_inventory_balances as
 SELECT l.id AS lot_id,
    l.legacy_id,
    l.material_name,
    l.category,
    l.unit,
    l.received_date,
    l.initial_qty,
    (l.total_cost_yen + l.costing_allocated_cost_yen)::numeric(16,2) AS total_cost_yen,
        CASE
            WHEN l.initial_qty > 0::numeric THEN round((l.total_cost_yen + l.costing_allocated_cost_yen) / l.initial_qty, 4)
            ELSE 0::numeric
        END AS unit_cost_yen,
    COALESCE(sum(t.quantity), 0::numeric)::numeric(16,3) AS balance,
    round(COALESCE(sum(t.quantity), 0::numeric) *
        CASE
            WHEN l.initial_qty > 0::numeric THEN (l.total_cost_yen + l.costing_allocated_cost_yen) / l.initial_qty
            ELSE 0::numeric
        END, 2) AS inventory_value_yen,
    l.source_type,
    l.source_id,
    l.supplier,
    l.storage_location,
    l.note,
    l.deleted_at,
    l.tea_type,
    l.origin,
    l.variety,
    l.grade,
    l.supplier_lot_no,
    l.purchase_document_no,
    l.total_cost_yen AS base_total_cost_yen,
    l.costing_allocated_cost_yen,
    l.costing_period_id
   FROM production_lots l
     LEFT JOIN production_transactions t ON t.lot_id = l.id
  GROUP BY l.id, l.legacy_id, l.material_name, l.category, l.unit, l.received_date, l.initial_qty, l.total_cost_yen, l.costing_allocated_cost_yen, l.source_type, l.source_id, l.supplier, l.storage_location, l.note, l.deleted_at, l.tea_type, l.origin, l.variety, l.grade, l.supplier_lot_no, l.purchase_document_no, l.costing_period_id;;
alter view public.production_inventory_balances set (security_invoker=true);

create or replace view private.packaging_source_lots as
 SELECT l.id AS lot_id,
    l.legacy_id,
    l.material_name,
    l.category,
    l.unit,
    l.received_date,
    l.initial_qty,
    (l.total_cost_yen + l.costing_allocated_cost_yen)::numeric(16,2) AS total_cost_yen,
        CASE
            WHEN l.initial_qty > 0::numeric THEN round((l.total_cost_yen + l.costing_allocated_cost_yen) / l.initial_qty, 4)
            ELSE 0::numeric
        END AS unit_cost_yen,
    COALESCE(sum(t.quantity), 0::numeric)::numeric(16,3) AS balance,
    round(COALESCE(sum(t.quantity), 0::numeric) *
        CASE
            WHEN l.initial_qty > 0::numeric THEN (l.total_cost_yen + l.costing_allocated_cost_yen) / l.initial_qty
            ELSE 0::numeric
        END, 2) AS inventory_value_yen,
    l.source_type,
    l.source_id,
    l.storage_location,
    l.supplier,
    l.tea_type,
    l.origin,
    l.variety,
    l.grade,
    l.supplier_lot_no,
    l.purchase_document_no,
    l.total_cost_yen AS base_total_cost_yen,
    l.costing_allocated_cost_yen,
    l.costing_period_id
   FROM production_lots l
     LEFT JOIN production_transactions t ON t.lot_id = l.id
  WHERE l.deleted_at IS NULL AND has_app_permission('packaging.manage'::text)
  GROUP BY l.id, l.legacy_id, l.material_name, l.category, l.unit, l.received_date, l.initial_qty, l.total_cost_yen, l.costing_allocated_cost_yen, l.source_type, l.source_id, l.storage_location, l.supplier, l.tea_type, l.origin, l.variety, l.grade, l.supplier_lot_no, l.purchase_document_no, l.costing_period_id;;

create or replace view public.packaging_source_lots as
 SELECT lot_id,
    legacy_id,
    material_name,
    category,
    unit,
    received_date,
    initial_qty,
    total_cost_yen,
    unit_cost_yen,
    balance,
    inventory_value_yen,
    source_type,
    source_id,
    storage_location,
    supplier,
    tea_type,
    origin,
    variety,
    grade,
    supplier_lot_no,
    purchase_document_no,
    base_total_cost_yen,
    costing_allocated_cost_yen,
    costing_period_id
   FROM private.packaging_source_lots;;
alter view public.packaging_source_lots set (security_invoker=true);
