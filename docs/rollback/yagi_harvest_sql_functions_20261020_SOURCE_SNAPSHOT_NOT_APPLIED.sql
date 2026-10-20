-- REVIEW-ONLY ROLLBACK SNAPSHOT; DO NOT EXECUTE WITHOUT APPROVAL.
-- Exact two function definitions captured read-only from Yagi Production
-- on 2026-10-20 before applying the proposed provenance SQL changes.
-- Does not create, delete or rewrite crop/field/harvest data.
-- CREATE OR REPLACE preserves current function access control; grants should
-- be explicitly checked before and after executing rollback.
-- Source project: mdbtngousidfanmrjybt

-- Source routine: ai_office_harvest_aggregate; SECURITY DEFINER=true; ACL snapshot={postgres=X/postgres,anon=X/postgres}
CREATE OR REPLACE FUNCTION public.ai_office_harvest_aggregate(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_token text;
 v_hash text;
 v_undated boolean;
 v_count integer;
 v_bad boolean;
 v_ha numeric;
 v_kg numeric;
 v_fields integer;
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from
    OR p_to-p_from>366 THEN
   RAISE EXCEPTION 'invalid_harvest_period' USING ERRCODE='22023';
 END IF;
 v_token := coalesce(
   nullif(current_setting('request.headers', true),'')::jsonb
      ->> 'x-yagi-ai-readonly-token','');
 IF length(v_token)<48 OR length(v_token)>256
    OR v_token !~ '^[A-Za-z0-9_-]+$' THEN
   RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
 END IF;
 v_hash := encode(extensions.digest(v_token, 'sha256'),'hex');
 IF NOT EXISTS (
   SELECT 1 FROM ai_readonly_private.harvest_aggregate_tokens
    WHERE token_sha256=v_hash AND enabled=true
 ) THEN
   RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501';
 END IF;

 -- Undated imported inventory cannot be accurately placed into any period.
 -- Never reinterpret its lifetime leaf weight as period harvest production.
 SELECT EXISTS (
   SELECT 1 FROM public.harvest_records h
   WHERE h.deleted_at IS NULL AND h.harvest_date IS NULL
 ) INTO v_undated;
 SELECT count(*) INTO v_count
 FROM public.harvest_records h
 WHERE h.deleted_at IS NULL AND h.harvest_date BETWEEN p_from AND p_to;
 IF v_undated OR v_count=0 THEN
   RETURN jsonb_build_object(
    'scope','yagi_harvest','from',to_char(p_from,'YYYY-MM-DD'),
    'to',to_char(p_to,'YYYY-MM-DD'),
    'quality',CASE WHEN v_undated THEN 'incomplete_provenance'
                   ELSE 'empty_period' END,
    'metrics',jsonb_build_object(
      'harvest_area_ha',NULL,'fresh_leaf_kg',NULL,'field_count',NULL));
 END IF;

 -- Check every event for a recorded harvest area and field provenance.
 -- Do NOT silently substitute the master field area as harvested area.
 SELECT EXISTS (
  SELECT 1 FROM public.harvest_records h
  CROSS JOIN LATERAL (
   SELECT COUNT(*) n,COUNT(rf.harvested_area_m2) n_area,
          SUM(rf.fresh_leaf_kg) field_kg
   FROM public.harvest_record_fields rf
   WHERE rf.harvest_record_id=h.id
  ) child
  WHERE h.deleted_at IS NULL AND h.harvest_date BETWEEN p_from AND p_to
  AND (h.fresh_leaf_kg IS NULL OR
    (child.n=0 AND (h.field_id IS NULL OR h.harvested_area_m2 IS NULL)) OR
    (child.n>0 AND
     (child.n<>child.n_area OR
      abs(child.field_kg-h.fresh_leaf_kg)>0.001)))
 ) INTO v_bad;
 IF v_bad THEN
   RETURN jsonb_build_object(
    'scope','yagi_harvest','from',to_char(p_from,'YYYY-MM-DD'),
    'to',to_char(p_to,'YYYY-MM-DD'),
    'quality','incomplete_provenance',
    'metrics',jsonb_build_object(
      'harvest_area_ha',NULL,'fresh_leaf_kg',NULL,'field_count',NULL));
 END IF;

 -- One row per harvest lot: preserve measured TOTAL kg and avoid multiplying
 -- production by join cardinality. Sum recorded areas across harvest events.
 SELECT round((SUM(
       CASE WHEN child.n>0 THEN child.area ELSE h.harvested_area_m2 END
   ) / 10000)::numeric,6),
   round(SUM(h.fresh_leaf_kg)::numeric,3)
 INTO v_ha,v_kg
 FROM public.harvest_records h
 CROSS JOIN LATERAL (
   SELECT count(*) n,sum(rf.harvested_area_m2) area
   FROM public.harvest_record_fields rf
   WHERE rf.harvest_record_id=h.id
 ) child
 WHERE h.deleted_at IS NULL AND h.harvest_date BETWEEN p_from AND p_to;

 -- Unique source fields; one record may include multiple distinct fields.
 SELECT count(DISTINCT refs.field_id)::int INTO v_fields
 FROM (
   SELECT rf.field_id FROM public.harvest_record_fields rf
   JOIN public.harvest_records h ON h.id=rf.harvest_record_id
   WHERE h.deleted_at IS NULL AND h.harvest_date BETWEEN p_from AND p_to
   UNION ALL
   SELECT h.field_id FROM public.harvest_records h
   WHERE h.deleted_at IS NULL AND h.harvest_date BETWEEN p_from AND p_to
   AND h.field_id IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.harvest_record_fields rf
                  WHERE rf.harvest_record_id=h.id)
 ) refs;

 RETURN jsonb_build_object(
  'scope','yagi_harvest','from',to_char(p_from,'YYYY-MM-DD'),
  'to',to_char(p_to,'YYYY-MM-DD'),'quality','complete',
  'metrics',jsonb_build_object(
    'harvest_area_ha',v_ha,'fresh_leaf_kg',v_kg,'field_count',v_fields)
 );
END;
$function$;

-- Source routine: save_harvest_record; SECURITY DEFINER=true; ACL snapshot={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.save_harvest_record(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text; v_display text; v_id uuid; v_before jsonb; v_after jsonb;
  v_date date; v_legacy text; v_field uuid; v_field_area numeric;
  v_item jsonb; v_items jsonb; v_seen jsonb:='{}'::jsonb;
  v_qty numeric:=0; v_each_qty numeric; v_each_area numeric; v_area numeric:=0;
  v_has_unset_area boolean:=false; v_primary_field uuid;
  v_field_ids uuid[]:=array[]::uuid[]; v_existing_fields uuid[];
  v_used numeric:=0; v_entry_mode text;
begin
  perform public.require_app_permission_('harvest_processing.manage');
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select role,display_name into v_role,v_display from public.profiles where id=auth.uid();
  if coalesce(v_role,'') not in ('admin','worker') then raise exception '権限がありません'; end if;
  v_id:=nullif(p_payload->>'id','')::uuid;
  v_date:=coalesce(nullif(p_payload->>'harvest_date','')::date,current_date);
  v_entry_mode:=coalesce(nullif(p_payload->>'yield_entry_mode',''),
    (select yield_entry_mode from public.harvest_records where id=v_id), 'PER_FIELD');
  if v_entry_mode not in ('PER_FIELD','TOTAL_AREA_ESTIMATE') then
    raise exception '生葉収量の入力方法が不正です';
  end if;
  if jsonb_typeof(p_payload->'fields')='array' then
    v_items:=p_payload->'fields';
  else
    -- Compatibility with old single-field callers.
    v_items:=jsonb_build_array(jsonb_build_object(
      'field_id',p_payload->>'field_id','fresh_leaf_kg',p_payload->>'fresh_leaf_kg',
      'harvested_area_m2',p_payload->>'harvested_area_m2'));
  end if;
  if jsonb_array_length(v_items)=0 then raise exception '圃場を1件以上選択してください'; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_field:=nullif(v_item->>'field_id','')::uuid;
    v_each_qty:=round(coalesce(nullif(v_item->>'fresh_leaf_kg','')::numeric,0),3);
    v_each_area:=nullif(v_item->>'harvested_area_m2','')::numeric;
    if v_field is null then raise exception '圃場を選択してください'; end if;
    if v_seen ? v_field::text then raise exception '同じ圃場が重複しています'; end if;
    v_seen:=v_seen||jsonb_build_object(v_field::text,true);
    select area_m2 into v_field_area from public.fields
      where id=v_field and deleted_at is null;
    if v_field_area is null then raise exception '圃場が見つかりません'; end if;
    if v_each_qty<=0 then raise exception '各圃場の生葉収量は0kgより大きくしてください'; end if;
    if v_each_area is not null and (v_each_area<=0 or v_each_area>v_field_area) then
      raise exception '摘採面積は0より大きく圃場面積以内にしてください';
    end if;
    if v_primary_field is null then v_primary_field:=v_field; end if;
    v_qty:=v_qty+v_each_qty;
    v_field_ids:=array_append(v_field_ids,v_field);
    if v_each_area is null then v_has_unset_area:=true; else v_area:=v_area+v_each_area; end if;
  end loop;
  v_qty:=round(v_qty,3);
  if nullif(p_payload->>'fresh_leaf_kg','') is not null
     and abs(v_qty-(p_payload->>'fresh_leaf_kg')::numeric)>0.0005 then
    raise exception '生葉合計と圃場別配分が一致しません';
  end if;
  if v_id is null then
    v_legacy:='HARV-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    insert into public.harvest_records
      (legacy_id,harvest_date,field_id,season,harvest_method,fresh_leaf_kg,harvested_area_m2,
       operator_id,operator_name_snapshot,destination,quality_note,note,yield_entry_mode)
    values
      (v_legacy,v_date,v_primary_field,nullif(btrim(p_payload->>'season'),''),
       nullif(btrim(p_payload->>'harvest_method'),''),v_qty,
       case when v_has_unset_area then null else v_area end,
       auth.uid(),coalesce(nullif(btrim(p_payload->>'operator_name'),''),v_display),
       nullif(btrim(p_payload->>'destination'),''),nullif(btrim(p_payload->>'quality_note'),''),
       nullif(btrim(p_payload->>'note'),''),v_entry_mode) returning id into v_id;
  else
    select jsonb_build_object('harvest',to_jsonb(h),'fields',
      (select coalesce(jsonb_agg(to_jsonb(f) order by f.field_id),'[]'::jsonb)
       from public.harvest_record_fields f where f.harvest_record_id=h.id))
      into v_before from public.harvest_records h
      where h.id=v_id and h.deleted_at is null for update;
    if v_before is null then raise exception '摘採記録が見つかりません'; end if;
    if jsonb_typeof(p_payload->'fields') is distinct from 'array' and
       (select count(*) from public.harvest_record_fields where harvest_record_id=v_id)>1 then
      raise exception '複数圃場の摘採ロットは新しい画面で編集してください';
    end if;
    select coalesce(sum(s.input_kg),0) into v_used
      from public.tea_processing_batch_harvests s
      join public.tea_processing_batches b on b.id=s.processing_batch_id
      where s.harvest_record_id=v_id and b.deleted_at is null;
    if v_qty+0.0005<v_used then
      raise exception '生葉収量を既に製茶へ使用した量より少なくできません';
    end if;
    if v_used>0 then
      select coalesce(array_agg(field_id order by field_id),array[]::uuid[])
      into v_existing_fields from public.harvest_record_fields where harvest_record_id=v_id;
      if v_existing_fields is distinct from
         (select array_agg(x order by x) from unnest(v_field_ids) x) then
        raise exception '製茶使用済みの摘採ロットは圃場の追加・削除ができません';
      end if;
    end if;
    update public.harvest_records set
      harvest_date=v_date,field_id=v_primary_field,yield_entry_mode=v_entry_mode,
      season=nullif(btrim(p_payload->>'season'),''),
      harvest_method=nullif(btrim(p_payload->>'harvest_method'),''),
      fresh_leaf_kg=v_qty,
      harvested_area_m2=case when v_has_unset_area then null else v_area end,
      operator_name_snapshot=coalesce(nullif(btrim(p_payload->>'operator_name'),''),operator_name_snapshot),
      destination=nullif(btrim(p_payload->>'destination'),''),
      quality_note=nullif(btrim(p_payload->>'quality_note'),''),
      note=nullif(btrim(p_payload->>'note'),''),updated_at=now()
    where id=v_id;
    delete from public.harvest_record_fields where harvest_record_id=v_id;
  end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    insert into public.harvest_record_fields
      (harvest_record_id,field_id,fresh_leaf_kg,harvested_area_m2)
    values
      (v_id,(v_item->>'field_id')::uuid,
       round((v_item->>'fresh_leaf_kg')::numeric,3),
       nullif(v_item->>'harvested_area_m2','')::numeric);
  end loop;
  select jsonb_build_object('harvest',to_jsonb(h),'fields',
    (select coalesce(jsonb_agg(to_jsonb(f) order by f.field_id),'[]'::jsonb)
     from public.harvest_record_fields f where f.harvest_record_id=v_id))
    into v_after from public.harvest_records h where h.id=v_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),case when v_before is null then 'CREATE' else 'UPDATE' end,
      'harvest_record',v_id::text,v_before,v_after);
  return v_id;
end $function$;
