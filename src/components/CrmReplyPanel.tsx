import {useEffect,useState} from 'react'
import {BookOpen,ClipboardCopy,FileText,RefreshCw,Save,ShieldCheck} from 'lucide-react'
import {
  createCrmReplyDraft,loadCrmReplyDrafts,loadCrmReplyKnowledge,saveCrmReplyDraft,
  type CrmReplyDraft,type CrmReplyKnowledge
} from '../lib/crmAssistant'
import {supabase} from '../lib/supabase'

export default function CrmReplyPanel({inquiryId,onError,onNotice,onSummarySaved}: {
  inquiryId:string;onError:(message:string)=>void;onNotice:(message:string)=>void;
  onSummarySaved:()=>Promise<void>
}) {
  const [knowledge,setKnowledge]=useState<CrmReplyKnowledge[]>([])
  const [drafts,setDrafts]=useState<CrmReplyDraft[]>([])
  const [selectedKnowledge,setSelectedKnowledge]=useState('')
  const [language,setLanguage]=useState<'ja'|'en'>('ja')
  const [draft,setDraft]=useState<CrmReplyDraft|null>(null)
  const [subject,setSubject]=useState('')
  const [body,setBody]=useState('')
  const [busy,setBusy]=useState(false)
  const [aiAvailable,setAiAvailable]=useState<boolean|null>(null)
  const valid=(record:CrmReplyKnowledge) => record.approved &&
    (!record.valid_until || record.valid_until>=new Date().toISOString().slice(0,10))
  async function reload() {
    const [facts,past]=await Promise.all([loadCrmReplyKnowledge(),loadCrmReplyDrafts(inquiryId)])
    setKnowledge(facts);setDrafts(past)
    const mostRecent=past[0]||null
    setDraft(mostRecent);setSubject(mostRecent?.reply_subject||'');setBody(mostRecent?.reply_body||'')
  }
  useEffect(()=>{setDraft(null);setDrafts([]);setSelectedKnowledge('');setAiAvailable(null)
    void reload().catch(e=>onError(e instanceof Error?e.message:'返信案を読み込めません'))},[inquiryId])
  async function generate() {
    setBusy(true);onError('')
    try {
      const result=await createCrmReplyDraft(inquiryId,selectedKnowledge||null,language)
      setAiAvailable(result.ai_available);await reload()
      onNotice(result.draft.method==='ai'
        ? 'AIが要約と返信案を作成しました。必ず根拠・数量・価格を確認してから利用してください。'
        : '登録済み条件をもとに確認用テンプレートを作成しました。生成AIを使用するにはサーバー側のAPIキー設定が必要です。')
    }catch(e){onError(e instanceof Error?e.message:'返信案を作成できませんでした')}
    finally{setBusy(false)}
  }
  async function saveDraft() {
    if(!draft)return
    setBusy(true);onError('')
    try {await saveCrmReplyDraft(draft.id,subject,body);await reload();onNotice('編集した返信案を保存しました。送信はしていません。')}
    catch(e){onError(e instanceof Error?e.message:'返信案を保存できませんでした')}
    finally{setBusy(false)}
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText('件名：'+subject+'\n\n'+body)
      onNotice('返信案をコピーしました。Gmailで内容を確認して手動で送信してください。')
    }catch{onError('コピーできません。返信案の本文を選択してコピーしてください。')}
  }
  async function saveSummary(){
    if(!draft)return
    setBusy(true)
    try {
      const {error}=await supabase.from('crm_inquiries')
        .update({summary:draft.summary,updated_at:new Date().toISOString()}).eq('id',inquiryId)
      if(error)throw error
      await onSummarySaved()
      onNotice('要約を案件に反映しました。')
    }catch(e){onError(e instanceof Error?e.message:'案件要約の保存に失敗しました')}
    finally{setBusy(false)}
  }
  return <section className="crm-reply-panel">
    <h3><FileText size={17}/>問い合わせの要約・返信案</h3>
    <p className="crm-hint">取引条件マスターの<strong>承認済みデータだけ</strong>を参照します。価格・MOQ・品種・納期など不明な条件は「要確認」です。自動返信・自動送信は一切行いません。</p>
    <div className="crm-reply-controls">
      <label>使用する商品条件<select value={selectedKnowledge} onChange={e=>setSelectedKnowledge(e.target.value)}>
        <option value="">商品を指定しない（共通方針のみ）</option>
        {knowledge.filter(item=>item.kind==='product'&&valid(item)).map(item=>
          <option key={item.id} value={item.id}>{item.title}{item.unit_price!==null?' · '+item.unit_price.toLocaleString()+' '+item.currency:''}</option>)}
      </select></label>
      <label>返信言語<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="ja">日本語</option><option value="en">英語</option></select></label>
      <button type="button" className="primary-button" disabled={busy} onClick={()=>void generate()}>
        <RefreshCw size={16}/>{busy?'作成中…':'要約・返信案を作成'}
      </button>
    </div>
    {knowledge.filter(item=>item.kind==='product'&&valid(item)).length===0&&
      <p className="crm-hint">商品マスターの承認済みレコードがありません。「商品・返信条件」で登録・承認すると、価格等を根拠に含められます。</p>}
    {draft&&<div className="crm-reply-result">
      <p className="crm-hint"><ShieldCheck size={15}/>{draft.method==='ai'?'AI生成（外部モデル）':'登録条件によるテンプレート（AI未使用）'}
        {' · '}作成日：{new Date(draft.created_at).toLocaleString('ja-JP')}</p>
      {aiAvailable===false&&<p className="crm-hint">AI APIキーは未設定です。現在は保守的なテンプレートを作成します。AI要約を有効にする場合は管理者がSupabaseのSecretsにCRM_AI_API_KEYを登録してください。</p>}
      <h4>問い合わせの要約</h4>
      <p className="crm-reply-summary">{draft.summary}</p>
      <button type="button" className="secondary-button" disabled={busy} onClick={()=>void saveSummary()}>要約を案件に反映</button>
      <h4>確認が必要な項目</h4>
      {draft.missing_fields.length
        ? <ul>{draft.missing_fields.map((item,i)=><li key={i}>{item}</li>)}</ul>
        : <p>システム上の未設定項目は検出されていません。メール内容との照合は必ず行ってください。</p>}
      <h4>根拠として使用したマスター</h4>
      <div className="crm-reply-facts"><pre>{JSON.stringify(draft.knowledge_snapshot,null,2)}</pre></div>
      <h4>返信案（編集可能）</h4>
      <label>件名<input value={subject} onChange={e=>setSubject(e.target.value)}/></label>
      <label>本文<textarea rows={11} value={body} onChange={e=>setBody(e.target.value)}/></label>
      <div className="crm-actions">
        <button type="button" className="secondary-button" disabled={busy||!body.trim()} onClick={()=>void saveDraft()}><Save size={16}/>編集内容を保存</button>
        <button type="button" className="primary-button" disabled={!body.trim()} onClick={()=>void copyDraft()}><ClipboardCopy size={16}/>返信案をコピー</button>
        <a href="https://mail.google.com/" target="_blank" rel="noopener noreferrer">Gmailを開く</a>
      </div>
      <p className="crm-hint">生成AIに送信されるのは、この案件のメール本文と承認済みマスターです。ボタンを押した場合にのみ処理され、メールの自動送信はしません。価格・条件・納期・個人情報を担当者が確認してください。</p>
    </div>}
    {!draft&&<p className="crm-empty">メールを確認し、必要に応じて商品マスターを選択して返信案を作成してください。</p>}
    {drafts.length>1&&<details><summary>過去の返信案（{drafts.length}件）</summary>
      {drafts.map(item=><button type="button" key={item.id} className="secondary-button" onClick={()=>{setDraft(item);setSubject(item.reply_subject);setBody(item.reply_body)}}>
        {new Date(item.created_at).toLocaleString('ja-JP')} · {item.method==='ai'?'AI':'テンプレート'}</button>)}
    </details>}
  </section>
}
