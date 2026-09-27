import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const PHOTO_CATEGORIES = new Set(['茶摘み','イベント','圃場','機械設備','作業記録','商品・制作','その他'])

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession:false, autoRefreshToken:false },
})

const corsHeaders = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}
const json = (data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json; charset=utf-8'}})
const errorJson = (message:string,status=400)=>json({error:message},status)

function cleanSegment(value:string,fallback='未分類'){
  const cleaned=String(value||'').normalize('NFKC').replace(/[\\/:*?"<>|#%{}~&]/g,' ').replace(/\s+/g,' ').trim()
  return (cleaned||fallback).slice(0,100)
}
function cleanFileName(value:string){
  const cleaned=String(value||'').normalize('NFKC').replace(/[\\/:*?"<>|#%{}~&]/g,'_').trim()
  return (cleaned||`photo-${Date.now()}`).slice(0,180)
}
function graphPath(segments:string[]){return segments.map(x=>encodeURIComponent(x)).join('/')}
function normalizeTakenAt(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function yearMonth(value:string){const normalized=normalizeTakenAt(value);return{year:normalized.slice(0,4),month:normalized.slice(5,7),date:normalized}}
function looksLikeImage(file:File){return file.type.startsWith('image/')||/\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp)$/i.test(file.name)}

async function userContext(req:Request,permission:string){
  const authorization=req.headers.get('Authorization')||''
  if(!authorization.startsWith('Bearer '))throw new Error('ログインが必要です。')
  const userClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}})
  const {data:userData,error:userError}=await userClient.auth.getUser()
  if(userError||!userData.user)throw new Error('ログイン情報を確認できません。')
  const {data:allowed,error:permissionError}=await userClient.rpc('has_app_permission',{p_permission_key:permission})
  if(permissionError||allowed!==true)throw new Error('この操作を行う権限がありません。')
  return userData.user
}

async function authenticatedContext(req:Request){
  const authorization=req.headers.get('Authorization')||''
  if(!authorization.startsWith('Bearer '))throw new Error('ログインが必要です。')
  const userClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}})
  const {data:userData,error:userError}=await userClient.auth.getUser()
  if(userError||!userData.user)throw new Error('ログイン情報を確認できません。')
  return{user:userData.user,userClient}
}

async function dailyReportContext(req:Request,reportId=''){
  const {user,userClient}=await authenticatedContext(req)
  const [ownResult,reviewResult]=await Promise.all([
    userClient.rpc('has_app_permission',{p_permission_key:'daily_reports.manage_own'}),
    userClient.rpc('has_app_permission',{p_permission_key:'daily_reports.review'}),
  ])
  const canOwn=!ownResult.error&&ownResult.data===true
  const canReview=!reviewResult.error&&reviewResult.data===true
  if(!canOwn&&!canReview)throw new Error('この操作を行う権限がありません。')
  if(reportId){
    const {data:report,error}=await admin.from('daily_reports').select('id,author_id').eq('id',reportId).is('deleted_at',null).maybeSingle()
    if(error)throw error
    if(!report)throw new Error('日報が見つかりません。')
    if(!canReview&&String(report.author_id)!==user.id)throw new Error('この日報の写真を操作する権限がありません。')
  }
  return{user,canReview}
}

async function accessibleDailyReportIds(userId:string,canReview:boolean){
  let query=admin.from('daily_reports').select('id').is('deleted_at',null)
  if(!canReview)query=query.eq('author_id',userId)
  const {data,error}=await query.limit(1000)
  if(error)throw error
  return(data||[]).map((x:any)=>String(x.id))
}

async function privateConfig(){
  const {data,error}=await admin.rpc('external_storage_get_private_config')
  if(error)throw error
  return (data||{}) as Record<string,unknown>
}

async function refreshAccessToken(config:Record<string,unknown>){
  const tenantId=String(config.tenant_id||''),clientId=String(config.client_id||''),clientSecret=String(config.client_secret||''),refreshToken=String(config.refresh_token||'')
  if(!tenantId||!clientId||!clientSecret||!refreshToken)throw new Error('OneDrive接続が完了していません。')
  const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'refresh_token',refresh_token:refreshToken,scope:'offline_access User.Read Files.ReadWrite'})
  const response=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body})
  const payload=await response.json().catch(()=>({})) as Record<string,unknown>
  if(!response.ok||!payload.access_token){
    const message=String(payload.error_description||payload.error||'Microsoft認証の更新に失敗しました。')
    await admin.rpc('external_storage_mark_error',{p_error:message})
    throw new Error(message)
  }
  if(payload.refresh_token&&payload.refresh_token!==refreshToken)await admin.rpc('external_storage_rotate_refresh_token',{p_refresh_token:String(payload.refresh_token)})
  return String(payload.access_token)
}

async function graphFetch(accessToken:string,path:string,init:RequestInit={}){
  return fetch(`https://graph.microsoft.com/v1.0${path}`,{...init,headers:{Authorization:`Bearer ${accessToken}`,...(init.headers||{})}})
}

async function ensureFolderPath(accessToken:string,driveId:string,segments:string[]){
  const built:string[]=[]
  let parentId=''
  for(const raw of segments){
    const segment=cleanSegment(raw)
    built.push(segment)
    const lookup=await graphFetch(accessToken,`/drives/${encodeURIComponent(driveId)}/root:/${graphPath(built)}`)
    if(lookup.ok){const existing=await lookup.json() as Record<string,unknown>;parentId=String(existing.id||'');continue}
    if(lookup.status!==404)throw new Error(`OneDriveフォルダ確認に失敗しました (${lookup.status})`)
    const endpoint=parentId?`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children`:`/drives/${encodeURIComponent(driveId)}/root/children`
    const created=await graphFetch(accessToken,endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:segment,folder:{},'@microsoft.graph.conflictBehavior':'fail'})})
    if(created.ok){const item=await created.json() as Record<string,unknown>;parentId=String(item.id||'');continue}
    if(created.status===409){
      const retry=await graphFetch(accessToken,`/drives/${encodeURIComponent(driveId)}/root:/${graphPath(built)}`)
      if(retry.ok){const item=await retry.json() as Record<string,unknown>;parentId=String(item.id||'');continue}
    }
    throw new Error(`OneDriveフォルダ作成に失敗しました (${created.status})`)
  }
}

async function relatedFolder(entityType:string,entityId:string|null){
  if(!entityId)return null
  if(entityType==='field'){
    const {data}=await admin.from('fields').select('legacy_id,name').eq('id',entityId).maybeSingle()
    if(!data)return null
    return ['04_圃場',cleanSegment(`${data.legacy_id||''} ${data.name||''}`.trim(),'圃場未設定'),'写真']
  }
  if(entityType==='equipment'){
    const {data}=await admin.from('equipment_assets').select('asset_no,name').eq('id',entityId).maybeSingle()
    if(!data)return null
    return ['05_機械設備',cleanSegment(`${data.asset_no||''} ${data.name||''}`.trim(),'設備未設定'),'写真']
  }
  if(entityType==='daily_report'){
    const {data}=await admin.from('daily_reports').select('report_date,author_name_snapshot').eq('id',entityId).is('deleted_at',null).maybeSingle()
    if(!data)return null
    return ['08_日報',cleanSegment(`${data.report_date||''} ${data.author_name_snapshot||''}`.trim(),'日報'),'写真']
  }
  return null
}

async function destination(root:string,photoCategory:string,album:string,takenAt:string,entityType:string,entityId:string|null){
  const category=PHOTO_CATEGORIES.has(photoCategory)?photoCategory:'その他'
  const group=cleanSegment(album,'未分類')
  const ym=yearMonth(takenAt)
  const related=await relatedFolder(entityType,entityId)
  const folders=related?[root,...related,category,group,ym.year,ym.month]:[root,'07_写真',category,group,ym.year,ym.month]
  return{category,album:group,takenAt:ym.date,folders}
}

async function upload(req:Request){
  const form=await req.formData()
  const file=form.get('file')
  if(!(file instanceof File))return errorJson('写真を選択してください。')
  if(file.size<=0)return errorJson('空のファイルはアップロードできません。')
  if(file.size>MAX_UPLOAD_BYTES)return errorJson('写真は1枚25MBまでアップロードできます。',413)
  if(!looksLikeImage(file))return errorJson('画像ファイルだけアップロードできます。',415)

  const photoCategory=String(form.get('photoCategory')||'その他')
  const album=String(form.get('album')||'未分類')
  const takenAt=String(form.get('takenAt')||'')
  const note=String(form.get('note')||'').trim()||null
  const entityType=String(form.get('entityType')||'general')
  const entityId=String(form.get('entityId')||'').trim()||null
  const user=entityType==='daily_report'?(await dailyReportContext(req,entityId||'')).user:await userContext(req,'storage.upload')

  const {data:settings,error:settingsError}=await admin.from('external_storage_settings').select('enabled,drive_id,root_folder').eq('id',1).single()
  if(settingsError)throw settingsError
  if(!settings.enabled||!settings.drive_id)return errorJson('OneDriveが未接続です。「ファイル・OneDrive」から接続してください。',409)

  const config=await privateConfig()
  const accessToken=await refreshAccessToken(config)
  const driveId=String(settings.drive_id)
  const root=cleanSegment(String(settings.root_folder||'五代目八木一兵衛'),'五代目八木一兵衛')
  const dest=await destination(root,photoCategory,album,takenAt,entityType,entityId)
  await ensureFolderPath(accessToken,driveId,dest.folders)

  const fileName=cleanFileName(file.name)
  const uploadPath=graphPath([...dest.folders,fileName])
  const bytes=await file.arrayBuffer()
  const response=await graphFetch(accessToken,`/drives/${encodeURIComponent(driveId)}/root:/${uploadPath}:/content?@microsoft.graph.conflictBehavior=rename`,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:bytes})
  const item=await response.json().catch(()=>({})) as Record<string,any>
  if(!response.ok||!item.id)throw new Error(String(item?.error?.message||`OneDriveアップロードに失敗しました (${response.status})`))

  const {data:fileRow,error:fileError}=await admin.from('external_files').insert({
    provider:'ONEDRIVE',drive_id:driveId,provider_item_id:String(item.id),file_name:String(item.name||fileName),mime_type:file.type||item.file?.mimeType||null,size_bytes:Number(item.size||file.size),folder_path:dest.folders.join('/'),web_url:String(item.webUrl||''),sha1_hash:String(item.file?.hashes?.sha1Hash||''),uploaded_by:user.id,
    metadata:{kind:'photo',photoCategory:dest.category,album:dest.album,takenAt:dest.takenAt,originalName:file.name,folderStructure:'photo-v1',eTag:item.eTag||null,cTag:item.cTag||null},
  }).select('id,provider,drive_id,provider_item_id,file_name,mime_type,size_bytes,folder_path,web_url,uploaded_at,metadata').single()
  if(fileError||!fileRow)throw fileError||new Error('写真台帳を保存できませんでした。')

  const linkType=entityType==='field'||entityType==='equipment'||entityType==='daily_report'?entityType:'photo'
  const {error:linkError}=await admin.from('external_file_links').insert({file_id:fileRow.id,entity_type:linkType,entity_id:entityId,category:dest.category,note,created_by:user.id})
  if(linkError)throw linkError
  return json({ok:true,file:fileRow})
}

async function dailyReportList(req:Request){
  const {user,canReview}=await dailyReportContext(req)
  const reportIds=await accessibleDailyReportIds(user.id,canReview)
  if(!reportIds.length)return json({files:[]})
  const {data:links,error:linkError}=await admin.from('external_file_links')
    .select('id,file_id,entity_type,entity_id,category,note,created_at')
    .eq('entity_type','daily_report')
    .in('entity_id',reportIds)
  if(linkError)throw linkError
  const fileIds=[...new Set((links||[]).map((x:any)=>String(x.file_id)).filter(Boolean))]
  if(!fileIds.length)return json({files:[]})
  const {data:files,error:fileError}=await admin.from('external_files')
    .select('id,provider,drive_id,provider_item_id,file_name,mime_type,size_bytes,folder_path,web_url,uploaded_at,metadata')
    .in('id',fileIds).is('archived_at',null).order('uploaded_at',{ascending:false})
  if(fileError)throw fileError
  const byFile=new Map((links||[]).map((x:any)=>[String(x.file_id),x]))
  return json({files:(files||[]).filter((x:any)=>x.metadata?.kind==='photo').map((x:any)=>({...x,external_file_links:byFile.has(String(x.id))?[byFile.get(String(x.id))]:[]}))})
}

async function thumbnails(req:Request,body:Record<string,unknown>){
  const ids=Array.isArray(body.fileIds)?body.fileIds.map(String).filter(Boolean).slice(0,60):[]
  if(!ids.length)return json({thumbnails:{}})
  let allowedIds=ids
  if(String(body.entityType||'')==='daily_report'){
    const {user,canReview}=await dailyReportContext(req)
    const reportIds=await accessibleDailyReportIds(user.id,canReview)
    if(!reportIds.length)return json({thumbnails:{}})
    const {data:links,error:linkError}=await admin.from('external_file_links').select('file_id').eq('entity_type','daily_report').in('entity_id',reportIds).in('file_id',ids)
    if(linkError)throw linkError
    const allowed=new Set((links||[]).map((x:any)=>String(x.file_id)))
    allowedIds=ids.filter(id=>allowed.has(id))
    if(!allowedIds.length)return json({thumbnails:{}})
  }else{
    await userContext(req,'storage.view')
  }
  const size=body.size==='large'?'large':'medium'
  const {data:rows,error}=await admin.from('external_files').select('id,drive_id,provider_item_id,metadata').in('id',allowedIds).is('archived_at',null)
  if(error)throw error
  const photos=(rows||[]).filter((row:any)=>row.metadata?.kind==='photo')
  if(!photos.length)return json({thumbnails:{}})
  const config=await privateConfig()
  const accessToken=await refreshAccessToken(config)
  const pairs=await Promise.all(photos.map(async(row:any)=>{
    try{
      const response=await graphFetch(accessToken,`/drives/${encodeURIComponent(String(row.drive_id))}/items/${encodeURIComponent(String(row.provider_item_id))}/thumbnails/0/${size}`)
      if(!response.ok)return [String(row.id),''] as const
      const payload=await response.json() as Record<string,unknown>
      return [String(row.id),String(payload.url||'')] as const
    }catch{return [String(row.id),''] as const}
  }))
  return json({thumbnails:Object.fromEntries(pairs.filter(([,url])=>Boolean(url)))})
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST')return errorJson('Method not allowed',405)
  try{
    const contentType=req.headers.get('content-type')||''
    if(contentType.includes('multipart/form-data'))return await upload(req)
    const body=await req.json().catch(()=>({})) as Record<string,unknown>
    if(String(body.action||'')==='thumbnails')return await thumbnails(req,body)
    if(String(body.action||'')==='daily-report-list')return await dailyReportList(req)
    return errorJson('Unknown action',400)
  }catch(error){
    const message=error instanceof Error?error.message:String(error)
    const status=message.includes('ログイン')?401:message.includes('権限')?403:500
    return errorJson(message,status)
  }
})
