create unique index if not exists uq_pesticides_famic_registration_no
on public.pesticides(famic_registration_no)
where famic_registration_no is not null;

create or replace function public.admin_add_pesticide_from_famic(
  p_registration_no text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_reg text := nullif(trim(p_registration_no),'');
  v_name text := nullif(trim(p_display_name),'');
  v_official_name text;
  v_category text;
  v_type text;
  v_frac text;
  v_id uuid;
begin
  v_user := public.require_admin_();
  if v_reg is null then raise exception 'FAMIC登録番号がありません'; end if;

  select id into v_id
  from public.pesticides
  where famic_registration_no = v_reg
  limit 1;
  if v_id is not null then return v_id; end if;

  select min(pesticide_name), min(purpose_category), min(pesticide_type)
    into v_official_name, v_category, v_type
  from public.pesticide_official_registrations
  where registration_no = v_reg;

  if v_official_name is null then
    raise exception 'FAMIC公式登録DBに登録番号 % が見つかりません', v_reg;
  end if;
  v_name := coalesce(v_name, v_official_name);

  select string_agg(distinct frac_irac, ' / ' order by frac_irac)
    into v_frac
  from public.pesticide_guidelines
  where pesticide_name = v_name and nullif(trim(frac_irac),'') is not null;

  insert into public.pesticides(
    legacy_id,famic_registration_no,name,category,active_ingredient,frac_irac,
    official_url,last_verified_at
  ) values (
    'FAMIC-' || v_reg,
    v_reg,
    v_name,
    v_category,
    null,
    v_frac,
    'https://www.acis.famic.go.jp/ddata/index2.htm',
    now()
  ) returning id into v_id;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(
    v_user,'CREATE','pesticide',v_id::text,
    jsonb_build_object(
      'source','FAMIC','registration_no',v_reg,'name',v_name,
      'category',v_category,'pesticide_type',v_type,'frac_irac',v_frac
    )
  );

  return v_id;
exception when unique_violation then
  select id into v_id from public.pesticides where famic_registration_no=v_reg limit 1;
  if v_id is null then raise; end if;
  return v_id;
end;
$$;

revoke all on function public.admin_add_pesticide_from_famic(text,text) from public,anon;
grant execute on function public.admin_add_pesticide_from_famic(text,text) to authenticated;
