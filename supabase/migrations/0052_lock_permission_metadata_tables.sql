-- 0052_lock_permission_metadata_tables.sql
-- Permission metadata is served through permission-checked SECURITY DEFINER RPCs only.

revoke select on public.app_permission_definitions from anon, authenticated;
revoke select on public.role_permissions from anon, authenticated;

drop policy if exists permission_definitions_read on public.app_permission_definitions;
create policy permission_definitions_deny_direct_access
on public.app_permission_definitions
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_deny_direct_access
on public.role_permissions
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
