import { supabase } from './supabase'
import { uploadExternalFile } from './externalStorage'

export type VendorDocumentKind='INVOICE'|'PAYMENT'
export type VendorDocument={
  id:string
  invoiceId:string
  kind:VendorDocumentKind
  fileName:string
  mimeType:string
  sizeBytes:number
  folderPath:string
  webUrl:string
  uploadedAt:string
  note:string
}
export type VendorDocumentMap=Record<string,VendorDocument[]>

export async function uploadVendorDocument(input:{file:File;invoiceId:string;kind:VendorDocumentKind;paymentId?:string}){
  const note=input.kind==='PAYMENT'
    ?`支払証憑${input.paymentId?` / payment:${input.paymentId}`:''}`
    :'仕入請求書原本'
  const result=await uploadExternalFile({
    file:input.file,
    category:input.kind==='PAYMENT'?'支払証憑':'仕入請求書',
    entityType:'vendor_invoice',
    entityId:input.invoiceId,
    note,
  })
  const f=result.file
  return{id:f.id,invoiceId:input.invoiceId,kind:input.kind,fileName:f.file_name,mimeType:f.mime_type||input.file.type,sizeBytes:f.size_bytes,folderPath:f.folder_path||'',webUrl:f.web_url||'',uploadedAt:f.uploaded_at,note} as VendorDocument
}

export async function loadVendorDocumentMap():Promise<VendorDocumentMap>{
  const{data,error}=await supabase.from('external_file_links')
    .select('entity_id,category,note,created_at,external_files!inner(id,file_name,mime_type,size_bytes,folder_path,web_url,uploaded_at,archived_at)')
    .eq('entity_type','vendor_invoice')
    .in('category',['仕入請求書','支払証憑'])
    .is('external_files.archived_at',null)
    .order('created_at',{ascending:false})
  if(error)throw error
  const map:VendorDocumentMap={}
  for(const row of (data||[]) as any[]){
    const invoiceId=String(row.entity_id||'')
    if(!invoiceId)continue
    const raw=Array.isArray(row.external_files)?row.external_files[0]:row.external_files
    if(!raw)continue
    const kind:VendorDocumentKind=String(row.category||'')==='支払証憑'||String(row.note||'').startsWith('支払証憑')?'PAYMENT':'INVOICE'
    const doc:VendorDocument={id:String(raw.id||''),invoiceId,kind,fileName:String(raw.file_name||''),mimeType:String(raw.mime_type||''),sizeBytes:Number(raw.size_bytes||0),folderPath:String(raw.folder_path||''),webUrl:String(raw.web_url||''),uploadedAt:String(raw.uploaded_at||row.created_at||''),note:String(row.note||'')}
    ;(map[invoiceId]||(map[invoiceId]=[])).push(doc)
  }
  return map
}
