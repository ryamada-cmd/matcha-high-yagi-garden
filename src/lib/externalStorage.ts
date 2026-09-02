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

export type ExternalLinkTarget = {
  entityType: 'sales_document'|'expense_claim'|'vendor_invoice'|'field'|'equipment'|'general'
  entityId: string
  label: string
  category: string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function looksLikeSecretId(value: string) {
  return uuidPattern.test(value.trim())
}

function friendlyExternalStorageError(value: unknown) {
  const message = String(value || '')
  if (message.includes('AADSTS7000215') || message.includes('Invalid client secret')) {
    return 'Microsoft EntraのClient Secretが正しくありません。「Secret ID」ではなく「値（Value）」を入力してください。値が分からない場合は、新しいClient Secretを作成して表示されたValueをコピーしてください。'
  }
  return message
}

async function invoke<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('external-storage', { body })
  if (error) throw new Error(friendlyExternalStorageError(error.message || error))
  const payload = (data || {}) as any
  if (payload.error) throw new Error(friendlyExternalStorageError(payload.error))
  if (typeof payload.lastError === 'string' && payload.lastError) payload.lastError = friendlyExternalStorageError(payload.lastError)
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
  if (input.clientSecret && looksLikeSecretId(input.clientSecret)) {
    return Promise.reject(new Error('Client Secretに「Secret ID」が入力されている可能性があります。Microsoft Entraの「値（Value）」を入力してください。'))
  }
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
  if (error) throw new Error(friendlyExternalStorageError(error.message || error))
  const payload = (data || {}) as any
  if (payload.error) throw new Error(friendlyExternalStorageError(payload.error))
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

export async function loadExternalLinkTargets(): Promise<ExternalLinkTarget[]> {
  const settled = await Promise.allSettled([
    supabase.from('sales_documents').select('id,document_type,document_no,customer_name').order('issue_date',{ascending:false}).limit(100),
    supabase.from('expense_claims').select('id,claim_no,purchase_at,vendor').order('purchase_at',{ascending:false}).limit(100),
    supabase.from('vendor_invoices').select('id,invoice_no,external_invoice_no,vendor,invoice_date').is('deleted_at',null).order('invoice_date',{ascending:false}).limit(100),
    supabase.from('fields').select('id,legacy_id,name').is('deleted_at',null).eq('status','active').order('legacy_id').limit(100),
    supabase.from('equipment_assets').select('id,asset_no,name').is('deleted_at',null).order('name').limit(100),
  ])
  const rows = settled.map((result) => result.status === 'fulfilled' && !result.value.error ? (result.value.data || []) : [])
  const [documents, expenses, invoices, fields, equipment] = rows as any[][]
  return [
    ...documents.map((x:any)=>({entityType:'sales_document' as const,entityId:String(x.id),label:`${x.document_type==='INVOICE'?'請求書':'納品書'} ${x.document_no}｜${x.customer_name}`,category:'請求書・納品書'})),
    ...expenses.map((x:any)=>({entityType:'expense_claim' as const,entityId:String(x.id),label:`経費 ${x.claim_no}｜${x.vendor||'購入先未入力'}`,category:'経費・領収書'})),
    ...invoices.map((x:any)=>({entityType:'vendor_invoice' as const,entityId:String(x.id),label:`仕入 ${x.invoice_no}${x.external_invoice_no?` / ${x.external_invoice_no}`:''}｜${x.vendor}`,category:'仕入請求書'})),
    ...fields.map((x:any)=>({entityType:'field' as const,entityId:String(x.id),label:`圃場 ${x.legacy_id||''} ${x.name}`.trim(),category:'圃場'})),
    ...equipment.map((x:any)=>({entityType:'equipment' as const,entityId:String(x.id),label:`設備 ${x.asset_no||''} ${x.name}`.trim(),category:'機械設備'})),
  ]
}
