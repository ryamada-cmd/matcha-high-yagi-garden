import { supabase } from './supabase'

export type DailyReportField={id:string;legacyId:string;name:string}
export type DailyReport={
  id:string;reportDate:string;authorId:string;authorName:string;weatherNote:string;workHours:number;
  workSummary:string;goodPoints:string;issues:string;nextActions:string;createdAt:string;updatedAt:string;fields:DailyReportField[]
}
export type DailyReportUser={id:string;role:string;displayName:string}
export type DailyReportFieldOption={id:string;legacyId:string;name:string;location:string;variety:string}
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0
const one=(v:any)=>Array.isArray(v)?v[0]:v

export async function loadDailyReportUser():Promise<DailyReportUser>{
  const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('ログインが必要です')
  const{data,error}=await supabase.from('profiles').select('id,role,display_name').eq('id',user.id).maybeSingle();if(error)throw error
  return{id:user.id,role:data?.role||'',displayName:data?.display_name||user.email||'担当者'}
}

export async function loadDailyReportFields():Promise<DailyReportFieldOption[]>{
  const{data,error}=await supabase.from('fields').select('id,legacy_id,name,location,variety').is('deleted_at',null).order('legacy_id');if(error)throw error
  return(data||[]).map((r:any)=>({id:r.id,legacyId:r.legacy_id||'',name:r.name||'',location:r.location||'',variety:r.variety||''}))
}

export async function loadDailyReports(limit=500):Promise<DailyReport[]>{
  const{data,error}=await supabase.from('daily_reports')
    .select('id,report_date,author_id,author_name_snapshot,weather_note,work_hours,work_summary,good_points,issues,next_actions,created_at,updated_at,daily_report_fields(field_id,fields(id,legacy_id,name))')
    .order('report_date',{ascending:false}).order('created_at',{ascending:false}).limit(limit)
  if(error)throw error
  return(data||[]).map((r:any)=>({
    id:r.id,reportDate:r.report_date||'',authorId:r.author_id||'',authorName:r.author_name_snapshot||'担当者',weatherNote:r.weather_note||'',workHours:n(r.work_hours),
    workSummary:r.work_summary||'',goodPoints:r.good_points||'',issues:r.issues||'',nextActions:r.next_actions||'',createdAt:r.created_at||'',updatedAt:r.updated_at||'',
    fields:(r.daily_report_fields||[]).map((x:any)=>{const f=one(x.fields);return{id:f?.id||x.field_id||'',legacyId:f?.legacy_id||'',name:f?.name||'圃場'}}).filter((f:DailyReportField)=>f.id)
  }))
}

export async function saveDailyReport(input:{id?:string;reportDate:string;weatherNote:string;workHours:number;workSummary:string;goodPoints:string;issues:string;nextActions:string;fieldIds:string[]}){
  const{data,error}=await supabase.rpc('save_daily_report',{p_payload:{id:input.id||'',report_date:input.reportDate,weather_note:input.weatherNote,work_hours:input.workHours,work_summary:input.workSummary,good_points:input.goodPoints,issues:input.issues,next_actions:input.nextActions,field_ids:input.fieldIds}});if(error)throw error;return data as string
}

export async function deleteDailyReport(id:string){const{error}=await supabase.rpc('delete_daily_report',{p_id:id});if(error)throw error}
