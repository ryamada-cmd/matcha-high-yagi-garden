import { supabase } from './supabase'

export type ExpenseReceipt = {
  id:string
  fileName:string
  mimeType:string
  sizeBytes:number
  folderPath:string
  webUrl:string
  uploadedAt:string
}
export type ExpenseReceiptMap=Record<string,ExpenseReceipt[]>

async function authHeaders(forceRefresh=false){
  let session=null
  if(!forceRefresh){
    const{data,error}=await supabase.auth.getSession()
    if(error)throw new Error('ログイン情報を確認できませんでした。再ログインしてください。')
    session=data.session
  }
  const now=Math.floor(Date.now()/1000)
  const expiresSoon=!session||!session.access_token||(session.expires_at!=null&&session.expires_at<=now+90)
  if(forceRefresh||expiresSoon){
    const{data,error}=await supabase.auth.refreshSession()
    if(error||!data.session?.access_token)throw new Error('ログインの有効期限が切れています。再ログインしてください。')
    session=data.session
  }
  if(!session?.access_token)throw new Error('ログインが必要です。')
  return{Authorization:`Bearer ${session.access_token}`}
}

function isUnauthorized(error:any){return Number(error?.context?.status||error?.status||0)===401}

async function invokeReceipt(file:File,claimId:string,forceRefresh=false):Promise<ExpenseReceipt>{
  const headers=await authHeaders(forceRefresh)
  const body=new FormData()
  body.set('file',file)
  body.set('claimId',claimId)
  const{data,error}=await supabase.functions.invoke('expense-receipts',{body,headers})
  if(error){
    if(!forceRefresh&&isUnauthorized(error))return invokeReceipt(file,claimId,true)
    throw new Error(error.message||'領収書をOneDriveへ保存できませんでした。')
  }
  const payload=(data||{}) as any
  if(payload.error)throw new Error(String(payload.error))
  const x=payload.file||{}
  return{id:String(x.id||''),fileName:String(x.file_name||file.name),mimeType:String(x.mime_type||file.type||''),sizeBytes:Number(x.size_bytes||file.size||0),folderPath:String(x.folder_path||''),webUrl:String(x.web_url||''),uploadedAt:String(x.uploaded_at||new Date().toISOString())}
}

export function uploadExpenseReceipt(file:File,claimId:string){return invokeReceipt(file,claimId)}

export async function loadExpenseReceiptMap():Promise<ExpenseReceiptMap>{
  const{data,error}=await supabase.from('external_file_links')
    .select('entity_id,created_at,external_files!inner(id,file_name,mime_type,size_bytes,folder_path,web_url,uploaded_at,archived_at,metadata)')
    .eq('entity_type','expense_claim')
    .eq('category','経費・領収書')
    .is('external_files.archived_at',null)
    .order('created_at',{ascending:false})
  if(error)throw error
  const map:ExpenseReceiptMap={}
  for(const row of (data||[]) as any[]){
    const claimId=String(row.entity_id||'')
    if(!claimId)continue
    const raw=Array.isArray(row.external_files)?row.external_files[0]:row.external_files
    if(!raw)continue
    const receipt:ExpenseReceipt={id:String(raw.id||''),fileName:String(raw.file_name||''),mimeType:String(raw.mime_type||''),sizeBytes:Number(raw.size_bytes||0),folderPath:String(raw.folder_path||''),webUrl:String(raw.web_url||''),uploadedAt:String(raw.uploaded_at||row.created_at||'')}
    ;(map[claimId]||(map[claimId]=[])).push(receipt)
  }
  return map
}
