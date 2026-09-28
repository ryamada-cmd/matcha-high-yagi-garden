import { supabase } from './supabase'
import { recognizeDocument, type DocumentOcrItem, type DocumentOcrKind, type DocumentOcrResult } from './documentOcr'

export type AiOcrStatus={
  provider:string
  model:string
  enabled:boolean
  configured:boolean
  updatedAt:string
}

type AiRawItem={
  transactionDate:string
  slipNo:string
  description:string
  capacity:string
  quantity:number
  unit:string
  unitPriceYen:number
  lineTotalYen:number
  taxRate:number
  suggestedCategory:string
}

type AiRawResult={
  vendor:string
  documentNo:string
  date:string
  dueDate:string
  billingPeriodStart:string
  billingPeriodEnd:string
  subtotalYen:number
  taxYen:number
  totalYen:number
  previousBalanceYen:number
  paymentYen:number
  carryoverBalanceYen:number
  referenceNo:string
  paymentMethod:string
  suggestedCategory:string
  warnings:string[]
  items:AiRawItem[]
}

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
  return{Authorization:'Bearer '+session.access_token}
}

function isUnauthorized(error:any){return Number(error?.context?.status||error?.status||0)===401}

function n(value:any){const x=Number(value||0);return Number.isFinite(x)?x:0}
function s(value:any){return String(value||'').trim()}
function approx(a:number,b:number){return Math.abs(a-b)<=Math.max(2,Math.max(a,b)*.002)}

function normalizeItems(raw:AiRawResult){
  const source=(Array.isArray(raw.items)?raw.items:[]).map(item=>({
    transactionDate:s(item.transactionDate),
    slipNo:s(item.slipNo),
    description:s(item.description),
    capacity:s(item.capacity),
    quantity:n(item.quantity),
    unit:s(item.unit),
    unitPriceYen:Math.round(n(item.unitPriceYen)),
    lineTotalYen:Math.round(n(item.lineTotalYen)),
    taxRate:n(item.taxRate),
    suggestedCategory:s(item.suggestedCategory)||'OTHER',
  }))
  const subtotal=Math.round(n(raw.subtotalYen))
  const tax=Math.round(n(raw.taxYen))
  const total=Math.round(n(raw.totalYen))
  const printedTotal=source.reduce((sum,item)=>sum+item.lineTotalYen,0)
  if(!source.length||!subtotal||!tax||!total||!approx(printedTotal,subtotal)||!approx(subtotal+tax,total))return source

  const ratio=1+tax/subtotal
  const converted=source.map(item=>{
    const unitPriceYen=Math.round(item.unitPriceYen*ratio)
    return{...item,unitPriceYen,lineTotalYen:Math.round(item.quantity*unitPriceYen),taxRate:item.taxRate||Math.round((tax/subtotal*100)*10)/10}
  })
  const convertedTotal=converted.reduce((sum,item)=>sum+item.lineTotalYen,0)
  return approx(convertedTotal,total)?converted:source
}

function toDocumentResult(raw:AiRawResult,model:string):DocumentOcrResult{
  const items=normalizeItems(raw)
  const warnings=[...(Array.isArray(raw.warnings)?raw.warnings.map(s).filter(Boolean):[])]
  const rawPrinted=(Array.isArray(raw.items)?raw.items:[]).reduce((sum,item)=>sum+Math.round(n(item.lineTotalYen)),0)
  const normalizedTotal=items.reduce((sum,item)=>sum+Math.round(n(item.lineTotalYen)),0)
  if(rawPrinted&&raw.subtotalYen&&approx(rawPrinted,n(raw.subtotalYen))&&normalizedTotal&&raw.totalYen&&approx(normalizedTotal,n(raw.totalYen))&&n(raw.taxYen)>0){
    warnings.push('帳票が税抜単価＋別途消費税のため、登録用明細は税込単価へ自動換算しました。')
  }
  const mapped:DocumentOcrItem[]=items.map(item=>({
    description:[item.description,item.capacity].filter(Boolean).join(' / '),
    quantity:item.quantity||1,
    unit:item.unit,
    unitPriceYen:item.unitPriceYen,
    lineTotalYen:item.lineTotalYen,
    taxRate:item.taxRate,
    suggestedCategory:item.suggestedCategory,
  }))
  const confidence=Math.max(70,Math.min(99,98-warnings.length*3))
  return{
    kind:'VENDOR_INVOICE',
    rawText:'',
    confidence,
    vendor:s(raw.vendor),
    documentNo:s(raw.documentNo),
    date:s(raw.date),
    dueDate:s(raw.dueDate),
    subtotalYen:Math.round(n(raw.subtotalYen)),
    taxYen:Math.round(n(raw.taxYen)),
    totalYen:Math.round(n(raw.totalYen)),
    referenceNo:s(raw.referenceNo),
    paymentMethod:s(raw.paymentMethod),
    suggestedCategory:s(raw.suggestedCategory)||'OTHER',
    items:mapped,
    warnings,
    engine:'AI',
    model,
  }
}

async function invokeAi(file:File,kind:DocumentOcrKind,forceRefresh=false):Promise<DocumentOcrResult>{
  const headers=await authHeaders(forceRefresh)
  const body=new FormData()
  body.set('file',file)
  body.set('kind',kind)
  const{data,error}=await supabase.functions.invoke('ai-document-ocr',{body,headers})
  if(error){
    if(!forceRefresh&&isUnauthorized(error))return invokeAi(file,kind,true)
    const e:any=new Error(error.message||'AI帳票解析に失敗しました。')
    e.code=String((error as any)?.context?.body?.code||'AI_INVOKE_ERROR')
    throw e
  }
  const payload=(data||{}) as any
  if(payload.error){
    const e:any=new Error(String(payload.error))
    e.code=String(payload.code||'AI_OCR_ERROR')
    throw e
  }
  const raw=(payload.result||{}) as AiRawResult
  const result=toDocumentResult(raw,String(payload.model||'AI'))
  result.kind=kind
  if(kind!=='VENDOR_INVOICE'){
    result.subtotalYen=0
    result.taxYen=0
  }
  return result
}

export async function recognizeDocumentSmart(file:File,kind:DocumentOcrKind,onProgress?:(progress:number,message:string)=>void){
  const aiSupported=file.type==='application/pdf'||['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||/\.(pdf|jpe?g|png|webp|gif)$/i.test(file.name)
  if(aiSupported){
    try{
      onProgress?.(8,'AIで帳票全体を解析しています…')
      const result=await invokeAi(file,kind)
      onProgress?.(100,'AI帳票解析が完了しました。')
      return result
    }catch(e:any){
      const message=e?.message||'AI OCRを利用できませんでした。'
      onProgress?.(10,'AI解析を利用できないため従来OCRへ切り替えます…')
      const fallback=await recognizeDocument(file,kind,onProgress)
      fallback.warnings.unshift('AI解析は使用できませんでした：'+message+' 従来OCRの結果を表示しています。')
      fallback.engine='OCR'
      return fallback
    }
  }
  const fallback=await recognizeDocument(file,kind,onProgress)
  fallback.engine='OCR'
  return fallback
}

export async function loadAiOcrStatus():Promise<AiOcrStatus>{
  const{data,error}=await supabase.rpc('ai_ocr_get_status')
  if(error)throw error
  const d:any=data||{}
  return{
    provider:s(d.provider)||'OPENAI',
    model:s(d.model)||'gpt-6-astra',
    enabled:d.enabled===true,
    configured:d.configured===true,
    updatedAt:s(d.updated_at),
  }
}

export async function saveAiOcrConfig(input:{apiKey:string;model:string;enabled:boolean}){
  const{error}=await supabase.rpc('ai_ocr_set_config',{
    p_api_key:input.apiKey.trim(),
    p_model:input.model.trim()||'gpt-6-astra',
    p_enabled:input.enabled,
  })
  if(error)throw error
}
