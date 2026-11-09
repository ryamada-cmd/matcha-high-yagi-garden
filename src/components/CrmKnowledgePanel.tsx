import {useEffect,useState,type FormEvent} from 'react'
import {BookOpen,CheckCircle2,Plus,Save,ShieldCheck,Undo2} from 'lucide-react'
import {
  loadCrmReplyKnowledge,saveCrmReplyKnowledge,setCrmKnowledgeApproved,
  loadCrmSenderRules,setCrmSenderRuleEnabled,
  type CrmReplyKnowledge,type CrmSenderRule
} from '../lib/crmAssistant'

type Draft = Record<string,string>
const initial: Draft = {
  kind:'product',title:'',brand:'MATCHA HIGH',product_name:'',variety:'',grade:'',
  unit_size:'1kg',unit_price:'',currency:'JPY',moq_kg:'',lead_time:'',
  sample_price:'',sample_quantity_g:'',sample_moq_qty:'',
  shipping_terms:'',payment_terms:'',notes:'',valid_until:''
}
const text = (v: unknown) => v === null || v === undefined ? '' : String(v)
const number = (s: string) => s.trim() ? Number(s) : null
const optional = (s: string) => s.trim() || null
function asDraft(row: CrmReplyKnowledge): Draft {
  return Object.fromEntries(Object.keys(initial).map(key =>
    [key,text((row as unknown as Record<string,unknown>)[key])])) as Draft
}
const expired = (row: CrmReplyKnowledge) =>
  !!row.valid_until && row.valid_until < new Date().toISOString().slice(0,10)

export default function CrmKnowledgePanel({
  onError,onNotice
}: {onError:(value:string)=>void;onNotice:(value:string)=>void}) {
  const [records,setRecords] = useState<CrmReplyKnowledge[]>([])
  const [rules,setRules] = useState<CrmSenderRule[]>([])
  const [currentId,setCurrentId] = useState('')
  const [form,setForm] = useState<Draft>({...initial})
  const [busy,setBusy] = useState(false)
  const current = records.find(item => item.id === currentId)
  const unsaved = Boolean(current && Object.keys(initial).some(key =>
    form[key].trim() !== text((current as unknown as Record<string,unknown>)[key]).trim()))
  const set = (key: string,value: string) => setForm(state=>({...state,[key]:value}))
  async function reload() {
    const [knowledge,senderRules]=await Promise.all([loadCrmReplyKnowledge(),loadCrmSenderRules()])
    setRecords(knowledge);setRules(senderRules)
    return knowledge
  }
  useEffect(()=>{void reload().catch(e=>onError(e instanceof Error?e.message:'マスターを読み込めません'))},[])
  async function submit(e:FormEvent) {
    e.preventDefault();setBusy(true);onError('')
    try {
      const payload = {
        kind:form.kind,title:form.title.trim(),brand:optional(form.brand),
        product_name:form.kind==='product'?optional(form.product_name):null,
        variety:optional(form.variety),grade:optional(form.grade),
        unit_size:optional(form.unit_size),unit_price:number(form.unit_price),
        currency:form.currency||'JPY',moq_kg:number(form.moq_kg),
        lead_time:optional(form.lead_time),sample_price:number(form.sample_price),
        sample_quantity_g:number(form.sample_quantity_g),
        sample_moq_qty:number(form.sample_moq_qty),
        shipping_terms:optional(form.shipping_terms),
        payment_terms:optional(form.payment_terms),
        notes:optional(form.notes),valid_until:optional(form.valid_until)
      }
      if (!payload.title) throw new Error('マスター名が必要です')
      if (payload.kind==='product' && !payload.product_name) throw new Error('商品名が必要です')
      const id=await saveCrmReplyKnowledge(currentId||null,payload)
      setCurrentId(id)
      const fresh = await reload()
      const updated = fresh.find(item => item.id === id)
      if(updated)setForm(asDraft(updated))
      onNotice('取引条件を保存しました。承認するまで返信案の根拠には使われません。')
    }catch(e){onError(e instanceof Error?e.message:'保存できませんでした')}
    finally{setBusy(false)}
  }
  async function approval(value:boolean) {
    if(!current) return
    setBusy(true);onError('')
    try{
      await setCrmKnowledgeApproved(current.id,value)
      await reload()
      onNotice(value?'このマスターを返信案の根拠として承認しました。':'承認を取り消しました。')
    }catch(e){onError(e instanceof Error?e.message:'承認できませんでした')}
    finally{setBusy(false)}
  }
  async function toggleRule(rule:CrmSenderRule) {
    setBusy(true);onError('')
    try{
      await setCrmSenderRuleEnabled(rule.id,!rule.active);await reload()
      onNotice(rule.active?'今後の自動除外を解除しました。既存の除外案件は個別に復元できます。':'この送信元の今後のメールを除外対象にしました。')
    }catch(e){onError(e instanceof Error?e.message:'変更に失敗しました')}
    finally{setBusy(false)}
  }
  return <div className="crm-knowledge-page">
    <div className="crm-knowledge-intro panel">
      <h2><BookOpen size={19}/>商品・取引条件マスター</h2>
      <p>単価・MOQ・納期・品種・サンプル条件を先に登録し、<strong>承認済みの情報だけ</strong>を返信案の根拠に使用します。空欄は不明として扱い、推測で補いません。</p>
      <p className="crm-hint">金額には税・送料を含むかどうかを「取引・配送条件」に明記してください。価格を変更すると承認が自動解除され、再承認が必要です。</p>
    </div>
    <div className="crm-knowledge-layout">
      <section className="panel">
        <h3>登録済み条件（{records.length}件）</h3>
        <div className="crm-actions">
          <button className="secondary-button" type="button" onClick={()=>{setCurrentId('');setForm({...initial,kind:'product',title:'業務用抹茶（1kg）',product_name:'業務用抹茶',unit_size:'1kg'})}}><Plus size={15}/>業務用抹茶を登録</button>
          <button className="secondary-button" type="button" onClick={()=>{setCurrentId('');setForm({...initial,kind:'general',title:'共通取引条件',product_name:'',unit_size:''})}}><Plus size={15}/>共通方針を登録</button>
        </div>
        <div className="crm-records">
          {records.map(record=><button type="button" key={record.id} onClick={()=>{setCurrentId(record.id);setForm(asDraft(record))}}>
            <b>{record.title}</b>
            <small>{record.kind==='general'?'共通方針':'商品'}
              {' · '}{record.approved?(expired(record)?'期限切れ':'承認済み'):'未承認'}
              {record.unit_price!==null?' · '+record.unit_price.toLocaleString()+' '+record.currency:''}</small>
          </button>)}
          {!records.length && <p className="crm-empty">まだ条件がありません。商品価格を推測させないため、登録するまでは返信案に金額を記載しません。</p>}
        </div>
      </section>
      <section className="panel">
        <h3>{currentId?'条件を編集':'新しい条件を登録'}</h3>
        {unsaved && <p className="crm-hint" role="status">未保存の変更があります。承認前に必ず保存してください。</p>}
        {current && <p className="crm-hint"><ShieldCheck size={15}/>{current.approved?(expired(current)?'期限切れ（返信案に使用不可）':'承認済み・返信案に使用できます'):'未承認・返信案に使用されません'}</p>}
        <form className="crm-form" onSubmit={submit}>
          <label>種別<select value={form.kind} onChange={e=>set('kind',e.target.value)}><option value="product">商品別</option><option value="general">共通方針</option></select></label>
          <label>マスター名<input required maxLength={160} value={form.title} onChange={e=>set('title',e.target.value)}/></label>
          <label>ブランド<input value={form.brand} onChange={e=>set('brand',e.target.value)}/></label>
          {form.kind==='product'&&<label>商品名<input required value={form.product_name} onChange={e=>set('product_name',e.target.value)}/></label>}
          <label>品種<input value={form.variety} placeholder="例：おくみどり（確定情報のみ）" onChange={e=>set('variety',e.target.value)}/></label>
          <label>グレード・用途<input value={form.grade} onChange={e=>set('grade',e.target.value)}/></label>
          <label>価格単位<input value={form.unit_size} placeholder="例：1kg" onChange={e=>set('unit_size',e.target.value)}/></label>
          <label>単価<input type="number" min="0" step="0.01" value={form.unit_price} onChange={e=>set('unit_price',e.target.value)}/></label>
          <label>通貨<select value={form.currency} onChange={e=>set('currency',e.target.value)}><option>JPY</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
          <label>MOQ（kg）<input type="number" min="0.001" step="0.001" value={form.moq_kg} onChange={e=>set('moq_kg',e.target.value)}/></label>
          <label className="crm-wide">納期の目安<input placeholder="例：ご入金確認後、通常10〜14営業日" value={form.lead_time} onChange={e=>set('lead_time',e.target.value)}/></label>
          <label>サンプル価格<input type="number" min="0" step="0.01" value={form.sample_price} onChange={e=>set('sample_price',e.target.value)}/></label>
          <label>サンプル容量（g）<input type="number" min="0.01" step="0.01" value={form.sample_quantity_g} onChange={e=>set('sample_quantity_g',e.target.value)}/></label>
          <label>サンプル最小個数<input type="number" min="0.01" step="0.01" value={form.sample_moq_qty} onChange={e=>set('sample_moq_qty',e.target.value)}/></label>
          <label>有効期限<input type="date" value={form.valid_until} onChange={e=>set('valid_until',e.target.value)}/></label>
          <label className="crm-wide">配送・税・輸出条件<textarea rows={2} value={form.shipping_terms} onChange={e=>set('shipping_terms',e.target.value)}/></label>
          <label className="crm-wide">支払条件<textarea rows={2} value={form.payment_terms} onChange={e=>set('payment_terms',e.target.value)}/></label>
          <label className="crm-wide">返信時の共通注意・補足<textarea rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)}/></label>
          <div className="crm-actions"><button disabled={busy} className="primary-button"><Save size={16}/>条件を保存</button>
            {current && !current.approved && <button type="button" disabled={busy||unsaved||expired(current)} className="secondary-button" onClick={()=>void approval(true)}><CheckCircle2 size={16}/>内容を確認して承認</button>}
            {current?.approved && <button type="button" disabled={busy} className="secondary-button" onClick={()=>void approval(false)}><Undo2 size={16}/>承認を解除</button>}
          </div>
        </form>
      </section>
    </div>
    <section className="panel">
      <h3>今後のメールを除外する送信元</h3>
      <p className="crm-hint">問い合わせの詳細で「この送信元を今後も除外」を選んだアドレスです。メールは削除せず、除外済み一覧に保管します。正当な問い合わせを誤って除外した場合は、ここでルールを解除してください。</p>
      <div className="crm-rule-list">
      {rules.map(rule=><div className="crm-rule-row" key={rule.id}><span>{rule.sender_email}<small> · {rule.active?'自動除外中':'停止中'}</small></span>
        <button className="secondary-button" disabled={busy} type="button" onClick={()=>void toggleRule(rule)}>{rule.active?'ルールを停止':'再有効化'}</button></div>)}
      {!rules.length && <p className="crm-empty">送信元の自動除外ルールはありません。</p>}
      </div>
    </section>
  </div>
}
