import { supabase } from './supabase'

export type PlanField = { id:string; legacyId:string; name:string; location:string }
export type PlanPesticide = { id:string; name:string; fracIrac:string }
export type AnnualPlan = {
  id:string; legacyId:string; year:number; month:number; period:string; fieldId:string; allFields:boolean;
  target:string; pesticideId:string; pesticideText:string; fracIrac:string; plannedDate:string; executedDate:string;
  status:'planned'|'completed'|'cancelled'; note:string
}
export type AnnualPlanInput = Omit<AnnualPlan,'id'>

export async function loadAnnualPlans(): Promise<{plans:AnnualPlan[];fields:PlanField[];pesticides:PlanPesticide[];role:string}> {
  const [plansRes,fieldsRes,pesticidesRes,profileRes] = await Promise.all([
    supabase.from('annual_spray_plans').select('id,legacy_id,plan_year,month,period,field_id,all_fields,target_pest,recommended_pesticide_id,recommended_pesticide_text,frac_irac,planned_date,executed_date,status,note').order('plan_year',{ascending:false}).order('month').order('period'),
    supabase.from('fields').select('id,legacy_id,name,location,status').eq('status','active').order('location').order('legacy_id'),
    supabase.from('pesticides').select('id,name,frac_irac').order('name'),
    supabase.from('profiles').select('role').single(),
  ])
  const err = plansRes.error || fieldsRes.error || pesticidesRes.error || profileRes.error
  if (err) throw err
  return {
    plans:(plansRes.data||[]).map((p:any)=>({
      id:p.id,legacyId:p.legacy_id||'',year:Number(p.plan_year)||0,month:Number(p.month)||0,period:p.period||'',fieldId:p.field_id||'',allFields:!!p.all_fields,
      target:p.target_pest||'',pesticideId:p.recommended_pesticide_id||'',pesticideText:p.recommended_pesticide_text||'',fracIrac:p.frac_irac||'',plannedDate:p.planned_date||'',executedDate:p.executed_date||'',status:(p.status||'planned') as AnnualPlan['status'],note:p.note||'',
    })),
    fields:(fieldsRes.data||[]).map((f:any)=>({id:f.id,legacyId:f.legacy_id||'',name:f.name||'',location:f.location||''})),
    pesticides:(pesticidesRes.data||[]).map((p:any)=>({id:p.id,name:p.name||'',fracIrac:p.frac_irac||''})),
    role:(profileRes.data as any)?.role||'',
  }
}

export async function saveAnnualPlan(planId:string|null,input:AnnualPlanInput){
  const payload={legacy_id:input.legacyId,plan_year:input.year,month:input.month,period:input.period,field_id:input.allFields?null:(input.fieldId||null),all_fields:input.allFields,target_pest:input.target,recommended_pesticide_id:input.pesticideId||null,recommended_pesticide_text:input.pesticideText,frac_irac:input.fracIrac,planned_date:input.plannedDate||null,executed_date:input.executedDate||null,status:input.status,note:input.note}
  const {data,error}=await supabase.rpc('save_annual_plan',{p_plan_id:planId||null,payload})
  if(error) throw error
  return data as {id:string;legacy_id:string;status:string}
}

export async function deleteAnnualPlan(planId:string,reason=''){
  const {data,error}=await supabase.rpc('delete_annual_plan',{p_plan_id:planId,p_reason:reason})
  if(error) throw error
  return data as {id:string;legacy_id:string;deleted:boolean}
}
