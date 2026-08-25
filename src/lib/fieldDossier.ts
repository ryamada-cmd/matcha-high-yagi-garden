import { supabase } from './supabase'

export type DossierField={id:string;legacyId:string;name:string;location:string;areaM2:number;variety:string;cultivationType:string;harvestDate:string;status:string;note:string}
export type DossierEvent={id:string;type:'spray'|'fertilizer'|'spray_plan'|'fertilizer_plan'|'harvest';date:string;title:string;subtitle:string;detail:string;amount?:number;n?:number;p?:number;k?:number;status?:string}
export type FieldDossier={field:DossierField;events:DossierEvent[];summary:{sprayCount:number;pesticides:string[];fertilizerCount:number;fertilizerKg:number;nKg:number;pKg:number;kKg:number;};years:number[]}
const num=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0
const one=(v:any)=>Array.isArray(v)?v[0]:v
const yearOf=(d:string)=>Number(String(d||'').slice(0,4))||0

export async function loadFieldDossier(fieldId:string,year:number):Promise<FieldDossier>{
  const {data:f,error:fe}=await supabase.from('fields').select('*').eq('id',fieldId).maybeSingle();if(fe)throw fe;if(!f)throw new Error('圃場が見つかりません。')
  const field:DossierField={id:f.id,legacyId:f.legacy_id||'',name:f.name||'',location:f.location||'',areaM2:num(f.area_m2),variety:f.variety||'',cultivationType:f.cultivation_type||'',harvestDate:f.harvest_planned_date||'',status:f.status||'',note:f.note||''}

  const [{data:sbf,error:e1},{data:fal,error:e2},{data:sp,error:e3},{data:fp,error:e4}]=await Promise.all([
    supabase.from('spray_batch_fields').select('spray_batch_id,actual_spray_volume_l,standard_volume_l').eq('field_id',fieldId),
    supabase.from('fertilizer_application_lines').select('application_id,amount_kg,rate_kg_per_10a,nitrogen_kg,phosphate_kg,potassium_kg,fertilizers(name)').eq('field_id',fieldId),
    supabase.from('annual_spray_plans').select('id,legacy_id,plan_year,month,period,planned_date,status,target_pest,recommended_pesticide_text,pesticides:recommended_pesticide_id(name),note,all_fields,field_id').is('deleted_at',null).or(`field_id.eq.${fieldId},all_fields.eq.true`),
    supabase.from('annual_fertilizer_plans').select('id,legacy_id,plan_year,month,period,planned_date,status,purpose,fertilizer_text,fertilizers(name),planned_rate_kg_per_10a,note,all_fields,field_id').is('deleted_at',null).or(`field_id.eq.${fieldId},all_fields.eq.true`),
  ]);if(e1)throw e1;if(e2)throw e2;if(e3)throw e3;if(e4)throw e4

  const sprayIds=[...new Set((sbf||[]).map((x:any)=>x.spray_batch_id))]
  const appIds=[...new Set((fal||[]).map((x:any)=>x.application_id))]
  let batches:any[]=[];let chems:any[]=[];let apps:any[]=[]
  if(sprayIds.length){const [{data:b,error:be},{data:c,error:ce}]=await Promise.all([supabase.from('spray_batches').select('id,legacy_id,spray_date,target,operator_name_snapshot,weather,prepared_volume_l').in('id',sprayIds).is('deleted_at',null),supabase.from('spray_batch_chemicals').select('spray_batch_id,dilution,chemical_qty,chemical_unit,pesticides(name)').in('spray_batch_id',sprayIds)]);if(be)throw be;if(ce)throw ce;batches=b||[];chems=c||[]}
  if(appIds.length){const {data:a,error:ae}=await supabase.from('fertilizer_applications').select('id,legacy_id,application_date,operator_name_snapshot,method,weather,note').in('id',appIds).is('deleted_at',null);if(ae)throw ae;apps=a||[]}

  const years=new Set<number>([year])
  const events:DossierEvent[]=[]
  let sprayCount=0;const pesticides=new Set<string>();let fertilizerCount=0,fertilizerKg=0,nKg=0,pKg=0,kKg=0
  const sbfMap=new Map((sbf||[]).map((x:any)=>[x.spray_batch_id,x]))
  const chemMap=new Map<string,any[]>();for(const c of chems){const a=chemMap.get(c.spray_batch_id)||[];a.push(c);chemMap.set(c.spray_batch_id,a)}
  for(const b of batches){years.add(yearOf(b.spray_date));if(yearOf(b.spray_date)!==year)continue;const cs=chemMap.get(b.id)||[];cs.forEach(c=>{const name=one(c.pesticides)?.name;if(name)pesticides.add(name)});sprayCount++;const fld:any=sbfMap.get(b.id);events.push({id:`spray-${b.id}`,type:'spray',date:b.spray_date,title:`防除｜${b.target||'対象未入力'}`,subtitle:`${b.legacy_id||''} / ${b.operator_name_snapshot||'担当未入力'}`,detail:`${cs.map(c=>`${one(c.pesticides)?.name||'農薬'} ${c.dilution?`${c.dilution}倍`:''}`.trim()).join(' / ')}${fld?`｜実散布 ${num(fld.actual_spray_volume_l).toLocaleString()}L`:''}`})}

  const lineMap=new Map<string,any[]>();for(const l of fal||[]){const a=lineMap.get((l as any).application_id)||[];a.push(l);lineMap.set((l as any).application_id,a)}
  for(const a of apps){years.add(yearOf(a.application_date));if(yearOf(a.application_date)!==year)continue;const ls=lineMap.get(a.id)||[];const kg=ls.reduce((s,l)=>s+num(l.amount_kg),0),nn=ls.reduce((s,l)=>s+num(l.nitrogen_kg),0),pp=ls.reduce((s,l)=>s+num(l.phosphate_kg),0),kk=ls.reduce((s,l)=>s+num(l.potassium_kg),0);fertilizerCount++;fertilizerKg+=kg;nKg+=nn;pKg+=pp;kKg+=kk;events.push({id:`fert-${a.id}`,type:'fertilizer',date:a.application_date,title:`施肥｜${ls.map(l=>one(l.fertilizers)?.name||'肥料').join(' / ')}`,subtitle:`${a.legacy_id||''} / ${a.operator_name_snapshot||'担当未入力'}`,detail:`${kg.toFixed(3)}kg｜${ls.map(l=>`${num(l.rate_kg_per_10a).toFixed(1)}kg/10a`).join(' / ')}${a.method?`｜${a.method}`:''}`,amount:kg,n:nn,p:pp,k:kk})}

  for(const p of sp||[]){years.add(num((p as any).plan_year));if(num((p as any).plan_year)!==year)continue;const date=(p as any).planned_date||`${year}-${String((p as any).month).padStart(2,'0')}-15`;events.push({id:`splan-${(p as any).id}`,type:'spray_plan',date,title:`防除計画｜${(p as any).target_pest||'対象未入力'}`,subtitle:`${(p as any).month}月${(p as any).period?` ${(p as any).period}`:''}`,detail:`${one((p as any).pesticides)?.name||(p as any).recommended_pesticide_text||'推奨農薬未指定'}${(p as any).note?`｜${(p as any).note}`:''}`,status:(p as any).status||'planned'})}
  for(const p of fp||[]){years.add(num((p as any).plan_year));if(num((p as any).plan_year)!==year)continue;const date=(p as any).planned_date||`${year}-${String((p as any).month).padStart(2,'0')}-15`;events.push({id:`fplan-${(p as any).id}`,type:'fertilizer_plan',date,title:`施肥計画｜${(p as any).purpose||'目的未入力'}`,subtitle:`${(p as any).month}月${(p as any).period?` ${(p as any).period}`:''}`,detail:`${one((p as any).fertilizers)?.name||(p as any).fertilizer_text||'肥料未指定'}${(p as any).planned_rate_kg_per_10a?`｜${num((p as any).planned_rate_kg_per_10a)}kg/10a`:''}${(p as any).note?`｜${(p as any).note}`:''}`,status:(p as any).status||'planned'})}
  if(field.harvestDate){years.add(yearOf(field.harvestDate));if(yearOf(field.harvestDate)===year)events.push({id:'harvest',type:'harvest',date:field.harvestDate,title:'摘採予定',subtitle:`${field.legacyId} ${field.name}`,detail:'圃場マスタに登録された摘採予定日'})}
  events.sort((a,b)=>b.date.localeCompare(a.date)||a.type.localeCompare(b.type))
  return{field,events,summary:{sprayCount,pesticides:[...pesticides],fertilizerCount,fertilizerKg,nKg,pKg,kKg},years:[...years].filter(Boolean).sort((a,b)=>b-a)}
}
