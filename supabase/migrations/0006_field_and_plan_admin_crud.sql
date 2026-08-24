-- Field and annual spray plan admin CRUD.
-- Applied to production on 2026-08-24.

create or replace function public.save_field(p_field_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid(); v_role text; v_id uuid := coalesce(p_field_id,gen_random_uuid());
  v_legacy text := upper(trim(coalesce(payload->>'legacy_id',''))); v_name text := trim(coalesce(payload->>'name',''));
  v_location text := nullif(trim(coalesce(payload->>'location','')),''); v_area numeric := nullif(payload->>'area_m2','')::numeric;
  v_variety text := nullif(trim(coalesce(payload->>'variety','')),''); v_cultivation text := coalesce(nullif(trim(coalesce(payload->>'cultivation_type','')),''),'茶園');
  v_rate numeric := coalesce(nullif(payload->>'standard_spray_l_per_10a','')::numeric,300); v_harvest date := nullif(payload->>'harvest_planned_date','')::date;
  v_status text := coalesce(nullif(payload->>'status',''),'active'); v_note text := nullif(trim(coalesce(payload->>'note','')),''); v_before jsonb;
begin
  if v_user is null then raise exception 'ログインが必要です'; end if;
  select role into v_role from public.profiles where id=v_user;
  if coalesce(v_role,'') <> 'admin' then raise exception '圃場マスタの変更は管理者のみ実行できます'; end if;
  if v_name='' then raise exception '圃場名を入力してください'; end if;
  if v_area is null or v_area<=0 then raise exception '面積(m²)を正しく入力してください'; end if;
  if v_rate<=0 then raise exception '基準散布量を正しく入力してください'; end if;
  if v_status not in ('active','inactive') then raise exception '状態が不正です'; end if;
  if p_field_id is null then
    if v_legacy='' then v_legacy := 'FIELD-'||upper(substr(replace(v_id::text,'-',''),1,6)); end if;
    if exists(select 1 from public.fields where upper(legacy_id)=v_legacy and deleted_at is null) then raise exception '同じ圃場IDがすでに存在します'; end if;
    insert into public.fields(id,legacy_id,name,location,area_m2,variety,cultivation_type,standard_spray_l_per_10a,harvest_planned_date,status,note)
    values(v_id,v_legacy,v_name,v_location,v_area,v_variety,v_cultivation,v_rate,v_harvest,v_status,v_note);
    insert into public.audit_logs(user_id,entity_type,entity_id,action,after_data) values(v_user,'field',v_id::text,'CREATE',jsonb_build_object('legacy_id',v_legacy,'name',v_name,'area_m2',v_area));
  else
    select to_jsonb(f) into v_before from public.fields f where f.id=p_field_id and f.deleted_at is null for update;
    if v_before is null then raise exception '圃場が見つからないか、すでに削除されています'; end if;
    if v_legacy='' then select legacy_id into v_legacy from public.fields where id=p_field_id; end if;
    if exists(select 1 from public.fields where upper(legacy_id)=v_legacy and id<>p_field_id and deleted_at is null) then raise exception '同じ圃場IDがすでに存在します'; end if;
    update public.fields set legacy_id=v_legacy,name=v_name,location=v_location,area_m2=v_area,variety=v_variety,cultivation_type=v_cultivation,standard_spray_l_per_10a=v_rate,harvest_planned_date=v_harvest,status=v_status,note=v_note,updated_at=now() where id=p_field_id;
    insert into public.audit_logs(user_id,entity_type,entity_id,action,before_data,after_data) values(v_user,'field',p_field_id::text,'UPDATE',v_before,jsonb_build_object('legacy_id',v_legacy,'name',v_name,'area_m2',v_area,'status',v_status));
  end if;
  return jsonb_build_object('id',v_id,'legacy_id',v_legacy,'name',v_name);
end$$;

create or replace function public.delete_field(p_field_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_role text; v_before jsonb; v_legacy text;
begin
  if v_user is null then raise exception 'ログインが必要です'; end if; select role into v_role from public.profiles where id=v_user;
  if coalesce(v_role,'')<>'admin' then raise exception '圃場マスタの削除は管理者のみ実行できます'; end if;
  select to_jsonb(f),f.legacy_id into v_before,v_legacy from public.fields f where f.id=p_field_id and f.deleted_at is null for update;
  if v_before is null then raise exception '圃場が見つからないか、すでに削除されています'; end if;
  update public.fields set deleted_at=now(),status='inactive',updated_at=now(),note=concat_ws(E'\n',note,case when nullif(trim(coalesce(p_reason,'')),'') is not null then '削除理由: '||trim(p_reason) end) where id=p_field_id;
  update public.annual_spray_plans set field_id=null,all_fields=true,updated_at=now(),note=concat_ws(E'\n',note,'対象圃場削除により全圃場へ変更') where field_id=p_field_id and deleted_at is null;
  insert into public.audit_logs(user_id,entity_type,entity_id,action,before_data,after_data) values(v_user,'field',p_field_id::text,'DELETE',v_before,jsonb_build_object('legacy_id',v_legacy,'reason',nullif(trim(coalesce(p_reason,'')),'')));
  return jsonb_build_object('id',p_field_id,'legacy_id',v_legacy,'deleted',true);
end$$;

create or replace function public.save_annual_plan(p_plan_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid(); v_role text; v_id uuid:=coalesce(p_plan_id,gen_random_uuid()); v_legacy text:=trim(coalesce(payload->>'legacy_id',''));
  v_year int:=nullif(payload->>'plan_year','')::int; v_month int:=nullif(payload->>'month','')::int; v_period text:=nullif(trim(coalesce(payload->>'period','')),'');
  v_all boolean:=coalesce((payload->>'all_fields')::boolean,true); v_field uuid:=nullif(payload->>'field_id','')::uuid; v_target text:=trim(coalesce(payload->>'target_pest',''));
  v_pid uuid:=nullif(payload->>'recommended_pesticide_id','')::uuid; v_ptext text:=nullif(trim(coalesce(payload->>'recommended_pesticide_text','')),''); v_group text:=nullif(trim(coalesce(payload->>'frac_irac','')),'');
  v_planned date:=nullif(payload->>'planned_date','')::date; v_executed date:=nullif(payload->>'executed_date','')::date; v_status text:=coalesce(nullif(payload->>'status',''),'planned');
  v_note text:=nullif(trim(coalesce(payload->>'note','')),''); v_before jsonb; v_num int;
begin
  if v_user is null then raise exception 'ログインが必要です'; end if; select role into v_role from public.profiles where id=v_user;
  if coalesce(v_role,'')<>'admin' then raise exception '年間計画の変更は管理者のみ実行できます'; end if;
  if v_year is null or v_year<2020 or v_year>2100 then raise exception '年度を正しく入力してください'; end if;
  if v_month is null or v_month<1 or v_month>12 then raise exception '月を正しく入力してください'; end if;
  if v_target='' then raise exception '病害虫/目的を入力してください'; end if;
  if v_status not in ('planned','completed','cancelled') then raise exception '状態が不正です'; end if;
  if not v_all and v_field is null then raise exception '対象圃場を選択してください'; end if;
  if v_field is not null and not exists(select 1 from public.fields where id=v_field and deleted_at is null) then raise exception '対象圃場が見つかりません'; end if;
  if v_pid is not null and not exists(select 1 from public.pesticides where id=v_pid) then raise exception '推奨農薬が見つかりません'; end if;
  if v_executed is not null and v_status='planned' then v_status:='completed'; end if;
  if p_plan_id is null then
    if v_legacy='' then select coalesce(max(nullif(regexp_replace(legacy_id,'\D','','g'),'')::int),0)+1 into v_num from public.annual_spray_plans; v_legacy:='PLAN-'||lpad(v_num::text,3,'0'); end if;
    insert into public.annual_spray_plans(id,legacy_id,plan_year,month,period,field_id,all_fields,target_pest,recommended_pesticide_id,recommended_pesticide_text,frac_irac,planned_date,executed_date,status,note)
    values(v_id,v_legacy,v_year,v_month,v_period,case when v_all then null else v_field end,v_all,v_target,v_pid,v_ptext,v_group,v_planned,v_executed,v_status,v_note);
    insert into public.audit_logs(user_id,entity_type,entity_id,action,after_data) values(v_user,'annual_plan',v_id::text,'CREATE',jsonb_build_object('legacy_id',v_legacy,'year',v_year,'month',v_month,'target',v_target));
  else
    select to_jsonb(p) into v_before from public.annual_spray_plans p where p.id=p_plan_id and p.deleted_at is null for update; if v_before is null then raise exception '年間計画が見つからないか、すでに削除されています'; end if;
    if v_legacy='' then select legacy_id into v_legacy from public.annual_spray_plans where id=p_plan_id; end if;
    update public.annual_spray_plans set legacy_id=v_legacy,plan_year=v_year,month=v_month,period=v_period,field_id=case when v_all then null else v_field end,all_fields=v_all,target_pest=v_target,recommended_pesticide_id=v_pid,recommended_pesticide_text=v_ptext,frac_irac=v_group,planned_date=v_planned,executed_date=v_executed,status=v_status,note=v_note,updated_at=now() where id=p_plan_id;
    insert into public.audit_logs(user_id,entity_type,entity_id,action,before_data,after_data) values(v_user,'annual_plan',p_plan_id::text,'UPDATE',v_before,jsonb_build_object('legacy_id',v_legacy,'year',v_year,'month',v_month,'target',v_target,'status',v_status));
  end if;
  return jsonb_build_object('id',v_id,'legacy_id',v_legacy,'status',v_status);
end$$;

create or replace function public.delete_annual_plan(p_plan_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_role text; v_before jsonb; v_legacy text;
begin
  if v_user is null then raise exception 'ログインが必要です'; end if; select role into v_role from public.profiles where id=v_user;
  if coalesce(v_role,'')<>'admin' then raise exception '年間計画の削除は管理者のみ実行できます'; end if;
  select to_jsonb(p),p.legacy_id into v_before,v_legacy from public.annual_spray_plans p where p.id=p_plan_id and p.deleted_at is null for update;
  if v_before is null then raise exception '年間計画が見つからないか、すでに削除されています'; end if;
  update public.annual_spray_plans set deleted_at=now(),updated_at=now(),note=concat_ws(E'\n',note,case when nullif(trim(coalesce(p_reason,'')),'') is not null then '削除理由: '||trim(p_reason) end) where id=p_plan_id;
  insert into public.audit_logs(user_id,entity_type,entity_id,action,before_data,after_data) values(v_user,'annual_plan',p_plan_id::text,'DELETE',v_before,jsonb_build_object('legacy_id',v_legacy,'reason',nullif(trim(coalesce(p_reason,'')),'')));
  return jsonb_build_object('id',p_plan_id,'legacy_id',v_legacy,'deleted',true);
end$$;

revoke all on function public.save_field(uuid,jsonb) from public,anon;
revoke all on function public.delete_field(uuid,text) from public,anon;
revoke all on function public.save_annual_plan(uuid,jsonb) from public,anon;
revoke all on function public.delete_annual_plan(uuid,text) from public,anon;
grant execute on function public.save_field(uuid,jsonb) to authenticated;
grant execute on function public.delete_field(uuid,text) to authenticated;
grant execute on function public.save_annual_plan(uuid,jsonb) to authenticated;
grant execute on function public.delete_annual_plan(uuid,text) to authenticated;
