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


CREATE OR REPLACE FUNCTION public.get_calendar_data_v2(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base jsonb;
  v_tasks jsonb;
  v_uid uuid:=auth.uid();
begin
  perform public.require_app_permission_('calendar.view');
  if v_uid is null then raise exception 'ログインが必要です'; end if;

  v_base:=public.get_calendar_data(p_start,p_end);

  select coalesce(jsonb_agg(
    t ||
    jsonb_build_object(
      'checklist',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',c.id,
          'label',c.label,
          'sortOrder',c.sort_order,
          'isDone',c.is_done,
          'completedAt',c.completed_at
        ) order by c.sort_order,c.created_at,c.id)
        from public.calendar_task_checklist_items c
        where c.task_id=(t->>'id')::uuid
      ),'[]'::jsonb)
    )
    order by t->>'dueDate',t->>'dueTime'
  ),'[]'::jsonb)
  into v_tasks
  from jsonb_array_elements(coalesce(v_base->'tasks','[]'::jsonb)) t;

  return v_base || jsonb_build_object(
    'currentUserId',v_uid,
    'tasks',v_tasks
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.save_calendar_task_with_checklist(p_task_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_uid uuid:=auth.uid();
  v_item jsonb;
  v_label text;
  v_done boolean;
  v_sort integer:=0;
begin
  perform public.require_app_permission_('calendar.manage');
  if v_uid is null then raise exception 'ログインが必要です'; end if;

  v_id:=public.save_calendar_task(p_task_id,p_payload);

  if jsonb_typeof(coalesce(p_payload->'checklist','[]'::jsonb)) <> 'array' then
    raise exception 'チェックリスト形式が不正です';
  end if;

  if jsonb_array_length(coalesce(p_payload->'checklist','[]'::jsonb)) > 30 then
    raise exception 'チェックリストは30項目までです';
  end if;

  delete from public.calendar_task_checklist_items where task_id=v_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'checklist','[]'::jsonb))
  loop
    v_label:=btrim(coalesce(v_item->>'label',''));
    if v_label='' then continue; end if;
    if char_length(v_label)>200 then raise exception 'チェック項目は200文字以内です'; end if;
    v_done:=coalesce((v_item->>'isDone')::boolean,false);

    insert into public.calendar_task_checklist_items(
      task_id,label,sort_order,is_done,completed_at,completed_by
    ) values(
      v_id,v_label,v_sort,v_done,
      case when v_done then now() else null end,
      case when v_done then v_uid else null end
    );
    v_sort:=v_sort+1;
  end loop;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(
    v_uid,'CHECKLIST_SAVE','calendar_task',v_id::text,
    jsonb_build_object('checklist_count',v_sort)
  );

  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.set_calendar_checklist_item(p_item_id uuid, p_done boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_task_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  perform public.require_app_permission_('calendar.manage');
  if v_uid is null then raise exception 'ログインが必要です'; end if;

  select c.task_id,to_jsonb(c)
  into v_task_id,v_before
  from public.calendar_task_checklist_items c
  join public.calendar_tasks t on t.id=c.task_id
  where c.id=p_item_id and t.deleted_at is null
  for update of c;

  if v_task_id is null then raise exception 'チェック項目が見つかりません'; end if;

  update public.calendar_task_checklist_items
  set is_done=coalesce(p_done,false),
      completed_at=case when coalesce(p_done,false) then now() else null end,
      completed_by=case when coalesce(p_done,false) then v_uid else null end,
      updated_at=now()
  where id=p_item_id;

  select to_jsonb(c) into v_after
  from public.calendar_task_checklist_items c where c.id=p_item_id;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(v_uid,'CHECKLIST_TOGGLE','calendar_task_checklist_item',p_item_id::text,v_before,v_after);
end
$function$;

revoke all on function public.get_calendar_data_v2(date,date) from public,anon;
revoke all on function public.save_calendar_task_with_checklist(uuid,jsonb) from public,anon;
revoke all on function public.set_calendar_checklist_item(uuid,boolean) from public,anon;

grant execute on function public.get_calendar_data_v2(date,date) to authenticated;
grant execute on function public.save_calendar_task_with_checklist(uuid,jsonb) to authenticated;
grant execute on function public.set_calendar_checklist_item(uuid,boolean) to authenticated;
