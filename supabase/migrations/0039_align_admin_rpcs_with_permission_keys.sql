-- Align the remaining administration RPC guards with the permission matrix.
-- These permissions are currently locked to administrators, so behavior stays the
-- same while the database now uses the same item-level permission vocabulary as UI.

create or replace function public.get_admin_console_data(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,100), 500));
  v_settings jsonb;
  v_users jsonb;
  v_logs jsonb;
begin
  perform public.require_app_permission_('settings.view');

  select to_jsonb(s) into v_settings from public.app_settings s where s.id = 1;

  select coalesce(jsonb_agg(x order by x.created_at), '[]'::jsonb)
  into v_users
  from (
    select p.id, p.display_name, p.role, p.created_at, u.email
    from public.profiles p
    left join auth.users u on u.id = p.id
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_logs
  from (
    select a.id, a.user_id, p.display_name as user_name, u.email as user_email,
           a.action, a.entity_type, a.entity_id, a.before_data, a.after_data, a.created_at
    from public.audit_logs a
    left join public.profiles p on p.id = a.user_id
    left join auth.users u on u.id = a.user_id
    order by a.created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object('settings', v_settings, 'users', v_users, 'audit_logs', v_logs);
end;
$function$;

create or replace function public.update_app_settings(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_before public.app_settings%rowtype;
  v_after public.app_settings%rowtype;
  v_low numeric;
  v_expiry integer;
  v_plan integer;
  v_harvest integer;
  v_weather_name text;
  v_weather_lat numeric;
  v_weather_lon numeric;
begin
  perform public.require_app_permission_('settings.manage');

  select * into v_before from public.app_settings where id = 1 for update;

  v_low := coalesce(nullif(p_payload->>'low_stock_threshold_percent','')::numeric, v_before.low_stock_threshold_percent);
  v_expiry := coalesce(nullif(p_payload->>'expiry_warning_days','')::integer, v_before.expiry_warning_days);
  v_plan := coalesce(nullif(p_payload->>'upcoming_plan_warning_days','')::integer, v_before.upcoming_plan_warning_days);
  v_harvest := coalesce(nullif(p_payload->>'upcoming_harvest_warning_days','')::integer, v_before.upcoming_harvest_warning_days);
  v_weather_name := case when p_payload ? 'weather_location_name' then nullif(trim(p_payload->>'weather_location_name'),'') else v_before.weather_location_name end;
  v_weather_lat := case when p_payload ? 'weather_latitude' then nullif(p_payload->>'weather_latitude','')::numeric else v_before.weather_latitude end;
  v_weather_lon := case when p_payload ? 'weather_longitude' then nullif(p_payload->>'weather_longitude','')::numeric else v_before.weather_longitude end;

  if v_low < 0 or v_low > 100 then raise exception '在庫警告率は0〜100%%で入力してください'; end if;
  if v_expiry < 0 or v_expiry > 3650 then raise exception '使用期限警告日は0〜3650日で入力してください'; end if;
  if v_plan < 0 or v_plan > 365 then raise exception '予定警告日は0〜365日で入力してください'; end if;
  if v_harvest < 0 or v_harvest > 365 then raise exception '摘採予定警告日は0〜365日で入力してください'; end if;
  if (v_weather_lat is null) <> (v_weather_lon is null) then raise exception '天気地点の緯度・経度は両方設定してください'; end if;
  if v_weather_lat is not null and (v_weather_lat < -90 or v_weather_lat > 90) then raise exception '緯度が範囲外です'; end if;
  if v_weather_lon is not null and (v_weather_lon < -180 or v_weather_lon > 180) then raise exception '経度が範囲外です'; end if;

  update public.app_settings
  set low_stock_threshold_percent = v_low,
      expiry_warning_days = v_expiry,
      upcoming_plan_warning_days = v_plan,
      upcoming_harvest_warning_days = v_harvest,
      weather_location_name = v_weather_name,
      weather_latitude = v_weather_lat,
      weather_longitude = v_weather_lon,
      updated_by = auth.uid(),
      updated_at = now()
  where id = 1
  returning * into v_after;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, before_data, after_data)
  values(auth.uid(), 'UPDATE', 'app_settings', '1', to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$function$;

create or replace function public.update_profile_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_before public.profiles%rowtype;
  v_after public.profiles%rowtype;
  v_admin_count integer;
begin
  perform public.require_app_permission_('users.manage');

  if p_role not in ('admin','worker') then raise exception '権限はadminまたはworkerのみ指定できます'; end if;

  select * into v_before from public.profiles where id = p_user_id for update;
  if not found then raise exception '対象ユーザーが見つかりません'; end if;

  if v_before.role = 'admin' and p_role = 'worker' then
    select count(*) into v_admin_count from public.profiles where role = 'admin';
    if v_admin_count <= 1 then raise exception '最後の管理者は作業者へ変更できません'; end if;
  end if;

  update public.profiles set role = p_role where id = p_user_id returning * into v_after;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, before_data, after_data)
  values(auth.uid(), 'UPDATE', 'profile_role', p_user_id::text, to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$function$;

create or replace function public.get_role_permission_matrix()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_result jsonb;
begin
  perform public.require_app_permission_('permissions.manage');

  select jsonb_build_object('definitions',coalesce(jsonb_agg(jsonb_build_object(
    'permission_key',d.permission_key,'feature_key',d.feature_key,'feature_label',d.feature_label,
    'item_label',d.item_label,'description',d.description,'sort_order',d.sort_order,'locked',d.locked,
    'admin_allowed',coalesce(a.allowed,false),'worker_allowed',coalesce(w.allowed,false)
  ) order by d.sort_order),'[]'::jsonb)) into v_result
  from public.app_permission_definitions d
  left join public.role_permissions a on a.permission_key=d.permission_key and a.app_role='admin'
  left join public.role_permissions w on w.permission_key=d.permission_key and w.app_role='worker';
  return v_result;
end;
$function$;

create or replace function public.update_role_permissions(p_role text, p_permissions jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_before jsonb; v_after jsonb; v_key text; v_value jsonb;
begin
  perform public.require_app_permission_('permissions.manage');

  if p_role not in ('admin','worker') then raise exception '対象役割が不正です'; end if;
  if jsonb_typeof(p_permissions)<>'object' then raise exception '権限設定の形式が不正です'; end if;
  select coalesce(jsonb_object_agg(permission_key,allowed),'{}'::jsonb) into v_before from public.role_permissions where app_role=p_role;
  for v_key,v_value in select key,value from jsonb_each(p_permissions) loop
    if jsonb_typeof(v_value)<>'boolean' then raise exception '許可・不許可は真偽値で指定してください'; end if;
    if not exists(select 1 from public.app_permission_definitions d where d.permission_key=v_key) then raise exception '不明な権限項目です（%）',v_key; end if;
    if exists(select 1 from public.app_permission_definitions d where d.permission_key=v_key and d.locked) then continue; end if;
    update public.role_permissions set allowed=(v_value::text)::boolean,updated_by=auth.uid(),updated_at=now()
    where app_role=p_role and permission_key=v_key;
  end loop;
  update public.role_permissions rp set allowed=(rp.app_role='admin'),updated_by=auth.uid(),updated_at=now()
  from public.app_permission_definitions d where d.permission_key=rp.permission_key and d.locked;
  select coalesce(jsonb_object_agg(permission_key,allowed),'{}'::jsonb) into v_after from public.role_permissions where app_role=p_role;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'UPDATE','role_permissions',p_role,v_before,v_after);
  return v_after;
end;
$function$;
