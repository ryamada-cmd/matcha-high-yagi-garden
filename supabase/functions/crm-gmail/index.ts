// Gmail OAuth + safe, opt-in CRM import.
// OAuth client credentials and encryption secret must be configured as Edge Function secrets.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const CLIENT_ID = Deno.env.get('CRM_GOOGLE_CLIENT_ID') || ''
const CLIENT_SECRET = Deno.env.get('CRM_GOOGLE_CLIENT_SECRET') || ''
const TOKEN_SECRET = Deno.env.get('CRM_TOKEN_ENCRYPTION_SECRET') || ''
const SITE = 'https://yagi-garden-manager.vercel.app'
const REDIRECT_URI = SUPABASE_URL + '/functions/v1/crm-gmail?action=callback'
const admin = createClient(SUPABASE_URL, SERVICE_KEY)
const allowedOrigins = new Set([SITE, 'https://ryamada-cmd.github.io', 'http://localhost:5173'])

function cors(request: Request) {
  const origin = request.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : SITE,
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,x-crm-cron',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
    'Vary': 'Origin'
  }
}
function json(request: Request, body: unknown, code = 200) {
  return new Response(JSON.stringify(body), { status: code, headers: { ...cors(request), 'Content-Type': 'application/json; charset=utf-8' } })
}
function requiredConfig() {
  if (!CLIENT_ID || !CLIENT_SECRET || TOKEN_SECRET.length < 32) {
    throw new Error('Gmail OAuthのサーバー設定が未完了です（CRM_GOOGLE_CLIENT_ID / CRM_GOOGLE_CLIENT_SECRET / CRM_TOKEN_ENCRYPTION_SECRET）')
  }
}
function validId(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)
}
async function permission(request: Request) {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!bearer) throw new Error('ログインが必要です')
  const { data, error } = await admin.auth.getUser(bearer)
  if (error || !data.user) throw new Error('認証が失効しています')
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + bearer } } })
  const check = await client.rpc('has_app_permission', { p_permission_key: 'crm.mailboxes' })
  if (check.error || check.data !== true) throw new Error('メール連携管理の権限がありません')
  return data.user
}
async function encryptionKey() {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TOKEN_SECRET))
  return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
function b64(bytes: Uint8Array) {
  let result = ''
  for (let i = 0; i < bytes.length; i++) result += String.fromCharCode(bytes[i])
  return btoa(result)
}
function unb64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, v => v.charCodeAt(0))
}
async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const result = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(value)))
  return b64(iv) + '.' + b64(result)
}
async function decrypt(value: string) {
  const [i,c] = value.split('.')
  if (!i || !c) throw new Error('暗号化された認証情報を復号できません')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(i) }, await encryptionKey(), unb64(c))
  return new TextDecoder().decode(plain)
}
async function googleToken(body: URLSearchParams) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  })
  const data = await response.json()
  if (!response.ok || !data.access_token) throw new Error('Google認証を更新できません。接続し直してください')
  return data
}
function googleAuth(accessToken: string) { return { Authorization: 'Bearer ' + accessToken } }
async function googleJson(url: string, accessToken: string) {
  const response = await fetch(url, { headers: googleAuth(accessToken) })
  if (!response.ok) throw new Error('Gmail APIの取得に失敗しました（HTTP ' + response.status + '）')
  return await response.json()
}
function head(payload: any, name: string) {
  return String((payload?.headers || []).find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value || '')
}
function address(value: string) {
  const match = value.match(/<([^>]+)>/)
  return (match ? match[1] : value).trim().replace(/^mailto:/i, '').toLowerCase()
}
function senderName(value: string) {
  return value.replace(/<[^>]+>/g, '').replace(/^["']|["']$/g, '').trim().slice(0, 150)
}
function base64Text(value: string) {
  try {
    const urlsafe = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = urlsafe + '='.repeat((4 - urlsafe.length % 4) % 4)
    return new TextDecoder().decode(unb64(padded))
  } catch { return '' }
}
function flattenParts(part: any): any[] {
  return [part, ...(part?.parts || []).flatMap((p: any) => flattenParts(p))]
}
function bodyPlain(payload: any, fallback: string) {
  const parts = flattenParts(payload)
  const plain = parts.find((p: any) => p?.mimeType === 'text/plain' && p?.body?.data)
  const body = plain?.body?.data || (payload?.mimeType === 'text/plain' ? payload?.body?.data : '')
  return (body ? base64Text(body) : fallback).slice(0, 150000)
}
async function connect(user: { id: string }, filterQuery: string) {
  requiredConfig()
  if (filterQuery.length < 2 || filterQuery.length > 500) throw new Error('Gmail検索条件を2〜500文字で指定してください')
  const state = crypto.randomUUID() + '-' + crypto.randomUUID()
  const result = await admin.rpc('crm_backend_create_state', { p_state: state, p_requested_by: user.id, p_filter_query: filterQuery })
  if (result.error) throw result.error
  const params = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code',
    scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline', prompt: 'consent', state, include_granted_scopes: 'true'
  })
  return { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() }
}
async function callback(url: URL) {
  requiredConfig()
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) throw new Error('Google認証が中断されました')
  const claim = await admin.rpc('crm_backend_consume_state', { p_state: state })
  if (claim.error || !claim.data) throw new Error('認証状態が失効しています。再度接続してください')
  const token = await googleToken(new URLSearchParams({
    code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI, grant_type: 'authorization_code'
  }))
  if (!token.refresh_token) throw new Error('更新トークンが発行されませんでした。再接続してください')
  const profile = await googleJson('https://www.googleapis.com/oauth2/v2/userinfo', token.access_token)
  const email = String(profile.email || '').trim().toLowerCase()
  if (!email || profile.verified_email === false) throw new Error('認証されたメールアドレスを確認できません')
  const upsert = await admin.from('crm_mailboxes').upsert({
    email, google_subject: String(profile.id || email),
    filter_query: claim.data.filter_query, status: 'paused',
    connected_at: new Date().toISOString(),created_by: claim.data.requested_by,
    last_error: null,updated_at: new Date().toISOString()
  }, { onConflict: 'email' }).select('id').single()
  if (upsert.error || !upsert.data) throw new Error('メール接続の保存に失敗しました')
  const result = await admin.rpc('crm_backend_store_token', {
    p_mailbox_id: upsert.data.id, p_token_enc: await encrypt(String(token.refresh_token))
  })
  if (result.error) throw new Error('認証情報を安全に保存できませんでした')
}
async function accessToken(mailboxId: string) {
  const token = await admin.rpc('crm_backend_get_token', { p_mailbox_id: mailboxId })
  if (token.error || !token.data) throw new Error('Gmail認証情報がありません。再接続してください')
  const refreshToken = await decrypt(String(token.data))
  const response = await googleToken(new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: refreshToken, grant_type: 'refresh_token'
  }))
  return String(response.access_token)
}
async function getOrCreateContact(from: string, display: string) {
  const email = address(from)
  if (!email || !email.includes('@')) return null
  const found = await admin.from('crm_contacts').select('id').ilike('email', email).limit(1).maybeSingle()
  if (found.data) return found.data.id as string
  const inserted = await admin.from('crm_contacts').insert({ name: display || email, email }).select('id').single()
  if (inserted.data) return inserted.data.id as string
  const retry = await admin.from('crm_contacts').select('id').ilike('email', email).limit(1).maybeSingle()
  if (retry.data) return retry.data.id as string
  throw new Error('問い合わせ担当者を登録できませんでした')
}
async function ingestMessage(mailbox: any, raw: any) {
  const id = String(raw.id)
  const threadId = String(raw.threadId || '')
  if (!id || !threadId || raw.labelIds?.includes('DRAFT')) return false
  const exists = await admin.from('crm_messages').select('id').eq('mailbox_id', mailbox.id).eq('gmail_message_id', id).maybeSingle()
  if (exists.data) return false
  const sent = new Date(Number(raw.internalDate || Date.now())).toISOString()
  const from = head(raw.payload, 'From')
  const to = head(raw.payload, 'To')
  const direction = raw.labelIds?.includes('SENT') || address(from) === String(mailbox.email).toLowerCase() ? 'outbound' : 'inbound'
  const subject = head(raw.payload, 'Subject') || '(件名なし)'
  const snippet = String(raw.snippet || '').slice(0, 2000)
  const allParts = flattenParts(raw.payload)
  const attachmentParts = allParts.filter((p: any) => p?.filename && p?.body?.attachmentId)
  let inquiry = await admin.from('crm_inquiries').select('id,last_message_at,contact_id,stage')
    .eq('mailbox_id', mailbox.id).eq('gmail_thread_id', threadId).maybeSingle()
  if (inquiry.error) throw inquiry.error
  let contactId: string | null = null
  if (direction === 'inbound') contactId = await getOrCreateContact(from, senderName(from))
  if (!inquiry.data) {
    const created = await admin.from('crm_inquiries').insert({
      subject: subject.slice(0, 500), category: 'other',stage: 'new',
      waiting_on: direction === 'inbound' ? 'our_team' : 'customer',
      priority: 'normal',source: 'gmail',contact_id: contactId,
      mailbox_id: mailbox.id,gmail_thread_id: threadId,
      summary: snippet, first_received_at: sent,last_message_at: sent
    }).select('id,last_message_at,contact_id,stage').single()
    if (created.error) {
      inquiry = await admin.from('crm_inquiries').select('id,last_message_at,contact_id,stage')
        .eq('mailbox_id', mailbox.id).eq('gmail_thread_id', threadId).maybeSingle()
      if (!inquiry.data) throw created.error
    } else inquiry = created
  }
  const message = await admin.from('crm_messages').upsert({
    inquiry_id: inquiry.data!.id,mailbox_id:mailbox.id,gmail_message_id:id,
    direction,from_address:from,to_addresses:to,cc_addresses:head(raw.payload,'Cc'),
    subject,body_plain:bodyPlain(raw.payload,snippet),snippet,sent_at:sent,
    has_attachments:attachmentParts.length > 0
  }, { onConflict: 'mailbox_id,gmail_message_id' }).select('id').single()
  if (message.error || !message.data) throw new Error('メールの保存に失敗しました')
  for (const part of attachmentParts) {
    const attachmentId = String(part.body.attachmentId)
    await admin.from('crm_attachments').upsert({
      message_id: message.data.id, gmail_attachment_id: attachmentId,
      filename: String(part.filename).slice(0, 250),
      mime_type: String(part.mimeType || ''),size_bytes: Number(part.body.size || 0)
    }, { onConflict: 'message_id,gmail_attachment_id' })
  }
  const previous = inquiry.data?.last_message_at
  if (!previous || new Date(previous).getTime() <= new Date(sent).getTime()) {
    const update: any = {
      last_message_at: sent,updated_at: new Date().toISOString(),
      waiting_on: direction === 'inbound' ? 'our_team' : 'customer'
    }
    if (!inquiry.data?.contact_id && contactId) update.contact_id = contactId
    if (['won','lost'].includes(String(inquiry.data?.stage))) delete update.waiting_on
    const saved = await admin.from('crm_inquiries').update(update).eq('id', inquiry.data!.id)
    if (saved.error) throw saved.error
  }
  return true
}
async function syncMailbox(box: any) {
  if (box.status !== 'active' || !box.filter_query?.trim()) throw new Error('メール同期が無効か、検索条件が未設定です')
  const access = await accessToken(box.id)
  const older = box.last_sync_at ? new Date(new Date(box.last_sync_at).getTime() - 86400000 * 2) : new Date(Date.now() - 86400000 * 7)
  const after = [older.getUTCFullYear(),String(older.getUTCMonth() + 1).padStart(2,'0'),String(older.getUTCDate()).padStart(2,'0')].join('/')
  const q = box.filter_query + ' after:' + after + ' -in:spam -in:trash'
  // Search threads, then fetch the *whole* thread so replies sent from Gmail
  // are retained even if the outbound individual message lacks the inbox label.
  const ids: string[] = []
  let pageToken = ''
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ q, maxResults: '200' })
    if (pageToken) params.set('pageToken', pageToken)
    const data = await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/threads?' + params.toString(), access)
    for (const item of data.threads || []) ids.push(item.id)
    pageToken = data.nextPageToken || ''
    if (!pageToken) break
  }
  if (pageToken) throw new Error('同期対象が1000スレッドを超えました。Gmail検索条件を絞り込んでください')
  const uniqueMessages = new Map<string, any>()
  for (const id of ids) {
    const data = await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/threads/' + encodeURIComponent(id) + '?format=full', access)
    for (const message of data.messages || []) uniqueMessages.set(message.id, message)
  }
  const messages = [...uniqueMessages.values()].sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0))
  let imported = 0
  for (const item of messages) if (await ingestMessage(box, item)) imported++
  const updated = await admin.from('crm_mailboxes').update({
    last_sync_at: new Date().toISOString(), last_error: null, status: 'active', updated_at: new Date().toISOString()
  }).eq('id', box.id)
  if (updated.error) throw updated.error
  return imported
}
async function sync(mailboxId?: string) {
  requiredConfig()
  let query = admin.from('crm_mailboxes').select('*').eq('status','active')
  if (mailboxId) query = query.eq('id',mailboxId)
  const result = await query
  if (result.error) throw result.error
  let imported = 0
  const errors: string[] = []
  for (const box of result.data || []) {
    try { imported += await syncMailbox(box) } catch (error) {
      const message = error instanceof Error ? error.message : '同期に失敗しました'
      errors.push(box.email + ': ' + message)
      await admin.from('crm_mailboxes').update({status:'error',last_error:message,updated_at:new Date().toISOString()}).eq('id',box.id)
    }
  }
  return { imported, checked: (result.data || []).length, errors }
}
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(request) })
  try {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.searchParams.get('action') === 'callback') {
      try {
        await callback(url)
        return Response.redirect(SITE + '/crm?gmail=connected', 302)
      } catch {
        return Response.redirect(SITE + '/crm?gmail=error', 302)
      }
    }
    if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)
    const payload = await request.json()
    const action = String(payload.action || '')
    const cronHeader = request.headers.get('x-crm-cron')
    const verification = action === 'cron' && cronHeader ? await admin.rpc('crm_backend_validate_cron', { p_secret: cronHeader }) : null
    const isCron = verification?.data === true && !verification.error
    if (!isCron) await permission(request)
    if (action === 'connect') return json(request, await connect((await permission(request)), String(payload.filterQuery || '').trim()))
    if (action === 'sync' || isCron) {
      if (payload.mailboxId && !validId(payload.mailboxId)) throw new Error('メールアカウントIDが正しくありません')
      return json(request, await sync(isCron ? undefined : payload.mailboxId))
    }
    throw new Error('Unknown operation')
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'CRM Gmail error' }, 400)
  }
})
