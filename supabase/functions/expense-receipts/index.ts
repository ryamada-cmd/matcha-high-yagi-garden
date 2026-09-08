import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

function cleanSegment(value: string, fallback = 'その他') {
  const cleaned = value.normalize('NFKC').replace(/[\\/:*?"<>|#%{}~&]/g, ' ').replace(/\s+/g, ' ').trim()
  return (cleaned || fallback).slice(0, 100)
}

function cleanFileName(value: string) {
  const cleaned = value.normalize('NFKC').replace(/[\\/:*?"<>|#%{}~&]/g, '_').trim()
  return (cleaned || `receipt-${Date.now()}`).slice(0, 180)
}

function graphPath(segments: string[]) {
  return segments.map((x) => encodeURIComponent(x)).join('/')
}

function japanYearMonth(value: string) {
  const date = new Date(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit',
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return { year: map.year || String(date.getUTCFullYear()), month: map.month || String(date.getUTCMonth() + 1).padStart(2, '0') }
}

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) throw new Error('ログインが必要です。')
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) throw new Error('ログイン情報を確認できません。')
  return { user: data.user, userClient }
}

async function hasPermission(userClient: any, key: string) {
  const { data, error } = await userClient.rpc('has_app_permission', { p_permission_key: key })
  if (error) throw error
  return data === true
}

async function privateConfig() {
  const { data, error } = await admin.rpc('external_storage_get_private_config')
  if (error) throw error
  return (data || {}) as Record<string, unknown>
}

async function refreshAccessToken(config: Record<string, unknown>) {
  const tenantId = String(config.tenant_id || '')
  const clientId = String(config.client_id || '')
  const clientSecret = String(config.client_secret || '')
  const refreshToken = String(config.refresh_token || '')
  if (!tenantId || !clientId || !clientSecret || !refreshToken) throw new Error('OneDrive接続が完了していません。')
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'offline_access User.Read Files.ReadWrite',
  })
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok || !payload.access_token) {
    const message = String(payload.error_description || payload.error || 'Microsoft認証の更新に失敗しました。')
    await admin.rpc('external_storage_mark_error', { p_error: message })
    throw new Error(message)
  }
  if (payload.refresh_token && payload.refresh_token !== refreshToken) {
    await admin.rpc('external_storage_rotate_refresh_token', { p_refresh_token: String(payload.refresh_token) })
  }
  return String(payload.access_token)
}

async function graphFetch(accessToken: string, path: string, init: RequestInit = {}) {
  return fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  })
}

async function ensureFolderPath(accessToken: string, driveId: string, segments: string[]) {
  const built: string[] = []
  let parentId = ''
  for (const raw of segments) {
    const segment = cleanSegment(raw)
    built.push(segment)
    const lookup = await graphFetch(accessToken, `/drives/${encodeURIComponent(driveId)}/root:/${graphPath(built)}`)
    if (lookup.ok) {
      const existing = await lookup.json() as Record<string, unknown>
      parentId = String(existing.id || '')
      continue
    }
    if (lookup.status !== 404) throw new Error(`OneDriveフォルダ確認に失敗しました (${lookup.status})`)
    const endpoint = parentId
      ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children`
      : `/drives/${encodeURIComponent(driveId)}/root/children`
    const created = await graphFetch(accessToken, endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: segment, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    })
    if (created.ok) {
      const item = await created.json() as Record<string, unknown>
      parentId = String(item.id || '')
      continue
    }
    if (created.status === 409) {
      const retry = await graphFetch(accessToken, `/drives/${encodeURIComponent(driveId)}/root:/${graphPath(built)}`)
      if (retry.ok) {
        const item = await retry.json() as Record<string, unknown>
        parentId = String(item.id || '')
        continue
      }
    }
    throw new Error(`OneDriveフォルダ作成に失敗しました (${created.status})`)
  }
}

function allowedReceiptFile(file: File) {
  const name = file.name.toLowerCase()
  return file.type.startsWith('image/') || file.type === 'application/pdf' || /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(name)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const { user, userClient } = await authenticatedUser(req)
    const form = await req.formData()
    const file = form.get('file')
    const claimId = String(form.get('claimId') || '').trim()
    if (!(file instanceof File)) return json({ error: '領収書ファイルを選択してください。' }, 400)
    if (!claimId) return json({ error: '経費申請を特定できません。' }, 400)
    if (file.size <= 0) return json({ error: '空のファイルはアップロードできません。' }, 400)
    if (file.size > MAX_UPLOAD_BYTES) return json({ error: '領収書は1ファイル25MBまでです。' }, 413)
    if (!allowedReceiptFile(file)) return json({ error: '領収書は画像（JPEG/PNG/WebP/HEIC）またはPDFを選択してください。' }, 415)

    const [{ data: claim, error: claimError }, canOwn, canReview] = await Promise.all([
      admin.from('expense_claims').select('id,claim_no,vendor,applicant_id,status,purchase_at').eq('id', claimId).maybeSingle(),
      hasPermission(userClient, 'expenses.manage_own'),
      hasPermission(userClient, 'expenses.review'),
    ])
    if (claimError) throw claimError
    if (!claim) return json({ error: '経費申請が見つかりません。' }, 404)
    if (!(canReview || (canOwn && claim.applicant_id === user.id))) return json({ error: 'この経費申請へ領収書を添付する権限がありません。' }, 403)
    if (claim.status === 'APPROVED' && !canReview) return json({ error: '承認済みの経費申請には領収書を追加できません。' }, 409)

    const config = await privateConfig()
    if (!config.enabled || !config.drive_id) return json({ error: 'OneDriveが未接続です。管理者へ確認してください。' }, 409)
    const accessToken = await refreshAccessToken(config)
    const driveId = String(config.drive_id)
    const root = cleanSegment(String(config.root_folder || '五代目八木一兵衛'))
    const { year, month } = japanYearMonth(String(claim.purchase_at))
    const claimFolder = cleanSegment(`${claim.claim_no}_${claim.vendor}`, String(claim.claim_no || '経費申請'))
    const folders = [root, '03_経費', '領収書', year, month, claimFolder]
    await ensureFolderPath(accessToken, driveId, folders)

    const original = cleanFileName(file.name)
    const fileName = cleanFileName(`領収書_${claim.claim_no}_${original}`)
    const uploadPath = graphPath([...folders, fileName])
    const bytes = await file.arrayBuffer()
    const uploadResponse = await graphFetch(accessToken, `/drives/${encodeURIComponent(driveId)}/root:/${uploadPath}:/content?@microsoft.graph.conflictBehavior=rename`, {
      method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: bytes,
    })
    const item = await uploadResponse.json().catch(() => ({})) as Record<string, any>
    if (!uploadResponse.ok || !item.id) throw new Error(String(item?.error?.message || `OneDriveアップロードに失敗しました (${uploadResponse.status})`))

    const { data: fileRow, error: fileError } = await admin.from('external_files').insert({
      provider: 'ONEDRIVE',
      drive_id: driveId,
      provider_item_id: String(item.id),
      file_name: String(item.name || fileName),
      mime_type: file.type || item.file?.mimeType || null,
      size_bytes: Number(item.size || file.size),
      folder_path: folders.join('/'),
      web_url: String(item.webUrl || ''),
      sha1_hash: String(item.file?.hashes?.sha1Hash || ''),
      uploaded_by: user.id,
      metadata: { kind: 'expense_receipt', claimNo: claim.claim_no, vendor: claim.vendor, eTag: item.eTag || null, cTag: item.cTag || null },
    }).select('id,provider,drive_id,provider_item_id,file_name,mime_type,size_bytes,folder_path,web_url,uploaded_at').single()
    if (fileError || !fileRow) throw fileError || new Error('領収書台帳を保存できませんでした。')

    const { error: linkError } = await admin.from('external_file_links').insert({
      file_id: fileRow.id,
      entity_type: 'expense_claim',
      entity_id: claimId,
      category: '経費・領収書',
      note: '経費精算領収書',
      created_by: user.id,
    })
    if (linkError) throw linkError
    return json({ ok: true, file: fileRow })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('権限') ? 403 : message.includes('ログイン') ? 401 : 500
    return json({ error: message }, status)
  }
})
