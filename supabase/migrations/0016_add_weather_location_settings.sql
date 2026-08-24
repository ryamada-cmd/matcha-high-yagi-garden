alter table public.app_settings
  add column if not exists weather_location_name text,
  add column if not exists weather_latitude numeric(9,6),
  add column if not exists weather_longitude numeric(9,6);

create or replace function public.update_app_settings(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
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
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if coalesce(v_role,'') <> 'admin' then raise exception '管理者のみ設定を変更できます'; end if;

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
