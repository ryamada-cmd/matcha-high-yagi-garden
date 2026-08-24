create or replace function public.normalize_jp_search(p_text text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  s text := coalesce(p_text,'');
begin
  s := replace(s,'ｳﾞ','ヴ');
  s := replace(s,'ｶﾞ','ガ'); s := replace(s,'ｷﾞ','ギ'); s := replace(s,'ｸﾞ','グ'); s := replace(s,'ｹﾞ','ゲ'); s := replace(s,'ｺﾞ','ゴ');
  s := replace(s,'ｻﾞ','ザ'); s := replace(s,'ｼﾞ','ジ'); s := replace(s,'ｽﾞ','ズ'); s := replace(s,'ｾﾞ','ゼ'); s := replace(s,'ｿﾞ','ゾ');
  s := replace(s,'ﾀﾞ','ダ'); s := replace(s,'ﾁﾞ','ヂ'); s := replace(s,'ﾂﾞ','ヅ'); s := replace(s,'ﾃﾞ','デ'); s := replace(s,'ﾄﾞ','ド');
  s := replace(s,'ﾊﾞ','バ'); s := replace(s,'ﾋﾞ','ビ'); s := replace(s,'ﾌﾞ','ブ'); s := replace(s,'ﾍﾞ','ベ'); s := replace(s,'ﾎﾞ','ボ');
  s := replace(s,'ﾊﾟ','パ'); s := replace(s,'ﾋﾟ','ピ'); s := replace(s,'ﾌﾟ','プ'); s := replace(s,'ﾍﾟ','ペ'); s := replace(s,'ﾎﾟ','ポ');
  s := translate(
    s,
    '｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ',
    '。「」、・ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン'
  );
  return lower(s);
end;
$$;

revoke all on function public.normalize_jp_search(text) from public;
grant execute on function public.normalize_jp_search(text) to authenticated;

create or replace function public.search_pesticide_catalog(p_query text, p_limit integer default 100)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  q text := trim(coalesce(p_query,''));
  nq text := public.normalize_jp_search(trim(coalesce(p_query,'')));
  lim integer := greatest(1,least(coalesce(p_limit,100),250));
  v_official jsonb;
  v_guidelines jsonb;
  v_expired jsonb;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if q = '' then
    return jsonb_build_object('official','[]'::jsonb,'guidelines','[]'::jsonb,'expired','[]'::jsonb,
      'counts',jsonb_build_object(
        'official',(select count(*) from public.pesticide_official_registrations),
        'guidelines',(select count(*) from public.pesticide_guidelines),
        'expired',(select count(*) from public.expired_pesticides)
      ));
  end if;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_official from (
    select id,registration_no,pesticide_name,pesticide_type,purpose_category,company_name,crop_name,target_pest,use_purpose,dilution_or_rate,use_timing,spray_volume,product_use_count,application_method,application_place,active_ingredient,total_use_count,acquired_on
    from public.pesticide_official_registrations
    where public.normalize_jp_search(search_text) like '%'||nq||'%'
    order by case when public.normalize_jp_search(pesticide_name)=nq then 0 when public.normalize_jp_search(pesticide_name) like nq||'%' then 1 else 2 end, pesticide_name, target_pest
    limit lim
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_guidelines from (
    select id,source_category,category,target_pest_or_use,pesticide_name,formulation,dilution,spray_volume_or_rate,use_timing,use_count,toxicity,frac_irac,active_ingredient,registration_no,manufacturer,source_page,covering_exception,note,data_status
    from public.pesticide_guidelines
    where public.normalize_jp_search(search_text) like '%'||nq||'%'
    order by case when public.normalize_jp_search(pesticide_name)=nq then 0 when public.normalize_jp_search(pesticide_name) like nq||'%' then 1 else 2 end, pesticide_name, target_pest_or_use
    limit lim
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_expired from (
    select id,expired_on,pesticide_name,expiry_type,note,source_page,verification_status
    from public.expired_pesticides
    where public.normalize_jp_search(search_text) like '%'||nq||'%'
    order by expired_on desc nulls last, pesticide_name
    limit lim
  ) x;

  return jsonb_build_object(
    'official',v_official,'guidelines',v_guidelines,'expired',v_expired,
    'counts',jsonb_build_object('official',jsonb_array_length(v_official),'guidelines',jsonb_array_length(v_guidelines),'expired',jsonb_array_length(v_expired))
  );
end;
$$;
