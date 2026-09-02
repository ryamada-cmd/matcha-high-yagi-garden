import { supabase } from './supabase'

export type ExternalStorageStatus = {
  provider: 'ONEDRIVE'
  enabled: boolean
  tenantId: string
  clientId: string
  clientSecretConfigured: boolean
  refreshTokenConfigured: boolean
  driveId: string
  driveType: string
  connectedAccount: string
  rootFolder: string
  connectedAt: string
  lastVerifiedAt: string
  lastError: string
  fileCount: number
  redirectUri: string
}

export type ExternalFileRow = {
  id: string
  provider: string
  drive_id: string
  provider_item_id: string
  file_name: string
  mime_type: string | null
  size_bytes: number
  folder_path: string | null
  web_url: string | null
  uploaded_by: string | null
  uploaded_at: string
  external_file_links?: Array<{
    id: string
    entity_type: string
    entity_id: string | null
    category: string | null
    note: string | null
    created_at: string
  }>
}

async function invoke<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('external-storage', { body })
  if (error) throw error
  const payload = (data || {}) as any
  if (payload.error) throw new Error(String(payload.error))
  return payload as T
}

export function getExternalStorageStatus() {
  return invoke<ExternalStorageStatus>({ action: 'status' })
}

export function configureExternalStorage(input: {
  tenantId: string
  clientId: string
  clientSecret?: string
  rootFolder: string
}) {
  return invoke<ExternalStorageStatus & { ok: boolean }>({ action: 'configure', ...input })
}

export async function startOneDriveAuthorization(returnTo: string) {
  return invoke<{ url: string; redirectUri: string }>({ action: 'authorize', returnTo })
}

export function verifyExternalStorage() {
  return invoke<ExternalStorageStatus & { ok: boolean }>({ action: 'verify' })
}

export async function uploadExternalFile(input: {
  file: File
  category: string
  entityType?: string
  entityId?: string
  note?: string
}) {
  const form = new FormData()
  form.set('file', input.file)
  form.set('category', input.category)
  form.set('entityType', input.entityType || 'general')
  if (input.entityId) form.set('entityId', input.entityId)
  if (input.note) form.set('note', input.note)
  const { data, error } = await supabase.functions.invoke('external-storage', { body: form })
  if (error) throw error
  const payload = (data || {}) as any
  if (payload.error) throw new Error(String(payload.error))
  return payload as { ok: boolean; file: ExternalFileRow }
}

export async function loadExternalFiles(limit = 250) {
  const { data, error } = await supabase
    .from('external_files')
    .select('id,provider,drive_id,provider_item_id,file_name,mime_type,size_bytes,folder_path,web_url,uploaded_by,uploaded_at,external_file_links(id,entity_type,entity_id,category,note,created_at)')
    .is('archived_at', null)
    .order('uploaded_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []) as ExternalFileRow[]
}
