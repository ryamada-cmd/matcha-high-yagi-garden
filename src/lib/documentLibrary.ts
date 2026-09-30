import { supabase } from './supabase'
import type { ExternalFileRow } from './externalStorage'

export type LibraryMetadata = {
  id: string
  fileId: string
  title: string
  documentType: string
  documentDate: string
  counterpartyName: string
  fiscalYear: number | null
  category: string
  tags: string[]
  note: string
  ocrText: string
  ocrStatus: 'NOT_PROCESSED'|'PROCESSING'|'COMPLETED'|'FAILED'
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type LibraryFile = {
  file: ExternalFileRow
  library: LibraryMetadata | null
}

export type LibraryMetadataInput = {
  title: string
  documentType: string
  documentDate?: string
  counterpartyName?: string
  fiscalYear?: number | null
  category: string
  tags?: string[]
  note?: string
}

function normalizeMetadata(row: any): LibraryMetadata | null {
  if (!row) return null
  return {
    id: String(row.id || ''),
    fileId: String(row.file_id || ''),
    title: String(row.title || ''),
    documentType: String(row.document_type || 'その他'),
    documentDate: String(row.document_date || ''),
    counterpartyName: String(row.counterparty_name || ''),
    fiscalYear: row.fiscal_year == null ? null : Number(row.fiscal_year),
    category: String(row.category || 'その他'),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    note: String(row.note || ''),
    ocrText: String(row.ocr_text || ''),
    ocrStatus: (row.ocr_status || 'NOT_PROCESSED') as LibraryMetadata['ocrStatus'],
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  }
}

export async function loadDocumentLibrary(limit = 1000): Promise<LibraryFile[]> {
  const { data, error } = await supabase
    .from('external_files')
    .select(`
      id,provider,drive_id,provider_item_id,file_name,mime_type,size_bytes,folder_path,web_url,uploaded_by,uploaded_at,metadata,
      external_file_links(id,entity_type,entity_id,category,note,created_at),
      document_library_items(id,file_id,title,document_type,document_date,counterparty_name,fiscal_year,category,tags,note,ocr_text,ocr_status,created_by,created_at,updated_at)
    `)
    .is('archived_at', null)
    .order('uploaded_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data || []) as any[])
    .filter(row => row.metadata?.kind !== 'photo')
    .map(row => {
      const metaRaw = Array.isArray(row.document_library_items) ? row.document_library_items[0] : row.document_library_items
      const file: ExternalFileRow = {
        id: String(row.id),
        provider: String(row.provider || ''),
        drive_id: String(row.drive_id || ''),
        provider_item_id: String(row.provider_item_id || ''),
        file_name: String(row.file_name || ''),
        mime_type: row.mime_type ? String(row.mime_type) : null,
        size_bytes: Number(row.size_bytes || 0),
        folder_path: row.folder_path ? String(row.folder_path) : null,
        web_url: row.web_url ? String(row.web_url) : null,
        uploaded_by: row.uploaded_by ? String(row.uploaded_by) : null,
        uploaded_at: String(row.uploaded_at || ''),
        metadata: row.metadata || null,
        external_file_links: Array.isArray(row.external_file_links) ? row.external_file_links : [],
      }
      return { file, library: normalizeMetadata(metaRaw) }
    })
}

export async function saveDocumentLibraryMetadata(fileId: string, input: LibraryMetadataInput) {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const userId = userData.user?.id
  if (!userId) throw new Error('ログイン情報を確認できませんでした。')

  const payload = {
    file_id: fileId,
    title: input.title.trim(),
    document_type: input.documentType,
    document_date: input.documentDate || null,
    counterparty_name: input.counterpartyName?.trim() || null,
    fiscal_year: input.fiscalYear ?? (input.documentDate ? Number(input.documentDate.slice(0, 4)) : new Date().getFullYear()),
    category: input.category,
    tags: (input.tags || []).map(x => x.trim()).filter(Boolean),
    note: input.note?.trim() || null,
    created_by: userId,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('document_library_items')
    .upsert(payload, { onConflict: 'file_id' })
    .select('id,file_id,title,document_type,document_date,counterparty_name,fiscal_year,category,tags,note,ocr_text,ocr_status,created_by,created_at,updated_at')
    .single()
  if (error) throw error
  return normalizeMetadata(data)!
}
