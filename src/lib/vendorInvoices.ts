import { supabase } from './supabase'

export type VendorInvoiceStatus='UNPAID'|'PARTIAL'|'PAID'|'HOLD'
export type VendorInvoiceItem={
  id:string;lineNo:number;category:string;description:string;quantity:number;unit:string;unitPriceYen:number;taxRate:number;lineTotalYen:number;note:string
}
export type VendorInvoicePayment={
  id:string;paymentNo:string;invoiceId:string;paymentDate:string;amountYen:number;paymentMethod:string;paymentAccount:string;referenceNo:string;note:string;createdAt:string
}
export type VendorInvoice={
  id:string;invoiceNo:string;externalInvoiceNo:string;vendor:string;invoiceDate:string;paymentDueDate:string;scheduledPaymentDate:string;
  plannedPaymentMethod:string;plannedPaymentAccount:string;totalAmountYen:number;paidAmountYen:number;paymentStatus:VendorInvoiceStatus;
  isOnHold:boolean;note:string;createdAt:string;updatedAt:string;items:VendorInvoiceItem[];payments:VendorInvoicePayment[]
}
export type VendorInvoiceItemInput={category:string;description:string;quantity:number;unit:string;unitPriceYen:number;taxRate:number;note?:string}

const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0

export async function loadVendorInvoiceRole(){
  const{data:{user}}=await supabase.auth.getUser();if(!user)return ''
  const{data,error}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();if(error)throw error
  return data?.role||''
}

export async function loadVendorInvoices():Promise<VendorInvoice[]>{
  const[invoicesResult,itemsResult,paymentsResult]=await Promise.all([
    supabase.from('vendor_invoices').select('*').is('deleted_at',null).order('invoice_date',{ascending:false}).order('created_at',{ascending:false}),
    supabase.from('vendor_invoice_items').select('*').order('line_no'),
    supabase.from('vendor_invoice_payments').select('*').is('deleted_at',null).order('payment_date',{ascending:false}).order('created_at',{ascending:false}),
  ])
  if(invoicesResult.error)throw invoicesResult.error;if(itemsResult.error)throw itemsResult.error;if(paymentsResult.error)throw paymentsResult.error
  const itemsByInvoice=new Map<string,VendorInvoiceItem[]>(),paymentsByInvoice=new Map<string,VendorInvoicePayment[]>()
  for(const r of itemsResult.data||[]){const item:VendorInvoiceItem={id:r.id,lineNo:n(r.line_no),category:r.category||'OTHER',description:r.description||'',quantity:n(r.quantity),unit:r.unit||'',unitPriceYen:n(r.unit_price_yen),taxRate:n(r.tax_rate),lineTotalYen:n(r.line_total_yen),note:r.note||''};itemsByInvoice.set(r.invoice_id,[...(itemsByInvoice.get(r.invoice_id)||[]),item])}
  for(const r of paymentsResult.data||[]){const payment:VendorInvoicePayment={id:r.id,paymentNo:r.payment_no||'',invoiceId:r.invoice_id,paymentDate:r.payment_date||'',amountYen:n(r.amount_yen),paymentMethod:r.payment_method||'',paymentAccount:r.payment_account||'',referenceNo:r.reference_no||'',note:r.note||'',createdAt:r.created_at||''};paymentsByInvoice.set(r.invoice_id,[...(paymentsByInvoice.get(r.invoice_id)||[]),payment])}
  return(invoicesResult.data||[]).map((r:any)=>({
    id:r.id,invoiceNo:r.invoice_no||'',externalInvoiceNo:r.external_invoice_no||'',vendor:r.vendor||'',invoiceDate:r.invoice_date||'',paymentDueDate:r.payment_due_date||'',scheduledPaymentDate:r.scheduled_payment_date||'',plannedPaymentMethod:r.planned_payment_method||'',plannedPaymentAccount:r.planned_payment_account||'',totalAmountYen:n(r.total_amount_yen),paidAmountYen:n(r.paid_amount_yen),paymentStatus:r.payment_status,isOnHold:r.is_on_hold===true,note:r.note||'',createdAt:r.created_at||'',updatedAt:r.updated_at||'',items:itemsByInvoice.get(r.id)||[],payments:paymentsByInvoice.get(r.id)||[]
  }))
}

export async function saveVendorInvoice(input:{id?:string;externalInvoiceNo:string;vendor:string;invoiceDate:string;paymentDueDate:string;scheduledPaymentDate:string;plannedPaymentMethod:string;plannedPaymentAccount:string;isOnHold:boolean;note:string;items:VendorInvoiceItemInput[]}){
  const{data,error}=await supabase.rpc('admin_save_vendor_invoice',{p_payload:{id:input.id||'',external_invoice_no:input.externalInvoiceNo,vendor:input.vendor,invoice_date:input.invoiceDate,payment_due_date:input.paymentDueDate,scheduled_payment_date:input.scheduledPaymentDate,planned_payment_method:input.plannedPaymentMethod,planned_payment_account:input.plannedPaymentAccount,is_on_hold:input.isOnHold,note:input.note,items:input.items.map(i=>({category:i.category,description:i.description,quantity:i.quantity,unit:i.unit,unit_price_yen:i.unitPriceYen,tax_rate:i.taxRate,note:i.note||''}))}})
  if(error)throw error;return data as string
}

export async function saveVendorInvoicePayment(input:{id?:string;invoiceId:string;paymentDate:string;amountYen:number;paymentMethod:string;paymentAccount:string;referenceNo:string;note:string}){
  const{data,error}=await supabase.rpc('admin_save_vendor_invoice_payment',{p_payload:{id:input.id||'',invoice_id:input.invoiceId,payment_date:input.paymentDate,amount_yen:input.amountYen,payment_method:input.paymentMethod,payment_account:input.paymentAccount,reference_no:input.referenceNo,note:input.note}})
  if(error)throw error;return data as string
}

export async function deleteVendorInvoicePayment(id:string,reason:string){const{error}=await supabase.rpc('admin_delete_vendor_invoice_payment',{p_id:id,p_reason:reason});if(error)throw error}
export async function deleteVendorInvoice(id:string,reason:string){const{error}=await supabase.rpc('admin_delete_vendor_invoice',{p_id:id,p_reason:reason});if(error)throw error}
