-- 0051_explicit_deny_internal_tables.sql
-- These tables are intentionally accessed through permission-checked SECURITY DEFINER RPCs.
-- Keep direct Data API access denied and make that intent explicit in RLS.

drop policy if exists app_settings_deny_direct_access on public.app_settings;
create policy app_settings_deny_direct_access
on public.app_settings
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists audit_logs_deny_direct_access on public.audit_logs;
create policy audit_logs_deny_direct_access
on public.audit_logs
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
