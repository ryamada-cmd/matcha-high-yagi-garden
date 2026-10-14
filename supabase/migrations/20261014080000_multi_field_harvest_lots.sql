-- Multiple source fields per harvest lot. Non-destructive; legacy HARV-* IDs are the canonical harvest lot numbers.
-- Apply as a single migration before deploying the matching UI.
create table if not exists public.harvest_record_fields (
  harvest_record_id uuid not null references public.harvest_records(id) on delete cascade,
  field_id uuid not null references public.fields(id),
  fresh_leaf_kg numeric(14,3) not null check (fresh_leaf_kg > 0),
  harvested_area_m2 numeric(14,3) check (harvested_area_m2 is null or harvested_area_m2 > 0),
  created_at timestamptz not null default now(),
  primary key (harvest_record_id, field_id)
);
create index if not exists idx_harvest_record_fields_field on public.harvest_record_fields(field_id,harvest_record_id);
alter table public.harvest_record_fields enable row level security;
revoke all on public.harvest_record_fields from anon;
grant select on public.harvest_record_fields to authenticated;
drop policy if exists harvest_record_fields_read on public.harvest_record_fields;
create policy harvest_record_fields_read on public.harvest_record_fields
  for select to authenticated using (true);

-- Preserve every existing single-field record; imported records with unknown fields remain unknown.
insert into public.harvest_record_fields(harvest_record_id,field_id,fresh_leaf_kg,harvested_area_m2)
select h.id,h.field_id,h.fresh_leaf_kg,h.harvested_area_m2
from public.harvest_records h
where h.field_id is not null
  and not exists (select 1 from public.harvest_record_fields f where f.harvest_record_id=h.id)
on conflict (harvest_record_id,field_id) do nothing;

create or replace function public.save_harvest_record(p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_role text; v_display text; v_id uuid; v_before jsonb; v_after jsonb;
  v_date date; v_legacy text; v_field uuid; v_field_area numeric;
  v_item jsonb; v_items jsonb; v_seen jsonb:='{}'::jsonb;
  v_qty numeric:=0; v_each_qty numeric; v_each_area numeric; v_area numeric:=0;
  v_has_unset_area boolean:=false; v_primary_field uuid;
  v_field_ids uuid[]:=array[]::uuid[]; v_existing_fields uuid[];
  v_used numeric:=0;
begin
  perform public.require_app_permission_('harvest_processing.manage');
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select role,display_name into v_role,v_display from public.profiles where id=auth.uid();
  if coalesce(v_role,'') not in ('admin','worker') then raise exception '権限がありません'; end if;
  v_id:=nullif(p_payload->>'id','')::uuid;
  v_date:=coalesce(nullif(p_payload->>'harvest_date','')::date,current_date);
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
      where id=v_field and deleted_at is null and status='active';
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
  if v_id is null then
    v_legacy:='HARV-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    insert into public.harvest_records
      (legacy_id,harvest_date,field_id,season,harvest_method,fresh_leaf_kg,harvested_area_m2,
       operator_id,operator_name_snapshot,destination,quality_note,note)
    values
      (v_legacy,v_date,v_primary_field,nullif(btrim(p_payload->>'season'),''),
       nullif(btrim(p_payload->>'harvest_method'),''),v_qty,
       case when v_has_unset_area then null else v_area end,
       auth.uid(),coalesce(nullif(btrim(p_payload->>'operator_name'),''),v_display),
       nullif(btrim(p_payload->>'destination'),''),nullif(btrim(p_payload->>'quality_note'),''),
       nullif(btrim(p_payload->>'note'),'')) returning id into v_id;
  else
    select to_jsonb(h) into v_before from public.harvest_records h
      where id=v_id and deleted_at is null for update;
    if v_before is null then raise exception '摘採記録が見つかりません'; end if;
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
      harvest_date=v_date,field_id=v_primary_field,
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
end $$;
revoke all on function public.save_harvest_record(jsonb) from public,anon;
grant execute on function public.save_harvest_record(jsonb) to authenticated;

-- Finalizing an imported lot that previously had no known field must also establish field provenance.
create or replace function public.harvest_field_on_source_finalized_()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if old.field_id is null and new.field_id is not null
     and not exists(select 1 from public.harvest_record_fields where harvest_record_id=new.id) then
    insert into public.harvest_record_fields
      (harvest_record_id,field_id,fresh_leaf_kg,harvested_area_m2)
    values(new.id,new.field_id,new.fresh_leaf_kg,new.harvested_area_m2)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_harvest_field_on_source_finalized on public.harvest_records;
create trigger trg_harvest_field_on_source_finalized
after update of field_id on public.harvest_records
for each row execute function public.harvest_field_on_source_finalized_();
revoke all on function public.harvest_field_on_source_finalized_() from public,anon,authenticated;
