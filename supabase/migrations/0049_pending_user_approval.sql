-- 0049_pending_user_approval.sql
-- New self-registered users start without operational permissions until an admin approves them.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  initial_role text;
begin
  select case when exists(select 1 from public.profiles) then 'viewer' else 'admin' end
    into initial_role;

  insert into public.profiles(id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,''),'@',1)),
    initial_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.update_profile_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_before public.profiles%rowtype;
  v_after public.profiles%rowtype;
  v_admin_count integer;
begin
  perform public.require_app_permission_('users.manage');

  if p_role not in ('admin','worker','viewer') then
    raise exception '役割はadmin、worker、viewerのみ指定できます';
  end if;

  select * into v_before
  from public.profiles
  where id = p_user_id
  for update;

  if not found then raise exception '対象ユーザーが見つかりません'; end if;

  if v_before.role = 'admin' and p_role <> 'admin' then
    select count(*) into v_admin_count from public.profiles where role = 'admin';
    if v_admin_count <= 1 then raise exception '最後の管理者は承認待ち・作業者へ変更できません'; end if;
  end if;

  update public.profiles
  set role = p_role
  where id = p_user_id
  returning * into v_after;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, before_data, after_data)
  values((select auth.uid()), 'UPDATE', 'profile_role', p_user_id::text, to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$$;
