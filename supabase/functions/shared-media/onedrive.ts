import type { SupabaseClient } from '@supabase/supabase-js'

export class MediaError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfter?: string
  constructor(status: number, code: string, message: string, retryAfter?: string) {
    super(message)
    this.status=status
    this.code=code
    this.retryAfter=retryAfter
  }
}

export function graphError(response: Response) {
  const status = response.status
  const retryAfter = response.headers.get('Retry-After') ?? undefined
  if (status===429) return new MediaError(429,'throttled','OneDriveの転送が混み合っています。時間を置いてお試しください。',retryAfter)
  if (status===507) return new MediaError(507,'quota','OneDriveの空き容量が不足しています。',retryAfter)
  if (status>=500) return new MediaError(503,'graph_unavailable','OneDriveとの通信に失敗しました。',retryAfter)
  return new MediaError(502,'graph_error','OneDriveで処理を完了できませんでした。')
}

export type DriveItem = {
  id: string
  name: string
  size: number
  webUrl?: string
  parentReference?: { id?: string; driveId?: string }
  file?: {mimeType?: string; hashes?: {sha1Hash?: string}}
  '@microsoft.graph.downloadUrl'?: string
}

export const segment = (value: string) => encodeURIComponent(value).replace(/'/g,'%27')
export const drivePath = (id: string) => '/drives/'+segment(id)

export function httpsUrl(value: unknown) {
  if (typeof value!=='string') throw new MediaError(502,'graph_url','OneDriveからURLを取得できませんでした。')
  let url: URL
  try { url = new URL(value) } catch { throw new MediaError(502,'graph_url','OneDriveからURLを取得できませんでした。') }
  if (url.protocol!=='https:' || url.username || url.password) throw new MediaError(502,'graph_url','OneDriveからURLを取得できませんでした。')
  return url.href
}

export async function microsoftGraph(admin: SupabaseClient) {
  const {data,error} = await admin.rpc('external_storage_get_private_config')
  if (error || !data?.tenant_id || !data.client_secret || !data.client_id || !data.refresh_token) {
    throw new MediaError(503,'drive_disconnected','OneDriveの接続を確認してください。')
  }
  const tokenResponse = await fetch('https://login.microsoftonline.com/'+segment(data.tenant_id)+'/oauth2/v2.0/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      client_id:data.client_id, client_secret:data.client_secret, refresh_token:data.refresh_token,
      grant_type:'refresh_token', scope:'offline_access User.Read Files.ReadWrite',
    }),
    signal:AbortSignal.timeout(15000),
  })
  const token = await tokenResponse.json().catch(()=>null)
  if (!tokenResponse.ok || !token?.access_token) throw graphError(tokenResponse)
  if (token.refresh_token && token.refresh_token!==data.refresh_token) {
    await admin.rpc('external_storage_rotate_refresh_token',{p_refresh_token:token.refresh_token})
  }
  return (path: string, init: RequestInit={}) => fetch('https://graph.microsoft.com/v1.0'+path,{
    ...init, redirect:init.redirect||'error', signal:AbortSignal.timeout(20000),
    headers:{'Authorization':'Bearer '+token.access_token,...init.headers},
  })
}

export type Graph = Awaited<ReturnType<typeof microsoftGraph>>

export async function driveSettings(admin: SupabaseClient) {
  const {data,error} = await admin.from('external_storage_settings').select('enabled,drive_id,root_folder').eq('id',1).single()
  if (error || !data?.enabled || !data.drive_id || !data.root_folder) {
    throw new MediaError(503,'drive_disconnected','OneDriveの接続を確認してください。')
  }
  return {driveId:String(data.drive_id),root:String(data.root_folder)}
}

export function itemPath(driveId: string, path: string) {
  return drivePath(driveId)+'/root:/'+path.split('/').map(segment).join('/')
}

export async function ensureFolder(graph: Graph, driveId: string, parentPath: string, name: string) {
  const parent = itemPath(driveId,parentPath)
  const full = parent+'/'+segment(name)
  const lookup = await graph(full+'?$select=id,folder')
  if (lookup.ok) {
    if (!(await lookup.json()).folder) throw new MediaError(409,'folder','OneDriveの保存先を確認してください。')
    return
  }
  if (lookup.status!==404) throw graphError(lookup)
  const parentResponse = await graph(parent+'?$select=id,folder')
  if (!parentResponse.ok) throw graphError(parentResponse)
  const parentItem = await parentResponse.json()
  if (!parentItem.id || !parentItem.folder) throw new MediaError(409,'folder','OneDriveの保存先を確認してください。')
  const result = await graph(drivePath(driveId)+'/items/'+segment(parentItem.id)+'/children',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'}),
  })
  if (result.ok) return
  if (result.status===409) {
    const retry = await graph(full+'?$select=id,folder')
    if (retry.ok && (await retry.json()).folder) return
  }
  throw graphError(result)
}

export async function originalUrl(graph: Graph,driveId: string,itemId: string,annotation?: string) {
  if (annotation) return httpsUrl(annotation)
  const result = await graph(drivePath(driveId)+'/items/'+segment(itemId)+'/content',{redirect:'manual'})
  const location = result.headers.get('Location')
  await result.body?.cancel()
  if (result.status!==302 || !location) throw graphError(result)
  return httpsUrl(location)
}

export async function readPrefix(url: string, total: number) {
  const size = Math.min(4096,total)
  const result = await fetch(url,{headers:{Range:'bytes=0-'+(size-1)},redirect:'error',signal:AbortSignal.timeout(15000)})
  if (!result.body || (result.status!==206 && (result.status!==200 || total>size))) {
    await result.body?.cancel()
    throw graphError(result)
  }
  if (result.status===206 && result.headers.get('Content-Range')!=='bytes 0-'+(size-1)+'/'+total) {
    await result.body.cancel()
    throw new MediaError(502,'graph_range','原本のサイズを確認できませんでした。')
  }
  const reader = result.body.getReader()
  const prefix = new Uint8Array(size)
  let offset=0
  try {
    while (offset<size) {
      const part=await reader.read()
      if (part.done) break
      const bytes=part.value.subarray(0,size-offset)
      prefix.set(bytes,offset)
      offset+=bytes.length
    }
  } finally { await reader.cancel().catch(()=>{}) }
  if (offset!==size) throw new MediaError(502,'graph_range','原本の読み取りに失敗しました。')
  return prefix
}
