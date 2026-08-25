-- Fertilizer application editing and history support.
-- Applied to production on 2026-08-25.

create or replace function public.update_fertilizer_application(p_application_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_date date;
  v_operator text;
  v_item jsonb;
  v_fert uuid;
  v_lot uuid;
  v_field uuid;
  v_amount numeric;
  v_area numeric;
  v_n numeric;
  v_p numeric;
  v_k numeric;
  v_rate numeric;
  v_key text;
  v_old numeric;
  v_old_totals jsonb := '{}'::jsonb;
  v_new_totals jsonb := '{}'::jsonb;
  v_current numeric;
  v_virtual numeric;
  v_old_qty numeric;
  v_new_qty numeric;
  v_delta numeric;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select role,display_name into v_role,v_operator from public.profiles where id=auth.uid();
  if coalesce(v_role,'') not in ('admin','worker') then raise exception '権限がありません'; end if;

  select jsonb_build_object(
    'application',to_jsonb(a),
    'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.fertilizer_application_lines l where l.application_id=a.id),'[]'::jsonb)
  ) into v_before
  from public.fertilizer_applications a
  where a.id=p_application_id and a.deleted_at is null
  for update;
  if v_before is null then raise exception '施肥記録が見つかりません'; end if;

  if jsonb_typeof(p_payload->'lines') <> 'array' or jsonb_array_length(p_payload->'lines')=0 then raise exception '施肥明細を1件以上入力してください'; end if;
  v_date:=coalesce(nullif(p_payload->>'application_date','')::date,current_date);

  for v_key in select distinct inventory_lot_id::text from public.fertilizer_application_lines where application_id=p_application_id loop
    select coalesce(sum(amount_kg),0) into v_old_qty from public.fertilizer_application_lines where application_id=p_application_id and inventory_lot_id=v_key::uuid;
    v_old_totals:=jsonb_set(v_old_totals,array[v_key],to_jsonb(v_old_qty));
  end loop;

  for v_item in select * from jsonb_array_elements(p_payload->'lines') loop
    v_lot:=nullif(v_item->>'inventory_lot_id','')::uuid;
    if v_lot is not null then
      v_old:=coalesce((v_new_totals->>v_lot::text)::numeric,0);
      v_new_totals:=jsonb_set(v_new_totals,array[v_lot::text],to_jsonb(v_old+coalesce(nullif(v_item->>'amount_kg','')::numeric,0)));
    end if;
  end loop;

  for v_key in select key from (select jsonb_object_keys(v_old_totals) key union select jsonb_object_keys(v_new_totals) key) q loop
    perform 1 from public.fertilizer_inventory_lots where id=v_key::uuid for update;
    if not found then raise exception '在庫ロットが見つかりません'; end if;
    select coalesce(balance_kg,0) into v_current from public.fertilizer_inventory_balances where inventory_lot_id=v_key::uuid;
    v_old_qty:=coalesce((v_old_totals->>v_key)::numeric,0);
    v_new_qty:=coalesce((v_new_totals->>v_key)::numeric,0);
    v_virtual:=v_current+v_old_qty;
    if v_new_qty>v_virtual then raise exception '肥料在庫不足です（必要 %kg / 編集時利用可能 %kg）',v_new_qty,v_virtual; end if;
  end loop;

  delete from public.fertilizer_application_lines where application_id=p_application_id;

  for v_item in select * from jsonb_array_elements(p_payload->'lines') loop
    v_fert:=nullif(v_item->>'fertilizer_id','')::uuid;
    v_lot:=nullif(v_item->>'inventory_lot_id','')::uuid;
    v_field:=nullif(v_item->>'field_id','')::uuid;
    v_amount:=coalesce(nullif(v_item->>'amount_kg','')::numeric,0);
    if v_amount<=0 then raise exception '施肥量は0kgより大きくしてください'; end if;
    select area_m2 into v_area from public.fields where id=v_field and deleted_at is null and status='active';
    if v_area is null then raise exception '有効な圃場が見つかりません'; end if;
    if not exists(select 1 from public.fertilizer_inventory_lots where id=v_lot and fertilizer_id=v_fert) then raise exception '肥料と在庫ロットが一致しません'; end if;
    select nitrogen_percent,phosphate_percent,potassium_percent into v_n,v_p,v_k from public.fertilizers where id=v_fert and deleted_at is null and is_active;
    if not found then raise exception '有効な肥料マスタが見つかりません'; end if;
    v_rate:=round(v_amount/(v_area/1000.0),3);
    insert into public.fertilizer_application_lines(application_id,fertilizer_id,inventory_lot_id,field_id,field_area_m2_snapshot,amount_kg,rate_kg_per_10a,nitrogen_kg,phosphate_kg,potassium_kg)
    values(p_application_id,v_fert,v_lot,v_field,v_area,round(v_amount,3),v_rate,round(v_amount*v_n/100,4),round(v_amount*v_p/100,4),round(v_amount*v_k/100,4));
  end loop;

  for v_key in select key from (select jsonb_object_keys(v_old_totals) key union select jsonb_object_keys(v_new_totals) key) q loop
    v_old_qty:=coalesce((v_old_totals->>v_key)::numeric,0);
    v_new_qty:=coalesce((v_new_totals->>v_key)::numeric,0);
    v_delta:=round(v_new_qty-v_old_qty,3);
    if v_delta>0 then
      insert into public.fertilizer_inventory_transactions(inventory_lot_id,transaction_type,quantity_kg,reference_type,reference_id,reason,created_by)
      values(v_key::uuid,'APPLICATION',v_delta,'fertilizer_application',p_application_id,'施肥記録編集による追加使用',auth.uid());
    elsif v_delta<0 then
      insert into public.fertilizer_inventory_transactions(inventory_lot_id,transaction_type,quantity_kg,reference_type,reference_id,reason,created_by)
      values(v_key::uuid,'RETURN',abs(v_delta),'fertilizer_application',p_application_id,'施肥記録編集による戻入',auth.uid());
    end if;
  end loop;

  update public.fertilizer_applications
  set application_date=v_date,
      operator_name_snapshot=coalesce(nullif(btrim(p_payload->>'operator_name'),''),v_operator),
      method=nullif(btrim(p_payload->>'method'),''),
      weather=nullif(btrim(p_payload->>'weather'),''),
      note=nullif(btrim(p_payload->>'note'),''),
      updated_at=now()
  where id=p_application_id;

  select jsonb_build_object(
    'application',to_jsonb(a),
    'lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.fertilizer_application_lines l where l.application_id=a.id),'[]'::jsonb)
  ) into v_after
  from public.fertilizer_applications a where a.id=p_application_id;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'UPDATE','fertilizer_application',p_application_id::text,v_before,v_after);
  return p_application_id;
end $$;

revoke all on function public.update_fertilizer_application(uuid,jsonb) from public,anon;
grant execute on function public.update_fertilizer_application(uuid,jsonb) to authenticated;

create index if not exists idx_fertilizer_applications_date on public.fertilizer_applications(application_date desc) where deleted_at is null;
create index if not exists idx_fertilizer_application_lines_field on public.fertilizer_application_lines(field_id);
create index if not exists idx_fertilizer_application_lines_fertilizer on public.fertilizer_application_lines(fertilizer_id);
