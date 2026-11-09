import { supabase } from './supabase'

export type CrmSenderRule = {
  id: string; mailbox_id: string; sender_email: string; active: boolean;
  created_at: string; updated_at: string
}
export type CrmReplyKnowledge = {
  id: string; kind: 'product' | 'general'; title: string;
  brand: string | null; product_name: string | null; variety: string | null;
  grade: string | null; unit_size: string | null; unit_price: number | null;
  currency: string; moq_kg: number | null; lead_time: string | null;
  sample_price: number | null; sample_quantity_g: number | null;
  sample_moq_qty: number | null; shipping_terms: string | null;
  payment_terms: string | null; notes: string | null;
  valid_until: string | null; approved: boolean; approved_at: string | null;
  updated_at: string
}
export type CrmReplyDraft = {
  id: string; inquiry_id: string; knowledge_id: string | null;
  summary: string; reply_subject: string; reply_body: string;
  missing_fields: string[]; knowledge_snapshot: Record<string, unknown>;
  method: 'ai' | 'template'; language: 'ja' | 'en'; created_at: string
}
function checked(error: {message: string} | null) {
  if (error) throw new Error(error.message)
}
export async function setCrmInquiryExcluded(inquiryId: string, excluded: boolean, reason = '営業対象外・プロモーション') {
  const {data: user} = await supabase.auth.getUser()
  if (!user.user) throw new Error('ログインしてください')
  const {error} = await supabase.from('crm_inquiries').update({
    excluded_at: excluded ? new Date().toISOString() : null,
    excluded_by: excluded ? user.user.id : null,
    excluded_reason: excluded ? reason.trim().slice(0, 400) : null,
    updated_at: new Date().toISOString()
  }).eq('id', inquiryId)
  checked(error)
}
export function crmSenderAddress(value: string) {
  const match = value.match(/<([^<>]+@[^<>]+)>/)
  const email = (match ? match[1] : value).trim().toLowerCase()
  return /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) ? email : ''
}
export async function loadCrmSenderRules() {
  const {data, error} = await supabase.from('crm_sender_rules').select('*').order('created_at',{ascending:false})
  checked(error)
  return (data || []) as CrmSenderRule[]
}
export async function blockCrmSender(mailboxId: string, senderEmail: string) {
  const email = crmSenderAddress(senderEmail)
  if (!email) throw new Error('送信元メールアドレスを確認できません')
  const found = await supabase.from('crm_sender_rules').select('id').eq('mailbox_id',mailboxId).eq('sender_email',email).maybeSingle()
  checked(found.error)
  if (found.data) {
    const {error} = await supabase.from('crm_sender_rules').update({active:true}).eq('id', found.data.id)
    checked(error)
  } else {
    const {error} = await supabase.from('crm_sender_rules').insert({mailbox_id:mailboxId,sender_email:email,active:true})
    checked(error)
  }
}
export async function setCrmSenderRuleEnabled(id: string, enabled: boolean) {
  const {error} = await supabase.from('crm_sender_rules').update({active:enabled}).eq('id',id)
  checked(error)
}
export async function loadCrmReplyKnowledge() {
  const {data,error} = await supabase.from('crm_reply_knowledge').select('*').order('updated_at',{ascending:false}).limit(300)
  checked(error)
  return (data || []) as CrmReplyKnowledge[]
}
export async function saveCrmReplyKnowledge(id: string | null, values: Record<string, unknown>) {
  const {data: auth} = await supabase.auth.getUser()
  if (!auth.user) throw new Error('ログインしてください')
  const payload = { ...values, updated_by: auth.user.id }
  const request = id
    ? supabase.from('crm_reply_knowledge').update(payload).eq('id',id).select('id').single()
    : supabase.from('crm_reply_knowledge').insert(payload).select('id').single()
  const {data,error} = await request
  checked(error)
  return data!.id as string
}
export async function setCrmKnowledgeApproved(id: string, approved: boolean) {
  const {error} = await supabase.from('crm_reply_knowledge').update({approved}).eq('id',id)
  checked(error)
}
export async function loadCrmReplyDrafts(inquiryId: string) {
  const {data,error} = await supabase.from('crm_reply_drafts').select('*')
    .eq('inquiry_id',inquiryId).order('created_at',{ascending:false}).limit(12)
  checked(error)
  return (data || []) as CrmReplyDraft[]
}
export async function saveCrmReplyDraft(id: string, subject: string, body: string) {
  const {error} = await supabase.from('crm_reply_drafts').update({
    reply_subject:subject.slice(0,240),reply_body:body.slice(0,12000),updated_at:new Date().toISOString()
  }).eq('id',id)
  checked(error)
}
export async function createCrmReplyDraft(inquiryId: string, knowledgeId: string | null, language: 'ja' | 'en') {
  const {data,error} = await supabase.functions.invoke('crm-reply-assistant', {
    body: { inquiryId, knowledgeId, language }
  })
  if (error) {
    const context = (error as {context?: unknown}).context
    if (context instanceof Response) {
      try {
        const body = await context.clone().json()
        if (typeof body?.error === 'string') throw new Error(body.error)
      } catch (detail) {
        if (detail instanceof Error && !(detail instanceof SyntaxError)) throw detail
      }
    }
    throw new Error(error.message)
  }
  if (data?.error) throw new Error(String(data.error))
  return data as {draft: CrmReplyDraft; ai_available: boolean}
}
