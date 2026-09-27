-- Keep overdue unfinished tasks visible even when the calendar is showing a later month.
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
        and (
          (t.due_date >= p_start and coalesce(t.start_date,t.due_date) <= p_end)
          or (t.status in ('TODO','IN_PROGRESS') and t.due_date < p_start)
        )
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
