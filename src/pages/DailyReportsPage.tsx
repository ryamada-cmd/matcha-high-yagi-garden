import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Edit3, FileText, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useAppPermissions } from '../lib/permissions'
import { deleteDailyReport, loadDailyReportFields, loadDailyReports, loadDailyReportUser, saveDailyReport, type DailyReport, type DailyReportFieldOption, type DailyReportUser } from '../lib/dailyReports'

const today=()=>new Intl.DateTimeFormat('sv-SE').format(new Date())
const thisMonth=()=>today().slice(0,7)
const blank=()=>({id:'',reportDate:today(),weatherNote:'',workHours:'',workSummary:'',goodPoints:'',issues:'',nextActions:'',fieldIds:[] as string[]})
const nf=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1})

export default function DailyReportsPage(){
  const{allowed}=useAppPermissions(),canManageOwn=allowed('daily_reports.manage_own'),canReview=allowed('daily_reports.review')
  const canCreate=canManageOwn||canReview
  const[reports,setReports]=useState<DailyReport[]>([]),[fields,setFields]=useState<DailyReportFieldOption[]>([]),[me,setMe]=useState<DailyReportUser|null>(null)
  const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const[form,setForm]=useState(blank),[month,setMonth]=useState(thisMonth()),[query,setQuery]=useState(''),[author,setAuthor]=useState(''),[fieldFilter,setFieldFilter]=useState('')

  async function refresh(hydrateToday=false){
    setLoading(true);setError('')
    try{
      const[r,f,u]=await Promise.all([loadDailyReports(),loadDailyReportFields(),loadDailyReportUser()]);setReports(r);setFields(f);setMe(u)
      if(hydrateToday&&canCreate){const current=r.find(x=>x.authorId===u.id&&x.reportDate===today());if(current)loadIntoForm(current)}
    }catch(e:any){setError(e?.message||'日報を読み込めませんでした。')}finally{setLoading(false)}
  }
  useEffect(()=>{void refresh(true)},[canCreate])

  const canEdit=(r:DailyReport)=>!!me&&(canReview||(canManageOwn&&r.authorId===me.id))
  function loadIntoForm(r:DailyReport){if(!canEdit(r)){setError('この日報を編集する権限がありません。');return}setForm({id:r.id,reportDate:r.reportDate,weatherNote:r.weatherNote,workHours:r.workHours?String(r.workHours):'',workSummary:r.workSummary,goodPoints:r.goodPoints,issues:r.issues,nextActions:r.nextActions,fieldIds:r.fields.map(f=>f.id)});setError('');setSuccess('')}
  function resetForm(){setForm(blank());setError('');setSuccess('')}
  function toggleField(id:string){setForm(v=>({...v,fieldIds:v.fieldIds.includes(id)?v.fieldIds.filter(x=>x!==id):[...v.fieldIds,id]}))}

  async function submit(e:FormEvent){
    e.preventDefault();if(!canCreate)return setError('日報を登録・編集する権限がありません。');if(form.id){const target=reports.find(r=>r.id===form.id);if(target&&!canEdit(target))return setError('この日報を編集する権限がありません。')}
    setBusy(true);setError('');setSuccess('')
    try{
      const hours=form.workHours===''?0:Number(form.workHours);if(!Number.isFinite(hours)||hours<0||hours>24)throw new Error('作業時間は0〜24時間で入力してください。')
      if(!form.workSummary.trim())throw new Error('作業内容を入力してください。')
      await saveDailyReport({id:form.id||undefined,reportDate:form.reportDate,weatherNote:form.weatherNote,workHours:hours,workSummary:form.workSummary,goodPoints:form.goodPoints,issues:form.issues,nextActions:form.nextActions,fieldIds:form.fieldIds})
      setSuccess(form.id?'日報を更新しました。':'日報を登録しました。');setMonth(form.reportDate.slice(0,7));await refresh(false);resetForm()
    }catch(e:any){setError(e?.message||'日報を保存できませんでした。')}finally{setBusy(false)}
  }

  async function remove(r:DailyReport){
    if(!canEdit(r))return setError('この日報を削除する権限がありません。')
    if(!window.confirm(`${r.reportDate} の日報を削除しますか？`))return
    setBusy(true);setError('');setSuccess('')
    try{await deleteDailyReport(r.id);if(form.id===r.id)resetForm();setSuccess('日報を削除しました。');await refresh(false)}catch(e:any){setError(e?.message||'日報を削除できませんでした。')}finally{setBusy(false)}
  }

  const authors=useMemo(()=>[...new Map(reports.map(r=>[r.authorId,r.authorName])).entries()].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name,'ja')),[reports])
  const monthRows=useMemo(()=>reports.filter(r=>r.reportDate.startsWith(month)),[reports,month])
  const filtered=useMemo(()=>{const q=query.trim().normalize('NFKC').toLowerCase();return monthRows.filter(r=>{
    if(author&&r.authorId!==author)return false;if(fieldFilter&&!r.fields.some(f=>f.id===fieldFilter))return false;if(!q)return true
    return `${r.authorName} ${r.weatherNote} ${r.workSummary} ${r.goodPoints} ${r.issues} ${r.nextActions} ${r.fields.map(f=>`${f.legacyId} ${f.name}`).join(' ')}`.normalize('NFKC').toLowerCase().includes(q)
  })},[monthRows,query,author,fieldFilter])
  const totalHours=filtered.reduce((s,r)=>s+r.workHours,0),issueCount=filtered.filter(r=>r.issues.trim()).length
  const fieldCount=new Set(filtered.flatMap(r=>r.fields.map(f=>f.id))).size

  function shiftMonth(delta:number){const[y,m]=month.split('-').map(Number);const d=new Date(y,m-1+delta,1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}

  return <div className="page daily-reports-page">
    <div className="page-head"><div><p className="eyebrow">DAILY REPORT</p><h1>日報</h1><p className="sub">その日の作業・気づき・課題・次回対応を残し、月単位で振り返れます。</p></div><div className="head-actions">{canCreate&&<button className="secondary-button" onClick={resetForm}><Plus size={17}/>新しい日報</button>}<button className="icon-button" onClick={()=>void refresh(false)} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div></div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}{success&&<div className="notice success dashboard-notice">{success}</div>}

    {canCreate&&<form className="panel daily-report-form" onSubmit={submit}>
      <div className="panel-title"><div><h2>{form.id?'日報を編集':'日報を書く'}</h2><p>同じ担当者・同じ日付の日報は1件です。権限の範囲内で登録後も編集できます。</p></div>{form.id&&<span>編集中</span>}</div>
      <div className="form-grid three"><label>日付<input type="date" required value={form.reportDate} onChange={e=>setForm({...form,reportDate:e.target.value})}/></label><label>作業時間<input type="number" min="0" max="24" step="0.25" value={form.workHours} onChange={e=>setForm({...form,workHours:e.target.value})} placeholder="例：6.5"/></label><label>天気・現場状況<input value={form.weatherNote} onChange={e=>setForm({...form,weatherNote:e.target.value})} placeholder="例：晴れ、午後から曇り"/></label></div>
      <div className="daily-report-field-picker"><div className="field-picker-head"><b>関連する圃場</b>{form.fieldIds.length>0&&<button type="button" onClick={()=>setForm({...form,fieldIds:[]})}>全解除</button>}</div><div className="daily-report-field-chips">{fields.map(f=><button type="button" key={f.id} className={form.fieldIds.includes(f.id)?'selected':''} onClick={()=>toggleField(f.id)}><span>{f.legacyId}</span><b>{f.name}</b>{f.variety&&<small>{f.variety}</small>}</button>)}</div></div>
      <label className="full-label">今日の作業内容<textarea required rows={5} value={form.workSummary} onChange={e=>setForm({...form,workSummary:e.target.value})} placeholder="実施した作業、使用した機械、進捗など"/></label>
      <div className="daily-report-reflection-grid"><label>良かった点・できたこと<textarea rows={4} value={form.goodPoints} onChange={e=>setForm({...form,goodPoints:e.target.value})} placeholder="うまくいったこと、改善できたこと"/></label><label>課題・気になったこと<textarea rows={4} value={form.issues} onChange={e=>setForm({...form,issues:e.target.value})} placeholder="病害虫、設備、作業上の問題など"/></label><label>次回やること<textarea rows={4} value={form.nextActions} onChange={e=>setForm({...form,nextActions:e.target.value})} placeholder="明日・次回の優先作業や確認事項"/></label></div>
      <div className="daily-report-form-actions">{form.id&&<button type="button" className="secondary-button" onClick={resetForm}>編集をやめる</button>}<button className="primary-button" disabled={busy}>{busy?'保存中…':form.id?'日報を更新':'日報を登録'}</button></div>
    </form>}

    <section className="daily-report-review">
      <div className="daily-report-review-head"><div><p className="eyebrow">REVIEW</p><h2>日報を振り返る</h2></div><div className="month-switch"><button type="button" onClick={()=>shiftMonth(-1)}><ChevronLeft size={18}/></button><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/><button type="button" onClick={()=>shiftMonth(1)}><ChevronRight size={18}/></button></div></div>
      <div className="metrics daily-report-metrics"><article className="metric"><span>日報</span><strong>{filtered.length}件</strong></article><article className="metric"><span>作業時間</span><strong>{nf.format(totalHours)}h</strong></article><article className="metric"><span>関係圃場</span><strong>{fieldCount}圃場</strong></article><article className="metric"><span>課題記録</span><strong>{issueCount}件</strong></article></div>
      <section className="panel daily-report-history-panel"><div className="toolbar daily-report-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="作業・課題・次回対応を検索"/></div><select value={author} onChange={e=>setAuthor(e.target.value)}><option value="">全担当者</option>{authors.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select><select value={fieldFilter} onChange={e=>setFieldFilter(e.target.value)}><option value="">全圃場</option>{fields.map(f=><option value={f.id} key={f.id}>{f.legacyId} {f.name}</option>)}</select></div>
        <div className="daily-report-history-list">{filtered.map(r=><article className="daily-report-history-card" key={r.id}><div className="daily-report-card-head"><div className="daily-report-date"><CalendarDays size={18}/><div><strong>{r.reportDate}</strong><span>{r.authorName}</span></div></div><div className="daily-report-card-meta">{r.workHours>0&&<span><Clock3 size={14}/>{nf.format(r.workHours)}h</span>}{r.weatherNote&&<span>{r.weatherNote}</span>}</div></div>{r.fields.length>0&&<div className="daily-report-card-fields">{r.fields.map(f=><span key={f.id}>{f.legacyId} {f.name}</span>)}</div>}<div className="daily-report-card-body"><section className="daily-report-main"><h3><FileText size={16}/>作業内容</h3><p>{r.workSummary}</p></section>{r.goodPoints&&<section className="good"><h3>良かった点</h3><p>{r.goodPoints}</p></section>}{r.issues&&<section className="issue"><h3>課題</h3><p>{r.issues}</p></section>}{r.nextActions&&<section className="next"><h3>次回やること</h3><p>{r.nextActions}</p></section>}</div>{canEdit(r)&&<div className="daily-report-card-actions"><button onClick={()=>{loadIntoForm(r);window.scrollTo({top:0,behavior:'smooth'})}}><Edit3 size={14}/>編集</button><button className="danger-text" disabled={busy} onClick={()=>void remove(r)}><Trash2 size={14}/>削除</button></div>}</article>)}{!loading&&!filtered.length&&<p className="empty">この条件の日報はありません。</p>}</div>
      </section>
    </section>
  </div>
}
