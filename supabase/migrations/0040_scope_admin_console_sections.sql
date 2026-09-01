-- Scope administrative console payload sections by their item-level permissions.
-- settings.view grants entry to the page; sensitive subsections additionally require
-- their own locked permissions so the RPC remains correct if the matrix evolves.

create or replace function public.get_admin_console_data(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,100), 500));
  v_settings jsonb;
  v_users jsonb := '[]'::jsonb;
  v_logs jsonb := '[]'::jsonb;
begin
  perform public.require_app_permission_('settings.view');

  select to_jsonb(s) into v_settings
  from public.app_settings s
  where s.id = 1;

  if public.has_app_permission('users.manage') then
    select coalesce(jsonb_agg(x order by x.created_at), '[]'::jsonb)
    into v_users
    from (
      select p.id, p.display_name, p.role, p.created_at, u.email
      from public.profiles p
      left join auth.users u on u.id = p.id
    ) x;
  end if;

  if public.has_app_permission('audit.view') then
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
  end if;

  return jsonb_build_object(
    'settings', v_settings,
    'users', v_users,
    'audit_logs', v_logs
  );
end;
$function$;
