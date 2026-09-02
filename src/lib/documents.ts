import { supabase } from './supabase'

export type DocumentType = 'INVOICE' | 'DELIVERY_NOTE'
export type DocumentStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED'

export type DocumentCustomer = {
  id:string; customerCode:string; name:string; postalCode:string; address1:string; address2:string;
  department:string; contactName:string; honorific:string; email:string; phone:string; note:string;
}

export type CompanyDocumentSettings = {
  companyName:string; registrationNo:string; postalCode:string; address1:string; address2:string; phone:string;
  bankName:string; bankBranch:string; bankAccountType:string; bankAccountNo:string; bankAccountName:string; note:string;
}

export type SalesDocumentItem = {
  id?:string; productId:string; itemName:string; unitPriceYen:number; quantity:number; unit:string; taxRate:number; deliveryDate:string;
}

export type SalesDocument = {
  id:string; documentType:DocumentType; documentNo:string; status:DocumentStatus; issueDate:string; dueDate:string; deliveryDate:string;
  customerId:string; customerName:string; customerPostalCode:string; customerAddress1:string; customerAddress2:string; customerDepartment:string;
  customerContactName:string; customerHonorific:string; sellerCompanyName:string; sellerRegistrationNo:string; sellerPostalCode:string;
  sellerAddress1:string; sellerAddress2:string; sellerPhone:string; bankName:string; bankBranch:string; bankAccountType:string; bankAccountNo:string;
  bankAccountName:string; note:string; subtotalYen:number; taxYen:number; totalYen:number; createdAt:string; updatedAt:string; items:SalesDocumentItem[];
}

const s=(v:unknown)=>v==null?'':String(v)
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0

export async function loadDocumentCustomers():Promise<DocumentCustomer[]> {
  const {data,error}=await supabase.from('document_customers').select('*').is('deleted_at',null).order('name')
  if(error) throw error
  return (data||[]).map((r:any)=>({id:r.id,customerCode:s(r.customer_code),name:s(r.name),postalCode:s(r.postal_code),address1:s(r.address1),address2:s(r.address2),department:s(r.department),contactName:s(r.contact_name),honorific:s(r.honorific)||'御中',email:s(r.email),phone:s(r.phone),note:s(r.note)}))
}

export async function saveDocumentCustomer(customer:Partial<DocumentCustomer>&{name:string}) {
  const {data,error}=await supabase.rpc('save_document_customer',{p_customer_id:customer.id||null,p_payload:{customer_code:customer.customerCode||'',name:customer.name,postal_code:customer.postalCode||'',address1:customer.address1||'',address2:customer.address2||'',department:customer.department||'',contact_name:customer.contactName||'',honorific:customer.honorific||'御中',email:customer.email||'',phone:customer.phone||'',note:customer.note||''}})
  if(error) throw error
  return String(data)
}

export async function deleteDocumentCustomer(id:string){const {error}=await supabase.rpc('delete_document_customer',{p_customer_id:id});if(error)throw error}

export async function loadCompanyDocumentSettings():Promise<CompanyDocumentSettings>{
  const {data,error}=await supabase.from('document_company_settings').select('*').eq('id',1).single(); if(error)throw error
  const r:any=data||{}; return {companyName:s(r.company_name),registrationNo:s(r.registration_no),postalCode:s(r.postal_code),address1:s(r.address1),address2:s(r.address2),phone:s(r.phone),bankName:s(r.bank_name),bankBranch:s(r.bank_branch),bankAccountType:s(r.bank_account_type),bankAccountNo:s(r.bank_account_no),bankAccountName:s(r.bank_account_name),note:s(r.note)}
}

export async function saveCompanyDocumentSettings(input:CompanyDocumentSettings){
  const {error}=await supabase.rpc('update_document_company_settings',{p_payload:{company_name:input.companyName,registration_no:input.registrationNo,postal_code:input.postalCode,address1:input.address1,address2:input.address2,phone:input.phone,bank_name:input.bankName,bank_branch:input.bankBranch,bank_account_type:input.bankAccountType,bank_account_no:input.bankAccountNo,bank_account_name:input.bankAccountName,note:input.note}});if(error)throw error
}

export async function loadSalesDocuments():Promise<SalesDocument[]> {
  const {data,error}=await supabase.from('sales_documents').select('*,sales_document_items(*)').is('deleted_at',null).order('issue_date',{ascending:false}).order('created_at',{ascending:false});if(error)throw error
  return (data||[]).map((r:any)=>({id:r.id,documentType:r.document_type,documentNo:s(r.document_no),status:r.status,issueDate:s(r.issue_date),dueDate:s(r.due_date),deliveryDate:s(r.delivery_date),customerId:s(r.customer_id),customerName:s(r.customer_name),customerPostalCode:s(r.customer_postal_code),customerAddress1:s(r.customer_address1),customerAddress2:s(r.customer_address2),customerDepartment:s(r.customer_department),customerContactName:s(r.customer_contact_name),customerHonorific:s(r.customer_honorific)||'御中',sellerCompanyName:s(r.seller_company_name),sellerRegistrationNo:s(r.seller_registration_no),sellerPostalCode:s(r.seller_postal_code),sellerAddress1:s(r.seller_address1),sellerAddress2:s(r.seller_address2),sellerPhone:s(r.seller_phone),bankName:s(r.bank_name),bankBranch:s(r.bank_branch),bankAccountType:s(r.bank_account_type),bankAccountNo:s(r.bank_account_no),bankAccountName:s(r.bank_account_name),note:s(r.note),subtotalYen:n(r.subtotal_yen),taxYen:n(r.tax_yen),totalYen:n(r.total_yen),createdAt:s(r.created_at),updatedAt:s(r.updated_at),items:(r.sales_document_items||[]).sort((a:any,b:any)=>a.line_no-b.line_no).map((i:any)=>({id:i.id,productId:s(i.product_id),itemName:s(i.item_name),unitPriceYen:n(i.unit_price_yen),quantity:n(i.quantity),unit:s(i.unit)||'個',taxRate:n(i.tax_rate),deliveryDate:s(i.delivery_date)}))}))
}

export async function saveSalesDocument(input:Omit<SalesDocument,'id'|'subtotalYen'|'taxYen'|'totalYen'|'createdAt'|'updatedAt'> & {id?:string}){
  const payload={document_type:input.documentType,document_no:input.documentNo,status:input.status,issue_date:input.issueDate,due_date:input.dueDate,delivery_date:input.deliveryDate,customer_id:input.customerId,customer_name:input.customerName,customer_postal_code:input.customerPostalCode,customer_address1:input.customerAddress1,customer_address2:input.customerAddress2,customer_department:input.customerDepartment,customer_contact_name:input.customerContactName,customer_honorific:input.customerHonorific,seller_company_name:input.sellerCompanyName,seller_registration_no:input.sellerRegistrationNo,seller_postal_code:input.sellerPostalCode,seller_address1:input.sellerAddress1,seller_address2:input.sellerAddress2,seller_phone:input.sellerPhone,bank_name:input.bankName,bank_branch:input.bankBranch,bank_account_type:input.bankAccountType,bank_account_no:input.bankAccountNo,bank_account_name:input.bankAccountName,note:input.note,items:input.items.map(i=>({product_id:i.productId,item_name:i.itemName,unit_price_yen:i.unitPriceYen,quantity:i.quantity,unit:i.unit,tax_rate:i.taxRate,delivery_date:i.deliveryDate}))}
  const {data,error}=await supabase.rpc('save_sales_document',{p_document_id:input.id||null,p_payload:payload});if(error)throw error;return String(data)
}

export async function deleteSalesDocument(id:string){const {error}=await supabase.rpc('delete_sales_document',{p_document_id:id});if(error)throw error}
