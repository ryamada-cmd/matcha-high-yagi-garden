-- 0047_expense_receipt_onedrive_access.sql
-- Allow expense applicants/reviewers to read OneDrive receipt metadata linked to expense claims
-- without granting broad external-storage access.

create or replace function public.can_access_expense_claim_(p_claim_id text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists(
    select 1
    from public.expense_claims c
    where c.id::text = p_claim_id
      and (
        (c.applicant_id = (select auth.uid()) and public.has_app_permission('expenses.view'))
        or public.has_app_permission('expenses.review')
      )
  )
$$;

create or replace function public.can_access_expense_receipt_file_(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists(
    select 1
    from public.external_file_links l
    join public.expense_claims c on c.id::text = l.entity_id
    where l.file_id = p_file_id
      and l.entity_type = 'expense_claim'
      and (
        (c.applicant_id = (select auth.uid()) and public.has_app_permission('expenses.view'))
        or public.has_app_permission('expenses.review')
      )
  )
$$;

revoke all on function public.can_access_expense_claim_(text) from public, anon;
revoke all on function public.can_access_expense_receipt_file_(uuid) from public, anon;
grant execute on function public.can_access_expense_claim_(text) to authenticated;
grant execute on function public.can_access_expense_receipt_file_(uuid) to authenticated;

drop policy if exists external_file_links_select_expense_receipts on public.external_file_links;
create policy external_file_links_select_expense_receipts
on public.external_file_links
for select
to authenticated
using (
  entity_type = 'expense_claim'
  and public.can_access_expense_claim_(entity_id)
);

drop policy if exists external_files_select_expense_receipts on public.external_files;
create policy external_files_select_expense_receipts
on public.external_files
for select
to authenticated
using (public.can_access_expense_receipt_file_(id));
