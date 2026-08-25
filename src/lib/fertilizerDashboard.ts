import { supabase } from './supabase'

export type FertilizerDashboardData={stockKg:number;stockLots:number;masterCount:number;nKg:number;pKg:number;kKg:number;nextPlan:null|{label:string;purpose:string;fertilizer:string;rate:number|null;date:string};lastApplication:null|{date:string;totalKg:number}}
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0
const one=(v:any)=>Array.isArray(v)?v[0]:v
const today=()=>new Intl.DateTimeFormat('sv-SE').format(new Date())
function periodDay(p:string){return p==='上旬'?5:p==='中旬'?15:p==='下旬'?25:15}
function planDate(r:any){if(r.planned_date)return String(r.planned_date);return `${r.plan_year}-${String(r.month).padStart(2,'0')}-${String(periodDay(r.period||'')).padStart(2,'0')}`}
export async function loadFertilizerDashboard():Promise<FertilizerDashboardData>{
 const y=Number(today().slice(0,4));const[{data:balances,error:e1},{data:masters,error:e2},{data:npk,error:e3},{data:plans,error:e4},{data:apps,error:e5}]=await Promise.all([
  supabase.from('fertilizer_inventory_balances').select('inventory_lot_id,balance_kg'),
  supabase.from('fertilizers').select('id').is('deleted_at',null).eq('is_active',true),
  supabase.from('fertilizer_npk_by_field_year').select('fertilizer_kg,nitrogen_kg,phosphate_kg,potassium_kg').eq('application_year',y),
  supabase.from('annual_fertilizer_plans').select('plan_year,month,period,purpose,planned_rate_kg_per_10a,planned_date,status,fertilizers(name)').is('deleted_at',null).eq('plan_year',y),
  supabase.from('fertilizer_applications').select('id,application_date').is('deleted_at',null).order('application_date',{ascending:false}).order('created_at',{ascending:false}).limit(1)
 ]);const err=e1||e2||e3||e4||e5;if(err)throw err
 const active=(balances||[]).filter((b:any)=>n(b.balance_kg)>0),stockKg=active.reduce((s:number,b:any)=>s+n(b.balance_kg),0),rows=npk||[],nKg=rows.reduce((s:number,r:any)=>s+n(r.nitrogen_kg),0),pKg=rows.reduce((s:number,r:any)=>s+n(r.phosphate_kg),0),kKg=rows.reduce((s:number,r:any)=>s+n(r.potassium_kg),0)
 const open=(plans||[]).filter((r:any)=>!['completed','cancelled','実施済','中止'].includes(String(r.status||'').toLowerCase())).map((r:any)=>({...r,_date:planDate(r)})).filter((r:any)=>r._date>=today()).sort((a:any,b:any)=>a._date.localeCompare(b._date));const p=open[0]
 let lastApplication:FertilizerDashboardData['lastApplication']=null;const app=(apps||[])[0] as any;if(app){const{data:lines,error}=await supabase.from('fertilizer_application_lines').select('amount_kg').eq('application_id',app.id);if(error)throw error;lastApplication={date:app.application_date,totalKg:(lines||[]).reduce((s:number,r:any)=>s+n(r.amount_kg),0)}}
 return{stockKg,stockLots:active.length,masterCount:(masters||[]).length,nKg,pKg,kKg,nextPlan:p?{label:`${p.month}月${p.period||''}`,purpose:p.purpose||'施肥',fertilizer:one(p.fertilizers)?.name||'未指定',rate:p.planned_rate_kg_per_10a===null?null:n(p.planned_rate_kg_per_10a),date:p._date}:null,lastApplication}
}
