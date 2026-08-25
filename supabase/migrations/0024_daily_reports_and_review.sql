-- Daily reports: one active report per author/day, field links, review history and audit logging.
-- Applied to production on 2026-08-26.

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null default current_date,
  author_id uuid not null references auth.users(id),
  author_name_snapshot text not null,
  weather_note text,
  work_hours numeric(6,2) not null default 0 check(work_hours >= 0 and work_hours <= 24),
  work_summary text not null,
  good_points text,
  issues text,
  next_actions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);
create unique index if not exists uq_daily_reports_author_date_active on public.daily_reports(author_id,report_date) where deleted_at is null;
create index if not exists idx_daily_reports_date on public.daily_reports(report_date desc) where deleted_at is null;
create index if not exists idx_daily_reports_author on public.daily_reports(author_id,report_date desc) where deleted_at is null;

create table if not exists public.daily_report_fields (
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  field_id uuid not null references public.fields(id),
  created_at timestamptz not null default now(),
  primary key(report_id,field_id)
);
create index if not exists idx_daily_report_fields_field on public.daily_report_fields(field_id,report_id);

alter table public.daily_reports enable row level security;
alter table public.daily_report_fields enable row level security;
drop policy if exists daily_reports_read on public.daily_reports;
create policy daily_reports_read on public.daily_reports for select to authenticated using(deleted_at is null);
drop policy if exists daily_report_fields_read on public.daily_report_fields;
create policy daily_report_fields_read on public.daily_report_fields for select to authenticated using(exists(select 1 from public.daily_reports r where r.id=report_id and r.deleted_at is null));
grant select on public.daily_reports,public.daily_report_fields to authenticated;

create or replace function public.save_daily_report(p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_date date;v_role text;v_display text;v_before jsonb;v_after jsonb;v_field jsonb;v_field_id uuid;v_hours numeric;v_summary text;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  select role,coalesce(nullif(display_name,''),'担当者') into v_role,v_display from public.profiles where id=auth.uid();
  if coalesce(v_role,'') not in('admin','worker') then raise exception '権限がありません'; end if;
  v_id:=nullif(p_payload->>'id','')::uuid;v_date:=coalesce(nullif(p_payload->>'report_date','')::date,current_date);v_hours:=greatest(coalesce(nullif(p_payload->>'work_hours','')::numeric,0),0);v_summary:=btrim(coalesce(p_payload->>'work_summary',''));
  if v_summary='' then raise exception '作業内容を入力してください'; end if;if v_hours>24 then raise exception '作業時間は24時間以内で入力してください'; end if;
  if v_id is null then select id into v_id from public.daily_reports where author_id=auth.uid() and report_date=v_date and deleted_at is null limit 1 for update; end if;
  if v_id is null then
    insert into public.daily_reports(report_date,author_id,author_name_snapshot,weather_note,work_hours,work_summary,good_points,issues,next_actions)
    values(v_date,auth.uid(),v_display,nullif(btrim(p_payload->>'weather_note'),''),round(v_hours,2),v_summary,nullif(btrim(p_payload->>'good_points'),''),nullif(btrim(p_payload->>'issues'),''),nullif(btrim(p_payload->>'next_actions'),'')) returning id into v_id;v_before:=null;
  else
    select jsonb_build_object('report',to_jsonb(r),'field_ids',(select coalesce(jsonb_agg(f.field_id),'[]'::jsonb) from public.daily_report_fields f where f.report_id=r.id)) into v_before from public.daily_reports r where r.id=v_id and r.deleted_at is null for update;
    if v_before is null then raise exception '日報が見つかりません'; end if;if(select author_id from public.daily_reports where id=v_id)<>auth.uid() and v_role<>'admin' then raise exception 'この日報を編集する権限がありません'; end if;
    update public.daily_reports set report_date=v_date,weather_note=nullif(btrim(p_payload->>'weather_note'),''),work_hours=round(v_hours,2),work_summary=v_summary,good_points=nullif(btrim(p_payload->>'good_points'),''),issues=nullif(btrim(p_payload->>'issues'),''),next_actions=nullif(btrim(p_payload->>'next_actions'),''),updated_at=now() where id=v_id;
    delete from public.daily_report_fields where report_id=v_id;
  end if;
  if jsonb_typeof(coalesce(p_payload->'field_ids','[]'::jsonb))='array' then
    for v_field in select * from jsonb_array_elements(coalesce(p_payload->'field_ids','[]'::jsonb)) loop
      v_field_id:=trim(both '"' from v_field::text)::uuid;if not exists(select 1 from public.fields where id=v_field_id and deleted_at is null) then raise exception '選択された圃場が見つかりません'; end if;insert into public.daily_report_fields(report_id,field_id) values(v_id,v_field_id) on conflict do nothing;
    end loop;
  end if;
  select jsonb_build_object('report',to_jsonb(r),'field_ids',(select coalesce(jsonb_agg(f.field_id),'[]'::jsonb) from public.daily_report_fields f where f.report_id=r.id)) into v_after from public.daily_reports r where r.id=v_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),case when v_before is null then 'CREATE' else 'UPDATE' end,'daily_report',v_id::text,v_before,v_after);return v_id;
exception when unique_violation then raise exception '同じ担当者・同じ日付の日報がすでにあります';
end $$;
revoke all on function public.save_daily_report(jsonb) from public,anon;grant execute on function public.save_daily_report(jsonb) to authenticated;

create or replace function public.delete_daily_report(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_before jsonb;v_role text;v_author uuid;
begin
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;select role into v_role from public.profiles where id=auth.uid();
  select author_id,jsonb_build_object('report',to_jsonb(r),'field_ids',(select coalesce(jsonb_agg(f.field_id),'[]'::jsonb) from public.daily_report_fields f where f.report_id=r.id)) into v_author,v_before from public.daily_reports r where r.id=p_id and r.deleted_at is null for update;
  if v_before is null then raise exception '日報が見つかりません'; end if;if v_author<>auth.uid() and coalesce(v_role,'')<>'admin' then raise exception 'この日報を削除する権限がありません'; end if;
  update public.daily_reports set deleted_at=now(),deleted_by=auth.uid(),updated_at=now() where id=p_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'DELETE','daily_report',p_id::text,v_before,jsonb_build_object('deleted_at',now()));
end $$;
revoke all on function public.delete_daily_report(uuid) from public,anon;grant execute on function public.delete_daily_report(uuid) to authenticated;
