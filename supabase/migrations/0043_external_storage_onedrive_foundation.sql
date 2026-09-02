-- 0043_external_storage_onedrive_foundation.sql
-- External file storage foundation. Additive only: existing business data is untouched.

insert into public.app_permission_definitions(permission_key,feature_key,feature_label,item_label,description,sort_order,locked,worker_default)
values
  ('storage.view','storage','外部ストレージ','閲覧','OneDrive等に保存したファイル台帳と接続状態を閲覧します。',160,false,false),
  ('storage.upload','storage','外部ストレージ','アップロード','外部ストレージへファイルをアップロードし、業務データへ関連付けます。',161,false,false),
  ('storage.manage','storage','外部ストレージ','接続設定','Microsoft 365 / OneDriveの接続設定と認証を管理します。',162,false,false)
on conflict (permission_key) do update set
  feature_key=excluded.feature_key,
  feature_label=excluded.feature_label,
  item_label=excluded.item_label,
  description=excluded.description,
  sort_order=excluded.sort_order,
  locked=excluded.locked,
  worker_default=excluded.worker_default;

insert into public.role_permissions(app_role,permission_key,allowed)
values
  ('admin','storage.view',true),
  ('admin','storage.upload',true),
  ('admin','storage.manage',true),
  ('worker','storage.view',false),
  ('worker','storage.upload',false),
  ('worker','storage.manage',false)
on conflict (app_role,permission_key) do nothing;

create table if not exists public.external_storage_settings (
  id smallint primary key default 1 check (id = 1),
  provider text not null default 'ONEDRIVE' check (provider in ('ONEDRIVE')),
  enabled boolean not null default false,
  tenant_id text,
  client_id text,
  client_secret_secret_id uuid,
  refresh_token_secret_id uuid,
  drive_id text,
  drive_type text,
  connected_account text,
  root_folder text not null default '五代目八木一兵衛',
  connected_at timestamptz,
  last_verified_at timestamptz,
  last_error text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.external_storage_settings(id) values (1) on conflict (id) do nothing;

create table if not exists public.external_files (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'ONEDRIVE',
  drive_id text not null,
  provider_item_id text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  folder_path text,
  web_url text,
  sha1_hash text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists ux_external_files_provider_item on public.external_files(provider,drive_id,provider_item_id) where archived_at is null;
create index if not exists idx_external_files_uploaded_at on public.external_files(uploaded_at desc);
create index if not exists idx_external_files_name on public.external_files(file_name);

create table if not exists public.external_file_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.external_files(id) on delete cascade,
  entity_type text not null,
  entity_id text,
  category text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_external_file_links_entity on public.external_file_links(entity_type,entity_id,created_at desc);
create index if not exists idx_external_file_links_file on public.external_file_links(file_id);

create table if not exists public.external_storage_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  return_to text not null default '/storage',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
create index if not exists idx_external_storage_oauth_states_expiry on public.external_storage_oauth_states(expires_at);

alter table public.external_storage_settings enable row level security;
alter table public.external_files enable row level security;
alter table public.external_file_links enable row level security;
alter table public.external_storage_oauth_states enable row level security;

drop policy if exists external_storage_settings_select_permission on public.external_storage_settings;
create policy external_storage_settings_select_permission on public.external_storage_settings for select to authenticated using (public.has_app_permission('storage.view'));
drop policy if exists external_files_select_permission on public.external_files;
create policy external_files_select_permission on public.external_files for select to authenticated using (public.has_app_permission('storage.view'));
drop policy if exists external_file_links_select_permission on public.external_file_links;
create policy external_file_links_select_permission on public.external_file_links for select to authenticated using (public.has_app_permission('storage.view'));

revoke all on public.external_storage_settings from anon, authenticated;
revoke all on public.external_files from anon, authenticated;
revoke all on public.external_file_links from anon, authenticated;
revoke all on public.external_storage_oauth_states from anon, authenticated;
grant select on public.external_storage_settings, public.external_files, public.external_file_links to authenticated;

create or replace function public.external_storage_set_private_config(p_tenant_id text,p_client_id text,p_client_secret text,p_root_folder text,p_user_id uuid default null)
returns void language plpgsql security definer set search_path='public','vault' as $$
declare v_secret_id uuid; v_existing uuid;
begin
  if btrim(coalesce(p_tenant_id,''))='' or btrim(coalesce(p_client_id,''))='' then raise exception 'tenant_id and client_id are required'; end if;
  select client_secret_secret_id into v_existing from public.external_storage_settings where id=1 for update;
  if btrim(coalesce(p_client_secret,''))<>'' then
    if v_existing is null then
      select vault.create_secret(p_client_secret,'yagi_onedrive_client_secret','Microsoft Graph client secret',null) into v_secret_id;
    else
      perform vault.update_secret(v_existing,p_client_secret,'yagi_onedrive_client_secret','Microsoft Graph client secret',null); v_secret_id := v_existing;
    end if;
  else v_secret_id := v_existing; end if;
  update public.external_storage_settings set tenant_id=btrim(p_tenant_id),client_id=btrim(p_client_id),client_secret_secret_id=v_secret_id,
    root_folder=coalesce(nullif(btrim(p_root_folder),''),'五代目八木一兵衛'),last_error=null,updated_by=p_user_id,updated_at=now() where id=1;
end $$;

create or replace function public.external_storage_get_private_config()
returns jsonb language sql security definer set search_path='public','vault' as $$
  select jsonb_build_object('provider',s.provider,'tenant_id',s.tenant_id,'client_id',s.client_id,
    'client_secret',(select d.decrypted_secret from vault.decrypted_secrets d where d.id=s.client_secret_secret_id),
    'refresh_token',(select d.decrypted_secret from vault.decrypted_secrets d where d.id=s.refresh_token_secret_id),
    'drive_id',s.drive_id,'drive_type',s.drive_type,'connected_account',s.connected_account,'root_folder',s.root_folder,'enabled',s.enabled)
  from public.external_storage_settings s where s.id=1
$$;

create or replace function public.external_storage_set_connection(p_drive_id text,p_drive_type text,p_connected_account text,p_refresh_token text,p_user_id uuid default null)
returns void language plpgsql security definer set search_path='public','vault' as $$
declare v_secret_id uuid; v_existing uuid;
begin
  if btrim(coalesce(p_refresh_token,''))='' then raise exception 'refresh token is required'; end if;
  select refresh_token_secret_id into v_existing from public.external_storage_settings where id=1 for update;
  if v_existing is null then
    select vault.create_secret(p_refresh_token,'yagi_onedrive_refresh_token','Microsoft Graph refresh token',null) into v_secret_id;
  else
    perform vault.update_secret(v_existing,p_refresh_token,'yagi_onedrive_refresh_token','Microsoft Graph refresh token',null); v_secret_id := v_existing;
  end if;
  update public.external_storage_settings set refresh_token_secret_id=v_secret_id,drive_id=nullif(btrim(p_drive_id),''),drive_type=nullif(btrim(p_drive_type),''),
    connected_account=nullif(btrim(p_connected_account),''),enabled=true,connected_at=now(),last_verified_at=now(),last_error=null,updated_by=p_user_id,updated_at=now() where id=1;
end $$;

create or replace function public.external_storage_mark_error(p_error text)
returns void language sql security definer set search_path='public' as $$
  update public.external_storage_settings set last_error=left(coalesce(p_error,''),1000),updated_at=now() where id=1
$$;

revoke execute on function public.external_storage_set_private_config(text,text,text,text,uuid) from public, anon, authenticated;
revoke execute on function public.external_storage_get_private_config() from public, anon, authenticated;
revoke execute on function public.external_storage_set_connection(text,text,text,text,uuid) from public, anon, authenticated;
revoke execute on function public.external_storage_mark_error(text) from public, anon, authenticated;
grant execute on function public.external_storage_set_private_config(text,text,text,text,uuid) to service_role;
grant execute on function public.external_storage_get_private_config() to service_role;
grant execute on function public.external_storage_set_connection(text,text,text,text,uuid) to service_role;
grant execute on function public.external_storage_mark_error(text) to service_role;
