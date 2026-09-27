-- Calendar checklist items and current-user context.
-- Applied to production on 2026-09-27 as calendar_checklists_and_self_context.

create table if not exists public.calendar_task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.calendar_tasks(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 200),
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  is_done boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_calendar_task_checklist_task
  on public.calendar_task_checklist_items(task_id,sort_order,id);

alter table public.calendar_task_checklist_items enable row level security;
revoke all on public.calendar_task_checklist_items from anon,authenticated,public;

create policy calendar_task_checklist_items_deny_direct
  on public.calendar_task_checklist_items
  as restrictive for all to anon,authenticated
  using (false) with check (false);

-- Production RPCs:
-- get_calendar_data_v2(date,date)
-- save_calendar_task_with_checklist(uuid,jsonb)
-- set_calendar_checklist_item(uuid,boolean)
-- All are SECURITY DEFINER with search_path='' and permission checks.
