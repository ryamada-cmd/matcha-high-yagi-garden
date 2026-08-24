create or replace function public.register_spray_batch(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_batch uuid := gen_random_uuid();
  v_legacy text := 'MIX-' || upper(substr(replace(v_batch::text, '-', ''), 1, 8));
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
  if coalesce(v_role,'') not in ('admin','worker') then raise exception '散布登録権限がありません'; end if;

  v_spray_date := nullif(payload->>'spray_date','')::date;
  v_prepared := nullif(payload->>'prepared_volume_l','')::numeric;
  v_target := nullif(payload->>'target','');
  v_weather := nullif(payload->>'weather','');
  v_temp := nullif(payload->>'temperature_c','')::numeric;
  v_operator := coalesce(nullif(payload->>'operator_name',''), (select display_name from public.profiles where id=v_user));
  v_note := nullif(payload->>'note','');
  v_precheck := coalesce((payload->>'pre_harvest_checked')::boolean,false);
  v_countcheck := coalesce((payload->>'application_count_checked')::boolean,false);
  v_mixcheck := coalesce((payload->>'tank_mix_checked')::boolean,false);

  if v_spray_date is null then raise exception '散布日を入力してください'; end if;
  if v_prepared is null or v_prepared <= 0 then raise exception '調製量を入力してください'; end if;
  if jsonb_typeof(payload->'chemicals') <> 'array' or jsonb_array_length(payload->'chemicals') = 0 then raise exception '農薬を1つ以上選択してください'; end if;
  if jsonb_typeof(payload->'fields') <> 'array' or jsonb_array_length(payload->'fields') = 0 then raise exception '圃場を1つ以上選択してください'; end if;
  if not v_precheck then raise exception '収穫前日数の確認が必要です'; end if;
  if not v_countcheck then raise exception '使用回数の確認が必要です'; end if;
  if jsonb_array_length(payload->'chemicals') > 1 and not v_mixcheck then raise exception '混用時はラベル・メーカー・公式登録情報の確認が必要です'; end if;

  if (select count(*) from (select x->>'pesticide_id' k from jsonb_array_elements(payload->'chemicals') x group by 1 having count(*)>1) q) > 0 then
    raise exception '同じ農薬を重複して追加できません';
  end if;

  perform 1 from public.inventory_lots l
  where l.id in (select (x->>'inventory_lot_id')::uuid from jsonb_array_elements(payload->'chemicals') x)
  order by l.id for update;

  for v_chem in select * from jsonb_array_elements(payload->'chemicals') loop
    v_pid := (v_chem->>'pesticide_id')::uuid;
    v_lot := (v_chem->>'inventory_lot_id')::uuid;
    v_dilution := nullif(v_chem->>'dilution','')::numeric;
    if v_dilution is null or v_dilution <= 0 then raise exception '希釈倍率が不正です'; end if;

    select pesticide_id, content_unit into v_lot_pid, v_unit from public.inventory_lots where id=v_lot;
    if v_lot_pid is null then raise exception '在庫ロットが見つかりません'; end if;
    if v_lot_pid <> v_pid then raise exception '農薬と在庫ロットの組み合わせが不正です'; end if;
    if coalesce(v_unit,'') not in ('ml','g') then raise exception 'ロットの内容量単位が未設定です'; end if;

    v_qty := round(v_prepared * 1000 / v_dilution, 3);
    select coalesce(sum(case
      when transaction_type in ('PURCHASE','RETURN') then quantity
      when transaction_type in ('SPRAY','DISPOSAL') then -quantity
      when transaction_type='ADJUSTMENT' then quantity
      else 0 end),0)
    into v_balance from public.inventory_transactions where inventory_lot_id=v_lot;
    if v_balance < v_qty then
      raise exception '在庫不足です（必要 % %, 在庫 % %）', v_qty, v_unit, v_balance, v_unit;
    end if;
  end loop;

  v_field_count := jsonb_array_length(payload->'fields');
  for v_field in select * from jsonb_array_elements(payload->'fields') loop
    v_field_id := (case when jsonb_typeof(v_field)='string' then trim(both '"' from v_field::text) else v_field->>'field_id' end)::uuid;
    select area_m2, standard_spray_l_per_10a into v_area, v_rate from public.fields where id=v_field_id and deleted_at is null and status='active';
    if v_area is null then raise exception '圃場が見つからないか無効です'; end if;
    v_total_standard := v_total_standard + (v_area / 1000 * v_rate);
  end loop;
  if v_total_standard <= 0 then raise exception '圃場の標準散布量が不正です'; end if;

  insert into public.spray_batches(id,legacy_id,spray_date,prepared_volume_l,target,weather,temperature_c,operator_id,operator_name_snapshot,allocation_method,pre_harvest_checked,application_count_checked,tank_mix_checked,note)
  values(v_batch,v_legacy,v_spray_date,v_prepared,v_target,v_weather,v_temp,v_user,v_operator,'proportional',v_precheck,v_countcheck,v_mixcheck,v_note);

  for v_chem in select * from jsonb_array_elements(payload->'chemicals') loop
    v_pid := (v_chem->>'pesticide_id')::uuid;
    v_lot := (v_chem->>'inventory_lot_id')::uuid;
    v_dilution := (v_chem->>'dilution')::numeric;
    select content_unit into v_unit from public.inventory_lots where id=v_lot;
    v_qty := round(v_prepared * 1000 / v_dilution, 3);
    insert into public.spray_batch_chemicals(spray_batch_id,pesticide_id,inventory_lot_id,dilution,chemical_qty,chemical_unit)
    values(v_batch,v_pid,v_lot,v_dilution,v_qty,v_unit);
    insert into public.inventory_transactions(inventory_lot_id,transaction_type,quantity,unit,reference_type,reference_id,reason,created_by)
    values(v_lot,'SPRAY',v_qty,v_unit,'spray_batch',v_batch,v_legacy || ' 散布登録',v_user);
  end loop;

  v_i := 0;
  v_allocated := 0;
  for v_field in select * from jsonb_array_elements(payload->'fields') loop
    v_i := v_i + 1;
    v_field_id := (case when jsonb_typeof(v_field)='string' then trim(both '"' from v_field::text) else v_field->>'field_id' end)::uuid;
    select area_m2, standard_spray_l_per_10a into v_area, v_rate from public.fields where id=v_field_id;
    v_standard := v_area / 1000 * v_rate;
    if v_i = v_field_count then
      v_actual := v_prepared - v_allocated;
    else
      v_actual := round(v_prepared * v_standard / v_total_standard, 1);
      v_allocated := v_allocated + v_actual;
    end if;
    insert into public.spray_batch_fields(spray_batch_id,field_id,field_area_m2_snapshot,standard_volume_l,actual_spray_volume_l)
    values(v_batch,v_field_id,v_area,round(v_standard,2),round(v_actual,1));
  end loop;

  insert into public.audit_logs(user_id,entity_type,entity_id,action,after_data)
  values(v_user,'spray_batch',v_batch::text,'CREATE',jsonb_build_object('legacy_id',v_legacy,'prepared_volume_l',v_prepared,'spray_date',v_spray_date));

  return jsonb_build_object('id',v_batch,'legacy_id',v_legacy,'prepared_volume_l',v_prepared);
end;
$$;

revoke all on function public.register_spray_batch(jsonb) from public, anon;
grant execute on function public.register_spray_batch(jsonb) to authenticated;
