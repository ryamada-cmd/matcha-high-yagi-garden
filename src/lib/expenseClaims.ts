import { supabase } from './supabase'

export type ExpenseClaimItem={
  id:string;lineNo:number;description:string;quantity:number;unitPriceYen:number;taxRate:number;lineTotalYen:number;note:string
}
export type ExpenseClaim={
  id:string;claimNo:string;purchaseAt:string;vendor:string;applicantId:string;applicantName:string;status:'SUBMITTED'|'APPROVED'|'REJECTED';
  totalAmountYen:number;note:string;submittedAt:string;reviewedAt:string;reviewerName:string;reviewComment:string;items:ExpenseClaimItem[]
}
export type ExpenseUser={id:string;displayName:string;role:string}
export type ExpenseItemInput={description:string;quantity:number;unitPriceYen:number;taxRate:number;note?:string}
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0

export async function loadExpenseUser():Promise<ExpenseUser>{
  const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('ログインが必要です')
  const{data,error}=await supabase.from('profiles').select('display_name,role').eq('id',user.id).maybeSingle();if(error)throw error
  return{id:user.id,displayName:data?.display_name||user.email||'担当者',role:data?.role||''}
}

export async function loadExpenseClaims():Promise<ExpenseClaim[]>{
  const{data,error}=await supabase.from('expense_claims').select('id,claim_no,purchase_at,vendor,applicant_id,applicant_name_snapshot,status,total_amount_yen,note,submitted_at,reviewed_at,reviewer_name_snapshot,review_comment,expense_claim_items(id,line_no,description,quantity,unit_price_yen,tax_rate,line_total_yen,note)').order('purchase_at',{ascending:false}).order('submitted_at',{ascending:false});if(error)throw error
  return(data||[]).map((r:any)=>({
    id:r.id,claimNo:r.claim_no||'',purchaseAt:r.purchase_at||'',vendor:r.vendor||'',applicantId:r.applicant_id||'',applicantName:r.applicant_name_snapshot||'',status:r.status,
    totalAmountYen:n(r.total_amount_yen),note:r.note||'',submittedAt:r.submitted_at||'',reviewedAt:r.reviewed_at||'',reviewerName:r.reviewer_name_snapshot||'',reviewComment:r.review_comment||'',
    items:(r.expense_claim_items||[]).sort((a:any,b:any)=>n(a.line_no)-n(b.line_no)).map((i:any)=>({id:i.id,lineNo:n(i.line_no),description:i.description||'',quantity:n(i.quantity),unitPriceYen:n(i.unit_price_yen),taxRate:n(i.tax_rate),lineTotalYen:n(i.line_total_yen),note:i.note||''}))
  }))
}

export async function saveExpenseClaim(input:{id?:string;purchaseAt:string;vendor:string;note:string;items:ExpenseItemInput[]}){
  const{data,error}=await supabase.rpc('save_expense_claim',{p_payload:{id:input.id||'',purchase_at:input.purchaseAt,vendor:input.vendor,note:input.note,items:input.items.map(x=>({description:x.description,quantity:x.quantity,unit_price_yen:x.unitPriceYen,tax_rate:x.taxRate,note:x.note||''}))}});if(error)throw error;return data as string
}

export async function reviewExpenseClaim(id:string,action:'APPROVE'|'REJECT',comment=''){
  const{error}=await supabase.rpc('review_expense_claim',{p_id:id,p_action:action,p_comment:comment});if(error)throw error
}
