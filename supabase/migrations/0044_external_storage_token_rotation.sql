-- 0044_external_storage_token_rotation.sql
-- Rotate Microsoft Graph refresh tokens without changing existing business data.

create or replace function public.external_storage_rotate_refresh_token(p_refresh_token text)
returns void
language plpgsql
security definer
set search_path='public','vault'
as $$
declare v_existing uuid;
begin
  if btrim(coalesce(p_refresh_token,''))='' then return; end if;
  select refresh_token_secret_id into v_existing from public.external_storage_settings where id=1 for update;
  if v_existing is null then
    select vault.create_secret(p_refresh_token,'yagi_onedrive_refresh_token','Microsoft Graph refresh token',null) into v_existing;
    update public.external_storage_settings set refresh_token_secret_id=v_existing,last_verified_at=now(),updated_at=now() where id=1;
  else
    perform vault.update_secret(v_existing,p_refresh_token,'yagi_onedrive_refresh_token','Microsoft Graph refresh token',null);
    update public.external_storage_settings set last_verified_at=now(),last_error=null,updated_at=now() where id=1;
  end if;
end $$;

revoke execute on function public.external_storage_rotate_refresh_token(text) from public, anon, authenticated;
grant execute on function public.external_storage_rotate_refresh_token(text) to service_role;
