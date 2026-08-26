-- Track MAFF registry lapse status from the current all-record CSV.
-- Applied to production on 2026-08-26.

alter table public.fertilizer_official_registrations add column if not exists lapse_status text;
create index if not exists idx_fertilizer_official_lapse on public.fertilizer_official_registrations(lapse_status);

create or replace function public.sync_official_fertilizer_chunk(p_rows jsonb,p_sync_token uuid,p_source_date date) returns integer
language plpgsql security definer set search_path=public as $$
declare r jsonb; v_count integer:=0; v_key text; v_name text;
begin
  perform public.require_fertilizer_admin_();
  if jsonb_typeof(p_rows)<>'array' then raise exception '同期データ形式が不正です'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_key:=btrim(coalesce(r->>'source_key','')); v_name:=btrim(coalesce(r->>'fertilizer_name',''));
    if v_key='' or v_name='' then continue; end if;
    insert into public.fertilizer_official_registrations(
      source_key,registration_no,registration_category,fertilizer_name,company_name,fertilizer_type,registration_date,expiration_date,valid_period,address,lapse_status,
      tn,an,nn,tp,cp,sp,wp,tk,ck,wk,smg,cmg,wmg,sca,cca,wca,components,search_text,source_date,source_url,sync_token,synced_at)
    values(
      v_key,nullif(btrim(r->>'registration_no'),''),nullif(btrim(r->>'registration_category'),''),v_name,nullif(btrim(r->>'company_name'),''),nullif(btrim(r->>'fertilizer_type'),''),
      nullif(r->>'registration_date','')::date,nullif(r->>'expiration_date','')::date,nullif(btrim(r->>'valid_period'),''),nullif(btrim(r->>'address'),''),nullif(btrim(r->>'lapse_status'),''),
      nullif(r->>'tn','')::numeric,nullif(r->>'an','')::numeric,nullif(r->>'nn','')::numeric,nullif(r->>'tp','')::numeric,nullif(r->>'cp','')::numeric,nullif(r->>'sp','')::numeric,nullif(r->>'wp','')::numeric,
      nullif(r->>'tk','')::numeric,nullif(r->>'ck','')::numeric,nullif(r->>'wk','')::numeric,nullif(r->>'smg','')::numeric,nullif(r->>'cmg','')::numeric,nullif(r->>'wmg','')::numeric,
      nullif(r->>'sca','')::numeric,nullif(r->>'cca','')::numeric,nullif(r->>'wca','')::numeric,coalesce(r->'components','{}'::jsonb),coalesce(r->>'search_text',''),p_source_date,
      coalesce(nullif(r->>'source_url',''),'https://fertilizer-search.maff.go.jp/FertilizerRegistrationSearch'),p_sync_token,now())
    on conflict(source_key) do update set
      registration_no=excluded.registration_no,registration_category=excluded.registration_category,fertilizer_name=excluded.fertilizer_name,company_name=excluded.company_name,fertilizer_type=excluded.fertilizer_type,
      registration_date=excluded.registration_date,expiration_date=excluded.expiration_date,valid_period=excluded.valid_period,address=excluded.address,lapse_status=excluded.lapse_status,
      tn=excluded.tn,an=excluded.an,nn=excluded.nn,tp=excluded.tp,cp=excluded.cp,sp=excluded.sp,wp=excluded.wp,tk=excluded.tk,ck=excluded.ck,wk=excluded.wk,
      smg=excluded.smg,cmg=excluded.cmg,wmg=excluded.wmg,sca=excluded.sca,cca=excluded.cca,wca=excluded.wca,components=excluded.components,search_text=excluded.search_text,
      source_date=excluded.source_date,source_url=excluded.source_url,sync_token=excluded.sync_token,synced_at=now();
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.sync_official_fertilizer_chunk(jsonb,uuid,date) from public,anon;
grant execute on function public.sync_official_fertilizer_chunk(jsonb,uuid,date) to authenticated;
