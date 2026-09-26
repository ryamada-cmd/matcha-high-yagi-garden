-- 0048_rls_policy_performance_hardening.sql
-- Preserve existing authorization semantics while reducing repeated RLS work.

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists external_files_select_permission on public.external_files;
drop policy if exists external_files_select_expense_receipts on public.external_files;
create policy external_files_select_authorized
on public.external_files
for select
to authenticated
using (
  (select public.has_app_permission('storage.view'))
  or public.can_access_expense_receipt_file_(id)
);

drop policy if exists external_file_links_select_permission on public.external_file_links;
drop policy if exists external_file_links_select_expense_receipts on public.external_file_links;
create policy external_file_links_select_authorized
on public.external_file_links
for select
to authenticated
using (
  (select public.has_app_permission('storage.view'))
  or (
    entity_type = 'expense_claim'
    and public.can_access_expense_claim_(entity_id)
  )
);
