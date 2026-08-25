-- Complete fertilizer operational RPCs. Production functions were applied with 0017 foundation.

create or replace function public.admin_adjust_fertilizer_stock(p_lot_id uuid,p_target_balance_kg numeric,p_reason text)
returns numeric language plpgsql security definer set search_path=public as $$
declare v_current numeric; v_delta numeric;
begin
  perform public.require_fertilizer_admin_();
  if p_target_balance_kg < 0 then raise exception '実在庫は0kg以上で入力してください'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception '棚卸理由を入力してください'; end if;
  perform 1 from public.fertilizer_inventory_lots where id=p_lot_id for update;
  if not found then raise exception '在庫ロットが見つかりません'; end if;
  select coalesce(balance_kg,0) into v_current from public.fertilizer_inventory_balances where inventory_lot_id=p_lot_id;
  v_delta := round(p_target_balance_kg-v_current,3);
  if v_delta<>0 then
    insert into public.fertilizer_inventory_transactions(inventory_lot_id,transaction_type,quantity_kg,reference_type,reference_id,reason,created_by)
    values(p_lot_id,'ADJUSTMENT',v_delta,'inventory_lot',p_lot_id,p_reason,auth.uid());
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'UPDATE','fertilizer_inventory_balance',p_lot_id::text,jsonb_build_object('balance_kg',v_current),jsonb_build_object('balance_kg',p_target_balance_kg,'delta_kg',v_delta,'reason',p_reason));
  return v_delta;
end $$;
revoke all on function public.admin_adjust_fertilizer_stock(uuid,numeric,text) from public,anon;
grant execute on function public.admin_adjust_fertilizer_stock(uuid,numeric,text) to authenticated;

create or replace function public.admin_dispose_fertilizer_stock(p_lot_id uuid,p_quantity_kg numeric,p_reason text)
returns numeric language plpgsql security definer set search_path=public as $$
declare v_current numeric;
begin
  perform public.require_fertilizer_admin_();
  if p_quantity_kg<=0 then raise exception '廃棄量は0kgより大きくしてください'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception '廃棄理由を入力してください'; end if;
  perform 1 from public.fertilizer_inventory_lots where id=p_lot_id for update;
  if not found then raise exception '在庫ロットが見つかりません'; end if;
  select coalesce(balance_kg,0) into v_current from public.fertilizer_inventory_balances where inventory_lot_id=p_lot_id;
  if p_quantity_kg>v_current then raise exception '在庫不足です（現在庫 % kg）',v_current; end if;
  insert into public.fertilizer_inventory_transactions(inventory_lot_id,transaction_type,quantity_kg,reference_type,reference_id,reason,created_by)
  values(p_lot_id,'DISPOSAL',round(p_quantity_kg,3),'inventory_lot',p_lot_id,p_reason,auth.uid());
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'UPDATE','fertilizer_inventory_balance',p_lot_id::text,jsonb_build_object('balance_kg',v_current),jsonb_build_object('balance_kg',v_current-p_quantity_kg,'disposed_kg',p_quantity_kg,'reason',p_reason));
  return round(v_current-p_quantity_kg,3);
end $$;
revoke all on function public.admin_dispose_fertilizer_stock(uuid,numeric,text) from public,anon;
grant execute on function public.admin_dispose_fertilizer_stock(uuid,numeric,text) to authenticated;

create or replace function public.register_fertilizer_application(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_role text; v_id uuid; v_date date; v_operator text; v_item jsonb; v_fert uuid; v_lot uuid; v_field uuid;
  v_amount numeric; v_area numeric; v_balance numeric; v_n numeric; v_p numeric; v_k numeric; v_rate numeric; v_legacy text;
  v_totals jsonb := '{}'::jsonb; v_key text; v_old numeric;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select role,display_name into v_role,v_operator from public.profiles where id=auth.uid();
  if coalesce(v_role,'') not in ('admin','worker') then raise exception '権限がありません'; end if;
  v_date := coalesce(nullif(p_payload->>'application_date','')::date,current_date);
  if jsonb_typeof(p_payload->'lines') <> 'array' or jsonb_array_length(p_payload->'lines')=0 then raise exception '施肥明細を1件以上入力してください'; end if;
  v_legacy := 'FAPP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,4));
  insert into public.fertilizer_applications(legacy_id,application_date,operator_id,operator_name_snapshot,method,weather,note)
  values(v_legacy,v_date,auth.uid(),coalesce(nullif(btrim(p_payload->>'operator_name'),''),v_operator),nullif(btrim(p_payload->>'method'),''),nullif(btrim(p_payload->>'weather'),''),nullif(btrim(p_payload->>'note'),'')) returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_payload->'lines') loop
    v_fert:=nullif(v_item->>'fertilizer_id','')::uuid; v_lot:=nullif(v_item->>'inventory_lot_id','')::uuid; v_field:=nullif(v_item->>'field_id','')::uuid; v_amount:=coalesce(nullif(v_item->>'amount_kg','')::numeric,0);
    if v_amount<=0 then raise exception '施肥量は0kgより大きくしてください'; end if;
    select area_m2 into v_area from public.fields where id=v_field and deleted_at is null and status='active';
    if v_area is null then raise exception '有効な圃場が見つかりません'; end if;
    perform 1 from public.fertilizer_inventory_lots where id=v_lot and fertilizer_id=v_fert for update;
    if not found then raise exception '肥料と在庫ロットが一致しません'; end if;
    v_key:=v_lot::text; v_old:=coalesce((v_totals->>v_key)::numeric,0); v_totals:=jsonb_set(v_totals,array[v_key],to_jsonb(v_old+v_amount));
    select nitrogen_percent,phosphate_percent,potassium_percent into v_n,v_p,v_k from public.fertilizers where id=v_fert and deleted_at is null and is_active;
    if not found then raise exception '有効な肥料マスタが見つかりません'; end if;
    v_rate:=round(v_amount/(v_area/1000.0),3);
    insert into public.fertilizer_application_lines(application_id,fertilizer_id,inventory_lot_id,field_id,field_area_m2_snapshot,amount_kg,rate_kg_per_10a,nitrogen_kg,phosphate_kg,potassium_kg)
    values(v_id,v_fert,v_lot,v_field,v_area,round(v_amount,3),v_rate,round(v_amount*v_n/100,4),round(v_amount*v_p/100,4),round(v_amount*v_k/100,4));
  end loop;
  for v_key in select jsonb_object_keys(v_totals) loop
    select coalesce(balance_kg,0) into v_balance from public.fertilizer_inventory_balances where inventory_lot_id=v_key::uuid;
    v_amount:=(v_totals->>v_key)::numeric;
    if v_amount>v_balance then raise exception '肥料在庫不足です（必要 %kg / 在庫 %kg）',v_amount,v_balance; end if;
    insert into public.fertilizer_inventory_transactions(inventory_lot_id,transaction_type,quantity_kg,reference_type,reference_id,reason,created_by)
    values(v_key::uuid,'APPLICATION',round(v_amount,3),'fertilizer_application',v_id,'施肥',auth.uid());
  end loop;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'CREATE','fertilizer_application',v_id::text,jsonb_build_object('legacy_id',v_legacy,'application_date',v_date,'line_count',jsonb_array_length(p_payload->'lines')));
  return v_id;
end $$;
revoke all on function public.register_fertilizer_application(jsonb) from public,anon;
grant execute on function public.register_fertilizer_application(jsonb) to authenticated;

create or replace function public.delete_fertilizer_application(p_application_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_before jsonb; r record;
begin
  perform public.require_fertilizer_admin_();
  select to_jsonb(a) into v_before from public.fertilizer_applications a where a.id=p_application_id and deleted_at is null for update;
  if v_before is null then raise exception '施肥記録が見つかりません'; end if;
  for r in select inventory_lot_id,sum(amount_kg) qty from public.fertilizer_application_lines where application_id=p_application_id group by inventory_lot_id loop
    perform 1 from public.fertilizer_inventory_lots where id=r.inventory_lot_id for update;
    insert into public.fertilizer_inventory_transactions(inventory_lot_id,transaction_type,quantity_kg,reference_type,reference_id,reason,created_by)
    values(r.inventory_lot_id,'RETURN',r.qty,'fertilizer_application',p_application_id,coalesce(nullif(btrim(p_reason),''),'施肥記録削除による戻入'),auth.uid());
  end loop;
  update public.fertilizer_applications set deleted_at=now(),deleted_by=auth.uid(),delete_reason=nullif(btrim(p_reason),'') where id=p_application_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'DELETE','fertilizer_application',p_application_id::text,v_before,jsonb_build_object('deleted_at',now(),'reason',p_reason));
end $$;
revoke all on function public.delete_fertilizer_application(uuid,text) from public,anon;
grant execute on function public.delete_fertilizer_application(uuid,text) to authenticated;

create or replace function public.admin_save_fertilizer_plan(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_before jsonb; v_after jsonb; v_all boolean; v_field uuid; v_year int; v_month int;
begin
  perform public.require_fertilizer_admin_();
  v_id:=nullif(p_payload->>'id','')::uuid; v_year:=coalesce(nullif(p_payload->>'plan_year','')::int,extract(year from current_date)::int); v_month:=nullif(p_payload->>'month','')::int; v_all:=coalesce((p_payload->>'all_fields')::boolean,false); v_field:=nullif(p_payload->>'field_id','')::uuid;
  if v_month not between 1 and 12 then raise exception '月は1〜12で入力してください'; end if;
  if not v_all and v_field is null then raise exception '対象圃場を選択してください'; end if;
  if v_id is null then
    insert into public.annual_fertilizer_plans(legacy_id,plan_year,month,period,field_id,all_fields,purpose,fertilizer_id,fertilizer_text,planned_rate_kg_per_10a,planned_date,executed_date,status,note)
    values('FPLAN-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,4)),v_year,v_month,nullif(btrim(p_payload->>'period'),''),case when v_all then null else v_field end,v_all,nullif(btrim(p_payload->>'purpose'),''),nullif(p_payload->>'fertilizer_id','')::uuid,nullif(btrim(p_payload->>'fertilizer_text'),''),nullif(p_payload->>'planned_rate_kg_per_10a','')::numeric,nullif(p_payload->>'planned_date','')::date,nullif(p_payload->>'executed_date','')::date,coalesce(nullif(btrim(p_payload->>'status'),''),'planned'),nullif(btrim(p_payload->>'note'),'')) returning id into v_id;
    select to_jsonb(x) into v_after from public.annual_fertilizer_plans x where x.id=v_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data) values(auth.uid(),'CREATE','annual_fertilizer_plan',v_id::text,v_after);
  else
    select to_jsonb(x) into v_before from public.annual_fertilizer_plans x where x.id=v_id for update;
    if v_before is null then raise exception '施肥計画が見つかりません'; end if;
    update public.annual_fertilizer_plans set plan_year=v_year,month=v_month,period=nullif(btrim(p_payload->>'period'),''),field_id=case when v_all then null else v_field end,all_fields=v_all,purpose=nullif(btrim(p_payload->>'purpose'),''),fertilizer_id=nullif(p_payload->>'fertilizer_id','')::uuid,fertilizer_text=nullif(btrim(p_payload->>'fertilizer_text'),''),planned_rate_kg_per_10a=nullif(p_payload->>'planned_rate_kg_per_10a','')::numeric,planned_date=nullif(p_payload->>'planned_date','')::date,executed_date=nullif(p_payload->>'executed_date','')::date,status=coalesce(nullif(btrim(p_payload->>'status'),''),'planned'),note=nullif(btrim(p_payload->>'note'),''),updated_at=now() where id=v_id;
    select to_jsonb(x) into v_after from public.annual_fertilizer_plans x where x.id=v_id;
    insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'UPDATE','annual_fertilizer_plan',v_id::text,v_before,v_after);
  end if;
  return v_id;
end $$;
revoke all on function public.admin_save_fertilizer_plan(jsonb) from public,anon;
grant execute on function public.admin_save_fertilizer_plan(jsonb) to authenticated;

create or replace function public.admin_delete_fertilizer_plan(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_before jsonb;
begin
  perform public.require_fertilizer_admin_();
  select to_jsonb(x) into v_before from public.annual_fertilizer_plans x where x.id=p_id and deleted_at is null for update;
  if v_before is null then raise exception '施肥計画が見つかりません'; end if;
  update public.annual_fertilizer_plans set deleted_at=now(),updated_at=now() where id=p_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'DELETE','annual_fertilizer_plan',p_id::text,v_before,jsonb_build_object('deleted_at',now()));
end $$;
revoke all on function public.admin_delete_fertilizer_plan(uuid) from public,anon;
grant execute on function public.admin_delete_fertilizer_plan(uuid) to authenticated;
