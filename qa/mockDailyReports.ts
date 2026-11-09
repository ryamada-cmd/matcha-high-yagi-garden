// Synthetic in-memory daily report service for Astryx browser QA.
// No Supabase client, credentials or external network access.
const entries:any[]=[]
const fields=[{id:'qa-field-a',legacyId:'QA-A',name:'架空茶園A',location:'架空圃場',variety:'やぶきた'}]
const me={id:'qa-user',role:'admin',displayName:'架空担当者'}
const copy=(v:any)=>JSON.parse(JSON.stringify(v))
export async function loadDailyReportUser(){return {...me}}
export async function loadDailyReportFields(){return fields.map(x=>({...x}))}
export async function loadDailyReports(){return copy(entries)}
export async function saveDailyReport(input:any){
 const id=input.id||'qa-daily-'+(entries.length+1)
 const item={...input,id,authorId:me.id,authorName:me.displayName,
  createdAt:'2026-11-10',updatedAt:'2026-11-10',
  fields:fields.filter(x=>input.fieldIds?.includes(x.id)).map(x=>({id:x.id,name:x.name,legacyId:x.legacyId}))}
 const i=entries.findIndex(x=>x.id===id)
 if(i<0)entries.unshift(item);else entries[i]=item
 ;(window as any).__qa_daily_saved=copy(item)
 return id
}
export async function deleteDailyReport(id:string){const i=entries.findIndex(x=>x.id===id);if(i>=0)entries.splice(i,1)}
