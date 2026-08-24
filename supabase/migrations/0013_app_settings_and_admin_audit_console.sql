create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  low_stock_threshold_percent numeric(5,2) not null default 20 check (low_stock_threshold_percent >= 0 and low_stock_threshold_percent <= 100),
  expiry_warning_days integer not null default 90 check (expiry_warning_days >= 0 and expiry_warning_days <= 3650),
  upcoming_plan_warning_days integer not null default 14 check (upcoming_plan_warning_days >= 0 and upcoming_plan_warning_days <= 365),
  upcoming_harvest_warning_days integer not null default 30 check (upcoming_harvest_warning_days >= 0 and upcoming_harvest_warning_days <= 365),
  updated_by uuid null references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon, authenticated;

create or replace function public.get_app_settings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_settings public.app_settings%rowtype;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select * into v_settings from public.app_settings where id = 1;
  return to_jsonb(v_settings);
end;
$$;
revoke all on function public.get_app_settings() from public, anon;
grant execute on function public.get_app_settings() to authenticated;

create or replace function public.update_app_settings(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_before public.app_settings%rowtype;
  v_after public.app_settings%rowtype;
  v_low numeric;
  v_expiry integer;
  v_plan integer;
  v_harvest integer;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if coalesce(v_role,'') <> 'admin' then raise exception '管理者のみ設定を変更できます'; end if;
  select * into v_before from public.app_settings where id = 1 for update;
  v_low := coalesce(nullif(p_payload->>'low_stock_threshold_percent','')::numeric, v_before.low_stock_threshold_percent);
  v_expiry := coalesce(nullif(p_payload->>'expiry_warning_days','')::integer, v_before.expiry_warning_days);
  v_plan := coalesce(nullif(p_payload->>'upcoming_plan_warning_days','')::integer, v_before.upcoming_plan_warning_days);
  v_harvest := coalesce(nullif(p_payload->>'upcoming_harvest_warning_days','')::integer, v_before.upcoming_harvest_warning_days);
  if v_low < 0 or v_low > 100 then raise exception '在庫警告率は0〜100%%で入力してください'; end if;
  if v_expiry < 0 or v_expiry > 3650 then raise exception '使用期限警告日は0〜3650日で入力してください'; end if;
  if v_plan < 0 or v_plan > 365 then raise exception '予定警告日は0〜365日で入力してください'; end if;
  if v_harvest < 0 or v_harvest > 365 then raise exception '摘採予定警告日は0〜365日で入力してください'; end if;
  update public.app_settings
  set low_stock_threshold_percent = v_low,
      expiry_warning_days = v_expiry,
      upcoming_plan_warning_days = v_plan,
      upcoming_harvest_warning_days = v_harvest,
      updated_by = auth.uid(),
      updated_at = now()
  where id = 1 returning * into v_after;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, before_data, after_data)
  values(auth.uid(), 'UPDATE', 'app_settings', '1', to_jsonb(v_before), to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;
revoke all on function public.update_app_settings(jsonb) from public, anon;
grant execute on function public.update_app_settings(jsonb) to authenticated;

create or replace function public.get_admin_console_data(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_limit integer := greatest(1, least(coalesce(p_limit,100), 500));
  v_settings jsonb;
  v_users jsonb;
  v_logs jsonb;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if coalesce(v_role,'') <> 'admin' then raise exception '管理者のみ閲覧できます'; end if;
  select to_jsonb(s) into v_settings from public.app_settings s where s.id = 1;
  select coalesce(jsonb_agg(x order by x.created_at), '[]'::jsonb) into v_users
  from (select p.id,p.display_name,p.role,p.created_at,u.email from public.profiles p left join auth.users u on u.id=p.id) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_logs
  from (
    select a.id,a.user_id,p.display_name as user_name,u.email as user_email,a.action,a.entity_type,a.entity_id,a.before_data,a.after_data,a.created_at
    from public.audit_logs a
    left join public.profiles p on p.id=a.user_id
    left join auth.users u on u.id=a.user_id
    order by a.created_at desc limit v_limit
  ) x;
  return jsonb_build_object('settings',v_settings,'users',v_users,'audit_logs',v_logs);
end;
$$;
revoke all on function public.get_admin_console_data(integer) from public, anon;
grant execute on function public.get_admin_console_data(integer) to authenticated;

create or replace function public.update_profile_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_before public.profiles%rowtype;
  v_after public.profiles%rowtype;
  v_admin_count integer;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select role into v_actor_role from public.profiles where id=auth.uid();
  if coalesce(v_actor_role,'') <> 'admin' then raise exception '管理者のみ権限を変更できます'; end if;
  if p_role not in ('admin','worker') then raise exception '権限はadminまたはworkerのみ指定できます'; end if;
  select * into v_before from public.profiles where id=p_user_id for update;
  if not found then raise exception '対象ユーザーが見つかりません'; end if;
  if v_before.role='admin' and p_role='worker' then
    select count(*) into v_admin_count from public.profiles where role='admin';
    if v_admin_count <= 1 then raise exception '最後の管理者は作業者へ変更できません'; end if;
  end if;
  update public.profiles set role=p_role where id=p_user_id returning * into v_after;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'UPDATE','profile_role',p_user_id::text,to_jsonb(v_before),to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;
revoke all on function public.update_profile_role(uuid,text) from public, anon;
grant execute on function public.update_profile_role(uuid,text) to authenticated;