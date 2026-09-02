-- 0045_harden_external_storage_metadata.sql
-- Additive hardening and indexes for external storage metadata.
-- No existing business rows are modified or deleted.

drop policy if exists external_storage_oauth_states_no_client_access on public.external_storage_oauth_states;
create policy external_storage_oauth_states_no_client_access
on public.external_storage_oauth_states
for all
to authenticated
using (false)
with check (false);

create index if not exists idx_external_files_uploaded_by
  on public.external_files(uploaded_by)
  where uploaded_by is not null;

create index if not exists idx_external_file_links_created_by
  on public.external_file_links(created_by)
  where created_by is not null;

create index if not exists idx_external_storage_oauth_states_user
  on public.external_storage_oauth_states(user_id);

create index if not exists idx_external_storage_settings_updated_by
  on public.external_storage_settings(updated_by)
  where updated_by is not null;
