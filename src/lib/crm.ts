import { supabase } from './supabase'

export const PRIMARY_INQUIRY_RECIPIENTS = ['info@matchahigh.jp', 'info@godaimeyagiichibei.com'] as const
export const DEFAULT_GMAIL_SEARCH = '{to:info@matchahigh.jp to:info@godaimeyagiichibei.com}'

export type CrmAssignee = { id: string; display_name: string }
export type CrmCompany = {
  id: string; name: string; website: string | null; industry: string | null; country: string | null;
  region: string | null; address: string | null; phone: string | null; notes: string | null;
  document_customer_id: string | null
}
export type CrmContact = {
  id: string; company_id: string | null; name: string; email: string | null; phone: string | null;
  position: string | null; language: string | null; country: string | null; notes: string | null
}
export type CrmInquiry = {
  id: string; subject: string; category: string; stage: string; waiting_on: string; priority: string;
  source: string; company_id: string | null; contact_id: string | null; mailbox_id: string | null;
  gmail_thread_id: string | null; summary: string | null; notes: string | null; assigned_to: string | null;
  next_action_at: string | null; requested_product: string | null; quantity_kg: number | null;
  monthly_quantity_kg: number | null; expected_amount: number | null; currency: string;
  country: string | null; received_address: string | null; customer_id: string | null; sales_document_id: string | null;
  first_received_at: string | null; last_message_at: string | null; created_at: string; updated_at: string
}
export type CrmMessage = {
  id: string; inquiry_id: string; direction: 'inbound' | 'outbound'; from_address: string | null;
  to_addresses: string | null; subject: string | null; body_plain: string | null;
  snippet: string | null; sent_at: string; has_attachments: boolean
}
export type CrmActivity = {
  id: string; inquiry_id: string; activity_type: string; title: string;
  body: string | null; occurred_at: string
}
export type CrmMailbox = {
  id: string; email: string; oauth_email: string | null; filter_query: string; status: string; last_error: string | null;
  last_sync_at: string | null; connected_at: string | null
}
export type CrmAttachment = {
  id: string; message_id: string; filename: string; mime_type: string | null; size_bytes: number
}
export const CATEGORIES: Record<string, string> = {
  purchase: '商品購入', wholesale: '業務用卸売', oem: 'OEM・PB',
  export: '海外輸出', sample: '商品サンプル', other: 'その他'
}
export const STAGES: Record<string, string> = {
  new: '新規受付', qualifying: '要件確認', sampling: 'サンプル対応',
  quoted: '見積提出', negotiating: '条件交渉', won: '受注',
  lost: '失注', on_hold: '保留'
}
export const WAITING: Record<string, string> = {
  our_team: '自社対応待ち', customer: '顧客返信待ち', none: '対応完了'
}
export const PRIORITIES: Record<string, string> = { high: '高', normal: '通常', low: '低' }

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}
export async function loadCrm() {
  const [inquiries, companies, contacts, assignees] = await Promise.all([
    supabase.from('crm_inquiries').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase.from('crm_companies').select('*').order('name').limit(1000),
    supabase.from('crm_contacts').select('*').order('name').limit(1500),
    supabase.rpc('crm_list_assignees'),
  ])
  fail(inquiries.error); fail(companies.error); fail(contacts.error); fail(assignees.error)
  return {
    inquiries: (inquiries.data || []) as CrmInquiry[],
    companies: (companies.data || []) as CrmCompany[],
    contacts: (contacts.data || []) as CrmContact[],
    assignees: (assignees.data || []) as CrmAssignee[],
  }
}
export async function loadInquiryHistory(inquiryId: string) {
  const [messages, activities] = await Promise.all([
    supabase.from('crm_messages').select('*').eq('inquiry_id', inquiryId).order('sent_at', { ascending: true }).limit(500),
    supabase.from('crm_activities').select('*').eq('inquiry_id', inquiryId).order('occurred_at', { ascending: true }).limit(500),
  ])
  fail(messages.error); fail(activities.error)
  const ids = (messages.data || []).map(m => m.id)
  const attachments = ids.length
    ? await supabase.from('crm_attachments').select('*').in('message_id', ids).limit(500)
    : { data: [], error: null }
  fail(attachments.error)
  return {
    messages: (messages.data || []) as CrmMessage[],
    activities: (activities.data || []) as CrmActivity[],
    attachments: (attachments.data || []) as CrmAttachment[]
  }
}
export async function saveInquiry(id: string | null, values: Record<string, unknown>) {
  const payload = { ...values, updated_at: new Date().toISOString() }
  const request = id
    ? supabase.from('crm_inquiries').update(payload).eq('id', id).select('id').single()
    : supabase.from('crm_inquiries').insert(payload).select('id').single()
  const { data, error } = await request
  fail(error)
  return data!.id as string
}
export async function saveCompany(id: string | null, values: Record<string, unknown>) {
  const payload = { ...values, updated_at: new Date().toISOString() }
  const request = id
    ? supabase.from('crm_companies').update(payload).eq('id', id).select('id').single()
    : supabase.from('crm_companies').insert(payload).select('id').single()
  const { data, error } = await request
  fail(error)
  return data!.id as string
}
export async function saveContact(id: string | null, values: Record<string, unknown>) {
  const payload = { ...values, updated_at: new Date().toISOString() }
  const request = id
    ? supabase.from('crm_contacts').update(payload).eq('id', id).select('id').single()
    : supabase.from('crm_contacts').insert(payload).select('id').single()
  const { data, error } = await request
  fail(error)
  return data!.id as string
}
export async function addActivity(inquiryId: string, activity_type: string, title: string, body: string) {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('ログインしてください')
  const { error } = await supabase.from('crm_activities').insert({
    inquiry_id: inquiryId, activity_type, title, body, created_by: data.user.id
  })
  fail(error)
}
export async function loadCrmMailboxes() {
  const { data, error } = await supabase.from('crm_mailboxes').select('*').order('created_at')
  fail(error)
  return (data || []) as CrmMailbox[]
}
export async function updateCrmMailbox(id: string, values: Record<string, unknown>) {
  const { error } = await supabase.from('crm_mailboxes')
    .update({ ...values, updated_at: new Date().toISOString() }).eq('id', id)
  fail(error)
}
export async function invokeCrmMail(action: string, values: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('crm-gmail', {
    body: { action, ...values }
  })
  if (error) {
    // Supabase FunctionsHttpError keeps the server's JSON error in its Response.
    // Without reading it the UI only showed "Edge Function returned a non-2xx status code".
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: unknown }
        if (typeof body?.error === 'string' && body.error) throw new Error(body.error)
      } catch (detail) {
        if (detail instanceof Error && detail.message !== 'Failed to fetch') {
          if (detail instanceof SyntaxError) throw new Error(error.message)
          throw detail
        }
      }
    }
    throw new Error(error.message)
  }
  if (data?.error) throw new Error(String(data.error))
  return data
}
