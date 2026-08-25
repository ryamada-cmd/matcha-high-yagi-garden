import { supabase } from './supabase'

export type HarvestField={id:string;legacyId:string;name:string;location:string;areaM2:number;variety:string}
export type HarvestRecord={id:string;legacyId:string;date:string;fieldId:string;fieldLegacyId:string;fieldName:string;location:string;areaM2:number;season:string;method:string;freshLeafKg:number;harvestedAreaM2:number|null;operator:string;destination:string;qualityNote:string;note:string;processedKg:number;remainingKg:number;yieldKgPer10a:number}
export type ProcessingSource={id:string;harvestId:string;harvestLegacyId:string;fieldId:string;fieldLegacyId:string;fieldName:string;harvestDate:string;inputKg:number}
export type ProcessingBatch={id:string;legacyId:string;date:string;processType:string;outputMaterial:string;outputKg:number;facility:string;costYen:number;operator:string;note:string;sources:ProcessingSource[];inputKg:number;yieldPct:number}
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0
const one=(v:any)=>Array.isArray(v)?v[0]:v

export async function loadHarvestRole(){const{data:{user}}=await supabase.auth.getUser();if(!user)return'';const{data,error}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();if(error)throw error;return data?.role||''}

export async function loadHarvestFields():Promise<HarvestField[]>{const{data,error}=await supabase.from('fields').select('id,legacy_id,name,location,area_m2,variety').is('deleted_at',null).eq('status','active').order('legacy_id');if(error)throw error;return(data||[]).map((r:any)=>({id:r.id,legacyId:r.legacy_id||'',name:r.name||'',location:r.location||'',areaM2:n(r.area_m2),variety:r.variety||''}))}

export async function loadHarvestRecords(limit=300):Promise<HarvestRecord[]>{
 const[{data:rows,error:e1},{data:usage,error:e2}]=await Promise.all([
  supabase.from('harvest_records').select('*,fields(legacy_id,name,location,area_m2)').is('deleted_at',null).order('harvest_date',{ascending:false}).order('created_at',{ascending:false}).limit(limit),
  supabase.from('harvest_processing_usage').select('*')
 ]);if(e1)throw e1;if(e2)throw e2
 const um=new Map((usage||[]).map((u:any)=>[u.harvest_record_id,{processed:n(u.processed_kg),remaining:n(u.remaining_kg)}]))
 return(rows||[]).map((r:any)=>{const f=one(r.fields);const u=um.get(r.id)||{processed:0,remaining:n(r.fresh_leaf_kg)};const area=r.harvested_area_m2===null?null:n(r.harvested_area_m2);const basis=area&&area>0?area:n(f?.area_m2);return{id:r.id,legacyId:r.legacy_id||'',date:r.harvest_date||'',fieldId:r.field_id,fieldLegacyId:f?.legacy_id||'',fieldName:f?.name||'圃場',location:f?.location||'',areaM2:n(f?.area_m2),season:r.season||'',method:r.harvest_method||'',freshLeafKg:n(r.fresh_leaf_kg),harvestedAreaM2:area,operator:r.operator_name_snapshot||'',destination:r.destination||'',qualityNote:r.quality_note||'',note:r.note||'',processedKg:u.processed,remainingKg:u.remaining,yieldKgPer10a:basis>0?n(r.fresh_leaf_kg)/(basis/1000):0}})
}

export async function saveHarvestRecord(input:{id?:string;date:string;fieldId:string;season:string;method:string;freshLeafKg:number;harvestedAreaM2:number|null;operator:string;destination:string;qualityNote:string;note:string}){const{data,error}=await supabase.rpc('save_harvest_record',{p_payload:{id:input.id||'',harvest_date:input.date,field_id:input.fieldId,season:input.season,harvest_method:input.method,fresh_leaf_kg:input.freshLeafKg,harvested_area_m2:input.harvestedAreaM2??'',operator_name:input.operator,destination:input.destination,quality_note:input.qualityNote,note:input.note}});if(error)throw error;return data as string}
export async function deleteHarvestRecord(id:string,reason:string){const{error}=await supabase.rpc('delete_harvest_record',{p_id:id,p_reason:reason});if(error)throw error}

export async function loadProcessingBatches(limit=200):Promise<ProcessingBatch[]>{
 const{data:batches,error:e1}=await supabase.from('tea_processing_batches').select('*').is('deleted_at',null).order('processing_date',{ascending:false}).order('created_at',{ascending:false}).limit(limit);if(e1)throw e1
 const ids=(batches||[]).map((b:any)=>b.id);if(!ids.length)return[]
 const{data:sources,error:e2}=await supabase.from('tea_processing_batch_harvests').select('id,processing_batch_id,harvest_record_id,input_kg,harvest_records(legacy_id,harvest_date,field_id,fields(legacy_id,name))').in('processing_batch_id',ids);if(e2)throw e2
 const by=new Map<string,ProcessingSource[]>();for(const s of sources||[]){const h=one((s as any).harvest_records);const f=one(h?.fields);const arr=by.get((s as any).processing_batch_id)||[];arr.push({id:(s as any).id,harvestId:(s as any).harvest_record_id,harvestLegacyId:h?.legacy_id||'',fieldId:h?.field_id||'',fieldLegacyId:f?.legacy_id||'',fieldName:f?.name||'圃場',harvestDate:h?.harvest_date||'',inputKg:n((s as any).input_kg)});by.set((s as any).processing_batch_id,arr)}
 return(batches||[]).map((b:any)=>{const ss=by.get(b.id)||[];const input=ss.reduce((sum,x)=>sum+x.inputKg,0);return{id:b.id,legacyId:b.legacy_id||'',date:b.processing_date||'',processType:b.process_type||'',outputMaterial:b.output_material||'',outputKg:n(b.output_kg),facility:b.facility||'',costYen:n(b.processing_cost_yen),operator:b.operator_name_snapshot||'',note:b.note||'',sources:ss,inputKg:input,yieldPct:input>0?n(b.output_kg)/input*100:0}})
}

export async function saveProcessingBatch(input:{id?:string;date:string;processType:string;outputMaterial:string;outputKg:number;facility:string;costYen:number;operator:string;note:string;sources:Array<{harvestId:string;inputKg:number}>}){const{data,error}=await supabase.rpc('save_tea_processing_batch',{p_payload:{id:input.id||'',processing_date:input.date,process_type:input.processType,output_material:input.outputMaterial,output_kg:input.outputKg,facility:input.facility,processing_cost_yen:input.costYen,operator_name:input.operator,note:input.note,sources:input.sources.map(x=>({harvest_record_id:x.harvestId,input_kg:x.inputKg}))}});if(error)throw error;return data as string}
export async function deleteProcessingBatch(id:string,reason:string){const{error}=await supabase.rpc('delete_tea_processing_batch',{p_id:id,p_reason:reason});if(error)throw error}
