create or replace function public.external_storage_set_private_config(
  p_tenant_id text,
  p_client_id text,
  p_client_secret text,
  p_root_folder text,
  p_user_id uuid default null::uuid
)
returns void
language plpgsql
security definer
set search_path to 'public', 'vault'
as $function$
declare
  v_secret_id uuid;
  v_existing uuid;
begin
  if btrim(coalesce(p_tenant_id,''))='' or btrim(coalesce(p_client_id,''))='' then
    raise exception 'Tenant IDとClient IDを入力してください。';
  end if;

  if btrim(coalesce(p_client_secret,''))<>''
     and btrim(p_client_secret) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Client Secretには「Secret ID」ではなく「値（Value）」を入力してください。';
  end if;

  select client_secret_secret_id into v_existing
  from public.external_storage_settings
  where id=1
  for update;

  if btrim(coalesce(p_client_secret,''))<>'' then
    if v_existing is null then
      select vault.create_secret(p_client_secret,'yagi_onedrive_client_secret','Microsoft Graph client secret',null) into v_secret_id;
    else
      perform vault.update_secret(v_existing,p_client_secret,'yagi_onedrive_client_secret','Microsoft Graph client secret',null);
      v_secret_id := v_existing;
    end if;
  else
    v_secret_id := v_existing;
  end if;

  update public.external_storage_settings set
    tenant_id=btrim(p_tenant_id),
    client_id=btrim(p_client_id),
    client_secret_secret_id=v_secret_id,
    root_folder=coalesce(nullif(btrim(p_root_folder),''),'五代目八木一兵衛'),
    last_error=null,
    updated_by=p_user_id,
    updated_at=now()
  where id=1;
end
$function$;
