import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { MEDIA_CATEGORIES, MEDIA_MAX_BYTES, mediaFormat, matchMediaSignature } from './format.ts'
import { drivePath, driveSettings, ensureFolder, graphError, httpsUrl, itemPath, MediaError, microsoftGraph, originalUrl, readPrefix, segment, type DriveItem } from './onedrive.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const auth = {persistSession:false,autoRefreshToken:false}
const admin = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth})
const origins = new Set((Deno.env.get('SHARED_MEDIA_ORIGINS') || 'https://yagi-garden-manager.vercel.app,https://ryamada-cmd.github.io').split(',').map(s=>s.trim()))
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const publicColumns = 'id,kind,original_name,mime_type,size_bytes,category,album_id,taken_at,note,field_id,equipment_id,owner_id,posted_at,legacy'
const sessionColumns = 'id,owner_id,original_name,fingerprint,size_bytes,mime_type,state,drive_id,folder_path,object_name,encrypted_url,expires_at,missing_since,media_id'
const invalid = (message: string) => new MediaError(400,'invalid',message)
const denied = () => new MediaError(403,'approval_required','共有ギャラリーの利用承認が必要です。')
type Payload = Record<string,unknown>
type Context = {id:string; client:SupabaseClient; isAdmin:boolean}
type Session = {
  id:string; owner_id:string; original_name:string; fingerprint:string; size_bytes:number; mime_type:string;
  state:string; drive_id:string; folder_path:string; object_name:string; encrypted_url:string|null;
  expires_at:string|null; missing_since:string|null; media_id:string|null;
}

function id(value: unknown, optional=false) {
  if (optional && (value===null || value==='')) return null
  if (typeof value!=='string' || !uuid.test(value)) throw invalid('入力されたIDが無効です。')
  return value
}
function controlCharacter(character: string) {
  const code=character.charCodeAt(0)
  return code<32 || code===127
}
function string(value: unknown, max: number) {
  if (typeof value!=='string' || value.length>max || [...value].some(character=>
    controlCharacter(character) && !['\t','\n','\r'].includes(character))) throw invalid('入力内容を確認してください。')
  return value.trim()
}
function date(value: unknown) {
  if (value===null || value==='') return null
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid('撮影日を確認してください。')
  const instant = new Date(value)
  if (!Number.isFinite(instant.valueOf()) || instant.toISOString().slice(0,10)!==value) throw invalid('撮影日を確認してください。')
  return value
}
async function context(request: Request): Promise<Context> {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new MediaError(401,'auth','ログインしてください。')
  const client = createClient(url,anonKey,{auth,global:{headers:{Authorization:authorization}}})
  const {data,error} = await client.auth.getUser()
  if (error || !data.user) throw new MediaError(401,'auth','ログインの有効期限を確認してください。')
  const [approval, profile] = await Promise.all([
    client.rpc('media_can_access'), admin.from('profiles').select('role').eq('id',data.user.id).maybeSingle(),
  ])
  if (approval.error || profile.error) throw new MediaError(503,'permissions','利用承認を確認できませんでした。')
  if (approval.data!==true || !profile.data) throw denied()
  return {id:data.user.id,client,isAdmin:profile.data.role==='admin'}
}

function sessionKey() {
  const raw = Deno.env.get('SHARED_MEDIA_SESSION_KEY') || ''
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new MediaError(503,'session_key','アップロード設定を確認してください。')
  return crypto.subtle.importKey('raw',Uint8Array.from(raw.match(/../g)!,c=>parseInt(c,16)),'AES-GCM',false,['encrypt','decrypt'])
}
async function encrypt(value: string, sessionId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(sessionId)},await sessionKey(),encoder.encode(value)))
  return btoa(String.fromCharCode(...iv,...cipher))
}
async function sessionUrl(session: Session) {
  const bytes = Uint8Array.from(atob(session.encrypted_url!),c=>c.charCodeAt(0))
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:encoder.encode(session.id)},await sessionKey(),bytes.slice(12))
  return httpsUrl(decoder.decode(plain))
}

async function permitted(ctx: Context, permission: string) {
  const {data,error} = await ctx.client.rpc('has_app_permission',{p_permission_key:permission})
  if (error) throw error
  return data===true
}

async function metadata(ctx: Context, body: Payload) {
  const category = body.category as typeof MEDIA_CATEGORIES[number]
  if (!MEDIA_CATEGORIES.includes(category)) throw invalid('分類を選択してください。')
  const field_id = id(body.fieldId,true)
  if (field_id) {
    if (!await permitted(ctx,'fields.view')) throw denied()
    const {data,error} = await ctx.client.from('fields').select('id').eq('id',field_id).is('deleted_at',null).maybeSingle()
    if (error) throw error
    if (!data) throw denied()
  }
  const equipment_id = id(body.equipmentId,true)
  if (equipment_id) {
    if (!await permitted(ctx,'equipment.view')) throw denied()
    const {data,error} = await ctx.client.from('equipment_assets').select('id').eq('id',equipment_id).is('deleted_at',null).maybeSingle()
    if (error) throw error
    if (!data) throw denied()
  }
  const album_id = id(body.albumId,true)
  if (album_id) {
    const {data,error} = await ctx.client.from('media_albums').select('id').eq('id',album_id).maybeSingle()
    if (error) throw error
    if (!data) throw invalid('アルバムが見つかりません。')
  }
  return {category,album_id,field_id,equipment_id,taken_at:date(body.takenAt),note:string(body.note,2000)||null}
}
async function uploadSession(ctx: Context, sessionId: unknown): Promise<Session> {
  const {data,error} = await admin.from('media_upload_sessions').select(sessionColumns).eq('id',id(sessionId)).eq('owner_id',ctx.id).maybeSingle()
  if (error) throw error
  if (!data) throw new MediaError(404,'session_not_found','アップロードが見つかりません。')
  return data as Session
}
function finished(session: Session) {
  return {state:'finalized',id:session.id,mediaId:session.media_id}
}
function sessionObject(session: Session) {
  return itemPath(session.drive_id,session.folder_path+'/'+session.object_name)
}

async function begin(ctx: Context, body: Payload) {
  const sessionId = id(body.id)!
  const name = string(body.name,255)
  const format = mediaFormat(name)
  const size = Number(body.size)
  const fingerprint = string(body.fingerprint,64)
  if (!format) throw new MediaError(415,'format','このファイル形式には対応していません。')
  if (!Number.isSafeInteger(size) || size<1 || size>MEDIA_MAX_BYTES) throw new MediaError(413,'size','1ファイル20GBまでです。')
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw invalid('ファイルの識別情報を確認できません。')

  const {data:prior,error:priorError} = await admin.from('media_upload_sessions').select(sessionColumns).eq('owner_id',ctx.id)
    .eq('size_bytes',size).eq('fingerprint',fingerprint).in('state',['open','finalized']).maybeSingle()
  if (priorError) throw priorError
  if (prior) return await status(prior as Session)

  const info = await metadata(ctx,body)
  await sessionKey()
  // Only a successfully inserted row may create a Graph session. A duplicate click or tab reuses that row.
  const settings = await driveSettings(admin)
  const objectName = [...name].map(character=>controlCharacter(character)||`"'*:/<>?\\|#%`.includes(character)?'_':character)
    .join('').replace(/^[. ~]+|[. ]+$/g,'').slice(-160)
  const parent = settings.root+'/07_写真'
  const folder = parent+'/共有原本'
  const folderPath = folder+'/'+sessionId
  const record = {id:sessionId,owner_id:ctx.id,original_name:name,fingerprint,size_bytes:size,mime_type:format.mime,kind:format.kind,
    drive_id:settings.driveId,folder_path:folderPath,object_name:objectName,...info}
  const {error} = await admin.from('media_upload_sessions').insert(record)
  if (error?.code==='23505') {
    const {data,error:lookup} = await admin.from('media_upload_sessions').select(sessionColumns).eq('owner_id',ctx.id)
      .eq('size_bytes',size).eq('fingerprint',fingerprint).in('state',['open','finalized']).maybeSingle()
    if (lookup) throw lookup
    if (data) return await status(data as Session)
    throw new MediaError(409,'session_id','新しいアップロードとして再開してください。')
  }
  if (error?.code==='53300') throw new MediaError(429,'active_limit','進行中のアップロードが多いため、完了かキャンセル後にお試しください。')
  if (error) throw error
  let uploadUrl: string|undefined
  try {
    const graph = await microsoftGraph(admin)
    await ensureFolder(graph,settings.driveId,settings.root,'07_写真')
    await ensureFolder(graph,settings.driveId,parent,'共有原本')
    await ensureFolder(graph,settings.driveId,folder,sessionId)
    const result = await graph(itemPath(settings.driveId,folderPath+'/'+objectName)+':/createUploadSession',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({item:{'@microsoft.graph.conflictBehavior':'fail',name:objectName}}),
    })
    if (!result.ok) throw graphError(result)
    const remote = await result.json()
    uploadUrl = httpsUrl(remote.uploadUrl)
    const {error:saveError} = await admin.from('media_upload_sessions').update({
      encrypted_url:await encrypt(uploadUrl,sessionId),
      expires_at:remote.expirationDateTime,
    }).eq('id',sessionId).eq('state','open')
    if (saveError) throw saveError
    return {state:'open',id:sessionId,uploadUrl,nextExpectedRanges:['0-'],expiresAt:remote.expirationDateTime}
  } catch(error) {
    if (uploadUrl) await fetch(uploadUrl,{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(5000)}).catch(()=>{})
    await admin.from('media_upload_sessions').delete().eq('id',sessionId).eq('state','open').is('encrypted_url',null)
    throw error
  }
}

async function status(session: Session) {
  if (session.state==='finalized') return finished(session)
  if (session.state!=='open') return {state:session.state,id:session.id}
  if (!session.encrypted_url) {
    // Recover a request killed before it could persist the Graph session.
    const {data,error} = await admin.from('media_upload_sessions').update({state:'expired'})
      .eq('id',session.id).eq('state','open').is('encrypted_url',null)
      .lt('created_at',new Date(Date.now()-360000).toISOString()).select('id').maybeSingle()
    if (error) throw error
    return {state:data?'expired':'creating',id:session.id}
  }
  const uploadUrl = await sessionUrl(session)
  const result = await fetch(uploadUrl,{redirect:'error',signal:AbortSignal.timeout(15000)})
  if (result.status===404 || result.status===410) return {state:'verify',id:session.id}
  if (!result.ok) throw graphError(result)
  const remote = await result.json()
  return {state:'open',id:session.id,uploadUrl,nextExpectedRanges:remote.nextExpectedRanges,expiresAt:remote.expirationDateTime}
}

async function finalize(ctx: Context, session: Session) {
  if (session.state==='finalized') return finished(session)
  if (session.state!=='open' || !session.encrypted_url) return {state:session.state,id:session.id}
  const graph = await microsoftGraph(admin)
  const path = sessionObject(session)
  const result = await graph(path+'?$select=id,name,size,webUrl,parentReference,file,@microsoft.graph.downloadUrl')
  if (result.status===404) {
    const remote = await status(session)
    if (remote.state!=='verify') return {state:'incomplete',id:session.id}
    if (!session.missing_since) {
      const {error} = await admin.from('media_upload_sessions').update({missing_since:new Date().toISOString()})
        .eq('id',session.id).eq('state','open').is('missing_since',null)
      if (error) throw error
      return {state:'incomplete',id:session.id}
    }
    if (Date.now()-Date.parse(session.missing_since)<15000) return {state:'incomplete',id:session.id}
    const {error} = await admin.from('media_upload_sessions').update({state:'expired',encrypted_url:null})
      .eq('id',session.id).eq('state','open')
    if (error) throw error
    return {state:'expired',id:session.id}
  }
  if (!result.ok) throw graphError(result)
  const item: DriveItem = await result.json()
  const format = mediaFormat(session.original_name)
  if (!item.id || !item.file || item.name!==session.object_name ||
      item.parentReference?.driveId!==session.drive_id || !format) {
    throw new MediaError(409,'item_mismatch','OneDriveの原本情報がアップロードと一致しません。')
  }
  const matchingSize = item.size===session.size_bytes
  const signatureMatches = matchingSize && matchMediaSignature(format,
    await readPrefix(await originalUrl(graph,session.drive_id,item.id,item['@microsoft.graph.downloadUrl']),item.size))
  if (!signatureMatches) {
    const rejected = await graph(drivePath(session.drive_id)+'/items/'+segment(item.id),{method:'DELETE'})
    if (!rejected.ok && rejected.status!==404) throw graphError(rejected)
    const {error} = await admin.from('media_upload_sessions').update({state:'rejected',encrypted_url:null})
      .eq('id',session.id).eq('state','open')
    if (error) throw error
    throw new MediaError(415,'signature',matchingSize
      ? '原本の内容と拡張子が一致しません。共有には登録されていません。'
      : '原本のサイズが一致しません。共有には登録されていません。')
  }
  const {data,error} = await admin.rpc('media_finalize',{
    p_session:session.id,p_owner:ctx.id,p_item_id:item.id,p_web_url:item.webUrl||null,p_sha1:item.file.hashes?.sha1Hash||null,
  })
  if (error) throw error
  return {state:'finalized',id:session.id,mediaId:data}
}

async function cancel(session: Session) {
  if (session.state!=='open') return {state:session.state,id:session.id}
  if (!session.encrypted_url) return {state:'creating',id:session.id}
  const response = await fetch(await sessionUrl(session),{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(15000)})
  if ([404,410].includes(response.status)) return {state:'verify',id:session.id}
  if (!response.ok) throw graphError(response)
  const {error} = await admin.from('media_upload_sessions').update({state:'cancelled',encrypted_url:null}).eq('id',session.id).eq('state','open')
  if (error) throw error
  return {state:'cancelled',id:session.id}
}

async function libraryOptions(ctx: Context) {
  const [showFields,showEquipment] = await Promise.all([permitted(ctx,'fields.view'),permitted(ctx,'equipment.view')])
  const [albums,fields,equipment,owners] = await Promise.all([
    ctx.client.from('media_albums').select('id,name,created_by').order('name'),
    showFields ? ctx.client.from('fields').select('id,name,legacy_id').is('deleted_at',null).order('legacy_id') : {data:[],error:null},
    showEquipment ? ctx.client.from('equipment_assets').select('id,name').is('deleted_at',null).order('name') : {data:[],error:null},
    admin.rpc('media_poster_ids'),
  ])
  if (albums.error || fields.error || equipment.error || owners.error) throw albums.error || fields.error || equipment.error || owners.error
  const ownerIds = ((owners.data||[]) as {owner_id:string}[]).map(row=>row.owner_id)
  const posters = []
  for (let index=0;index<ownerIds.length;index+=100) {
    const result = await admin.from('profiles').select('id,display_name').in('id',ownerIds.slice(index,index+100))
    if (result.error) throw result.error
    posters.push(...result.data)
  }
  posters.sort((left,right)=>(left.display_name||'').localeCompare(right.display_name||'','ja'))
  return {albums:albums.data,fields:fields.data,equipment:equipment.data,posters,isAdmin:ctx.isAdmin,userId:ctx.id}
}

async function list(ctx: Context,body: Payload) {
  const limit = 36
  const page = Number(body.page)
  if (!Number.isSafeInteger(page) || page<0 || page>10000) throw invalid('ページを確認してください。')
  let query = ctx.client.from('media_items').select(publicColumns).order('posted_at',{ascending:false}).order('id',{ascending:false})
  if (body.kind==='photo' || body.kind==='video') query=query.eq('kind',body.kind)
  if (body.category) query=query.eq('category',string(body.category,15))
  if (body.albumId) query=query.eq('album_id',id(body.albumId))
  if (body.ownerId) query=query.eq('owner_id',id(body.ownerId))
  if (body.fieldId) query=query.eq('field_id',id(body.fieldId))
  if (body.from) query=query.gte('taken_at',date(body.from)!)
  if (body.to) query=query.lte('taken_at',date(body.to)!)
  if (body.search) query=query.ilike('original_name','%'+string(body.search,120).replace(/[\\%_]/g,'\\$&')+'%')
  const {data,error} = await query.range(page*limit,page*limit+limit)
  if (error) throw error
  return {items:data.slice(0,limit),hasMore:data.length>limit}
}

async function visibleFile(ctx: Context,mediaId: unknown) {
  const {data:item,error} = await ctx.client.from('media_items').select('id,kind,mime_type').eq('id',id(mediaId)).maybeSingle()
  if (error) throw error
  if (!item) throw new MediaError(404,'not_found','共有メディアが見つかりません。')
  const {data:file,error:fileError} = await admin.from('external_files').select('drive_id,provider_item_id').eq('id',item.id).is('archived_at',null).maybeSingle()
  if (fileError) throw fileError
  if (!file) throw new MediaError(404,'not_found','共有メディアが見つかりません。')
  return {item,file}
}

async function links(ctx: Context,body: Payload) {
  if (!Array.isArray(body.ids) || body.ids.length>36) throw invalid('サムネイルの選択を確認してください。')
  const ids = [...new Set(body.ids.map(value=>id(value)!))]
  if (!ids.length) return {thumbnails:{}}
  const {data,error} = await ctx.client.from('media_items').select('id').in('id',ids)
  if (error) throw error
  if (!data.length) return {thumbnails:{}}
  const {data:files,error:fileError} = await admin.from('external_files').select('id,drive_id,provider_item_id').in('id',data.map(row=>row.id)).is('archived_at',null)
  if (fileError) throw fileError
  const graph = await microsoftGraph(admin)
  const pairs: (readonly [string,string])[] = []
  for (let offset=0;offset<files.length;offset+=6) {
    const chunk = await Promise.allSettled(files.slice(offset,offset+6).map(async file=>{
      const result = await graph(drivePath(file.drive_id)+'/items/'+segment(file.provider_item_id)+'/thumbnails/0/'+(body.size==='large'?'large':'medium'))
      if (!result.ok) return null
      return [file.id,httpsUrl((await result.json()).url)] as const
    }))
    for (const pair of chunk) if (pair.status==='fulfilled' && pair.value) pairs.push(pair.value)
  }
  return {thumbnails:Object.fromEntries(pairs)}
}

async function original(ctx: Context,body: Payload,preview: boolean) {
  const {item,file} = await visibleFile(ctx,body.id)
  if (preview && (item.kind!=='video' || !['video/mp4','video/quicktime'].includes(item.mime_type||''))) {
    throw new MediaError(415,'preview','この形式はプレビューに対応していません。')
  }
  const graph = await microsoftGraph(admin)
  const result = await graph(drivePath(file.drive_id)+'/items/'+segment(file.provider_item_id)+'?$select=id,@microsoft.graph.downloadUrl')
  if (!result.ok) throw graphError(result)
  return {url:await originalUrl(graph,file.drive_id,file.provider_item_id,(await result.json())['@microsoft.graph.downloadUrl'])}
}

async function updateItem(ctx: Context,body: Payload) {
  const {field_id,equipment_id,...changes} = await metadata(ctx,body)
  const [canRelateField,canRelateEquipment] = await Promise.all([permitted(ctx,'fields.view'),permitted(ctx,'equipment.view')])
  const {data,error} = await admin.rpc('media_edit',{p_actor:ctx.id,p_media:id(body.id),p_changes:{
    ...changes,...(canRelateField?{field_id}:{}),...(canRelateEquipment?{equipment_id}:{}),
  }})
  if (error) throw error
  if (!data) throw denied()
  return {ok:true}
}

async function album(ctx: Context,body: Payload) {
  const name = string(body.name,100)
  if (!name) throw invalid('アルバム名を入力してください。')
  if (body.id) {
    let query=admin.from('media_albums').update({name}).eq('id',id(body.id))
    if (!ctx.isAdmin) query=query.eq('created_by',ctx.id)
    const {data,error} = await query.select('id').maybeSingle()
    if (error?.code==='23505') throw new MediaError(409,'album_name','同じ名前のアルバムがあります。')
    if (error) throw error
    if (!data) throw denied()
    return {id:data.id}
  }
  const {data,error} = await admin.from('media_albums').insert({name,created_by:ctx.id}).select('id').single()
  if (error?.code==='23505') throw new MediaError(409,'album_name','同じ名前のアルバムがあります。')
  if (error) throw error
  return {id:data.id}
}

async function removeItem(ctx: Context,body: Payload) {
  if (!ctx.isAdmin) throw denied()
  const mediaId = id(body.id)!
  const {data:item,error} = await admin.from('media_items').select('id,legacy,state').eq('id',mediaId).maybeSingle()
  if (error) throw error
  if (!item || item.state==='removed') return {ok:true}
  if (item.legacy) throw new MediaError(409,'legacy','既存業務の添付ファイルを保護するため、原本の削除はできません。')
  const {data,error:fileError} = await admin.from('external_files').select('drive_id,provider_item_id').eq('id',mediaId).single()
  if (fileError) throw fileError
  const graph = await microsoftGraph(admin)
  const result = await graph(drivePath(data.drive_id)+'/items/'+segment(data.provider_item_id)+'/permanentDelete',{method:'POST'})
  if (!result.ok && result.status!==404) throw graphError(result)
  const {error:finishError} = await admin.rpc('media_mark_removed',{p_media:mediaId,p_actor:ctx.id})
  if (finishError) throw finishError
  return {ok:true}
}

async function approvals(ctx: Context,body: Payload) {
  if (!ctx.isAdmin) throw denied()
  if (body.action==='approval-set') {
    const target = id(body.id)!
    if (target===ctx.id || typeof body.approved!=='boolean') throw invalid('利用承認の変更内容を確認してください。')
    const {error} = await admin.rpc('media_set_approval',{p_actor:ctx.id,p_user:target,p_approved:body.approved})
    if (error) throw error
    return {ok:true}
  }
  const {data,error} = await admin.from('media_approvals').select('user_id,approved,profiles(display_name,role)').order('changed_at',{ascending:false})
  if (error) throw error
  return {approvals:data}
}

async function readPayload(request: Request): Promise<Payload> {
  if (!request.body) throw invalid('操作を確認してください。')
  const reader=request.body.getReader()
  const buffer=new Uint8Array(16384)
  let used=0
  try {
    while (true) {
      const block=await reader.read()
      if (block.done) break
      if (used+block.value.length>buffer.length) throw new MediaError(413,'request_size','入力が長すぎます。')
      buffer.set(block.value,used)
      used+=block.value.length
    }
  } finally {await reader.cancel().catch(()=>{})}
  let payload: unknown
  try {payload=JSON.parse(decoder.decode(buffer.subarray(0,used)))} catch {throw invalid('操作を確認してください。')}
  if (!payload || typeof payload!=='object' || Array.isArray(payload)) throw invalid('操作を確認してください。')
  return payload as Payload
}

Deno.serve(async (request)=>{
  const origin = request.headers.get('Origin')
  const headers = {
    'Cache-Control':'no-store, private','Content-Type':'application/json; charset=utf-8','Vary':'Origin',
    ...(origin && origins.has(origin) ? {'Access-Control-Allow-Origin':origin} : {}),
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Expose-Headers':'Retry-After',
    'Referrer-Policy':'no-referrer',
  }
  const send = (value: unknown,status=200,extra:Record<string,string>={}) => new Response(JSON.stringify(value),{status,headers:{...headers,...extra}})
  if (origin && !origins.has(origin)) return send({error:'許可されていないアクセス元です。'},403)
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers})
  if (request.method!=='POST') return send({error:'Method not allowed'},405)
  if (Deno.env.get('SHARED_MEDIA_ENABLED')!=='1') return send({error:'共有ギャラリーは準備中です。'},503)
  try {
    const ctx = await context(request)
    const body = await readPayload(request)
    switch (body.action) {
      case 'begin': return send(await begin(ctx,body))
      case 'status': return send(await status(await uploadSession(ctx,body.id)))
      case 'cancel': return send(await cancel(await uploadSession(ctx,body.id)))
      case 'finalize': return send(await finalize(ctx,await uploadSession(ctx,body.id)))
      case 'options': return send(await libraryOptions(ctx))
      case 'list': return send(await list(ctx,body))
      case 'thumbnails': return send(await links(ctx,body))
      case 'original': return send(await original(ctx,body,false))
      case 'playback': return send(await original(ctx,body,true))
      case 'edit': return send(await updateItem(ctx,body))
      case 'album': return send(await album(ctx,body))
      case 'remove': return send(await removeItem(ctx,body))
      case 'approvals': case 'approval-set': return send(await approvals(ctx,body))
      default: throw invalid('操作を確認してください。')
    }
  } catch(error) {
    if (error instanceof MediaError) return send({error:error.message,code:error.code},error.status,error.retryAfter?{'Retry-After':error.retryAfter}:{})
    if (error instanceof DOMException && ['AbortError','TimeoutError'].includes(error.name)) return send({error:'OneDriveとの通信がタイムアウトしました。',code:'timeout'},503)
    return send({error:'共有メディアの処理に失敗しました。',code:'internal'},500)
  }
})
