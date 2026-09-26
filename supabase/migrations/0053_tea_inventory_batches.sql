-- 0053_tea_inventory_batches.sql
-- Exact tea inventory lots from historical source documents.
-- Keeps logistics dates as logistics dates; does not invent harvest/processing dates.

alter table public.production_lots
  drop constraint if exists production_lots_source_type_check;
alter table public.production_lots
  add constraint production_lots_source_type_check
  check (source_type = any (array['PRIMARY_PROCESSING'::text,'MANUFACTURING'::text,'MANUAL_RECEIPT'::text,'TEA_INVENTORY'::text]));

create table if not exists public.tea_inventory_batches (
  id uuid primary key default gen_random_uuid(),
  crop_year integer not null check (crop_year between 2000 and 2200),
  season text not null,
  lot_no text not null,
  variety text,
  picking_method text,
  fresh_leaf_kg numeric(16,3) not null check (fresh_leaf_kg > 0),
  ja_shipment_date date,
  cold_storage_date date,
  storage_location text,
  source_file text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  delete_reason text,
  unique (crop_year, season, lot_no)
);

create table if not exists public.tea_inventory_outputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.tea_inventory_batches(id) on delete cascade,
  grade text not null,
  output_kg numeric(16,3) not null check (output_kg > 0),
  bag_count integer not null default 0 check (bag_count >= 0),
  production_lot_id uuid references public.production_lots(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, grade),
  unique (production_lot_id)
);

create index if not exists idx_tea_inventory_batches_year_season
  on public.tea_inventory_batches(crop_year desc, season, lot_no)
  where deleted_at is null;
create index if not exists idx_tea_inventory_outputs_batch
  on public.tea_inventory_outputs(batch_id);

alter table public.tea_inventory_batches enable row level security;
alter table public.tea_inventory_outputs enable row level security;

revoke all on public.tea_inventory_batches from anon, authenticated;
revoke all on public.tea_inventory_outputs from anon, authenticated;
grant select on public.tea_inventory_batches, public.tea_inventory_outputs to authenticated;

drop policy if exists tea_inventory_batches_read on public.tea_inventory_batches;
create policy tea_inventory_batches_read
on public.tea_inventory_batches
for select
to authenticated
using ((select public.has_app_permission('production.view')) and deleted_at is null);

drop policy if exists tea_inventory_outputs_read on public.tea_inventory_outputs;
create policy tea_inventory_outputs_read
on public.tea_inventory_outputs
for select
to authenticated
using (
  (select public.has_app_permission('production.view'))
  and exists (
    select 1
    from public.tea_inventory_batches b
    where b.id = tea_inventory_outputs.batch_id
      and b.deleted_at is null
  )
);

create or replace function public.admin_create_tea_inventory_batch(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_batch uuid;
  v_output_id uuid;
  v_production_lot uuid;
  v_item jsonb;
  v_year integer;
  v_season text;
  v_lot_no text;
  v_variety text;
  v_method text;
  v_fresh numeric;
  v_ja_date date;
  v_cold_date date;
  v_storage text;
  v_source_file text;
  v_note text;
  v_grade text;
  v_grade_code text;
  v_qty numeric;
  v_bags integer;
  v_output_total numeric := 0;
  v_received_date date;
  v_material text;
begin
  perform public.require_app_permission_('production.inventory_manage');

  v_year := coalesce(nullif(p_payload->>'crop_year','')::integer, extract(year from current_date)::integer);
  v_season := btrim(coalesce(p_payload->>'season',''));
  v_lot_no := btrim(coalesce(p_payload->>'lot_no',''));
  v_variety := nullif(btrim(coalesce(p_payload->>'variety','')), '');
  v_method := nullif(btrim(coalesce(p_payload->>'picking_method','')), '');
  v_fresh := coalesce(nullif(p_payload->>'fresh_leaf_kg','')::numeric,0);
  v_ja_date := nullif(p_payload->>'ja_shipment_date','')::date;
  v_cold_date := nullif(p_payload->>'cold_storage_date','')::date;
  v_storage := nullif(btrim(coalesce(p_payload->>'storage_location','')), '');
  v_source_file := nullif(btrim(coalesce(p_payload->>'source_file','')), '');
  v_note := nullif(btrim(coalesce(p_payload->>'note','')), '');

  if v_season = '' then raise exception '茶期を入力してください'; end if;
  if v_lot_no = '' then raise exception 'ロット番号を入力してください'; end if;
  if v_fresh <= 0 then raise exception '持込生葉量は0kgより大きくしてください'; end if;
  if jsonb_typeof(p_payload->'outputs') <> 'array' or jsonb_array_length(p_payload->'outputs') = 0 then
    raise exception '製茶出来高明細を1件以上入力してください';
  end if;

  insert into public.tea_inventory_batches(
    crop_year,season,lot_no,variety,picking_method,fresh_leaf_kg,
    ja_shipment_date,cold_storage_date,storage_location,source_file,note,created_by
  )
  values(
    v_year,v_season,v_lot_no,v_variety,v_method,round(v_fresh,3),
    v_ja_date,v_cold_date,v_storage,v_source_file,v_note,(select auth.uid())
  )
  returning id into v_batch;

  v_received_date := coalesce(v_cold_date,v_ja_date,current_date);

  for v_item in select value from jsonb_array_elements(p_payload->'outputs') loop
    v_grade := btrim(coalesce(v_item->>'grade',''));
    v_qty := coalesce(nullif(v_item->>'output_kg','')::numeric,0);
    v_bags := greatest(coalesce(nullif(v_item->>'bag_count','')::integer,0),0);

    if v_grade = '' then raise exception '出来高区分を入力してください'; end if;
    if v_qty <= 0 then raise exception '出来高は0kgより大きくしてください'; end if;

    insert into public.tea_inventory_outputs(batch_id,grade,output_kg,bag_count,note)
    values(v_batch,v_grade,round(v_qty,3),v_bags,nullif(btrim(coalesce(v_item->>'note','')),''))
    returning id into v_output_id;

    v_grade_code := case v_grade when '葉' then 'LEAF' when '骨' then 'BONE' else upper(substr(md5(v_grade),1,6)) end;
    v_material := '碾茶 '||v_grade||case when v_variety is not null then '（'||v_variety||'）' else '' end;

    insert into public.production_lots(
      legacy_id,source_type,source_id,material_name,category,unit,received_date,
      initial_qty,total_cost_yen,supplier,storage_location,note
    )
    values(
      'LOT-TEA-'||v_year::text||'-'||v_lot_no||'-'||v_grade_code,
      'TEA_INVENTORY',v_output_id,v_material,'碾茶','kg',v_received_date,
      round(v_qty,3),0,null,v_storage,
      concat_ws(' / ',v_year::text||'年 '||v_season,'JAロット '||v_lot_no,v_source_file)
    )
    returning id into v_production_lot;

    insert into public.production_transactions(
      lot_id,transaction_type,quantity,reference_type,reference_id,reason,created_by
    )
    values(
      v_production_lot,'RECEIPT',round(v_qty,3),'TEA_INVENTORY',v_output_id,
      '茶在庫移行：'||v_year::text||'年 '||v_season||' / JAロット '||v_lot_no,
      (select auth.uid())
    );

    update public.tea_inventory_outputs
    set production_lot_id=v_production_lot,updated_at=now()
    where id=v_output_id;

    v_output_total := v_output_total + v_qty;
  end loop;

  if v_output_total > v_fresh + 0.0005 then
    raise exception '碾茶出来高が持込生葉量を超えています';
  end if;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(
    (select auth.uid()),'CREATE','tea_inventory_batch',v_batch::text,
    jsonb_build_object(
      'crop_year',v_year,'season',v_season,'lot_no',v_lot_no,
      'variety',v_variety,'picking_method',v_method,'fresh_leaf_kg',v_fresh,
      'output_kg',round(v_output_total,3),'ja_shipment_date',v_ja_date,
      'cold_storage_date',v_cold_date,'source_file',v_source_file
    )
  );

  return v_batch;
exception
  when unique_violation then
    raise exception '同じ年・茶期・ロット番号の茶在庫がすでに登録されています';
end;
$$;

revoke all on function public.admin_create_tea_inventory_batch(jsonb) from public, anon;
grant execute on function public.admin_create_tea_inventory_batch(jsonb) to authenticated;
