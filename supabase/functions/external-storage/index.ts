import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const FUNCTION_BASE = `${SUPABASE_URL}/functions/v1/external-storage`
const DEFAULT_APP_ORIGIN = 'https://yagi-garden-manager.vercel.app'
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})
const errorJson = (message: string, status = 400) => json({ error: message }, status)

function cleanSegment(value: string, fallback = 'その他') {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|#%{}~&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || fallback).slice(0, 100)
}

function cleanFileName(value: string) {
  const normalized = value.normalize('NFKC').replace(/[\\/:*?"<>|#%{}~&]/g, '_').trim()
  return (normalized || `file-${Date.now()}`).slice(0, 180)
}

function graphPath(segments: string[]) {
  return segments.map((x) => encodeURIComponent(x)).join('/')
}

function safeReturnTo(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return `${DEFAULT_APP_ORIGIN}/storage`
  try {
    const url = new URL(raw)
    const allowed = url.origin === DEFAULT_APP_ORIGIN
      || url.origin === 'https://ryamada-cmd.github.io'
      || url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
    return allowed ? url.toString() : `${DEFAULT_APP_ORIGIN}/storage`
  } catch {
    return `${DEFAULT_APP_ORIGIN}/storage`
  }
}

function japanYearMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: map.year || String(date.getUTCFullYear()),
    month: map.month || String(date.getUTCMonth() + 1).padStart(2, '0'),
  }
}

async function userContext(req: Request, permission: string) {
  const authorization = req.headers.get('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) throw new Error('ログインが必要です。')
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) throw new Error('ログイン情報を確認できません。')
  const { data: allowed, error: permissionError } = await userClient.rpc('has_app_permission', { p_permission_key: permission })
  if (permissionError || allowed !== true) throw new Error('この操作を行う権限がありません。')
  return { user: userData.user, userClient }
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
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
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
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
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
    if (lookup.status !== 404) {
      const body = await lookup.text()
      throw new Error(`OneDriveフォルダ確認に失敗しました (${lookup.status}): ${body.slice(0, 300)}`)
    }
    const endpoint = parentId
      ? `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children`
      : `/drives/${encodeURIComponent(driveId)}/root/children`
    const createdResponse = await graphFetch(accessToken, endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: segment, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    })
    if (createdResponse.ok) {
      const created = await createdResponse.json() as Record<string, unknown>
      parentId = String(created.id || '')
      continue
    }
    if (createdResponse.status === 409) {
      const retry = await graphFetch(accessToken, `/drives/${encodeURIComponent(driveId)}/root:/${graphPath(built)}`)
      if (retry.ok) {
        const existing = await retry.json() as Record<string, unknown>
        parentId = String(existing.id || '')
        continue
      }
    }
    const body = await createdResponse.text()
    throw new Error(`OneDriveフォルダ作成に失敗しました (${createdResponse.status}): ${body.slice(0, 300)}`)
  }
}

async function ensureBaseFolderStructure(accessToken: string, driveId: string, rootFolder: string) {
  const root = cleanSegment(rootFolder || '五代目八木一兵衛')
  const paths = [
    [root, '01_帳票', '請求書'],
    [root, '01_帳票', '納品書'],
    [root, '02_仕入', '仕入請求書'],
    [root, '03_経費'],
    [root, '04_圃場'],
    [root, '05_機械設備'],
    [root, '06_農薬・肥料', '農薬'],
    [root, '06_農薬・肥料', '肥料'],
    [root, '99_その他'],
  ]
  for (const path of paths) await ensureFolderPath(accessToken, driveId, path)
}

async function resolveEntityFolder(entityType: string, entityId: string | null) {
  if (!entityId) return null
  if (entityType === 'sales_document') {
    const { data } = await admin.from('sales_documents').select('document_type,document_no,customer_name').eq('id', entityId).maybeSingle()
    if (!data) return null
    const subtype = data.document_type === 'INVOICE' ? '請求書' : '納品書'
    return { category: subtype, segments: ['01_帳票', subtype] }
  }
  if (entityType === 'vendor_invoice') {
    const { data } = await admin.from('vendor_invoices').select('invoice_no,vendor').eq('id', entityId).maybeSingle()
    if (!data) return null
    return { category: '仕入請求書', segments: ['02_仕入', '仕入請求書'] }
  }
  if (entityType === 'expense_claim') {
    const { data } = await admin.from('expense_claims').select('claim_no,vendor').eq('id', entityId).maybeSingle()
    if (!data) return null
    return { category: '経費・領収書', segments: ['03_経費'] }
  }
  if (entityType === 'field') {
    const { data } = await admin.from('fields').select('legacy_id,name').eq('id', entityId).maybeSingle()
    if (!data) return null
    const label = cleanSegment(`${data.legacy_id || ''} ${data.name || ''}`.trim(), '圃場未設定')
    return { category: '圃場', segments: ['04_圃場', label] }
  }
  if (entityType === 'equipment') {
    const { data } = await admin.from('equipment_assets').select('asset_no,name').eq('id', entityId).maybeSingle()
    if (!data) return null
    const label = cleanSegment(`${data.asset_no || ''} ${data.name || ''}`.trim(), '設備未設定')
    return { category: '機械設備', segments: ['05_機械設備', label] }
  }
  return null
}

async function resolveUploadDestination(root: string, requestedCategory: string, entityType: string, entityId: string | null) {
  const { year, month } = japanYearMonth()
  const entity = await resolveEntityFolder(entityType, entityId)
  if (entity) return { category: entity.category, folders: [root, ...entity.segments, year, month] }

  const category = cleanSegment(requestedCategory || 'その他')
  if (category === '請求書・納品書' || category === '請求書' || category === '納品書') {
    const subtype = category === '請求書' || category === '納品書' ? category : '未分類'
    return { category, folders: [root, '01_帳票', subtype, year, month] }
  }
  if (category === '仕入請求書') return { category, folders: [root, '02_仕入', '仕入請求書', year, month] }
  if (category === '経費・領収書') return { category, folders: [root, '03_経費', year, month] }
  if (category === '圃場') return { category, folders: [root, '04_圃場', '未分類', year, month] }
  if (category === '機械設備') return { category, folders: [root, '05_機械設備', '未分類', year, month] }
  if (category === '農薬') return { category, folders: [root, '06_農薬・肥料', '農薬', year, month] }
  if (category === '肥料') return { category, folders: [root, '06_農薬・肥料', '肥料', year, month] }
  if (category === '農薬・肥料') return { category, folders: [root, '06_農薬・肥料', '共通', year, month] }
  return { category: 'その他', folders: [root, '99_その他', year, month] }
}

async function statusPayload() {
  const { data, error } = await admin.from('external_storage_settings').select('*').eq('id', 1).single()
  if (error) throw error
  const { count } = await admin.from('external_files').select('id', { count: 'exact', head: true }).is('archived_at', null)
  return {
    provider: data.provider,
    enabled: data.enabled,
    tenantId: data.tenant_id || '',
    clientId: data.client_id || '',
    clientSecretConfigured: Boolean(data.client_secret_secret_id),
    refreshTokenConfigured: Boolean(data.refresh_token_secret_id),
    driveId: data.drive_id || '',
    driveType: data.drive_type || '',
    connectedAccount: data.connected_account || '',
    rootFolder: data.root_folder || '五代目八木一兵衛',
    connectedAt: data.connected_at || '',
    lastVerifiedAt: data.last_verified_at || '',
    lastError: data.last_error || '',
    fileCount: count || 0,
    folderStructure: 'v2',
    redirectUri: `${FUNCTION_BASE}/callback`,
  }
}

async function handleCallback(url: URL) {
  const state = url.searchParams.get('state') || ''
  const code = url.searchParams.get('code') || ''
  const oauthError = url.searchParams.get('error_description') || url.searchParams.get('error') || ''
  if (!state) return new Response('Invalid OAuth state', { status: 400 })

  const { data: stateRow } = await admin.from('external_storage_oauth_states').select('*').eq('state', state).maybeSingle()
  if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
    return new Response('OAuth state expired. Please return to the app and connect again.', { status: 400 })
  }
  await admin.from('external_storage_oauth_states').delete().eq('state', state)
  const returnTo = safeReturnTo(stateRow.return_to)
  if (oauthError) return Response.redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}storage_error=${encodeURIComponent(oauthError)}`, 302)
  if (!code) return Response.redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}storage_error=${encodeURIComponent('認証コードを取得できませんでした。')}`, 302)

  try {
    const config = await privateConfig()
    const tenantId = String(config.tenant_id || '')
    const clientId = String(config.client_id || '')
    const clientSecret = String(config.client_secret || '')
    if (!tenantId || !clientId || !clientSecret) throw new Error('Microsoft接続設定が不足しています。')

    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${FUNCTION_BASE}/callback`,
      scope: 'offline_access User.Read Files.ReadWrite',
    })
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    })
    const token = await tokenResponse.json().catch(() => ({})) as Record<string, unknown>
    if (!tokenResponse.ok || !token.access_token || !token.refresh_token) {
      throw new Error(String(token.error_description || token.error || 'Microsoft認証に失敗しました。'))
    }

    const accessToken = String(token.access_token)
    const [driveResponse, meResponse] = await Promise.all([
      graphFetch(accessToken, '/me/drive'),
      graphFetch(accessToken, '/me?$select=displayName,mail,userPrincipalName'),
    ])
    if (!driveResponse.ok) throw new Error(`OneDrive情報を取得できませんでした (${driveResponse.status})`)
    const drive = await driveResponse.json() as Record<string, unknown>
    const me = meResponse.ok ? await meResponse.json() as Record<string, unknown> : {}
    const driveId = String(drive.id || '')
    if (!driveId) throw new Error('OneDrive Drive IDを取得できませんでした。')
    const account = String(me.mail || me.userPrincipalName || me.displayName || 'Microsoft account')
    const root = String(config.root_folder || '五代目八木一兵衛')

    await ensureBaseFolderStructure(accessToken, driveId, root)
    const { error: saveError } = await admin.rpc('external_storage_set_connection', {
      p_drive_id: driveId,
      p_drive_type: String(drive.driveType || ''),
      p_connected_account: account,
      p_refresh_token: String(token.refresh_token),
      p_user_id: stateRow.user_id,
    })
    if (saveError) throw saveError
    return Response.redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}storage_connected=1`, 302)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await admin.rpc('external_storage_mark_error', { p_error: message })
    return Response.redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}storage_error=${encodeURIComponent(message)}`, 302)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url)
  if (req.method === 'GET' && url.pathname.endsWith('/callback')) return handleCallback(url)
  if (req.method !== 'POST') return errorJson('Method not allowed', 405)

  try {
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const { user } = await userContext(req, 'storage.upload')
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) return errorJson('ファイルを選択してください。')
      if (file.size <= 0) return errorJson('空のファイルはアップロードできません。')
      if (file.size > MAX_UPLOAD_BYTES) return errorJson('現在は1ファイル25MBまでアップロードできます。', 413)

      const config = await privateConfig()
      if (!config.enabled || !config.drive_id) return errorJson('OneDriveが未接続です。設定画面から接続してください。', 409)
      const accessToken = await refreshAccessToken(config)
      const driveId = String(config.drive_id)
      const root = cleanSegment(String(config.root_folder || '五代目八木一兵衛'))
      const requestedCategory = String(form.get('category') || 'その他')
      const entityType = cleanSegment(String(form.get('entityType') || 'general'), 'general').toLowerCase().replace(/\s+/g, '_')
      const entityId = String(form.get('entityId') || '').trim() || null
      const note = String(form.get('note') || '').trim() || null
      const destination = await resolveUploadDestination(root, requestedCategory, entityType, entityId)
      await ensureFolderPath(accessToken, driveId, destination.folders)

      const fileName = cleanFileName(file.name)
      const uploadPath = graphPath([...destination.folders, fileName])
      const bytes = await file.arrayBuffer()
      const uploadResponse = await graphFetch(accessToken, `/drives/${encodeURIComponent(driveId)}/root:/${uploadPath}:/content?@microsoft.graph.conflictBehavior=rename`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: bytes,
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
        folder_path: destination.folders.join('/'),
        web_url: String(item.webUrl || ''),
        sha1_hash: String(item.file?.hashes?.sha1Hash || ''),
        uploaded_by: user.id,
        metadata: { eTag: item.eTag || null, cTag: item.cTag || null, folderStructure: 'v2' },
      }).select('id,provider,drive_id,provider_item_id,file_name,mime_type,size_bytes,folder_path,web_url,uploaded_at').single()
      if (fileError || !fileRow) throw fileError || new Error('ファイル台帳を保存できませんでした。')

      const { error: linkError } = await admin.from('external_file_links').insert({
        file_id: fileRow.id,
        entity_type: entityType,
        entity_id: entityId,
        category: destination.category,
        note,
        created_by: user.id,
      })
      if (linkError) throw linkError
      return json({ ok: true, file: fileRow })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = String(body.action || 'status')

    if (action === 'status') {
      await userContext(req, 'storage.view')
      return json(await statusPayload())
    }

    if (action === 'configure') {
      const { user } = await userContext(req, 'storage.manage')
      const tenantId = String(body.tenantId || '').trim()
      const clientId = String(body.clientId || '').trim()
      const clientSecret = String(body.clientSecret || '')
      const rootFolder = cleanSegment(String(body.rootFolder || '五代目八木一兵衛'))
      if (!tenantId || !clientId) return errorJson('Tenant IDとClient IDを入力してください。')
      const { error } = await admin.rpc('external_storage_set_private_config', {
        p_tenant_id: tenantId,
        p_client_id: clientId,
        p_client_secret: clientSecret,
        p_root_folder: rootFolder,
        p_user_id: user.id,
      })
      if (error) throw error
      return json({ ok: true, ...(await statusPayload()) })
    }

    if (action === 'authorize') {
      const { user } = await userContext(req, 'storage.manage')
      const config = await privateConfig()
      const tenantId = String(config.tenant_id || '')
      const clientId = String(config.client_id || '')
      const clientSecret = String(config.client_secret || '')
      if (!tenantId || !clientId || !clientSecret) return errorJson('先にMicrosoft接続設定を保存してください。', 409)
      const state = `${crypto.randomUUID()}-${crypto.randomUUID()}`
      const returnTo = safeReturnTo(body.returnTo)
      await admin.from('external_storage_oauth_states').delete().lt('expires_at', new Date().toISOString())
      const { error } = await admin.from('external_storage_oauth_states').insert({ state, user_id: user.id, return_to: returnTo })
      if (error) throw error
      const authUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize`)
      authUrl.searchParams.set('client_id', clientId)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('redirect_uri', `${FUNCTION_BASE}/callback`)
      authUrl.searchParams.set('response_mode', 'query')
      authUrl.searchParams.set('scope', 'offline_access User.Read Files.ReadWrite')
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('prompt', 'select_account')
      return json({ url: authUrl.toString(), redirectUri: `${FUNCTION_BASE}/callback` })
    }

    if (action === 'verify') {
      await userContext(req, 'storage.manage')
      const config = await privateConfig()
      const accessToken = await refreshAccessToken(config)
      const driveResponse = await graphFetch(accessToken, '/me/drive')
      if (!driveResponse.ok) throw new Error(`OneDrive接続確認に失敗しました (${driveResponse.status})`)
      const drive = await driveResponse.json() as Record<string, unknown>
      await ensureBaseFolderStructure(accessToken, String(config.drive_id || drive.id || ''), String(config.root_folder || '五代目八木一兵衛'))
      await admin.from('external_storage_settings').update({ last_verified_at: new Date().toISOString(), last_error: null }).eq('id', 1)
      return json({ ok: true, drive: { id: drive.id, driveType: drive.driveType, name: drive.name }, ...(await statusPayload()) })
    }

    if (action === 'organize') {
      await userContext(req, 'storage.manage')
      const config = await privateConfig()
      if (!config.enabled || !config.drive_id) return errorJson('OneDriveが未接続です。', 409)
      const accessToken = await refreshAccessToken(config)
      await ensureBaseFolderStructure(accessToken, String(config.drive_id), String(config.root_folder || '五代目八木一兵衛'))
      await admin.from('external_storage_settings').update({ last_verified_at: new Date().toISOString(), last_error: null }).eq('id', 1)
      return json({ ok: true, ...(await statusPayload()) })
    }

    return errorJson('Unknown action', 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorJson(message, message.includes('権限') ? 403 : message.includes('ログイン') ? 401 : 500)
  }
})