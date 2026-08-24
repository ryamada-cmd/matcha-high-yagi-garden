create or replace function public.update_spray_batch(p_batch_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_batch public.spray_batches%rowtype;
  v_before jsonb;
  v_spray_date date;
  v_prepared numeric;
  v_target text;
  v_weather text;
  v_temp numeric;
  v_operator text;
  v_note text;
  v_precheck boolean;
  v_countcheck boolean;
  v_mixcheck boolean;
  v_chem jsonb;
  v_field jsonb;
  v_pid uuid;
  v_lot uuid;
  v_dilution numeric;
  v_qty numeric;
  v_unit text;
  v_lot_pid uuid;
  v_balance numeric;
  v_old_qty numeric;
  v_new_qty numeric;
  v_delta numeric;
  v_old_map jsonb := '{}'::jsonb;
  v_new_map jsonb := '{}'::jsonb;
  v_lot_key text;
  v_field_id uuid;
  v_area numeric;
  v_rate numeric;
  v_standard numeric;
  v_total_standard numeric := 0;
  v_actual numeric;
  v_allocated numeric := 0;
  v_field_count int;
  v_i int := 0;
begin
  if v_user is null then raise exception 'ログインが必要です'; end if;
  select role into v_role from public.profiles where id=v_user;
  if coalesce(v_role,'') not in ('admin','worker') then raise exception '散布編集権限がありません'; end if;

  select * into v_batch from public.spray_batches where id=p_batch_id and deleted_at is null for update;
  if not found then raise exception '散布記録が見つからないか、すでに削除されています'; end if;
  if not exists(select 1 from public.spray_batch_chemicals where spray_batch_id=p_batch_id) then raise exception '農薬明細がないため、安全に在庫を戻せません'; end if;

  select jsonb_build_object(
    'batch',to_jsonb(b),
    'chemicals',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.spray_batch_chemicals c where c.spray_batch_id=b.id),'[]'::jsonb),
    'fields',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.spray_batch_fields f where f.spray_batch_id=b.id),'[]'::jsonb)
  ) into v_before from public.spray_batches b where b.id=p_batch_id;

  select coalesce(jsonb_object_agg(inventory_lot_id::text,qty),'{}'::jsonb) into v_old_map
  from (select inventory_lot_id,sum(chemical_qty)::numeric qty from public.spray_batch_chemicals where spray_batch_id=p_batch_id group by inventory_lot_id) s;

  v_spray_date := nullif(payload->>'spray_date','')::date;
  v_prepared := nullif(payload->>'prepared_volume_l','')::numeric;
  v_target := nullif(payload->>'target','');
  v_weather := nullif(payload->>'weather','');
  v_temp := nullif(payload->>'temperature_c','')::numeric;
  v_operator := coalesce(nullif(payload->>'operator_name',''),(select display_name from public.profiles where id=v_user));
  v_note := nullif(payload->>'note','');
  v_precheck := coalesce((payload->>'pre_harvest_checked')::boolean,false);
  v_countcheck := coalesce((payload->>'application_count_checked')::boolean,false);
  v_mixcheck := coalesce((payload->>'tank_mix_checked')::boolean,false);

  if v_spray_date is null then raise exception '散布日を入力してください'; end if;
  if v_prepared is null or v_prepared <= 0 then raise exception '調製量を入力してください'; end if;
  if jsonb_typeof(payload->'chemicals') <> 'array' or jsonb_array_length(payload->'chemicals')=0 then raise exception '農薬を1つ以上選択してください'; end if;
  if jsonb_typeof(payload->'fields') <> 'array' or jsonb_array_length(payload->'fields')=0 then raise exception '圃場を1つ以上選択してください'; end if;
  if not v_precheck then raise exception '収穫前日数の確認が必要です'; end if;
  if not v_countcheck then raise exception '使用回数の確認が必要です'; end if;
  if jsonb_array_length(payload->'chemicals') > 1 and not v_mixcheck then raise exception '混用時はラベル・メーカー・公式登録情報の確認が必要です'; end if;
  if (select count(*) from (select x->>'pesticide_id' k from jsonb_array_elements(payload->'chemicals') x group by 1 having count(*)>1) q)>0 then raise exception '同じ農薬を重複して追加できません'; end if;

  perform 1 from public.inventory_lots l where l.id in (
    select key::uuid from jsonb_object_keys(v_old_map) key
    union
    select (x->>'inventory_lot_id')::uuid from jsonb_array_elements(payload->'chemicals') x
  ) order by l.id for update;

  for v_chem in select * from jsonb_array_elements(payload->'chemicals') loop
    v_pid := (v_chem->>'pesticide_id')::uuid;
    v_lot := (v_chem->>'inventory_lot_id')::uuid;
    v_dilution := nullif(v_chem->>'dilution','')::numeric;
    if v_dilution is null or v_dilution <= 0 then raise exception '希釈倍率が不正です'; end if;
    select pesticide_id,content_unit into v_lot_pid,v_unit from public.inventory_lots where id=v_lot;
    if v_lot_pid is null then raise exception '在庫ロットが見つかりません'; end if;
    if v_lot_pid <> v_pid then raise exception '農薬と在庫ロットの組み合わせが不正です'; end if;
    if coalesce(v_unit,'') not in ('ml','g') then raise exception 'ロットの内容量単位が未設定です'; end if;
    v_qty := round(v_prepared*1000/v_dilution,3);
    v_new_map := jsonb_set(v_new_map,array[v_lot::text],to_jsonb(v_qty),true);
  end loop;

  for v_lot_key in select distinct key from (select jsonb_object_keys(v_new_map) key union all select jsonb_object_keys(v_old_map) key) q loop
    v_lot := v_lot_key::uuid;
    v_old_qty := coalesce((v_old_map->>v_lot_key)::numeric,0);
    v_new_qty := coalesce((v_new_map->>v_lot_key)::numeric,0);
    select coalesce(sum(case when transaction_type in ('PURCHASE','RETURN') then quantity when transaction_type in ('SPRAY','DISPOSAL') then -quantity when transaction_type='ADJUSTMENT' then quantity else 0 end),0)
      into v_balance from public.inventory_transactions where inventory_lot_id=v_lot;
    if v_balance + v_old_qty < v_new_qty then
      select content_unit into v_unit from public.inventory_lots where id=v_lot;
      raise exception '在庫不足です（編集戻し込み利用可能 % %, 必要 % %）',v_balance+v_old_qty,v_unit,v_new_qty,v_unit;
    end if;
  end loop;

  v_field_count := jsonb_array_length(payload->'fields');
  for v_field in select * from jsonb_array_elements(payload->'fields') loop
    v_field_id := (case when jsonb_typeof(v_field)='string' then trim(both '"' from v_field::text) else v_field->>'field_id' end)::uuid;
    select area_m2,standard_spray_l_per_10a into v_area,v_rate from public.fields where id=v_field_id and deleted_at is null and status='active';
    if v_area is null then raise exception '圃場が見つからないか無効です'; end if;
    v_total_standard := v_total_standard + (v_area/1000*v_rate);
  end loop;
  if v_total_standard <= 0 then raise exception '圃場の標準散布量が不正です'; end if;

  for v_lot_key in select distinct key from (select jsonb_object_keys(v_new_map) key union all select jsonb_object_keys(v_old_map) key) q loop
    v_lot := v_lot_key::uuid;
    v_old_qty := coalesce((v_old_map->>v_lot_key)::numeric,0);
    v_new_qty := coalesce((v_new_map->>v_lot_key)::numeric,0);
    v_delta := round(v_new_qty-v_old_qty,3);
    select content_unit into v_unit from public.inventory_lots where id=v_lot;
    if v_delta > 0 then
      insert into public.inventory_transactions(inventory_lot_id,transaction_type,quantity,unit,reference_type,reference_id,reason,created_by)
      values(v_lot,'SPRAY',v_delta,v_unit,'spray_batch',p_batch_id,v_batch.legacy_id||' 散布編集による差分出庫',v_user);
    elsif v_delta < 0 then
      insert into public.inventory_transactions(inventory_lot_id,transaction_type,quantity,unit,reference_type,reference_id,reason,created_by)
      values(v_lot,'RETURN',abs(v_delta),v_unit,'spray_batch',p_batch_id,v_batch.legacy_id||' 散布編集による差分戻入',v_user);
    end if;
  end loop;

  update public.spray_batches set spray_date=v_spray_date,prepared_volume_l=v_prepared,target=v_target,weather=v_weather,temperature_c=v_temp,operator_id=v_user,operator_name_snapshot=v_operator,allocation_method='proportional',pre_harvest_checked=v_precheck,application_count_checked=v_countcheck,tank_mix_checked=v_mixcheck,note=v_note,updated_at=now() where id=p_batch_id;

  delete from public.spray_batch_chemicals where spray_batch_id=p_batch_id;
  for v_chem in select * from jsonb_array_elements(payload->'chemicals') loop
    v_pid := (v_chem->>'pesticide_id')::uuid;
    v_lot := (v_chem->>'inventory_lot_id')::uuid;
    v_dilution := (v_chem->>'dilution')::numeric;
    select content_unit into v_unit from public.inventory_lots where id=v_lot;
    v_qty := round(v_prepared*1000/v_dilution,3);
    insert into public.spray_batch_chemicals(spray_batch_id,pesticide_id,inventory_lot_id,dilution,chemical_qty,chemical_unit) values(p_batch_id,v_pid,v_lot,v_dilution,v_qty,v_unit);
  end loop;

  delete from public.spray_batch_fields where spray_batch_id=p_batch_id;
  v_i := 0; v_allocated := 0;
  for v_field in select * from jsonb_array_elements(payload->'fields') loop
    v_i := v_i+1;
    v_field_id := (case when jsonb_typeof(v_field)='string' then trim(both '"' from v_field::text) else v_field->>'field_id' end)::uuid;
    select area_m2,standard_spray_l_per_10a into v_area,v_rate from public.fields where id=v_field_id;
    v_standard := v_area/1000*v_rate;
    if v_i=v_field_count then v_actual := v_prepared-v_allocated; else v_actual := round(v_prepared*v_standard/v_total_standard,1); v_allocated := v_allocated+v_actual; end if;
    insert into public.spray_batch_fields(spray_batch_id,field_id,field_area_m2_snapshot,standard_volume_l,actual_spray_volume_l) values(p_batch_id,v_field_id,v_area,round(v_standard,2),round(v_actual,1));
  end loop;

  insert into public.audit_logs(user_id,entity_type,entity_id,action,before_data,after_data)
  values(v_user,'spray_batch',p_batch_id::text,'UPDATE',v_before,jsonb_build_object('legacy_id',v_batch.legacy_id,'spray_date',v_spray_date,'prepared_volume_l',v_prepared,'chemicals',payload->'chemicals','fields',payload->'fields'));
  return jsonb_build_object('id',p_batch_id,'legacy_id',v_batch.legacy_id,'prepared_volume_l',v_prepared);
end;
$$;

revoke all on function public.update_spray_batch(uuid,jsonb) from public,anon;
grant execute on function public.update_spray_batch(uuid,jsonb) to authenticated;

create or replace function public.delete_spray_batch(p_batch_id uuid,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_batch public.spray_batches%rowtype;
  v_before jsonb;
  r record;
begin
  if v_user is null then raise exception 'ログインが必要です'; end if;
  select role into v_role from public.profiles where id=v_user;
  if coalesce(v_role,'') <> 'admin' then raise exception '散布記録の削除は管理者のみ実行できます'; end if;
  select * into v_batch from public.spray_batches where id=p_batch_id and deleted_at is null for update;
  if not found then raise exception '散布記録が見つからないか、すでに削除されています'; end if;
  if not exists(select 1 from public.spray_batch_chemicals where spray_batch_id=p_batch_id) then raise exception '農薬明細がないため、安全に在庫を戻せません'; end if;

  select jsonb_build_object('batch',to_jsonb(b),'chemicals',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.spray_batch_chemicals c where c.spray_batch_id=b.id),'[]'::jsonb),'fields',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.spray_batch_fields f where f.spray_batch_id=b.id),'[]'::jsonb)) into v_before from public.spray_batches b where b.id=p_batch_id;

  perform 1 from public.inventory_lots l where l.id in (select distinct inventory_lot_id from public.spray_batch_chemicals where spray_batch_id=p_batch_id) order by l.id for update;
  for r in select c.inventory_lot_id,sum(c.chemical_qty)::numeric qty,max(c.chemical_unit) unit from public.spray_batch_chemicals c where c.spray_batch_id=p_batch_id group by c.inventory_lot_id loop
    insert into public.inventory_transactions(inventory_lot_id,transaction_type,quantity,unit,reference_type,reference_id,reason,created_by)
    values(r.inventory_lot_id,'RETURN',r.qty,r.unit,'spray_batch',p_batch_id,v_batch.legacy_id||' 散布記録削除による在庫戻入'||case when nullif(trim(coalesce(p_reason,'')),'') is not null then ' / '||trim(p_reason) else '' end,v_user);
  end loop;

  update public.spray_batches set deleted_at=now(),deleted_by=v_user,delete_reason=nullif(trim(coalesce(p_reason,'')),''),updated_at=now() where id=p_batch_id;
  insert into public.audit_logs(user_id,entity_type,entity_id,action,before_data,after_data)
  values(v_user,'spray_batch',p_batch_id::text,'DELETE',v_before,jsonb_build_object('legacy_id',v_batch.legacy_id,'deleted_at',now(),'delete_reason',nullif(trim(coalesce(p_reason,'')),'')));
  return jsonb_build_object('id',p_batch_id,'legacy_id',v_batch.legacy_id,'deleted',true);
end;
$$;

revoke all on function public.delete_spray_batch(uuid,text) from public,anon;
grant execute on function public.delete_spray_batch(uuid,text) to authenticated;
