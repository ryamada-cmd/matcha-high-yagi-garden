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

-- Functions are intentionally omitted here to keep this checked-in migration readable.
-- Production contains the permission-checked RPCs:
-- get_calendar_data, save_calendar_task, set_calendar_task_status,
-- delete_calendar_task, save_annual_harvest_plan, delete_annual_harvest_plan.
