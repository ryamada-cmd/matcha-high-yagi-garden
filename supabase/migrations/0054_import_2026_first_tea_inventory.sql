-- 0054_import_2026_first_tea_inventory.sql
-- Source: 茶在庫.xlsx supplied by the user.
-- Logistics dates are kept as logistics dates; no harvest/processing date is invented.

do $$
declare
  v_admin uuid;
  r record;
  v_outputs jsonb;
  v_fresh numeric;
  v_output numeric;
  v_bags integer;
  v_leaf numeric;
  v_leaf_bags integer;
  v_bone numeric;
  v_bone_bags integer;
begin
  select id into v_admin
  from public.profiles
  where role='admin'
  order by created_at
  limit 1;

  if v_admin is null then raise exception 'admin profile not found'; end if;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);

  for r in
    select *
    from (values
      ('5029','2026-05-17','2026-05-20','おくみどり','手摘み',36.0,5.1,1,1.6,1),
      ('5038','2026-05-18','2026-05-20','おくみどり','手摘み',65.0,8.7,1,2.7,1),
      ('5519','2026-05-19','2026-05-20','やぶきた','ハサミ',530.0,86.8,6,22.2,2),
      ('5060','2026-05-20','2026-05-22','おくみどり','手摘み',31.0,4.4,1,0.0,0),
      ('5525','2026-05-20','2026-05-22','やぶきた','ハサミ',120.0,24.0,2,4.1,1),
      ('5527','2026-05-21','2026-05-22','おくみどり','ハサミ',50.0,9.3,1,1.7,1),
      ('5075','2026-05-23','2026-05-22','おくみどり','手摘み',70.0,10.3,1,2.6,1),
      ('5544','2026-05-23','2026-05-22','やぶきた','ハサミ',220.0,39.6,3,6.9,1),
      ('5550','2026-05-23','2026-05-22','やぶきた','ハサミ',292.0,52.4,4,8.5,1),
      ('5565','2026-05-25','2026-05-28','おくみどり','手摘み',104.0,13.1,1,4.3,1),
      ('5566','2026-05-25','2026-05-28','やぶきた','ハサミ',76.0,14.3,1,1.8,1),
      ('5582','2026-05-26','2026-05-28','おくみどり','ハサミ',183.0,29.9,2,4.9,1),
      ('5096','2026-05-28','2026-05-28','おくみどり','手摘み',21.0,3.0,1,0.0,0),
      ('5595','2026-05-28','2026-05-28','おくみどり','ハサミ',163.0,26.0,2,4.6,1),
      ('5597','2026-05-29','','おくみどり','ハサミ',242.0,39.8,3,6.7,1),
      ('5106','2026-06-01','','おくみどり','手摘み',77.0,11.4,1,3.4,1),
      ('5614','2026-06-01','','おくみどり','ハサミ',17.0,3.0,1,0.0,0)
    ) as x(lot_no,ja_date,cold_date,variety,picking_method,fresh_leaf_kg,leaf_kg,leaf_bags,bone_kg,bone_bags)
  loop
    v_outputs := '[]'::jsonb;
    if r.leaf_kg > 0 then
      v_outputs := v_outputs || jsonb_build_array(jsonb_build_object('grade','葉','output_kg',r.leaf_kg,'bag_count',r.leaf_bags));
    end if;
    if r.bone_kg > 0 then
      v_outputs := v_outputs || jsonb_build_array(jsonb_build_object('grade','骨','output_kg',r.bone_kg,'bag_count',r.bone_bags));
    end if;

    perform public.admin_create_tea_inventory_batch(jsonb_build_object(
      'crop_year',2026,
      'season','一番茶',
      'lot_no',r.lot_no,
      'variety',r.variety,
      'picking_method',r.picking_method,
      'fresh_leaf_kg',r.fresh_leaf_kg,
      'ja_shipment_date',r.ja_date,
      'cold_storage_date',r.cold_date,
      'storage_location','城陽冷蔵庫',
      'source_file','茶在庫.xlsx',
      'note','原票どおり移行。JA出荷日・冷蔵庫持込日は物流日付として保持し、摘採日・製茶日には使用していない。',
      'outputs',v_outputs
    ));
  end loop;

  select coalesce(sum(fresh_leaf_kg),0)
  into v_fresh
  from public.tea_inventory_batches
  where crop_year=2026 and season='一番茶' and deleted_at is null;

  select
    coalesce(sum(o.output_kg),0),
    coalesce(sum(o.bag_count),0),
    coalesce(sum(o.output_kg) filter(where o.grade='葉'),0),
    coalesce(sum(o.bag_count) filter(where o.grade='葉'),0),
    coalesce(sum(o.output_kg) filter(where o.grade='骨'),0),
    coalesce(sum(o.bag_count) filter(where o.grade='骨'),0)
  into v_output,v_bags,v_leaf,v_leaf_bags,v_bone,v_bone_bags
  from public.tea_inventory_outputs o
  join public.tea_inventory_batches b on b.id=o.batch_id
  where b.crop_year=2026 and b.season='一番茶' and b.deleted_at is null;

  if v_fresh <> 2297.000
     or v_output <> 457.100
     or v_bags <> 47
     or v_leaf <> 381.100
     or v_leaf_bags <> 32
     or v_bone <> 76.000
     or v_bone_bags <> 15 then
    raise exception '2026 first-tea import totals mismatch: fresh %, output %, bags %, leaf %/% bone %/%',
      v_fresh,v_output,v_bags,v_leaf,v_leaf_bags,v_bone,v_bone_bags;
  end if;
end;
$$;
