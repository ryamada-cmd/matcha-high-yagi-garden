-- Harvest and primary tea processing management.
-- Applied to production on 2026-08-25.

create table if not exists public.harvest_records (
  id uuid primary key default gen_random_uuid(), legacy_id text unique not null,
  harvest_date date not null, field_id uuid not null references public.fields(id),
  season text, harvest_method text,
  fresh_leaf_kg numeric(14,3) not null check(fresh_leaf_kg>0),
  harvested_area_m2 numeric(14,3) check(harvested_area_m2 is null or harvested_area_m2>0),
  operator_id uuid references auth.users(id), operator_name_snapshot text,
  destination text, quality_note text, note text,
  deleted_at timestamptz, deleted_by uuid references auth.users(id), delete_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.tea_processing_batches (
  id uuid primary key default gen_random_uuid(), legacy_id text unique not null,
  processing_date date not null, process_type text not null, output_material text not null,
  output_kg numeric(14,3) not null check(output_kg>0), facility text,
  processing_cost_yen numeric(14,2) not null default 0 check(processing_cost_yen>=0),
  operator_id uuid references auth.users(id), operator_name_snapshot text, note text,
  deleted_at timestamptz, deleted_by uuid references auth.users(id), delete_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.tea_processing_batch_harvests (
  id uuid primary key default gen_random_uuid(),
  processing_batch_id uuid not null references public.tea_processing_batches(id) on delete cascade,
  harvest_record_id uuid not null references public.harvest_records(id),
  input_kg numeric(14,3) not null check(input_kg>0), created_at timestamptz not null default now(),
  unique(processing_batch_id,harvest_record_id)
);
create index if not exists idx_harvest_records_field_date on public.harvest_records(field_id,harvest_date desc) where deleted_at is null;
create index if not exists idx_processing_batches_date on public.tea_processing_batches(processing_date desc) where deleted_at is null;
create index if not exists idx_processing_sources_harvest on public.tea_processing_batch_harvests(harvest_record_id);
alter table public.harvest_records enable row level security;
alter table public.tea_processing_batches enable row level security;
alter table public.tea_processing_batch_harvests enable row level security;
create policy harvest_records_read on public.harvest_records for select to authenticated using(true);
create policy processing_batches_read on public.tea_processing_batches for select to authenticated using(true);
create policy processing_sources_read on public.tea_processing_batch_harvests for select to authenticated using(true);
create or replace view public.harvest_processing_usage with(security_invoker=true) as
select h.id harvest_record_id,h.field_id,h.harvest_date,h.fresh_leaf_kg,
 coalesce(sum(case when b.deleted_at is null then s.input_kg else 0 end),0)::numeric(14,3) processed_kg,
 greatest(h.fresh_leaf_kg-coalesce(sum(case when b.deleted_at is null then s.input_kg else 0 end),0),0)::numeric(14,3) remaining_kg
from public.harvest_records h left join public.tea_processing_batch_harvests s on s.harvest_record_id=h.id left join public.tea_processing_batches b on b.id=s.processing_batch_id
group by h.id,h.field_id,h.harvest_date,h.fresh_leaf_kg;
grant select on public.harvest_processing_usage to authenticated;

create or replace function public.save_harvest_record(p_payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare v_role text;v_display text;v_id uuid;v_before jsonb;v_after jsonb;v_field uuid;v_date date;v_qty numeric;v_area numeric;v_field_area numeric;v_legacy text;
begin
 if auth.uid() is null then raise exception 'ログインが必要です';end if;select role,display_name into v_role,v_display from public.profiles where id=auth.uid();if coalesce(v_role,'') not in('admin','worker') then raise exception '権限がありません';end if;
 v_id:=nullif(p_payload->>'id','')::uuid;v_field:=nullif(p_payload->>'field_id','')::uuid;v_date:=coalesce(nullif(p_payload->>'harvest_date','')::date,current_date);v_qty:=coalesce(nullif(p_payload->>'fresh_leaf_kg','')::numeric,0);v_area:=nullif(p_payload->>'harvested_area_m2','')::numeric;
 if v_qty<=0 then raise exception '生葉収量は0kgより大きくしてください';end if;select area_m2 into v_field_area from public.fields where id=v_field and deleted_at is null;if v_field_area is null then raise exception '圃場が見つかりません';end if;if v_area is not null and v_area>v_field_area then raise exception '摘採面積が圃場面積を超えています';end if;
 if v_id is null then v_legacy:='HARV-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,4));insert into public.harvest_records(legacy_id,harvest_date,field_id,season,harvest_method,fresh_leaf_kg,harvested_area_m2,operator_id,operator_name_snapshot,destination,quality_note,note) values(v_legacy,v_date,v_field,nullif(btrim(p_payload->>'season'),''),nullif(btrim(p_payload->>'harvest_method'),''),round(v_qty,3),v_area,auth.uid(),coalesce(nullif(btrim(p_payload->>'operator_name'),''),v_display),nullif(btrim(p_payload->>'destination'),''),nullif(btrim(p_payload->>'quality_note'),''),nullif(btrim(p_payload->>'note'),'')) returning id into v_id;select to_jsonb(x) into v_after from public.harvest_records x where x.id=v_id;insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data) values(auth.uid(),'CREATE','harvest_record',v_id::text,v_after);
 else select to_jsonb(x) into v_before from public.harvest_records x where x.id=v_id and deleted_at is null for update;if v_before is null then raise exception '摘採記録が見つかりません';end if;if exists(select 1 from public.tea_processing_batch_harvests s join public.tea_processing_batches b on b.id=s.processing_batch_id where s.harvest_record_id=v_id and b.deleted_at is null) and (v_field::text is distinct from v_before->>'field_id') then raise exception '製茶実績に使用済みの摘採記録は圃場を変更できません';end if;update public.harvest_records set harvest_date=v_date,field_id=v_field,season=nullif(btrim(p_payload->>'season'),''),harvest_method=nullif(btrim(p_payload->>'harvest_method'),''),fresh_leaf_kg=round(v_qty,3),harvested_area_m2=v_area,operator_name_snapshot=coalesce(nullif(btrim(p_payload->>'operator_name'),''),operator_name_snapshot),destination=nullif(btrim(p_payload->>'destination'),''),quality_note=nullif(btrim(p_payload->>'quality_note'),''),note=nullif(btrim(p_payload->>'note'),''),updated_at=now() where id=v_id;if(select coalesce(processed_kg,0) from public.harvest_processing_usage where harvest_record_id=v_id)>v_qty then raise exception '生葉収量を既に製茶へ使用した量より少なくできません';end if;select to_jsonb(x) into v_after from public.harvest_records x where x.id=v_id;insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'UPDATE','harvest_record',v_id::text,v_before,v_after);end if;return v_id;
end $$;
revoke all on function public.save_harvest_record(jsonb) from public,anon;grant execute on function public.save_harvest_record(jsonb) to authenticated;

create or replace function public.delete_harvest_record(p_id uuid,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare v_before jsonb;begin perform public.require_admin_();select to_jsonb(x) into v_before from public.harvest_records x where x.id=p_id and deleted_at is null for update;if v_before is null then raise exception '摘採記録が見つかりません';end if;if exists(select 1 from public.tea_processing_batch_harvests s join public.tea_processing_batches b on b.id=s.processing_batch_id where s.harvest_record_id=p_id and b.deleted_at is null) then raise exception 'この摘採記録は製茶実績で使用中です。先に製茶実績を削除してください';end if;update public.harvest_records set deleted_at=now(),deleted_by=auth.uid(),delete_reason=nullif(btrim(p_reason),'') where id=p_id;insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'DELETE','harvest_record',p_id::text,v_before,jsonb_build_object('deleted_at',now(),'reason',p_reason));end $$;
revoke all on function public.delete_harvest_record(uuid,text) from public,anon;grant execute on function public.delete_harvest_record(uuid,text) to authenticated;

create or replace function public.save_tea_processing_batch(p_payload jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare v_role text;v_display text;v_id uuid;v_before jsonb;v_after jsonb;v_legacy text;v_date date;v_output numeric;v_item jsonb;v_harvest uuid;v_input numeric;v_total numeric:=0;v_harvest_qty numeric;v_used numeric;v_seen jsonb:='{}'::jsonb;
begin
 if auth.uid() is null then raise exception 'ログインが必要です';end if;select role,display_name into v_role,v_display from public.profiles where id=auth.uid();if coalesce(v_role,'') not in('admin','worker') then raise exception '権限がありません';end if;v_id:=nullif(p_payload->>'id','')::uuid;v_date:=coalesce(nullif(p_payload->>'processing_date','')::date,current_date);v_output:=coalesce(nullif(p_payload->>'output_kg','')::numeric,0);if btrim(coalesce(p_payload->>'process_type',''))='' then raise exception '製茶工程を入力してください';end if;if btrim(coalesce(p_payload->>'output_material',''))='' then raise exception '出来上がり品目を入力してください';end if;if v_output<=0 then raise exception '出来高は0kgより大きくしてください';end if;if jsonb_typeof(p_payload->'sources')<>'array' or jsonb_array_length(p_payload->'sources')=0 then raise exception '原料となる摘採記録を1件以上選択してください';end if;
 if v_id is null then v_legacy:='PROC-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||upper(substr(md5(random()::text),1,4));insert into public.tea_processing_batches(legacy_id,processing_date,process_type,output_material,output_kg,facility,processing_cost_yen,operator_id,operator_name_snapshot,note) values(v_legacy,v_date,btrim(p_payload->>'process_type'),btrim(p_payload->>'output_material'),round(v_output,3),nullif(btrim(p_payload->>'facility'),''),coalesce(nullif(p_payload->>'processing_cost_yen','')::numeric,0),auth.uid(),coalesce(nullif(btrim(p_payload->>'operator_name'),''),v_display),nullif(btrim(p_payload->>'note'),'')) returning id into v_id;
 else select jsonb_build_object('batch',to_jsonb(b),'sources',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from public.tea_processing_batch_harvests s where s.processing_batch_id=b.id)) into v_before from public.tea_processing_batches b where b.id=v_id and b.deleted_at is null for update;if v_before is null then raise exception '製茶実績が見つかりません';end if;update public.tea_processing_batches set processing_date=v_date,process_type=btrim(p_payload->>'process_type'),output_material=btrim(p_payload->>'output_material'),output_kg=round(v_output,3),facility=nullif(btrim(p_payload->>'facility'),''),processing_cost_yen=coalesce(nullif(p_payload->>'processing_cost_yen','')::numeric,0),operator_name_snapshot=coalesce(nullif(btrim(p_payload->>'operator_name'),''),operator_name_snapshot),note=nullif(btrim(p_payload->>'note'),''),updated_at=now() where id=v_id;delete from public.tea_processing_batch_harvests where processing_batch_id=v_id;end if;
 for v_item in select * from jsonb_array_elements(p_payload->'sources') loop v_harvest:=nullif(v_item->>'harvest_record_id','')::uuid;v_input:=coalesce(nullif(v_item->>'input_kg','')::numeric,0);if v_harvest is null or v_input<=0 then raise exception '原料摘採と投入量を確認してください';end if;if v_seen ? v_harvest::text then raise exception '同じ摘採記録が重複しています';end if;v_seen:=v_seen||jsonb_build_object(v_harvest::text,true);select fresh_leaf_kg into v_harvest_qty from public.harvest_records where id=v_harvest and deleted_at is null for update;if v_harvest_qty is null then raise exception '摘採記録が見つかりません';end if;select coalesce(sum(s.input_kg),0) into v_used from public.tea_processing_batch_harvests s join public.tea_processing_batches b on b.id=s.processing_batch_id where s.harvest_record_id=v_harvest and b.deleted_at is null and b.id<>v_id;if v_used+v_input>v_harvest_qty+0.0005 then raise exception '摘採記録の未加工残量を超えています（収量 %kg / 他製茶使用 %kg / 今回 %kg）',v_harvest_qty,v_used,v_input;end if;insert into public.tea_processing_batch_harvests(processing_batch_id,harvest_record_id,input_kg) values(v_id,v_harvest,round(v_input,3));v_total:=v_total+v_input;end loop;
 if v_output>v_total+0.0005 then raise exception '出来高が生葉投入量を超えています';end if;select jsonb_build_object('batch',to_jsonb(b),'sources',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from public.tea_processing_batch_harvests s where s.processing_batch_id=b.id),'input_kg',v_total,'yield_pct',case when v_total>0 then round(v_output/v_total*100,2) else 0 end) into v_after from public.tea_processing_batches b where b.id=v_id;insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),case when v_before is null then 'CREATE' else 'UPDATE' end,'tea_processing_batch',v_id::text,v_before,v_after);return v_id;
end $$;
revoke all on function public.save_tea_processing_batch(jsonb) from public,anon;grant execute on function public.save_tea_processing_batch(jsonb) to authenticated;

create or replace function public.delete_tea_processing_batch(p_id uuid,p_reason text default null) returns void language plpgsql security definer set search_path=public as $$
declare v_before jsonb;begin perform public.require_admin_();select jsonb_build_object('batch',to_jsonb(b),'sources',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from public.tea_processing_batch_harvests s where s.processing_batch_id=b.id)) into v_before from public.tea_processing_batches b where b.id=p_id and b.deleted_at is null for update;if v_before is null then raise exception '製茶実績が見つかりません';end if;update public.tea_processing_batches set deleted_at=now(),deleted_by=auth.uid(),delete_reason=nullif(btrim(p_reason),'') where id=p_id;insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'DELETE','tea_processing_batch',p_id::text,v_before,jsonb_build_object('deleted_at',now(),'reason',p_reason));end $$;
revoke all on function public.delete_tea_processing_batch(uuid,text) from public,anon;grant execute on function public.delete_tea_processing_batch(uuid,text) to authenticated;
