import { supabase } from './supabase'

export type PhotoCategory = '茶摘み'|'イベント'|'圃場'|'機械設備'|'作業記録'|'商品・制作'|'その他'

export type PhotoGalleryFile = {
  id: string
  provider: string
  drive_id: string
  provider_item_id: string
  file_name: string
  mime_type: string | null
  size_bytes: number
  folder_path: string | null
  web_url: string | null
  uploaded_at: string
  metadata: {
    kind?: string
    photoCategory?: string
    album?: string
    takenAt?: string
    originalName?: string
    folderStructure?: string
  } | null
  external_file_links?: Array<{
    id: string
    entity_type: string
    entity_id: string | null
    category: string | null
    note: string | null
    created_at: string
  }>
}

export type PhotoTarget = {
  entityType: 'field'|'equipment'
  entityId: string
  label: string
}

async function authHeaders(forceRefresh = false) {
  let session = null
  if (!forceRefresh) {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw new Error('ログイン情報を確認できませんでした。')
    session = data.session
  }
  const now = Math.floor(Date.now() / 1000)
  const expiresSoon = !session?.access_token || (session.expires_at != null && session.expires_at <= now + 90)
  if (forceRefresh || expiresSoon) {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session?.access_token) throw new Error('ログインの有効期限が切れています。再ログインしてください。')
    session = data.session
  }
  if (!session?.access_token) throw new Error('ログイン情報がありません。再ログインしてください。')
  return { Authorization: `Bearer ${session.access_token}` }
}

function isUnauthorized(error: any) {
  return Number(error?.context?.status || error?.status || 0) === 401
}

async function invokePhoto<T>(body: BodyInit | Record<string, unknown>, forceRefresh = false): Promise<T> {
  const headers = await authHeaders(forceRefresh)
  const { data, error } = await supabase.functions.invoke('photo-gallery', { body, headers })
  if (error) {
    if (!forceRefresh && isUnauthorized(error)) return invokePhoto<T>(body, true)
    throw new Error(error.message || '写真ストレージ処理に失敗しました。')
  }
  const payload = (data || {}) as any
  if (payload.error) throw new Error(String(payload.error))
  return payload as T
}

export async function uploadPhoto(input: {
  file: File
  photoCategory: PhotoCategory
  album: string
  takenAt: string
  note?: string
  entityType?: 'field'|'equipment'
  entityId?: string
}) {
  const form = new FormData()
  form.set('file', input.file)
  form.set('photoCategory', input.photoCategory)
  form.set('album', input.album)
  form.set('takenAt', input.takenAt)
  form.set('entityType', input.entityType || 'general')
  if (input.entityId) form.set('entityId', input.entityId)
  if (input.note) form.set('note', input.note)
  return invokePhoto<{ ok: boolean; file: PhotoGalleryFile }>(form)
}

export async function loadPhotoGallery(limit = 500) {
  const { data, error } = await supabase
    .from('external_files')
    .select('id,provider,drive_id,provider_item_id,file_name,mime_type,size_bytes,folder_path,web_url,uploaded_at,metadata,external_file_links(id,entity_type,entity_id,category,note,created_at)')
    .contains('metadata', { kind: 'photo' })
    .is('archived_at', null)
    .order('uploaded_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []) as PhotoGalleryFile[]
}

export async function loadPhotoTargets(): Promise<PhotoTarget[]> {
  const settled = await Promise.allSettled([
    supabase.from('fields').select('id,legacy_id,name').is('deleted_at',null).eq('status','active').order('legacy_id').limit(200),
    supabase.from('equipment_assets').select('id,asset_no,name').is('deleted_at',null).order('name').limit(200),
  ])
  const fields = settled[0].status === 'fulfilled' && !settled[0].value.error ? (settled[0].value.data || []) : []
  const equipment = settled[1].status === 'fulfilled' && !settled[1].value.error ? (settled[1].value.data || []) : []
  return [
    ...fields.map((x:any)=>({entityType:'field' as const,entityId:String(x.id),label:`圃場 ${x.legacy_id||''} ${x.name||''}`.trim()})),
    ...equipment.map((x:any)=>({entityType:'equipment' as const,entityId:String(x.id),label:`設備 ${x.asset_no||''} ${x.name||''}`.trim()})),
  ]
}

export async function loadPhotoThumbnails(fileIds: string[], size: 'medium'|'large' = 'medium') {
  if (!fileIds.length) return {} as Record<string,string>
  const result = await invokePhoto<{ thumbnails: Record<string,string> }>({ action:'thumbnails', fileIds:fileIds.slice(0,60), size })
  return result.thumbnails || {}
}
