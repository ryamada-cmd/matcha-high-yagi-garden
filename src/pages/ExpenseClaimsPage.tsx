import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, Download, Edit3, Plus, ReceiptText, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react'
import { loadExpenseClaims, loadExpenseUser, reviewExpenseClaim, saveExpenseClaim, type ExpenseClaim, type ExpenseUser } from '../lib/expenseClaims'

const yen=new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0})
const num=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:3})
const localInput=(value?:string)=>{const d=value?new Date(value):new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
const currentMonth=()=>localInput().slice(0,7)
type FormItem={key:string;description:string;quantity:string;unitPrice:string;taxRate:string;note:string}
const newItem=():FormItem=>({key:`${Date.now()}-${Math.random()}`,description:'',quantity:'1',unitPrice:'',taxRate:'10',note:''})
const blank=()=>({id:'',purchaseAt:localInput(),vendor:'',note:'',items:[newItem()]})
const statusLabel=(s:string)=>s==='APPROVED'?'承認済':s==='REJECTED'?'差戻し':'申請中'
const csvCell=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`

export default function ExpenseClaimsPage(){
  const[claims,setClaims]=useState<ExpenseClaim[]>([]),[me,setMe]=useState<ExpenseUser|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const[form,setForm]=useState(blank),[month,setMonth]=useState(currentMonth()),[status,setStatus]=useState(''),[applicant,setApplicant]=useState(''),[query,setQuery]=useState('')

  async function refresh(){setLoading(true);setError('');try{const[c,u]=await Promise.all([loadExpenseClaims(),loadExpenseUser()]);setClaims(c);setMe(u)}catch(e:any){setError(e?.message||'経費精算を読み込めませんでした。')}finally{setLoading(false)}}
  useEffect(()=>{void refresh()},[])
  const isAdmin=me?.role==='admin'

  function resetForm(clear=true){setForm(blank());setError('');if(clear)setSuccess('')}
  function updateItem(key:string,patch:Partial<FormItem>){setForm(v=>({...v,items:v.items.map(i=>i.key===key?{...i,...patch}:i)}))}
  function removeItem(key:string){setForm(v=>({...v,items:v.items.length===1?v.items:v.items.filter(i=>i.key!==key)}))}
  const formTotal=useMemo(()=>form.items.reduce((s,i)=>s+Math.round((Number(i.quantity)||0)*(Number(i.unitPrice)||0)),0),[form.items])

  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');setSuccess('')
    try{
      if(!form.vendor.trim())throw new Error('購入先を入力してください。')
      const items=form.items.map((i,idx)=>{const q=Number(i.quantity),u=Number(i.unitPrice),t=Number(i.taxRate);if(!i.description.trim())throw new Error(`${idx+1}行目の購入内容を入力してください。`);if(!Number.isFinite(q)||q<=0)throw new Error(`${idx+1}行目の数量を確認してください。`);if(!Number.isFinite(u)||u<0)throw new Error(`${idx+1}行目の単価を確認してください。`);return{description:i.description,quantity:q,unitPriceYen:u,taxRate:t,note:i.note}})
      await saveExpenseClaim({id:form.id||undefined,purchaseAt:new Date(form.purchaseAt).toISOString(),vendor:form.vendor,note:form.note,items})
      setMonth(form.purchaseAt.slice(0,7));setSuccess(form.id?'修正した経費を再申請しました。':'経費精算を申請しました。');resetForm(false);await refresh()
    }catch(e:any){setError(e?.message||'経費精算を申請できませんでした。')}finally{setBusy(false)}
  }

  function editRejected(c:ExpenseClaim){setForm({id:c.id,purchaseAt:localInput(c.purchaseAt),vendor:c.vendor,note:c.note,items:c.items.map(i=>({key:i.id,description:i.description,quantity:String(i.quantity),unitPrice:String(i.unitPriceYen),taxRate:String(i.taxRate),note:i.note}))});setSuccess('');setError('');window.scrollTo({top:0,behavior:'smooth'})}
  async function approve(c:ExpenseClaim){if(!window.confirm(`${c.applicantName} / ${yen.format(c.totalAmountYen)} を承認しますか？`))return;setBusy(true);setError('');try{await reviewExpenseClaim(c.id,'APPROVE','');setSuccess(`${c.claimNo} を承認しました。`);await refresh()}catch(e:any){setError(e?.message||'承認できませんでした。')}finally{setBusy(false)}}
  async function reject(c:ExpenseClaim){const reason=window.prompt('差戻し理由を入力してください。');if(reason===null)return;if(!reason.trim()){setError('差戻し理由を入力してください。');return}setBusy(true);setError('');try{await reviewExpenseClaim(c.id,'REJECT',reason);setSuccess(`${c.claimNo} を差戻しました。`);await refresh()}catch(e:any){setError(e?.message||'差戻しできませんでした。')}finally{setBusy(false)}}

  const applicants=useMemo(()=>[...new Map(claims.map(c=>[c.applicantId,c.applicantName])).entries()].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'ja')),[claims])
  const filtered=useMemo(()=>{const q=query.trim().normalize('NFKC').toLowerCase();return claims.filter(c=>{
    if(month&&!localInput(c.purchaseAt).startsWith(month))return false;if(status&&c.status!==status)return false;if(applicant&&c.applicantId!==applicant)return false
    if(!q)return true;return `${c.claimNo} ${c.vendor} ${c.applicantName} ${c.note} ${c.items.map(i=>`${i.description} ${i.note}`).join(' ')}`.normalize('NFKC').toLowerCase().includes(q)
  })},[claims,month,status,applicant,query])
  const pending=claims.filter(c=>c.status==='SUBMITTED').length,approvedTotal=filtered.filter(c=>c.status==='APPROVED').reduce((s,c)=>s+c.totalAmountYen,0),filteredTotal=filtered.reduce((s,c)=>s+c.totalAmountYen,0)

  function exportCsv(){
    if(!isAdmin)return
    const header=['申請番号','購入日時','申請者','購入先','ステータス','明細番号','購入内容','数量','税込単価','税率','明細合計','申請合計','申請日時','審査日時','審査者','審査コメント','申請備考']
    const rows=filtered.flatMap(c=>c.items.map(i=>[c.claimNo,new Date(c.purchaseAt).toLocaleString('ja-JP'),c.applicantName,c.vendor,statusLabel(c.status),i.lineNo,i.description,i.quantity,i.unitPriceYen,`${i.taxRate}%`,i.lineTotalYen,c.totalAmountYen,c.submittedAt?new Date(c.submittedAt).toLocaleString('ja-JP'):'',c.reviewedAt?new Date(c.reviewedAt).toLocaleString('ja-JP'):'',c.reviewerName,c.reviewComment,c.note]))
    const csv='\ufeff'+[header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`経費精算_${month||'全期間'}.csv`;a.click();URL.revokeObjectURL(url)
  }

  return <div className="page expense-claims-page">
    <div className="page-head"><div><p className="eyebrow">EXPENSE REIMBURSEMENT</p><h1>経費精算</h1><p className="sub">複数の購入明細をまとめて申請し、管理者が承認・差戻しできます。</p></div><div className="head-actions">{isAdmin&&<button className="secondary-button" onClick={exportCsv}><Download size={17}/>CSVエクスポート</button>}<button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div></div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}{success&&<div className="notice success dashboard-notice">{success}</div>}

    <form className="panel expense-claim-form" onSubmit={submit}>
      <div className="panel-title"><div><h2>{form.id?'差戻し申請を修正':'経費を申請'}</h2><p>単価は領収書に記載された税込単価を入力してください。税率は会計用の区分として保持します。</p></div>{form.id&&<span>再申請</span>}</div>
      <div className="form-grid two"><label>購入日時<input type="datetime-local" required value={form.purchaseAt} onChange={e=>setForm({...form,purchaseAt:e.target.value})}/></label><label>購入先<input required value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} placeholder="例：JA京都やましろ"/></label></div>
      <div className="expense-items-head"><div><b>購入明細</b><span>複数点を一括申請できます</span></div><button type="button" className="secondary-button" onClick={()=>setForm(v=>({...v,items:[...v.items,newItem()]}))}><Plus size={16}/>明細を追加</button></div>
      <div className="expense-item-list">{form.items.map((i,index)=>{const line=Math.round((Number(i.quantity)||0)*(Number(i.unitPrice)||0));return <section className="expense-item-row" key={i.key}><div className="expense-item-no">{index+1}</div><label className="expense-desc">購入内容<input value={i.description} onChange={e=>updateItem(i.key,{description:e.target.value})} required placeholder="例：肥料20kg袋"/></label><label>数量<input type="number" min="0.001" step="0.001" value={i.quantity} onChange={e=>updateItem(i.key,{quantity:e.target.value})}/></label><label>税込単価<input type="number" min="0" step="1" inputMode="decimal" value={i.unitPrice} onChange={e=>updateItem(i.key,{unitPrice:e.target.value})} placeholder="0"/></label><label>税率<select value={i.taxRate} onChange={e=>updateItem(i.key,{taxRate:e.target.value})}><option value="10">10%</option><option value="8">8%</option><option value="0">0%</option></select></label><div className="expense-line-total"><span>合計</span><strong>{yen.format(line)}</strong></div><button type="button" className="expense-remove" disabled={form.items.length===1} onClick={()=>removeItem(i.key)} aria-label="明細を削除"><Trash2 size={17}/></button></section>})}</div>
      <label className="full-label">備考<textarea rows={3} value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="精算に必要な補足があれば入力"/></label>
      <div className="expense-submit-row"><div><span>申請合計</span><strong>{yen.format(formTotal)}</strong></div><div>{form.id&&<button type="button" className="secondary-button" onClick={()=>resetForm()}><RotateCcw size={16}/>修正をやめる</button>}<button className="primary-button" disabled={busy||formTotal<0}>{busy?'申請中…':form.id?'修正して再申請':'精算申請を送信'}</button></div></div>
    </form>

    <section className="expense-review-section">
      <div className="metrics expense-metrics"><article className="metric"><span>申請中</span><strong>{pending}件</strong></article><article className="metric"><span>表示中</span><strong>{filtered.length}件</strong></article><article className="metric"><span>表示中合計</span><strong>{yen.format(filteredTotal)}</strong></article><article className="metric"><span>承認済合計</span><strong>{yen.format(approvedTotal)}</strong></article></div>
      <section className="panel expense-history-panel"><div className="panel-title"><div><h2>{isAdmin?'申請一覧・承認':'申請履歴'}</h2><p>{isAdmin?'申請内容を確認して承認または差戻しします。':'自分の申請状況を確認できます。差戻し分は修正して再申請できます。'}</p></div></div>
        <div className="toolbar expense-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="購入先・内容・申請番号を検索"/></div><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">全ステータス</option><option value="SUBMITTED">申請中</option><option value="APPROVED">承認済</option><option value="REJECTED">差戻し</option></select>{isAdmin&&<select value={applicant} onChange={e=>setApplicant(e.target.value)}><option value="">全申請者</option>{applicants.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>}</div>
        <div className="expense-claim-list">{filtered.map(c=><article className={`expense-claim-card status-${c.status.toLowerCase()}`} key={c.id}><div className="expense-card-head"><div><span className={`expense-status ${c.status.toLowerCase()}`}>{statusLabel(c.status)}</span><h3>{c.vendor}</h3><small>{c.claimNo}</small></div><div className="expense-card-total"><span>{new Date(c.purchaseAt).toLocaleString('ja-JP')}</span><strong>{yen.format(c.totalAmountYen)}</strong><small>{c.applicantName}</small></div></div><div className="expense-card-items">{c.items.map(i=><div key={i.id}><span>{i.lineNo}</span><b>{i.description}</b><small>{num.format(i.quantity)} × {yen.format(i.unitPriceYen)} / 税率 {num.format(i.taxRate)}%</small><strong>{yen.format(i.lineTotalYen)}</strong></div>)}</div>{c.note&&<p className="expense-note">{c.note}</p>}{c.reviewedAt&&<div className="expense-review-result"><b>{c.status==='APPROVED'?'承認':'差戻し'}</b><span>{c.reviewerName} ・ {new Date(c.reviewedAt).toLocaleString('ja-JP')}</span>{c.reviewComment&&<p>{c.reviewComment}</p>}</div>}<div className="expense-card-actions">{c.status==='REJECTED'&&c.applicantId===me?.id&&<button onClick={()=>editRejected(c)}><Edit3 size={15}/>修正して再申請</button>}{isAdmin&&c.status==='SUBMITTED'&&<><button className="approve" disabled={busy} onClick={()=>void approve(c)}><Check size={15}/>承認</button><button className="reject" disabled={busy} onClick={()=>void reject(c)}><RotateCcw size={15}/>差戻し</button></>}</div></article>)}{!loading&&!filtered.length&&<p className="empty">該当する経費申請はありません。</p>}</div>
      </section>
    </section>
  </div>
}
