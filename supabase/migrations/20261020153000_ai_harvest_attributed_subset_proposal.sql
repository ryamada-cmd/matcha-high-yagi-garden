-- PROPOSAL ONLY, NOT APPLIED TO YAGI PRODUCTION.
-- Version 2 of the separately approved 3-metric source read-only function.
-- Historical undated imports remain unchanged and are NOT assigned guessed dates.
-- If no dated harvest exists, incomplete_provenance still returns null metrics.
-- If new fully-measured, dated harvests exist alongside undated imported lots,
-- return only the known dated subset as attributed_subset: these metrics do NOT
-- represent the complete period and must be clearly labeled to staff/AI.
-- Function grant/role restrictions and existing token authorization remain.
-- Apply only after explicit review and approval of this new source migration.

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
 IF v_count=0 THEN
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
  'to',to_char(p_to,'YYYY-MM-DD'),
  'quality',CASE WHEN v_undated THEN 'attributed_subset' ELSE 'complete' END,
  'metrics',jsonb_build_object(
    'harvest_area_ha',v_ha,'fresh_leaf_kg',v_kg,'field_count',v_fields)
 );
END;
$function$
