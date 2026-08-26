import { supabase } from './supabase'

export type Fertilizer = {
  id:string; legacyId:string; name:string; manufacturer:string; category:string;
  n:number; p:number; k:number; mg:number; ca:number; note:string; active:boolean;
  officialRegistrationId:string; officialRegistrationNo:string; officialSourceDate:string
}
export type OfficialFertilizer = {
  id:string; registrationNo:string; registrationCategory:string; name:string; company:string; type:string;
  registrationDate:string; expirationDate:string; validPeriod:string; address:string; lapseStatus:string; components:Record<string,number>;
  sourceDate:string; sourceUrl:string; n:number; p:number; k:number; mg:number; ca:number
}
export type OfficialFertilizerMeta = { count:number; sourceDate:string; rowCount:number; completedAt:string }
export type FertilizerLot = {
  id:string; legacyId:string; fertilizerId:string; fertilizerName:string; balanceKg:number;
  purchaseDate:string; supplier:string; purchaseUnitPrice:number; packageCount:number;
  packageUnit:string; packageSizeKg:number; purchasedQtyKg:number; storage:string;
  manufacturerLotNo:string; note:string; stockValue:number
}
export type FertilizerField = { id:string; legacyId:string; name:string; location:string; areaM2:number }
export type FertilizerApplicationLine = {
  id:string; fertilizerId:string; lotId:string; fieldId:string;
  fertilizerName:string; fieldName:string; fieldLegacyId:string; amountKg:number;
  rateKgPer10a:number; nKg:number; pKg:number; kKg:number
}
export type FertilizerApplication = {
  id:string; legacyId:string; date:string; operator:string; method:string; weather:string; note:string;
  lines:FertilizerApplicationLine[]; totalKg:number; nKg:number; pKg:number; kKg:number
}
export type FertilizerPlan = {
  id:string; legacyId:string; planYear:number; month:number; period:string; fieldId:string|null; allFields:boolean;
  fieldName:string; purpose:string; fertilizerId:string|null; fertilizerName:string; rateKgPer10a:number|null;
  plannedDate:string; executedDate:string; status:string; note:string
}
export type FertilizerFieldNpk = {
  year:number; fieldId:string; legacyId:string; fieldName:string; location:string;
  fertilizerKg:number; nKg:number; pKg:number; kKg:number
}

const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0
const maybe=(v:unknown)=>v===null||v===undefined||v===''?null:n(v)
const one=(v:any)=>Array.isArray(v)?v[0]:v
const first=(...xs:Array<number|null>)=>xs.find(x=>x!==null)??0

export async function loadFertilizerRole(){
  const {data:{user}}=await supabase.auth.getUser(); if(!user)return ''
  const {data,error}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle(); if(error)throw error
  return data?.role||''
}

export async function loadFertilizers():Promise<Fertilizer[]>{
  const {data,error}=await supabase.from('fertilizers').select('*').is('deleted_at',null).order('name'); if(error)throw error
  return (data||[]).map((r:any)=>({id:r.id,legacyId:r.legacy_id||'',name:r.name||'',manufacturer:r.manufacturer||'',category:r.category||'',n:n(r.nitrogen_percent),p:n(r.phosphate_percent),k:n(r.potassium_percent),mg:n(r.magnesium_percent),ca:n(r.calcium_percent),note:r.note||'',active:r.is_active!==false,officialRegistrationId:r.official_registration_id||'',officialRegistrationNo:r.official_registration_no||'',officialSourceDate:r.official_source_date||''}))
}

export async function saveFertilizer(input:{id?:string;name:string;manufacturer?:string;category?:string;n:number;p:number;k:number;mg?:number;ca?:number;note?:string;active?:boolean;officialRegistrationId?:string}){
  const {data,error}=await supabase.rpc('admin_save_fertilizer',{p_payload:{id:input.id||'',name:input.name,manufacturer:input.manufacturer||'',category:input.category||'',nitrogen_percent:input.n,phosphate_percent:input.p,potassium_percent:input.k,magnesium_percent:input.mg||0,calcium_percent:input.ca||0,note:input.note||'',is_active:input.active??true,official_registration_id:input.officialRegistrationId||''}}); if(error)throw error; return data as string
}

function mapOfficial(r:any):OfficialFertilizer{
  const components:Record<string,number>={};for(const[k,v]of Object.entries(r.components||{})){if(Number.isFinite(Number(v)))components[k]=Number(v)}
  return {id:r.id,registrationNo:r.registration_no||'',registrationCategory:r.registration_category||'',name:r.fertilizer_name||'',company:r.company_name||'',type:r.fertilizer_type||'',registrationDate:r.registration_date||'',expirationDate:r.expiration_date||'',validPeriod:r.valid_period||'',address:r.address||'',lapseStatus:r.lapse_status||'',components,sourceDate:r.source_date||'',sourceUrl:r.source_url||'',n:first(maybe(r.tn),maybe(r.an),maybe(r.nn)),p:first(maybe(r.tp),maybe(r.cp),maybe(r.sp),maybe(r.wp)),k:first(maybe(r.tk),maybe(r.ck),maybe(r.wk)),mg:first(maybe(r.smg),maybe(r.cmg),maybe(r.wmg)),ca:first(maybe(r.sca),maybe(r.cca),maybe(r.wca))}
}

export async function loadOfficialFertilizerMeta():Promise<OfficialFertilizerMeta>{
  const [{count,error:e1},{data:log,error:e2}]=await Promise.all([
    supabase.from('fertilizer_official_registrations').select('id',{count:'exact',head:true}),
    supabase.from('fertilizer_official_sync_log').select('source_date,row_count,completed_at').order('completed_at',{ascending:false}).limit(1).maybeSingle()
  ]);if(e1)throw e1;if(e2)throw e2
  return {count:count||0,sourceDate:log?.source_date||'',rowCount:n(log?.row_count),completedAt:log?.completed_at||''}
}

export async function searchOfficialFertilizers(query='',limit=100,offset=0):Promise<OfficialFertilizer[]>{
  const {data,error}=await supabase.rpc('search_official_fertilizers',{p_query:query,p_limit:limit,p_offset:offset});if(error)throw error
  return (data||[]).map(mapOfficial)
}

export async function syncOfficialFertilizers():Promise<{sourceDate:string;rows:number;csvFiles:string[]}>{
  const {data,error}=await supabase.functions.invoke('sync-fertilizers',{body:{}})
  if(error)throw new Error((data as any)?.error||error.message||'公式肥料DBを同期できませんでした。')
  if((data as any)?.error)throw new Error((data as any).error)
  return {sourceDate:(data as any)?.sourceDate||'',rows:n((data as any)?.rows),csvFiles:Array.isArray((data as any)?.csvFiles)?(data as any).csvFiles:[]}
}

export async function loadFertilizerLots():Promise<FertilizerLot[]>{
  const [{data:lots,error:e1},{data:balances,error:e2}]=await Promise.all([
    supabase.from('fertilizer_inventory_lots').select('*,fertilizers(name)').order('created_at',{ascending:false}),
    supabase.from('fertilizer_inventory_balances').select('*')
  ]); if(e1)throw e1;if(e2)throw e2
  const bal=new Map((balances||[]).map((b:any)=>[b.inventory_lot_id,n(b.balance_kg)]))
  return (lots||[]).map((r:any)=>{const balance=bal.get(r.id)||0;const unit=n(r.purchase_unit_price);const size=n(r.package_size_kg);return {id:r.id,legacyId:r.legacy_id||'',fertilizerId:r.fertilizer_id,fertilizerName:one(r.fertilizers)?.name||'肥料',balanceKg:balance,purchaseDate:r.purchase_date||'',supplier:r.supplier||'',purchaseUnitPrice:unit,packageCount:n(r.package_count),packageUnit:r.package_unit||'袋',packageSizeKg:size,purchasedQtyKg:n(r.purchased_qty_kg),storage:r.storage_location||'',manufacturerLotNo:r.manufacturer_lot_no||'',note:r.note||'',stockValue:size>0?balance*(unit/size):0}})
}

export async function receiveFertilizerLot(input:{fertilizerId:string;purchaseDate:string;supplier:string;purchaseUnitPrice:number;packageCount:number;packageUnit:string;packageSizeKg:number;storageLocation:string;manufacturerLotNo:string;note:string}){
  const {data,error}=await supabase.rpc('admin_receive_fertilizer_lot',{p_payload:{fertilizer_id:input.fertilizerId,purchase_date:input.purchaseDate,supplier:input.supplier,purchase_unit_price:input.purchaseUnitPrice,package_count:input.packageCount,package_unit:input.packageUnit,package_size_kg:input.packageSizeKg,storage_location:input.storageLocation,manufacturer_lot_no:input.manufacturerLotNo,note:input.note}});if(error)throw error;return data as string
}
export async function adjustFertilizerStock(lotId:string,targetKg:number,reason:string){const{data,error}=await supabase.rpc('admin_adjust_fertilizer_stock',{p_lot_id:lotId,p_target_balance_kg:targetKg,p_reason:reason});if(error)throw error;return n(data)}
export async function disposeFertilizerStock(lotId:string,qtyKg:number,reason:string){const{data,error}=await supabase.rpc('admin_dispose_fertilizer_stock',{p_lot_id:lotId,p_quantity_kg:qtyKg,p_reason:reason});if(error)throw error;return n(data)}

export async function loadFertilizerFields():Promise<FertilizerField[]>{
  const {data,error}=await supabase.from('fields').select('id,legacy_id,name,location,area_m2').is('deleted_at',null).eq('status','active').order('legacy_id');if(error)throw error
  return (data||[]).map((r:any)=>({id:r.id,legacyId:r.legacy_id||'',name:r.name||'',location:r.location||'',areaM2:n(r.area_m2)}))
}

export async function registerFertilizerApplication(input:{date:string;operator:string;method:string;weather:string;note:string;lines:Array<{fertilizerId:string;lotId:string;fieldId:string;amountKg:number}>}){
  const {data,error}=await supabase.rpc('register_fertilizer_application',{p_payload:{application_date:input.date,operator_name:input.operator,method:input.method,weather:input.weather,note:input.note,lines:input.lines.map(x=>({fertilizer_id:x.fertilizerId,inventory_lot_id:x.lotId,field_id:x.fieldId,amount_kg:x.amountKg}))}});if(error)throw error;return data as string
}
export async function updateFertilizerApplication(id:string,input:{date:string;operator:string;method:string;weather:string;note:string;lines:Array<{fertilizerId:string;lotId:string;fieldId:string;amountKg:number}>}){
  const {data,error}=await supabase.rpc('update_fertilizer_application',{p_application_id:id,p_payload:{application_date:input.date,operator_name:input.operator,method:input.method,weather:input.weather,note:input.note,lines:input.lines.map(x=>({fertilizer_id:x.fertilizerId,inventory_lot_id:x.lotId,field_id:x.fieldId,amount_kg:x.amountKg}))}});if(error)throw error;return data as string
}
export async function deleteFertilizerApplication(id:string,reason:string){const{error}=await supabase.rpc('delete_fertilizer_application',{p_application_id:id,p_reason:reason});if(error)throw error}

function mapApplicationLines(lines:any[]){
  const by=new Map<string,FertilizerApplicationLine[]>()
  for(const l of lines||[]){
    const arr=by.get(l.application_id)||[];const f=one(l.fields);const fert=one(l.fertilizers)
    arr.push({id:l.id,fertilizerId:l.fertilizer_id,lotId:l.inventory_lot_id,fieldId:l.field_id,fertilizerName:fert?.name||'肥料',fieldName:f?.name||'圃場',fieldLegacyId:f?.legacy_id||'',amountKg:n(l.amount_kg),rateKgPer10a:n(l.rate_kg_per_10a),nKg:n(l.nitrogen_kg),pKg:n(l.phosphate_kg),kKg:n(l.potassium_kg)})
    by.set(l.application_id,arr)
  }
  return by
}

function mapApplications(apps:any[],by:Map<string,FertilizerApplicationLine[]>):FertilizerApplication[]{
  return (apps||[]).map((a:any)=>{const ls=by.get(a.id)||[];return{id:a.id,legacyId:a.legacy_id||'',date:a.application_date||'',operator:a.operator_name_snapshot||'',method:a.method||'',weather:a.weather||'',note:a.note||'',lines:ls,totalKg:ls.reduce((s,x)=>s+x.amountKg,0),nKg:ls.reduce((s,x)=>s+x.nKg,0),pKg:ls.reduce((s,x)=>s+x.pKg,0),kKg:ls.reduce((s,x)=>s+x.kKg,0)}})
}

export async function loadFertilizerApplications(limit=200):Promise<FertilizerApplication[]>{
  const {data:apps,error:e1}=await supabase.from('fertilizer_applications').select('*').is('deleted_at',null).order('application_date',{ascending:false}).order('created_at',{ascending:false}).limit(limit);if(e1)throw e1
  const ids=(apps||[]).map((a:any)=>a.id); if(!ids.length)return []
  const {data:lines,error:e2}=await supabase.from('fertilizer_application_lines').select('*,fertilizers(name),fields(name,legacy_id)').in('application_id',ids);if(e2)throw e2
  return mapApplications(apps||[],mapApplicationLines(lines||[]))
}

export async function loadFertilizerApplication(id:string):Promise<FertilizerApplication|null>{
  const [{data:app,error:e1},{data:lines,error:e2}]=await Promise.all([
    supabase.from('fertilizer_applications').select('*').eq('id',id).is('deleted_at',null).maybeSingle(),
    supabase.from('fertilizer_application_lines').select('*,fertilizers(name),fields(name,legacy_id)').eq('application_id',id).order('created_at')
  ]);if(e1)throw e1;if(e2)throw e2;if(!app)return null
  return mapApplications([app],mapApplicationLines(lines||[]))[0]||null
}

export async function loadFertilizerNpkByField(year:number):Promise<FertilizerFieldNpk[]>{
  const [{data:rows,error:e1},{data:fields,error:e2}]=await Promise.all([
    supabase.from('fertilizer_npk_by_field_year').select('*').eq('application_year',year),
    supabase.from('fields').select('id,legacy_id,name,location').is('deleted_at',null)
  ]);if(e1)throw e1;if(e2)throw e2
  const fm=new Map((fields||[]).map((f:any)=>[f.id,f]))
  return (rows||[]).map((r:any)=>{const f=fm.get(r.field_id) as any;return{year:n(r.application_year),fieldId:r.field_id,legacyId:f?.legacy_id||'',fieldName:f?.name||'圃場',location:f?.location||'',fertilizerKg:n(r.fertilizer_kg),nKg:n(r.nitrogen_kg),pKg:n(r.phosphate_kg),kKg:n(r.potassium_kg)}}).sort((a,b)=>a.legacyId.localeCompare(b.legacyId))
}

export async function loadFertilizerPlans():Promise<FertilizerPlan[]>{
  const {data,error}=await supabase.from('annual_fertilizer_plans').select('*,fields(name,legacy_id),fertilizers(name)').is('deleted_at',null).order('plan_year',{ascending:false}).order('month').order('planned_date');if(error)throw error
  return (data||[]).map((r:any)=>({id:r.id,legacyId:r.legacy_id||'',planYear:n(r.plan_year),month:n(r.month),period:r.period||'',fieldId:r.field_id||null,allFields:!!r.all_fields,fieldName:r.all_fields?'全圃場':`${one(r.fields)?.legacy_id||''} ${one(r.fields)?.name||''}`.trim(),purpose:r.purpose||'',fertilizerId:r.fertilizer_id||null,fertilizerName:one(r.fertilizers)?.name||r.fertilizer_text||'未指定',rateKgPer10a:r.planned_rate_kg_per_10a===null?null:n(r.planned_rate_kg_per_10a),plannedDate:r.planned_date||'',executedDate:r.executed_date||'',status:r.status||'planned',note:r.note||''}))
}
export async function saveFertilizerPlan(input:any){const{data,error}=await supabase.rpc('admin_save_fertilizer_plan',{p_payload:{id:input.id||'',plan_year:input.planYear,month:input.month,period:input.period||'',field_id:input.fieldId||'',all_fields:!!input.allFields,purpose:input.purpose||'',fertilizer_id:input.fertilizerId||'',fertilizer_text:input.fertilizerText||'',planned_rate_kg_per_10a:input.rateKgPer10a??'',planned_date:input.plannedDate||'',executed_date:input.executedDate||'',status:input.status||'planned',note:input.note||''}});if(error)throw error;return data as string}
export async function deleteFertilizerPlan(id:string){const{error}=await supabase.rpc('admin_delete_fertilizer_plan',{p_id:id});if(error)throw error}
