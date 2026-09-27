create policy calendar_tasks_deny_direct on public.calendar_tasks
  as restrictive for all to anon,authenticated
  using (false) with check (false);

create policy calendar_task_assignees_deny_direct on public.calendar_task_assignees
  as restrictive for all to anon,authenticated
  using (false) with check (false);

create policy annual_harvest_plans_deny_direct on public.annual_harvest_plans
  as restrictive for all to anon,authenticated
  using (false) with check (false);
