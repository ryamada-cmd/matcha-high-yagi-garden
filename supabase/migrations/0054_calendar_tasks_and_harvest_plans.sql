-- Calendar tasks, multi-assignee workflow, and annual harvest planning.
-- Applied to production on 2026-09-27 as calendar_tasks_and_harvest_plans.
-- See production migration history for the authoritative applied timestamp.

create table if not exists public.calendar_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'GENERAL'
    check (category in ('GENERAL','SPRAY','FERTILIZER','HARVEST','PROCESSING','MAINTENANCE','SALES','OTHER')),
  priority text not null default 'NORMAL'
    check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  status text not null default 'TODO'
    check (status in ('TODO','IN_PROGRESS','DONE','CANCELLED')),
  start_date date,
  start_time time,
  due_date date not null,
  due_time time,
  field_id uuid references public.fields(id),
  link_type text check (link_type is null or link_type in ('spray_plan','fertilizer_plan','harvest_plan')),
  link_id uuid,
  created_by uuid not null references auth.users(id),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  delete_reason text,
  check (start_date is null or due_date >= start_date)
);

create table if not exists public.calendar_task_assignees (
  task_id uuid not null references public.calendar_tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (task_id,user_id)
);

create table if not exists public.annual_harvest_plans (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null unique,
  plan_year integer not null check (plan_year between 2020 and 2100),
  month integer not null check (month between 1 and 12),
  period text,
  field_id uuid references public.fields(id),
  all_fields boolean not null default false,
  season text not null,
  harvest_method text,
  planned_start_date date,
  planned_end_date date,
  status text not null default 'planned' check (status in ('planned','completed','cancelled')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (all_fields or field_id is not null),
  check (planned_end_date is null or planned_start_date is null or planned_end_date >= planned_start_date)
);

create index if not exists idx_calendar_tasks_due_status on public.calendar_tasks(due_date,status) where deleted_at is null;
create index if not exists idx_calendar_tasks_link on public.calendar_tasks(link_type,link_id) where deleted_at is null and link_id is not null;
create index if not exists idx_calendar_tasks_field on public.calendar_tasks(field_id) where deleted_at is null and field_id is not null;
create index if not exists idx_calendar_task_assignees_user on public.calendar_task_assignees(user_id,task_id);
create index if not exists idx_annual_harvest_plans_year_month on public.annual_harvest_plans(plan_year,month) where deleted_at is null;

alter table public.calendar_tasks enable row level security;
alter table public.calendar_task_assignees enable row level security;
alter table public.annual_harvest_plans enable row level security;

revoke all on public.calendar_tasks from anon, authenticated, public;
revoke all on public.calendar_task_assignees from anon, authenticated, public;
revoke all on public.annual_harvest_plans from anon, authenticated, public;

insert into public.app_permission_definitions(permission_key,feature_key,feature_label,item_label,description,sort_order,locked,worker_default)
values
 ('calendar.view','calendar','作業カレンダー','閲覧','日々のタスクと年間計画をカレンダーで閲覧',181,false,true),
 ('calendar.manage','calendar','作業カレンダー','登録・編集・完了','タスク、担当者、年間収穫計画を管理',182,false,true)
on conflict(permission_key) do update set
 feature_key=excluded.feature_key,feature_label=excluded.feature_label,item_label=excluded.item_label,
 description=excluded.description,sort_order=excluded.sort_order,worker_default=excluded.worker_default;

insert into public.role_permissions(app_role,permission_key,allowed,updated_at)
values ('admin','calendar.view',true,now()),('admin','calendar.manage',true,now()),
       ('worker','calendar.view',true,now()),('worker','calendar.manage',true,now())
on conflict(app_role,permission_key) do update set allowed=excluded.allowed,updated_at=now();


-- Permission-checked RPCs used by the frontend.
CREATE OR REPLACE FUNCTION public.delete_annual_harvest_plan(p_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_before jsonb;
begin
  perform public.require_app_permission_('calendar.manage');
  if v_uid is null then raise exception 'ログインが必要です'; end if;
  select to_jsonb(p) into v_before from public.annual_harvest_plans p where p.id=p_plan_id and p.deleted_at is null for update;
  if v_before is null then raise exception '収穫計画が見つかりません'; end if;
  update public.annual_harvest_plans set deleted_at=now(),updated_at=now() where id=p_plan_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data)
  values(v_uid,'DELETE','annual_harvest_plan',p_plan_id::text,v_before);
end
$function$;

CREATE OR REPLACE FUNCTION public.delete_calendar_task(p_task_id uuid, p_reason text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_before jsonb;
begin
  perform public.require_app_permission_('calendar.manage');
  if v_uid is null then raise exception 'ログインが必要です'; end if;
  select to_jsonb(t) into v_before from public.calendar_tasks t where t.id=p_task_id and t.deleted_at is null for update;
  if v_before is null then raise exception 'タスクが見つかりません'; end if;
  update public.calendar_tasks set deleted_at=now(),deleted_by=v_uid,delete_reason=nullif(btrim(coalesce(p_reason,'')),''),updated_at=now() where id=p_task_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data)
  values(v_uid,'DELETE','calendar_task',p_task_id::text,v_before);
end
$function$;

CREATE OR REPLACE FUNCTION public.get_calendar_data(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  perform public.require_app_permission_('calendar.view');
  if auth.uid() is null then raise exception 'ログインが必要です'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception '期間が不正です'; end if;
  if p_end - p_start > 400 then raise exception '一度に取得できる期間は400日までです'; end if;

  select jsonb_build_object(
    'members',coalesce((
      select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.display_name,''),'担当者'),'role',p.role) order by p.display_name)
      from public.profiles p
      where p.role in ('admin','worker')
    ),'[]'::jsonb),
    'fields',coalesce((
      select jsonb_agg(jsonb_build_object('id',f.id,'legacyId',f.legacy_id,'name',f.name,'location',f.location) order by f.legacy_id)
      from public.fields f
      where f.deleted_at is null and f.status='active'
    ),'[]'::jsonb),
    'tasks',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,'title',t.title,'description',coalesce(t.description,''),
        'category',t.category,'priority',t.priority,'status',t.status,
        'startDate',t.start_date,'startTime',t.start_time,
        'dueDate',t.due_date,'dueTime',t.due_time,
        'fieldId',t.field_id,'fieldName',case when f.id is null then '' else concat(f.legacy_id,' ',f.name) end,
        'linkType',t.link_type,'linkId',t.link_id,
        'createdBy',t.created_by,'createdByName',coalesce(cp.display_name,''),
        'completedAt',t.completed_at,
        'assignees',coalesce((
          select jsonb_agg(jsonb_build_object('id',a.user_id,'name',coalesce(p2.display_name,'担当者')) order by p2.display_name)
          from public.calendar_task_assignees a
          join public.profiles p2 on p2.id=a.user_id
          where a.task_id=t.id
        ),'[]'::jsonb)
      ) order by t.due_date,t.due_time nulls last,t.created_at)
      from public.calendar_tasks t
      left join public.fields f on f.id=t.field_id
      left join public.profiles cp on cp.id=t.created_by
      where t.deleted_at is null
        and t.due_date >= p_start and coalesce(t.start_date,t.due_date) <= p_end
    ),'[]'::jsonb),
    'sprayPlans',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'legacyId',p.legacy_id,'date',coalesce(p.planned_date,make_date(p.plan_year,p.month,case p.period when '上旬' then 5 when '下旬' then 25 else 15 end)),
        'year',p.plan_year,'month',p.month,'period',coalesce(p.period,''),
        'title',p.target_pest,'material',coalesce(nullif(p.recommended_pesticide_text,''),'農薬未指定'),
        'fieldId',p.field_id,'fieldName',case when p.all_fields then '全圃場' when f.id is null then '個別圃場' else concat(f.legacy_id,' ',f.name) end,
        'status',p.status,'note',coalesce(p.note,'')
      ) order by coalesce(p.planned_date,make_date(p.plan_year,p.month,15)))
      from public.annual_spray_plans p
      left join public.fields f on f.id=p.field_id
      where p.deleted_at is null
        and coalesce(p.planned_date,make_date(p.plan_year,p.month,case p.period when '上旬' then 5 when '下旬' then 25 else 15 end)) between p_start and p_end
    ),'[]'::jsonb),
    'fertilizerPlans',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'legacyId',p.legacy_id,'date',coalesce(p.planned_date,make_date(p.plan_year,p.month,case p.period when '上旬' then 5 when '下旬' then 25 else 15 end)),
        'year',p.plan_year,'month',p.month,'period',coalesce(p.period,''),
        'title',coalesce(nullif(p.purpose,''),'施肥'),'material',coalesce(fz.name,nullif(p.fertilizer_text,''),'肥料未指定'),
        'fieldId',p.field_id,'fieldName',case when p.all_fields then '全圃場' when f.id is null then '個別圃場' else concat(f.legacy_id,' ',f.name) end,
        'status',p.status,'note',coalesce(p.note,'')
      ) order by coalesce(p.planned_date,make_date(p.plan_year,p.month,15)))
      from public.annual_fertilizer_plans p
      left join public.fields f on f.id=p.field_id
      left join public.fertilizers fz on fz.id=p.fertilizer_id
      where p.deleted_at is null
        and coalesce(p.planned_date,make_date(p.plan_year,p.month,case p.period when '上旬' then 5 when '下旬' then 25 else 15 end)) between p_start and p_end
    ),'[]'::jsonb),
    'harvestPlans',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'legacyId',p.legacy_id,
        'date',coalesce(p.planned_start_date,make_date(p.plan_year,p.month,case p.period when '上旬' then 5 when '下旬' then 25 else 15 end)),
        'endDate',p.planned_end_date,'year',p.plan_year,'month',p.month,'period',coalesce(p.period,''),
        'title',p.season,'method',coalesce(p.harvest_method,''),
        'fieldId',p.field_id,'fieldName',case when p.all_fields then '全圃場' when f.id is null then '個別圃場' else concat(f.legacy_id,' ',f.name) end,
        'status',p.status,'note',coalesce(p.note,'')
      ) order by coalesce(p.planned_start_date,make_date(p.plan_year,p.month,15)))
      from public.annual_harvest_plans p
      left join public.fields f on f.id=p.field_id
      where p.deleted_at is null
        and coalesce(p.planned_start_date,make_date(p.plan_year,p.month,case p.period when '上旬' then 5 when '下旬' then 25 else 15 end)) <= p_end
        and coalesce(p.planned_end_date,p.planned_start_date,make_date(p.plan_year,p.month,case p.period when '上旬' then 5 when '下旬' then 25 else 15 end)) >= p_start
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.save_annual_harvest_plan(p_plan_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid:=p_plan_id;
  v_uid uuid:=auth.uid();
  v_year int:=coalesce(nullif(p_payload->>'plan_year','')::int,extract(year from current_date)::int);
  v_month int:=coalesce(nullif(p_payload->>'month','')::int,extract(month from current_date)::int);
  v_all boolean:=coalesce((p_payload->>'all_fields')::boolean,false);
  v_field uuid:=nullif(p_payload->>'field_id','')::uuid;
  v_season text:=btrim(coalesce(p_payload->>'season',''));
  v_status text:=lower(coalesce(nullif(p_payload->>'status',''),'planned'));
  v_legacy text;
  v_before jsonb;
  v_after jsonb;
begin
  perform public.require_app_permission_('calendar.manage');
  if v_uid is null then raise exception 'ログインが必要です'; end if;
  if v_season='' then raise exception '茶期・収穫名を入力してください'; end if;
  if not v_all and v_field is null then raise exception '圃場を選択してください'; end if;
  if v_status not in ('planned','completed','cancelled') then raise exception '状態が不正です'; end if;

  if v_id is null then
    v_legacy:='HPL-'||v_year::text||'-'||upper(substr(md5(clock_timestamp()::text||random()::text),1,6));
    insert into public.annual_harvest_plans(
      legacy_id,plan_year,month,period,field_id,all_fields,season,harvest_method,planned_start_date,planned_end_date,status,note,created_by
    ) values(
      v_legacy,v_year,v_month,nullif(btrim(coalesce(p_payload->>'period','')),''),
      case when v_all then null else v_field end,v_all,v_season,nullif(btrim(coalesce(p_payload->>'harvest_method','')),''),
      nullif(p_payload->>'planned_start_date','')::date,nullif(p_payload->>'planned_end_date','')::date,
      v_status,nullif(btrim(coalesce(p_payload->>'note','')),''),v_uid
    ) returning id into v_id;
  else
    select to_jsonb(p) into v_before from public.annual_harvest_plans p where p.id=v_id and p.deleted_at is null for update;
    if v_before is null then raise exception '収穫計画が見つかりません'; end if;
    update public.annual_harvest_plans set
      plan_year=v_year,month=v_month,period=nullif(btrim(coalesce(p_payload->>'period','')),''),
      field_id=case when v_all then null else v_field end,all_fields=v_all,season=v_season,
      harvest_method=nullif(btrim(coalesce(p_payload->>'harvest_method','')),''),
      planned_start_date=nullif(p_payload->>'planned_start_date','')::date,
      planned_end_date=nullif(p_payload->>'planned_end_date','')::date,
      status=v_status,note=nullif(btrim(coalesce(p_payload->>'note','')),''),updated_at=now()
    where id=v_id;
  end if;

  select to_jsonb(p) into v_after from public.annual_harvest_plans p where p.id=v_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_uid,case when v_before is null then 'CREATE' else 'UPDATE' end,'annual_harvest_plan',v_id::text,v_before,v_after);
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.save_calendar_task(p_task_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid:=p_task_id;
  v_title text:=btrim(coalesce(p_payload->>'title',''));
  v_category text:=upper(coalesce(nullif(p_payload->>'category',''),'GENERAL'));
  v_priority text:=upper(coalesce(nullif(p_payload->>'priority',''),'NORMAL'));
  v_status text:=upper(coalesce(nullif(p_payload->>'status',''),'TODO'));
  v_start date:=nullif(p_payload->>'start_date','')::date;
  v_due date:=nullif(p_payload->>'due_date','')::date;
  v_field uuid:=nullif(p_payload->>'field_id','')::uuid;
  v_link_type text:=nullif(p_payload->>'link_type','');
  v_link_id uuid:=nullif(p_payload->>'link_id','')::uuid;
  v_uid uuid:=auth.uid();
  v_assignee text;
  v_before jsonb;
  v_after jsonb;
begin
  perform public.require_app_permission_('calendar.manage');
  if v_uid is null then raise exception 'ログインが必要です'; end if;
  if v_title='' then raise exception 'やることを入力してください'; end if;
  if v_due is null then raise exception '期限を入力してください'; end if;
  if v_start is not null and v_due<v_start then raise exception '期限は開始日以降にしてください'; end if;
  if v_category not in ('GENERAL','SPRAY','FERTILIZER','HARVEST','PROCESSING','MAINTENANCE','SALES','OTHER') then raise exception 'カテゴリが不正です'; end if;
  if v_priority not in ('LOW','NORMAL','HIGH','URGENT') then raise exception '優先度が不正です'; end if;
  if v_status not in ('TODO','IN_PROGRESS','DONE','CANCELLED') then raise exception '状態が不正です'; end if;

  if v_field is not null and not exists(select 1 from public.fields where id=v_field and deleted_at is null) then raise exception '圃場が見つかりません'; end if;

  if v_link_type is not null or v_link_id is not null then
    if v_link_type is null or v_link_id is null then raise exception '年間計画のリンク情報が不正です'; end if;
    if v_link_type='spray_plan' and not exists(select 1 from public.annual_spray_plans where id=v_link_id and deleted_at is null) then raise exception '防除計画が見つかりません'; end if;
    if v_link_type='fertilizer_plan' and not exists(select 1 from public.annual_fertilizer_plans where id=v_link_id and deleted_at is null) then raise exception '施肥計画が見つかりません'; end if;
    if v_link_type='harvest_plan' and not exists(select 1 from public.annual_harvest_plans where id=v_link_id and deleted_at is null) then raise exception '収穫計画が見つかりません'; end if;
  end if;

  if v_id is null then
    insert into public.calendar_tasks(title,description,category,priority,status,start_date,start_time,due_date,due_time,field_id,link_type,link_id,created_by,completed_at,completed_by)
    values(
      v_title,nullif(btrim(coalesce(p_payload->>'description','')),''),v_category,v_priority,v_status,v_start,
      nullif(p_payload->>'start_time','')::time,v_due,nullif(p_payload->>'due_time','')::time,v_field,v_link_type,v_link_id,v_uid,
      case when v_status='DONE' then now() else null end,case when v_status='DONE' then v_uid else null end
    ) returning id into v_id;
  else
    select to_jsonb(t) into v_before from public.calendar_tasks t where t.id=v_id and t.deleted_at is null for update;
    if v_before is null then raise exception 'タスクが見つかりません'; end if;
    update public.calendar_tasks set
      title=v_title,description=nullif(btrim(coalesce(p_payload->>'description','')),''),
      category=v_category,priority=v_priority,status=v_status,start_date=v_start,
      start_time=nullif(p_payload->>'start_time','')::time,due_date=v_due,due_time=nullif(p_payload->>'due_time','')::time,
      field_id=v_field,link_type=v_link_type,link_id=v_link_id,
      completed_at=case when v_status='DONE' then coalesce(completed_at,now()) else null end,
      completed_by=case when v_status='DONE' then coalesce(completed_by,v_uid) else null end,
      updated_at=now()
    where id=v_id;
    delete from public.calendar_task_assignees where task_id=v_id;
  end if;

  if jsonb_typeof(coalesce(p_payload->'assignee_ids','[]'::jsonb))='array' then
    for v_assignee in select jsonb_array_elements_text(coalesce(p_payload->'assignee_ids','[]'::jsonb))
    loop
      if not exists(select 1 from public.profiles where id=v_assignee::uuid and role in ('admin','worker')) then
        raise exception '担当者が見つかりません';
      end if;
      insert into public.calendar_task_assignees(task_id,user_id,assigned_by)
      values(v_id,v_assignee::uuid,v_uid)
      on conflict(task_id,user_id) do nothing;
    end loop;
  end if;

  select jsonb_build_object(
    'task',to_jsonb(t),
    'assignee_ids',coalesce((select jsonb_agg(a.user_id) from public.calendar_task_assignees a where a.task_id=v_id),'[]'::jsonb)
  ) into v_after
  from public.calendar_tasks t where t.id=v_id;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_uid,case when v_before is null then 'CREATE' else 'UPDATE' end,'calendar_task',v_id::text,v_before,v_after);

  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.set_calendar_task_status(p_task_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text:=upper(coalesce(p_status,''));
  v_uid uuid:=auth.uid();
  v_before jsonb;
  v_after jsonb;
begin
  perform public.require_app_permission_('calendar.manage');
  if v_uid is null then raise exception 'ログインが必要です'; end if;
  if v_status not in ('TODO','IN_PROGRESS','DONE','CANCELLED') then raise exception '状態が不正です'; end if;
  select to_jsonb(t) into v_before from public.calendar_tasks t where t.id=p_task_id and t.deleted_at is null for update;
  if v_before is null then raise exception 'タスクが見つかりません'; end if;
  update public.calendar_tasks set
    status=v_status,
    completed_at=case when v_status='DONE' then coalesce(completed_at,now()) else null end,
    completed_by=case when v_status='DONE' then coalesce(completed_by,v_uid) else null end,
    updated_at=now()
  where id=p_task_id;
  select to_jsonb(t) into v_after from public.calendar_tasks t where t.id=p_task_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_uid,'STATUS','calendar_task',p_task_id::text,v_before,v_after);
end
$function$;

revoke all on function public.get_calendar_data(date,date) from public,anon;
revoke all on function public.save_calendar_task(uuid,jsonb) from public,anon;
revoke all on function public.set_calendar_task_status(uuid,text) from public,anon;
revoke all on function public.delete_calendar_task(uuid,text) from public,anon;
revoke all on function public.save_annual_harvest_plan(uuid,jsonb) from public,anon;
revoke all on function public.delete_annual_harvest_plan(uuid) from public,anon;

grant execute on function public.get_calendar_data(date,date) to authenticated;
grant execute on function public.save_calendar_task(uuid,jsonb) to authenticated;
grant execute on function public.set_calendar_task_status(uuid,text) to authenticated;
grant execute on function public.delete_calendar_task(uuid,text) to authenticated;
grant execute on function public.save_annual_harvest_plan(uuid,jsonb) to authenticated;
grant execute on function public.delete_annual_harvest_plan(uuid) to authenticated;
