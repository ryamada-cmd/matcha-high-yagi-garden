import { supabase } from './supabase'

export type OfficialResult={id:number;registration_no:string;pesticide_name:string;pesticide_type:string;purpose_category:string;company_name:string;crop_name:string;target_pest:string;use_purpose:string;dilution_or_rate:string;use_timing:string;spray_volume:string;product_use_count:string;application_method:string;application_place:string;active_ingredient:string;total_use_count:string;acquired_on:string}
export type GuidelineResult={id:number;source_category:string;category:string;target_pest_or_use:string;pesticide_name:string;formulation:string;dilution:string;spray_volume_or_rate:string;use_timing:string;use_count:string;toxicity:string;frac_irac:string;active_ingredient:string;registration_no:string;manufacturer:string;source_page:string;covering_exception:string;note:string;data_status:string}
export type ExpiredResult={id:number;expired_on:string;pesticide_name:string;expiry_type:string;note:string;source_page:string;verification_status:string}
export type CatalogSearch={official:OfficialResult[];guidelines:GuidelineResult[];expired:ExpiredResult[];counts:{official:number;guidelines:number;expired:number}}
export type CatalogStatus={role:string;official:number;guidelines:number;expired:number;sourceDate:string;importedAt:string}

export async function loadCatalogStatus():Promise<CatalogStatus>{
  const [profile,official,guidelines,expired,source]=await Promise.all([
    supabase.from('profiles').select('role').single(),
    supabase.from('pesticide_official_registrations').select('*',{count:'exact',head:true}),
    supabase.from('pesticide_guidelines').select('*',{count:'exact',head:true}),
    supabase.from('expired_pesticides').select('*',{count:'exact',head:true}),
    supabase.from('pesticide_data_sources').select('source_date,imported_at').eq('dataset','official').maybeSingle(),
  ])
  const error=profile.error||official.error||guidelines.error||expired.error||source.error
  if(error) throw error
  return {role:(profile.data as any)?.role||'',official:official.count||0,guidelines:guidelines.count||0,expired:expired.count||0,sourceDate:(source.data as any)?.source_date||'',importedAt:(source.data as any)?.imported_at||''}
}

export async function searchPesticideCatalog(query:string,limit=100):Promise<CatalogSearch>{
  const {data,error}=await supabase.rpc('search_pesticide_catalog',{p_query:query,p_limit:limit})
  if(error) throw error
  return (data||{official:[],guidelines:[],expired:[],counts:{official:0,guidelines:0,expired:0}}) as CatalogSearch
}

export async function syncFamic(){
  const {data,error}=await supabase.functions.invoke('sync-famic',{body:{}})
  if(error){
    const response=(error as any)?.context as Response|undefined
    if(response){
      try{
        const body=await response.clone().json()
        const detail=[body?.stage,body?.error].filter(Boolean).join('：')
        if(detail) throw new Error(detail)
      }catch(e){
        if(e instanceof Error && e.message!==error.message) throw e
      }
    }
    throw error
  }
  if((data as any)?.error){
    const detail=[(data as any)?.stage,(data as any)?.error].filter(Boolean).join('：')
    throw new Error(detail||'FAMIC同期に失敗しました')
  }
  return data as {ok:boolean;sourceDate:string;rows:number;files:string[]}
}
