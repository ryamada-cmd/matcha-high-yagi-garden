create table if not exists public.ai_ocr_settings (
  id smallint primary key default 1 check (id = 1),
  provider text not null default 'OPENAI' check (provider = 'OPENAI'),
  model text not null default 'gpt-6-astra',
  api_key_secret_id uuid,
  enabled boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.ai_ocr_settings(id,provider,model,enabled)
values(1,'OPENAI','gpt-6-astra',false)
on conflict (id) do nothing;

alter table public.ai_ocr_settings enable row level security;
revoke all on table public.ai_ocr_settings from anon, authenticated;

create or replace function public.ai_ocr_get_private_config()
returns jsonb
language sql
security definer
set search_path to 'public','vault'
as $function$
  select jsonb_build_object(
    'provider', s.provider,
    'model', s.model,
    'enabled', s.enabled,
    'api_key', (
      select d.decrypted_secret
      from vault.decrypted_secrets d
      where d.id=s.api_key_secret_id
    )
  )
  from public.ai_ocr_settings s
  where s.id=1
$function$;

revoke all on function public.ai_ocr_get_private_config() from public, anon, authenticated;
grant execute on function public.ai_ocr_get_private_config() to service_role;

create or replace function public.ai_ocr_get_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.ai_ocr_settings%rowtype;
begin
  if not public.has_app_permission('settings.manage') then
    raise exception 'AI OCR設定を表示する権限がありません。';
  end if;

  select * into v_row from public.ai_ocr_settings where id=1;
  return jsonb_build_object(
    'provider', v_row.provider,
    'model', v_row.model,
    'enabled', v_row.enabled,
    'configured', v_row.api_key_secret_id is not null,
    'updated_at', v_row.updated_at
  );
end
$function$;

revoke all on function public.ai_ocr_get_status() from public, anon;
grant execute on function public.ai_ocr_get_status() to authenticated;

create or replace function public.ai_ocr_set_config(
  p_api_key text,
  p_model text,
  p_enabled boolean,
  p_user_id uuid default auth.uid()
)
returns void
language plpgsql
security definer
set search_path to 'public','vault'
as $function$
declare
  v_secret_id uuid;
  v_existing uuid;
  v_model text;
begin
  if not public.has_app_permission('settings.manage') then
    raise exception 'AI OCR設定を変更する権限がありません。';
  end if;

  v_model := coalesce(nullif(btrim(p_model),''),'gpt-6-astra');
  if length(v_model) > 100 then
    raise exception 'モデル名が長すぎます。';
  end if;

  select api_key_secret_id into v_existing
  from public.ai_ocr_settings
  where id=1
  for update;

  if btrim(coalesce(p_api_key,'')) <> '' then
    if length(btrim(p_api_key)) < 20 then
      raise exception 'OpenAI APIキーの形式を確認してください。';
    end if;
    if v_existing is null then
      select vault.create_secret(
        btrim(p_api_key),
        'yagi_ai_ocr_openai_api_key',
        'OpenAI API key for Yagi Garden Manager AI OCR',
        null
      ) into v_secret_id;
    else
      perform vault.update_secret(
        v_existing,
        btrim(p_api_key),
        'yagi_ai_ocr_openai_api_key',
        'OpenAI API key for Yagi Garden Manager AI OCR',
        null
      );
      v_secret_id := v_existing;
    end if;
  else
    v_secret_id := v_existing;
  end if;

  if coalesce(p_enabled,false) and v_secret_id is null then
    raise exception 'AI OCRを有効にするにはOpenAI APIキーを登録してください。';
  end if;

  update public.ai_ocr_settings
  set model=v_model,
      enabled=coalesce(p_enabled,false),
      api_key_secret_id=v_secret_id,
      updated_by=coalesce(p_user_id,auth.uid()),
      updated_at=now()
  where id=1;
end
$function$;

revoke all on function public.ai_ocr_set_config(text,text,boolean,uuid) from public, anon;
grant execute on function public.ai_ocr_set_config(text,text,boolean,uuid) to authenticated;
