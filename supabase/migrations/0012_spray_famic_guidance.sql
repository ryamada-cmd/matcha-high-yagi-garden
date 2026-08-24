create or replace function public.get_spray_pesticide_guidance(
  p_pesticide_ids uuid[],
  p_spray_date date,
  p_exclude_batch_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_year int := extract(year from coalesce(p_spray_date,current_date))::int;
  v_source_date date;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select source_date into v_source_date from public.pesticide_data_sources where dataset='official';

  select coalesce(jsonb_agg(item order by item->>'pesticide_name'),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'pesticide_id',p.id,
      'pesticide_name',p.name,
      'registration_no',coalesce(p.famic_registration_no,''),
      'master_frac_irac',coalesce(p.frac_irac,''),
      'official_match_mode',case when nullif(trim(p.famic_registration_no),'') is not null then 'registration' else 'name_candidate' end,
      'official_source_date',v_source_date,
      'official',(
        select coalesce(jsonb_agg(to_jsonb(o2)),'[]'::jsonb)
        from (
          select distinct o.registration_no,o.pesticide_name,o.company_name,o.target_pest,o.use_purpose,
            o.dilution_or_rate,o.use_timing,o.spray_volume,o.product_use_count,o.total_use_count,
            o.application_method,o.active_ingredient
          from public.pesticide_official_registrations o
          where (
            nullif(trim(p.famic_registration_no),'') is not null and o.registration_no=p.famic_registration_no
          ) or (
            nullif(trim(p.famic_registration_no),'') is null and (
              public.normalize_jp_search(o.pesticide_name)=public.normalize_jp_search(p.name)
              or public.normalize_jp_search(o.pesticide_name) like '%'||public.normalize_jp_search(p.name)
            )
          )
          order by o.target_pest,o.dilution_or_rate,o.registration_no
          limit 60
        ) o2
      ),
      'guidelines',(
        select coalesce(jsonb_agg(to_jsonb(g2)),'[]'::jsonb)
        from (
          select distinct g.target_pest_or_use,g.dilution,g.spray_volume_or_rate,g.use_timing,g.use_count,
            g.frac_irac,g.toxicity,g.covering_exception,g.note,g.source_page
          from public.pesticide_guidelines g
          where (
            nullif(trim(p.famic_registration_no),'') is not null and nullif(trim(g.registration_no),'')=p.famic_registration_no
          ) or public.normalize_jp_search(g.pesticide_name)=public.normalize_jp_search(p.name)
          order by g.target_pest_or_use,g.dilution
          limit 40
        ) g2
      ),
      'recorded_year_use_count',(
        select count(distinct sb.id)
        from public.spray_batches sb
        join public.spray_batch_chemicals sc on sc.spray_batch_id=sb.id
        where sb.deleted_at is null
          and sc.pesticide_id=p.id
          and extract(year from sb.spray_date)::int=v_year
          and (p_exclude_batch_id is null or sb.id<>p_exclude_batch_id)
      ),
      'last_recorded_spray_date',(
        select max(sb.spray_date)
        from public.spray_batches sb
        join public.spray_batch_chemicals sc on sc.spray_batch_id=sb.id
        where sb.deleted_at is null
          and sc.pesticide_id=p.id
          and (p_exclude_batch_id is null or sb.id<>p_exclude_batch_id)
      )
    ) as item
    from public.pesticides p
    where p.id=any(coalesce(p_pesticide_ids,array[]::uuid[]))
  ) s;

  return v_result;
end;
$$;

revoke all on function public.get_spray_pesticide_guidance(uuid[],date,uuid) from public,anon;
grant execute on function public.get_spray_pesticide_guidance(uuid[],date,uuid) to authenticated;
