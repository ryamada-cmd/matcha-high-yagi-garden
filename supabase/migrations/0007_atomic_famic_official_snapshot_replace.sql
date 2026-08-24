create or replace function public.replace_famic_official_snapshot(
  p_rows jsonb,
  p_source_date date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'FAMIC公式登録データが空です';
  end if;

  delete from public.pesticide_official_registrations;

  insert into public.pesticide_official_registrations(
    source_key,registration_no,pesticide_name,pesticide_type,purpose_category,
    company_name,crop_name,target_pest,use_purpose,dilution_or_rate,use_timing,
    spray_volume,product_use_count,application_method,application_place,
    active_ingredient,total_use_count,acquired_on,search_text
  )
  select
    nullif(x->>'source_key',''),
    nullif(x->>'registration_no',''),
    nullif(x->>'pesticide_name',''),
    nullif(x->>'pesticide_type',''),
    nullif(x->>'purpose_category',''),
    nullif(x->>'company_name',''),
    nullif(x->>'crop_name',''),
    nullif(x->>'target_pest',''),
    nullif(x->>'use_purpose',''),
    nullif(x->>'dilution_or_rate',''),
    nullif(x->>'use_timing',''),
    nullif(x->>'spray_volume',''),
    nullif(x->>'product_use_count',''),
    nullif(x->>'application_method',''),
    nullif(x->>'application_place',''),
    nullif(x->>'active_ingredient',''),
    nullif(x->>'total_use_count',''),
    p_source_date,
    coalesce(x->>'search_text','')
  from jsonb_array_elements(p_rows) x;

  get diagnostics v_count = row_count;

  if v_count <> jsonb_array_length(p_rows) then
    raise exception 'FAMIC公式登録の投入件数が一致しません（入力 %, 投入 %）', jsonb_array_length(p_rows), v_count;
  end if;

  insert into public.pesticide_data_sources(
    dataset,source_title,source_note,source_date,row_count,imported_at
  ) values (
    'official',
    'FAMIC 農薬登録情報ダウンロード（CSV）',
    'FAMIC公開データから茶を含む適用情報を抽出。実際の使用は現物ラベルと最新登録内容を確認。',
    p_source_date,
    v_count,
    now()
  )
  on conflict (dataset) do update set
    source_title=excluded.source_title,
    source_note=excluded.source_note,
    source_date=excluded.source_date,
    row_count=excluded.row_count,
    imported_at=excluded.imported_at;

  return v_count;
end;
$$;

revoke all on function public.replace_famic_official_snapshot(jsonb,date) from public, anon, authenticated;
grant execute on function public.replace_famic_official_snapshot(jsonb,date) to service_role;
