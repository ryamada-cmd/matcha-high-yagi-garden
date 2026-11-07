import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CalendarClock, CircleCheck, Inbox, Mail, MessageSquareText, Plus, RefreshCw, Save, Search, Send, Settings2, Users } from 'lucide-react'
import { useAppPermissions } from '../lib/permissions'
import { supabase } from '../lib/supabase'
import {
  CATEGORIES, PRIMARY_INQUIRY_RECIPIENTS, PRIORITIES, STAGES, WAITING, addActivity, invokeCrmMail, loadCrm, loadCrmMailboxes,
  loadInquiryHistory, saveCompany, saveContact, saveInquiry, updateCrmMailbox,
  type CrmActivity, type CrmAttachment, type CrmAssignee, type CrmCompany, type CrmContact, type CrmInquiry, type CrmMailbox, type CrmMessage
} from '../lib/crm'

type Tab = 'inquiries' | 'contacts' | 'mail'
type DocRef = { id: string; document_no: string; document_type: string; customer_name: string; issue_date: string }
type DocCustomer = { id: string; name: string }
type Draft = Record<string, string>
const blank: Draft = { subject: '', category: 'wholesale', stage: 'new', waiting_on: 'our_team', priority: 'normal', source: 'manual', company_id: '', contact_id: '', assigned_to: '', sales_document_id: '', received_address: '', summary: '', notes: '', country: '', requested_product: '', quantity_kg: '', monthly_quantity_kg: '', expected_amount: '', currency: 'JPY', next_action_at: '' }
const stamp = (value: string | null) => value ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'
const localDate = (value: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
const opt = (value: string) => value.trim() || null
const number = (value: string) => value.trim() ? Number(value) : null
const selection = (items: Record<string, string>) => Object.entries(items).map(([value, label]) => <option key={value} value={value}>{label}</option>)
function draftFrom(inquiry: CrmInquiry): Draft {
  const d = { ...blank } as Draft
  for (const key of Object.keys(d)) {
    if (key === 'next_action_at') d[key] = localDate(inquiry.next_action_at)
    else d[key] = String((inquiry as unknown as Record<string, unknown>)[key] ?? '')
  }
  return d
}
function errText(error: unknown) { return error instanceof Error ? error.message : '処理に失敗しました' }

export default function CrmPage() {
  const { allowed } = useAppPermissions()
  const canManage = allowed('crm.manage')
  const canMail = allowed('crm.mailboxes')
  const [tab, setTab] = useState<Tab>('inquiries')
  const [inquiries, setInquiries] = useState<CrmInquiry[]>([])
  const [companies, setCompanies] = useState<CrmCompany[]>([])
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [docs, setDocs] = useState<DocRef[]>([])
  const [docCustomers, setDocCustomers] = useState<DocCustomer[]>([])
  const [assignees, setAssignees] = useState<CrmAssignee[]>([])
  const [mailboxes, setMailboxes] = useState<CrmMailbox[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<Draft>({ ...blank })
  const [companyDraft, setCompanyDraft] = useState<Draft>({ name: '', country: '', industry: '', website: '', notes: '', document_customer_id: '' })
  const [companyEdit, setCompanyEdit] = useState('')
  const [contactDraft, setContactDraft] = useState<Draft>({ name: '', email: '', company_id: '', country: '', phone: '', language: '', position: '', notes: '' })
  const [contactEdit, setContactEdit] = useState('')
  const [messageList, setMessageList] = useState<CrmMessage[]>([])
  const [activityList, setActivityList] = useState<CrmActivity[]>([])
  const [attachments, setAttachments] = useState<CrmAttachment[]>([])
  const [activityType, setActivityType] = useState('note')
  const [activityText, setActivityText] = useState('')
  const [filter, setFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [receivedFilter, setReceivedFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [oauthStatus, setOauthStatus] = useState<{ ready: boolean; missing: string[] } | null>(null)
  const selected = inquiries.find(x => x.id === selectedId)
  const contactName = (id: string | null) => contacts.find(x => x.id === id)?.name || '担当者未登録'
  const companyName = (id: string | null) => companies.find(x => x.id === id)?.name || '会社未登録'

  async function refresh() {
    setLoading(true)
    try {
      const result = await loadCrm()
      setInquiries(result.inquiries); setCompanies(result.companies); setContacts(result.contacts); setAssignees(result.assignees)
      if (allowed('documents.view')) {
        const [d, c] = await Promise.all([
          supabase.from('sales_documents').select('id,document_no,document_type,customer_name,issue_date').is('deleted_at', null).order('issue_date',{ascending:false}).limit(300),
          supabase.from('document_customers').select('id,name').is('deleted_at', null).order('name').limit(500)
        ])
        if (d.error || c.error) throw new Error(d.error?.message || c.error?.message || '帳票を読み込めません')
        setDocs((d.data || []) as DocRef[]); setDocCustomers((c.data || []) as DocCustomer[])
      }
      if (canMail) setMailboxes(await loadCrmMailboxes())
      setError('')
    } catch (error) { setError(errText(error)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [canMail])
  useEffect(() => {
    if (tab !== 'mail' || !canMail) return
    let active = true
    void invokeCrmMail('status').then(data => {
      if (active) setOauthStatus({
        ready: data.ready === true,
        missing: Array.isArray(data.missing) ? data.missing : []
      })
    }).catch(error => { if (active) setError(errText(error)) })
    return () => { active = false }
  }, [tab, canMail])
  useEffect(() => {
    if (selected) setDraft(draftFrom(selected))
    else if (selectedId === 'new') setDraft({ ...blank })
  }, [selectedId, selected?.updated_at])
  useEffect(() => {
    let active = true
    setMessageList([]); setActivityList([]); setAttachments([])
    if (!selected || selectedId === 'new') return
    loadInquiryHistory(selected.id).then(data => {
      if (active) { setMessageList(data.messages); setActivityList(data.activities); setAttachments(data.attachments) }
    }).catch(error => { if (active) setError(errText(error)) })
    return () => { active = false }
  }, [selectedId, selected?.last_message_at, selected?.updated_at])

  const filtered = useMemo(() => inquiries.filter(item => {
    if (stageFilter !== 'all' && item.stage !== stageFilter) return false
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
    if (receivedFilter !== 'all' && item.received_address !== receivedFilter) return false
    if (filter === 'pending' && (item.waiting_on !== 'our_team' || ['won', 'lost'].includes(item.stage))) return false
    if (filter === 'overdue' && (!item.next_action_at || new Date(item.next_action_at).getTime() >= Date.now())) return false
    const contact = contacts.find(x => x.id === item.contact_id)
    const company = companies.find(x => x.id === item.company_id)
    return (item.subject + ' ' + (item.summary || '') + ' ' + (contact?.email || '') + ' ' + (contact?.name || '') + ' ' + (company?.name || '')).toLowerCase().includes(query.toLowerCase())
  }), [inquiries, stageFilter, categoryFilter, receivedFilter, filter, contacts, companies, query])
  const pending = inquiries.filter(i => i.waiting_on === 'our_team' && !['won','lost'].includes(i.stage)).length
  const overdue = inquiries.filter(i => i.next_action_at && new Date(i.next_action_at) < new Date() && !['won','lost'].includes(i.stage)).length
  const won = inquiries.filter(i => i.stage === 'won').length
  function field(key: string, value: string) { setDraft(d => ({ ...d, [key]: value })) }

  async function saveCase(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return
    setBusy(true); setError(''); setNotice('')
    try {
      const payload = {
        subject: draft.subject.trim(), category: draft.category, stage: draft.stage,
        waiting_on: draft.waiting_on, priority: draft.priority, source: draft.source,
        company_id: opt(draft.company_id), contact_id: opt(draft.contact_id), assigned_to: opt(draft.assigned_to),
        sales_document_id: allowed('documents.view') ? opt(draft.sales_document_id) : (selected?.sales_document_id || null),
        summary: opt(draft.summary), notes: opt(draft.notes), country: opt(draft.country),
        received_address: opt(draft.received_address),
        requested_product: opt(draft.requested_product), currency: draft.currency || 'JPY',
        quantity_kg: number(draft.quantity_kg), monthly_quantity_kg: number(draft.monthly_quantity_kg),
        expected_amount: number(draft.expected_amount),
        next_action_at: draft.next_action_at ? new Date(draft.next_action_at).toISOString() : null
      }
      if (!payload.subject) throw new Error('件名を入力してください')
      const id = await saveInquiry(selectedId && selectedId !== 'new' ? selectedId : null, payload)
      setSelectedId(id); setNotice('案件を保存しました'); await refresh()
    } catch (error) { setError(errText(error)) } finally { setBusy(false) }
  }
  async function saveCompanyForm(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await saveCompany(companyEdit || null, {
        name: companyDraft.name.trim(), website: opt(companyDraft.website), industry: opt(companyDraft.industry),
        country: opt(companyDraft.country), notes: opt(companyDraft.notes),
        document_customer_id: allowed('documents.view') ? opt(companyDraft.document_customer_id) : (companies.find(x => x.id === companyEdit)?.document_customer_id || null)
      })
      setCompanyEdit(''); setCompanyDraft({ name: '', country: '', industry: '', website: '', notes: '', document_customer_id: '' })
      setNotice('取引先を保存しました'); await refresh()
    } catch (error) { setError(errText(error)) } finally { setBusy(false) }
  }
  async function saveContactForm(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await saveContact(contactEdit || null, {
        name: contactDraft.name.trim(), email: opt(contactDraft.email), phone: opt(contactDraft.phone),
        company_id: opt(contactDraft.company_id), country: opt(contactDraft.country),
        language: opt(contactDraft.language), position: opt(contactDraft.position), notes: opt(contactDraft.notes)
      })
      setContactEdit(''); setContactDraft({ name: '', email: '', company_id: '', country: '', phone: '', language: '', position: '', notes: '' })
      setNotice('担当者を保存しました'); await refresh()
    } catch (error) { setError(errText(error)) } finally { setBusy(false) }
  }
  async function addNote(event: FormEvent) {
    event.preventDefault(); if (!selected || !canManage) return
    setBusy(true); setError('')
    try {
      await addActivity(selected.id, activityType, { note: '社内メモ', call: '電話', meeting: '商談', sample: 'サンプル対応', task: 'タスク', stage: '進捗更新', other: 'その他' }[activityType] || '活動', activityText)
      setActivityText(''); setNotice('対応履歴を登録しました')
      const history = await loadInquiryHistory(selected.id)
      setMessageList(history.messages); setActivityList(history.activities); setAttachments(history.attachments)
    } catch (error) { setError(errText(error)) } finally { setBusy(false) }
  }
  async function mailAction(action: string, args: Record<string, unknown> = {}) {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await invokeCrmMail(action, args)
      if (action === 'connect') {
        const url = new URL(String(result.url))
        if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com') throw new Error('認証URLを確認できません')
        window.location.assign(url.toString()); return
      }
      if (Array.isArray(result.errors) && result.errors.length) setError(result.errors.join(' / '))
      setNotice(action === 'sync' ? '同期結果：' + (result.imported ?? 0) + '件のメールを取り込みました' : '設定を更新しました')
      await refresh()
    } catch (error) { setError(errText(error)) } finally { setBusy(false) }
  }
  return <div className="page crm-page">
    <header className="page-head"><div><p className="eyebrow">YAGI ICHIBEI / SALES CRM</p><h1>営業・問い合わせ管理</h1><p className="sub">国内外のお問い合わせを案件単位で集約し、商談から受注まで管理します。</p></div>
      <button className="icon-button" type="button" title="最新データに更新" onClick={() => void refresh()} disabled={loading}><RefreshCw size={19}/></button></header>
    {error && <div role="alert" className="notice error">{error}</div>}
    {notice && <div role="status" className="notice success">{notice}</div>}
    <div className="crm-tabs" role="tablist">
      <button className={tab === 'inquiries' ? 'active' : ''} onClick={() => setTab('inquiries')}><Inbox size={17}/>問い合わせ・商談</button>
      <button className={tab === 'contacts' ? 'active' : ''} onClick={() => setTab('contacts')}><Users size={17}/>取引先・担当者</button>
      {canMail && <button className={tab === 'mail' ? 'active' : ''} onClick={() => setTab('mail')}><Settings2 size={17}/>メール連携</button>}
    </div>
    {tab === 'inquiries' && <>
      <div className="crm-metrics">
        <button onClick={() => { setFilter(''); setStageFilter('all') }}><Inbox size={18}/><span>全案件</span><b>{inquiries.length}</b></button>
        <button onClick={() => setFilter('pending')}><Mail size={18}/><span>自社対応待ち</span><b>{pending}</b></button>
        <button onClick={() => setFilter('overdue')}><CalendarClock size={18}/><span>期限超過</span><b>{overdue}</b></button>
        <button onClick={() => { setFilter(''); setStageFilter('won') }}><CircleCheck size={18}/><span>受注</span><b>{won}</b></button>
      </div>
      <div className="crm-layout">
        <section className="panel crm-list">
          <div className="crm-list-head"><h2>問い合わせ一覧</h2>{canManage && <button className="primary-button" type="button" onClick={() => setSelectedId('new')}><Plus size={17}/>新規案件</button>}</div>
          <div className="crm-filter"><label><Search size={16}/><input aria-label="案件検索" placeholder="企業名・メール・内容で検索" value={query} onChange={e => setQuery(e.target.value)}/></label>
            <select aria-label="進捗で絞り込み" value={stageFilter} onChange={e => setStageFilter(e.target.value)}><option value="all">すべての進捗</option>{selection(STAGES)}</select>
            <select aria-label="種別で絞り込み" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">すべての種別</option>{selection(CATEGORIES)}</select>
            <select aria-label="受付アドレスで絞り込み" value={receivedFilter} onChange={e => setReceivedFilter(e.target.value)}><option value="all">すべての受付アドレス</option>{PRIMARY_INQUIRY_RECIPIENTS.map(addr => <option key={addr} value={addr}>{addr}</option>)}</select>
            {filter && <button className="secondary-button" onClick={() => setFilter('')}>絞り込み解除</button>}</div>
          <div className="crm-list-rows">{loading && <p>読み込み中…</p>}{!loading && filtered.length === 0 && <p className="crm-empty">該当する案件はありません。</p>}
            {filtered.map(item => <button key={item.id} className={'crm-item ' + (selectedId === item.id ? 'selected' : '')} type="button" onClick={() => setSelectedId(item.id)}>
              <div className="crm-item-top"><b>{item.subject}</b><small>{stamp(item.last_message_at || item.created_at)}</small></div>
              <div className="crm-item-sub">{companyName(item.company_id)} / {contactName(item.contact_id)}{item.country ? ' · ' + item.country : ''} · 担当：{assignees.find(a => a.id === item.assigned_to)?.display_name || '未設定'}</div>
              {item.received_address && <small className="crm-inquiry-recipient">受信先：{item.received_address}</small>}
              <div className="crm-chips"><span>{CATEGORIES[item.category] || item.category}</span><span>{STAGES[item.stage] || item.stage}</span><span className={item.waiting_on === 'our_team' ? 'attention' : ''}>{WAITING[item.waiting_on] || item.waiting_on}</span></div>
              {item.next_action_at && <small>次回対応：{stamp(item.next_action_at)}</small>}
            </button>)}
          </div>
        </section>
        <section className="panel crm-detail">
          {!selected && selectedId !== 'new' ? <div className="crm-placeholder"><MessageSquareText size={35}/><h3>案件を選択してください</h3><p>メールや商談履歴、進捗、次回対応をまとめて管理します。</p></div> : <>
            <h2>{selectedId === 'new' ? '新しい問い合わせ' : '案件の詳細'}</h2>
            <form onSubmit={saveCase} className="crm-form">
              <label className="crm-wide">件名<input required disabled={!canManage} value={draft.subject} onChange={e => field('subject', e.target.value)}/></label>
              <label>問い合わせ種別<select disabled={!canManage} value={draft.category} onChange={e => field('category', e.target.value)}>{selection(CATEGORIES)}</select></label>
              <label>商談ステージ<select disabled={!canManage} value={draft.stage} onChange={e => field('stage', e.target.value)}>{selection(STAGES)}</select></label>
              <label>対応状況<select disabled={!canManage} value={draft.waiting_on} onChange={e => field('waiting_on', e.target.value)}>{selection(WAITING)}</select></label>
              <label>優先度<select disabled={!canManage} value={draft.priority} onChange={e => field('priority', e.target.value)}>{selection(PRIORITIES)}</select></label>
              <label>取引先<select disabled={!canManage} value={draft.company_id} onChange={e => field('company_id', e.target.value)}><option value="">未設定</option>{companies.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
              <label>担当者<select disabled={!canManage} value={draft.contact_id} onChange={e => field('contact_id', e.target.value)}><option value="">未設定</option>{contacts.filter(c => !draft.company_id || !c.company_id || c.company_id === draft.company_id || c.id === draft.contact_id).map(c => <option value={c.id} key={c.id}>{c.name || c.email}</option>)}</select></label>
              <label>受付メールアドレス<select disabled={!canManage} value={draft.received_address} onChange={e => field('received_address', e.target.value)}><option value="">未設定・その他</option>{PRIMARY_INQUIRY_RECIPIENTS.map(addr => <option value={addr} key={addr}>{addr}</option>)}</select></label>
              <label>営業担当<select disabled={!canManage} value={draft.assigned_to} onChange={e => field('assigned_to', e.target.value)}><option value="">未設定</option>{assignees.map(a => <option key={a.id} value={a.id}>{a.display_name || 'ユーザー'}</option>)}</select></label>
              <label>国・地域<input disabled={!canManage} value={draft.country} onChange={e => field('country', e.target.value)} placeholder="例：日本・フランス"/></label>
              <label>次回対応日時<input type="datetime-local" disabled={!canManage} value={draft.next_action_at} onChange={e => field('next_action_at', e.target.value)}/></label>
              {allowed('documents.view') && <label className="crm-wide">関連する見積書・請求書<select disabled={!canManage} value={draft.sales_document_id} onChange={e => field('sales_document_id', e.target.value)}><option value="">未設定</option>{docs.map(d => <option key={d.id} value={d.id}>{d.document_no} · {d.customer_name} · {d.document_type === 'ESTIMATE' ? '見積書' : d.document_type === 'INVOICE' ? '請求書' : '納品書'}</option>)}</select></label>}
              <label>希望商品<input disabled={!canManage} value={draft.requested_product} onChange={e => field('requested_product', e.target.value)}/></label>
              <label>希望数量（kg）<input type="number" min="0" step="0.001" disabled={!canManage} value={draft.quantity_kg} onChange={e => field('quantity_kg', e.target.value)}/></label>
              <label>月間予定数量（kg）<input type="number" min="0" step="0.001" disabled={!canManage} value={draft.monthly_quantity_kg} onChange={e => field('monthly_quantity_kg', e.target.value)}/></label>
              <label>商談予定金額<input type="number" min="0" step="0.01" disabled={!canManage} value={draft.expected_amount} onChange={e => field('expected_amount', e.target.value)}/></label>
              <label>通貨<select disabled={!canManage} value={draft.currency} onChange={e => field('currency', e.target.value)}><option>JPY</option><option>USD</option><option>EUR</option><option>GBP</option><option>AUD</option><option>CAD</option></select></label>
              <label className="crm-wide">要約<textarea rows={2} disabled={!canManage} value={draft.summary} onChange={e => field('summary', e.target.value)}/></label>
              <label className="crm-wide">商談メモ<textarea rows={2} disabled={!canManage} value={draft.notes} onChange={e => field('notes', e.target.value)}/></label>
              {canManage && <div className="crm-actions"><button className="primary-button" disabled={busy}><Save size={16}/>案件を保存</button>{selected?.sales_document_id && <Link to="/documents">関連する帳票を開く</Link>}{!selected?.sales_document_id && allowed('documents.view') && <Link to="/documents">見積・帳票管理へ</Link>}</div>}
            </form>
            {selected && <><hr/><h3>メール・対応履歴</h3>
              {messageList.length + activityList.length === 0 && <p className="crm-empty">まだ対応履歴はありません。下のフォームから活動を登録できます。</p>}
              <div className="crm-timeline">{[
                ...messageList.map(m => ({ id: m.id, when: m.sent_at, kind: m.direction === 'inbound' ? '受信メール' : '送信メール', title: m.subject || '(件名なし)', body: m.body_plain || m.snippet || '', direction: m.direction, message: m })),
                ...activityList.map(a => ({ id: a.id, when: a.occurred_at, kind: '活動', title: a.title, body: a.body || '', direction: 'activity', message: null }))
              ].sort((a,b) => a.when.localeCompare(b.when)).map(entry => <article key={entry.id} className={'crm-event ' + entry.direction}>
                <div className="crm-event-head"><b>{entry.kind} · {entry.title}</b><small>{stamp(entry.when)}</small></div>
                {entry.message && <small>{entry.message.from_address || ''} → {entry.message.to_addresses || ''}</small>}
                {entry.body && <p>{entry.body}</p>}
                {entry.message && attachments.filter(a => a.message_id === entry.message?.id).map(a => <small key={a.id}>添付：{a.filename}（{Math.ceil(a.size_bytes / 1024)} KB）</small>)}
              </article>)}</div>
              {canManage && <form className="crm-note" onSubmit={addNote}><h3>対応履歴を追加</h3><select value={activityType} onChange={e => setActivityType(e.target.value)}><option value="note">社内メモ</option><option value="call">電話</option><option value="meeting">商談</option><option value="sample">サンプル発送</option><option value="task">次回対応</option><option value="other">その他</option></select>
                <textarea required rows={3} placeholder="対応内容・確認事項・発送内容など" value={activityText} onChange={e => setActivityText(e.target.value)}/>
                <button className="secondary-button" disabled={busy || !activityText.trim()}><Plus size={16}/>履歴を登録</button></form>}
              {selected.mailbox_id && <p className="crm-hint"><Mail size={14}/>メールはGmailとの同期で自動更新されます。返信操作はメールアプリから行い、送信履歴を同期します。</p>}
            </>}
          </>}
        </section>
      </div>
    </>}
    {tab === 'contacts' && <div className="crm-contacts-grid">
      <section className="panel"><h2><Building2 size={19}/>取引先（{companies.length}件）</h2>
        <div className="crm-records">{companies.map(c => <button key={c.id} onClick={() => { setCompanyEdit(c.id); setCompanyDraft({ name: c.name, website: c.website || '', industry: c.industry || '', country: c.country || '', notes: c.notes || '', document_customer_id: c.document_customer_id || '' }) }}><b>{c.name}</b><small>{c.country || '国未登録'} · {c.industry || '業種未登録'}</small></button>)}</div>
        {canManage && <form onSubmit={saveCompanyForm} className="crm-form"><h3 className="crm-wide">{companyEdit ? '取引先を編集' : '取引先を追加'}</h3>
          <label className="crm-wide">会社・店舗名<input required value={companyDraft.name} onChange={e => setCompanyDraft(x => ({ ...x, name: e.target.value }))}/></label>
          {(['country','industry','website'] as const).map(key => <label key={key}>{({country:'国・地域',industry:'業種',website:'Webサイト'})[key]}<input value={companyDraft[key]} onChange={e => setCompanyDraft(x => ({ ...x, [key]: e.target.value }))}/></label>)}
          {allowed('documents.view') && <label className="crm-wide">帳票の取引先マスタ<select value={companyDraft.document_customer_id} onChange={e => setCompanyDraft(x => ({ ...x, document_customer_id: e.target.value }))}><option value="">未連携</option>{docCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
          <label className="crm-wide">メモ<textarea rows={2} value={companyDraft.notes} onChange={e => setCompanyDraft(x => ({ ...x, notes: e.target.value }))}/></label>
          <div className="crm-actions"><button className="primary-button" disabled={busy}><Save size={16}/>保存</button>{companyEdit && <button type="button" className="secondary-button" onClick={() => { setCompanyEdit(''); setCompanyDraft({ name:'',country:'',industry:'',website:'',notes:'',document_customer_id:'' }) }}>新規登録へ</button>}</div></form>}
      </section>
      <section className="panel"><h2><Users size={19}/>担当者（{contacts.length}件）</h2>
        <div className="crm-records">{contacts.map(c => <button key={c.id} onClick={() => { setContactEdit(c.id); setContactDraft({ name:c.name, email:c.email || '',company_id:c.company_id || '',country:c.country || '',phone:c.phone || '',language:c.language || '',position:c.position || '',notes:c.notes || '' }) }}><b>{c.name || c.email}</b><small>{companyName(c.company_id)} · {c.email}</small></button>)}</div>
        {canManage && <form onSubmit={saveContactForm} className="crm-form"><h3 className="crm-wide">{contactEdit ? '担当者を編集' : '担当者を追加'}</h3>
          <label>担当者名<input value={contactDraft.name} onChange={e => setContactDraft(x => ({ ...x, name: e.target.value }))}/></label>
          <label>メールアドレス<input type="email" value={contactDraft.email} onChange={e => setContactDraft(x => ({ ...x, email: e.target.value }))}/></label>
          <label>所属企業<select value={contactDraft.company_id} onChange={e => setContactDraft(x => ({ ...x, company_id: e.target.value }))}><option value="">未登録</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          {(['country','phone','language','position'] as const).map(key => <label key={key}>{({ country:'国',phone:'電話',language:'言語',position:'部署・役職' })[key]}<input value={contactDraft[key]} onChange={e => setContactDraft(x => ({ ...x, [key]: e.target.value }))}/></label>)}
          <label className="crm-wide">メモ<textarea rows={2} value={contactDraft.notes} onChange={e => setContactDraft(x => ({ ...x, notes: e.target.value }))}/></label>
          <div className="crm-actions"><button className="primary-button" disabled={busy}><Save size={16}/>保存</button>{contactEdit && <button type="button" className="secondary-button" onClick={() => { setContactEdit(''); setContactDraft({ name:'',email:'',company_id:'',country:'',phone:'',language:'',position:'',notes:'' }) }}>新規登録へ</button>}</div></form>}
      </section>
    </div>}
    {tab === 'mail' && canMail && <section className="panel crm-mail-settings">
      <h2><Mail size={19}/>Gmail自動連携</h2><p>主な受付先：<strong>{PRIMARY_INQUIRY_RECIPIENTS.join(' / ')}</strong>。メールを受信するGoogleアカウントを接続し、受付先を検索条件で絞り込んでください。既存Google連携のメールを無断で取得しません。</p>
      <p className="crm-hint">2つは別々のGoogle Workspaceアカウントです。それぞれの行から該当するGoogleアカウントで個別に認証してください。メールの自動取込は認証後に有効化するまで開始しません。</p>
      {oauthStatus && !oauthStatus.ready && <div className="notice error" role="alert">
        <strong>Google認証を開始できません：サーバー側の設定が未完了です。</strong>
        <p>未設定または不正な項目：{oauthStatus.missing.join(' / ')}</p>
        <p>Google CloudのOAuthクライアント情報と暗号鍵を、SupabaseのEdge Function Secretsに設定してください。値をチャットやGitHubには貼り付けないでください。</p>
        <a href="https://supabase.com/dashboard/project/mdbtngousidfanmrjybt/functions/secrets" target="_blank" rel="noopener noreferrer">Supabaseの認証設定を開く</a>
      </div>}
      {oauthStatus?.ready && <p className="crm-hint">サーバー側のOAuth設定は登録済みです。Google Workspaceで認証を進めてください。</p>}
      {mailboxes.length === 0 && <p className="crm-empty">受付メールアカウントを準備中です。画面を更新してください。</p>}
      {mailboxes.map(box => <div className="crm-mailbox" key={box.id}><div><b>{box.email}</b><small>接続：{box.connected_at ? (box.status === 'active' ? '自動同期中' : '認証済み・同期停止中') : 'Google Workspace認証待ち'}　最終同期：{stamp(box.last_sync_at)}</small>{box.last_error && <small className="crm-error">{box.last_error}</small>}</div>
        <label>Gmail検索条件<input value={box.filter_query} onChange={e => setMailboxes(items => items.map(item => item.id === box.id ? { ...item, filter_query: e.target.value } : item))} placeholder="例：label:CRM または to:sales@example.com"/></label>
        <div className="crm-actions"><button className="secondary-button" disabled={busy} onClick={() => void mailAction('connect',{mailboxId:box.id})}><Send size={16}/>{box.connected_at ? 'Googleアカウントを再認証' : 'Google Workspaceで認証'}</button><button className="secondary-button" disabled={busy} onClick={async () => { try { await updateCrmMailbox(box.id,{ filter_query: box.filter_query, status: 'paused' }); setNotice('保存しました。同期は一時停止しています'); await refresh() } catch(e) { setError(errText(e)) } }}>検索条件を保存</button>
          <button className="secondary-button" disabled={busy || !box.connected_at || !box.filter_query.trim()} onClick={async () => { try { await updateCrmMailbox(box.id,{status:box.status === 'active' ? 'paused' : 'active',filter_query:box.filter_query}); await refresh() } catch(e) { setError(errText(e)) } }}>{box.status === 'active' ? '同期を一時停止' : '自動同期を有効化'}</button>
          <button className="primary-button" disabled={busy || box.status !== 'active'} onClick={() => void mailAction('sync',{mailboxId:box.id})}><RefreshCw size={16}/>今すぐ同期</button></div>
      </div>)}
      <p className="crm-hint">初回取込は直近7日分です。2つのメールアカウントを1件ずつ認証し、接続済みになったら各行の「自動同期を有効化」を押してください。Google Cloud側のOAuth設定が必要です。</p>
    </section>}
  </div>
}
