import { supabase } from './supabase'

export type CalendarMember={id:string;name:string;role:string}
export type CalendarField={id:string;legacyId:string;name:string;location:string}
export type CalendarAssignee={id:string;name:string}
export type CalendarChecklistItem={id:string;label:string;sortOrder:number;isDone:boolean;completedAt:string}
export type CalendarChecklistDraft={id?:string;label:string;isDone:boolean}
export type CalendarTask={
  id:string;title:string;description:string;category:string;priority:string;status:string;
  startDate:string;startTime:string;dueDate:string;dueTime:string;fieldId:string;fieldName:string;
  linkType:string;linkId:string;createdBy:string;createdByName:string;completedAt:string;assignees:CalendarAssignee[];checklist:CalendarChecklistItem[]
}
export type CalendarPlan={
  id:string;legacyId:string;date:string;endDate?:string;year:number;month:number;period:string;
  title:string;material?:string;method?:string;fieldId:string;fieldName:string;status:string;note:string;
}
export type CalendarData={
  currentUserId:string;members:CalendarMember[];fields:CalendarField[];tasks:CalendarTask[];
  sprayPlans:CalendarPlan[];fertilizerPlans:CalendarPlan[];harvestPlans:CalendarPlan[]
}
export type CalendarTaskInput={
  title:string;description:string;category:string;priority:string;status:string;
  startDate:string;startTime:string;dueDate:string;dueTime:string;fieldId:string;
  linkType:string;linkId:string;assigneeIds:string[];checklist:CalendarChecklistDraft[]
}
export type HarvestPlanInput={
  planYear:number;month:number;period:string;fieldId:string;allFields:boolean;season:string;harvestMethod:string;
  plannedStartDate:string;plannedEndDate:string;status:string;note:string
}

const emptyData:CalendarData={currentUserId:'',members:[],fields:[],tasks:[],sprayPlans:[],fertilizerPlans:[],harvestPlans:[]}
const arr=(v:any)=>Array.isArray(v)?v:[]

export async function loadCalendarData(start:string,end:string):Promise<CalendarData>{
  const{data,error}=await supabase.rpc('get_calendar_data_v2',{p_start:start,p_end:end})
  if(error)throw error
  const d=(data||{}) as any
  return{
    currentUserId:String(d.currentUserId||''),members:arr(d.members),fields:arr(d.fields),tasks:arr(d.tasks),
    sprayPlans:arr(d.sprayPlans),fertilizerPlans:arr(d.fertilizerPlans),harvestPlans:arr(d.harvestPlans),
  } as CalendarData
}

export async function saveCalendarTask(id:string|undefined,input:CalendarTaskInput){
  const{data,error}=await supabase.rpc('save_calendar_task_with_checklist',{p_task_id:id||null,p_payload:{
    title:input.title,description:input.description,category:input.category,priority:input.priority,status:input.status,
    start_date:input.startDate||'',start_time:input.startTime||'',due_date:input.dueDate,due_time:input.dueTime||'',
    field_id:input.fieldId||'',link_type:input.linkType||'',link_id:input.linkId||'',assignee_ids:input.assigneeIds,
    checklist:input.checklist.map((x,i)=>({label:x.label,isDone:x.isDone,sortOrder:i}))
  }})
  if(error)throw error
  return String(data||'')
}

export async function setCalendarTaskStatus(id:string,status:string){
  const{error}=await supabase.rpc('set_calendar_task_status',{p_task_id:id,p_status:status})
  if(error)throw error
}

export async function deleteCalendarTask(id:string,reason:string){
  const{error}=await supabase.rpc('delete_calendar_task',{p_task_id:id,p_reason:reason})
  if(error)throw error
}

export async function saveHarvestPlan(id:string|undefined,input:HarvestPlanInput){
  const{data,error}=await supabase.rpc('save_annual_harvest_plan',{p_plan_id:id||null,p_payload:{
    plan_year:input.planYear,month:input.month,period:input.period,field_id:input.fieldId||'',all_fields:input.allFields,
    season:input.season,harvest_method:input.harvestMethod,planned_start_date:input.plannedStartDate||'',
    planned_end_date:input.plannedEndDate||'',status:input.status,note:input.note
  }})
  if(error)throw error
  return String(data||'')
}

export async function deleteHarvestPlan(id:string){
  const{error}=await supabase.rpc('delete_annual_harvest_plan',{p_plan_id:id})
  if(error)throw error
}

export async function setCalendarChecklistItem(id:string,done:boolean){
  const{error}=await supabase.rpc('set_calendar_checklist_item',{p_item_id:id,p_done:done})
  if(error)throw error
}
