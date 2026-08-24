import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Circle, Pencil, Plus, RefreshCw, Save, Trash2, X, XCircle } from 'lucide-react'
import { deleteAnnualPlan, loadAnnualPlans, saveAnnualPlan, type AnnualPlan, type AnnualPlanInput, type PlanField, type PlanPesticide } from '../lib/plans'

const currentYear = new Date().getFullYear()
const emptyForm = (): AnnualPlanInput => ({ legacyId:'',year:currentYear,month:new Date().getMonth()+1,period:'上旬',fieldId:'',allFields:true,target:'',pesticideId:'',pesticideText:'',fracIrac:'',plannedDate:'',executedDate:'',status:'planned',note:'' })

const statusLabel = (s:AnnualPlan['status']) => s==='completed'?'実施済':s==='cancelled'?'中止':'予定'
const statusIcon = (s:AnnualPlan['status']) => s==='completed'?<CheckCircle2 size={15}/>:s==='cancelled'?<XCircle size={15}/>:<Circle size={15}/>

export default function PlansPage(){
  const [plans,setPlans]=useState<AnnualPlan[]>([])
  const [fields,setFields]=useState<PlanField[]>([])
  const [pesticides,setPesticides]=useState<PlanPesticide[]>([])
  const [role,setRole]=useState('')
  const [year,setYear]=useState(currentYear)
  const [form,setForm]=useState<AnnualPlanInput>(emptyForm())
  const [editingId,setEditingId]=useState<string|null>(null)
  const [formOpen,setFormOpen]=useState(false)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')

  async function refresh(){setLoading(true);setError('');try{const d=await loadAnnualPlans();setPlans(d.plans);setFields(d.fields);setPesticides(d.pesticides);setRole(d.role);if(d.plans.length && !d.plans.some(p=>p.year===year)) setYear(d.plans[0].year)}catch(e:any){setError(e?.message||'年間計画を読み込めませんでした。')}finally{setLoading(false)}}
  useEffect(()=>{void refresh()},[])

  const years=useMemo(()=>Array.from(new Set([currentYear,...plans.map(p=>p.year)])).sort((a,b)=>b-a),[plans])
  const shown=plans.filter(p=>p.year===year)
  const summary={planned:shown.filter(p=>p.status==='planned').length,completed:shown.filter(p=>p.status==='completed').length,cancelled:shown.filter(p=>p.status==='cancelled').length}

  function beginNew(){setEditingId(null);setForm({...emptyForm(),year});setFormOpen(true);setError('');setSuccess('');window.scrollTo({top:0,behavior:'smooth'})}
  function beginEdit(p:AnnualPlan){setEditingId(p.id);setForm({legacyId:p.legacyId,year:p.year,month:p.month,period:p.period,fieldId:p.fieldId,allFields:p.allFields,target:p.target,pesticideId:p.pesticideId,pesticideText:p.pesticideText,fracIrac:p.fracIrac,plannedDate:p.plannedDate,executedDate:p.executedDate,status:p.status,note:p.note});setFormOpen(true);setError('');setSuccess('');window.scrollTo({top:0,behavior:'smooth'})}
  function closeForm(){setFormOpen(false);setEditingId(null);setForm(emptyForm())}

  function choosePesticide(id:string){const p=pesticides.find(x=>x.id===id);setForm({...form,pesticideId:id,pesticideText:p?.name||form.pesticideText,fracIrac:p?.fracIrac||form.fracIrac})}

  async function submit(){
    if(role!=='admin') return setError('年間計画の変更は管理者のみ実行できます。')
    if(!form.target.trim()) return setError('病害虫/目的を入力してください。')
    if(!form.allFields&&!form.fieldId) return setError('対象圃場を選択してください。')
    setSaving(true);setError('');setSuccess('')
    try{const r=await saveAnnualPlan(editingId,form);setSuccess(`${r.legacy_id} を${editingId?'更新':'追加'}しました。`);setYear(form.year);closeForm();await refresh()}catch(e:any){setError(e?.message||'年間計画の保存に失敗しました。')}finally{setSaving(false)}
  }

  async function remove(p:AnnualPlan){
    if(role!=='admin') return setError('年間計画の削除は管理者のみ実行できます。')
    if(!window.confirm(`${p.legacyId} を削除しますか？`)) return
    const reason=window.prompt('削除理由を入力してください（任意）','');if(reason===null)return
    try{await deleteAnnualPlan(p.id,reason);setSuccess(`${p.legacyId} を削除しました。`);await refresh()}catch(e:any){setError(e?.message||'年間計画の削除に失敗しました。')}
  }

  const fieldName=(p:AnnualPlan)=>p.allFields?'全圃場':(()=>{const f=fields.find(x=>x.id===p.fieldId);return f?`${f.legacyId}｜${f.name}`:'個別圃場'})()

  return <div className="page master-page">
    <div className="page-head"><div><p className="eyebrow">ANNUAL PLAN</p><h1>年間防除計画</h1><p className="sub">月・旬・病害虫・推奨農薬・実施状況を年度単位で管理します。</p></div><div className="head-actions">{role==='admin'&&<button className="secondary-button" onClick={beginNew}><Plus size={16}/>計画追加</button>}<button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div></div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}{success&&<div className="notice success dashboard-notice">{success}</div>}

    <div className="plan-toolbar"><label>年度<select value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y} value={y}>{y}年</option>)}</select></label><div className="plan-status-summary"><span className="plan-pill planned">予定 {summary.planned}</span><span className="plan-pill completed">実施済 {summary.completed}</span><span className="plan-pill cancelled">中止 {summary.cancelled}</span></div></div>

    {formOpen&&<section className="panel master-form-panel">
      <div className="section-head"><div><h2>{editingId?'年間計画を編集':'年間計画を追加'}</h2><p className="muted">推奨農薬は任意です。実施日を入れると状態は実施済として保存されます。</p></div><button className="close-detail" onClick={closeForm}><X size={16}/></button></div>
      <div className="form-grid four master-form-grid">
        <label>計画ID<input value={form.legacyId} onChange={e=>setForm({...form,legacyId:e.target.value.toUpperCase()})} placeholder="空欄なら自動"/></label>
        <label>年度<input type="number" min="2020" max="2100" value={form.year} onChange={e=>setForm({...form,year:Number(e.target.value)})}/></label>
        <label>月<select value={form.month} onChange={e=>setForm({...form,month:Number(e.target.value)})}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}月</option>)}</select></label>
        <label>旬<select value={form.period} onChange={e=>setForm({...form,period:e.target.value})}><option>上旬</option><option>中旬</option><option>下旬</option><option value="">指定なし</option></select></label>
        <label>対象<select value={form.allFields?'all':'single'} onChange={e=>setForm({...form,allFields:e.target.value==='all',fieldId:e.target.value==='all'?'':form.fieldId})}><option value="all">全圃場</option><option value="single">個別圃場</option></select></label>
        {!form.allFields&&<label>対象圃場<select value={form.fieldId} onChange={e=>setForm({...form,fieldId:e.target.value})}><option value="">選択してください</option>{fields.map(f=><option key={f.id} value={f.id}>{f.legacyId}｜{f.name}（{f.location}）</option>)}</select></label>}
        <label className="span-two">病害虫 / 目的<input value={form.target} onChange={e=>setForm({...form,target:e.target.value})} placeholder="例：カンザワハダニ"/></label>
        <label className="span-two">推奨農薬（マスタ選択）<select value={form.pesticideId} onChange={e=>choosePesticide(e.target.value)}><option value="">指定なし</option>{pesticides.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="span-two">推奨農薬（表示名）<input value={form.pesticideText} onChange={e=>setForm({...form,pesticideText:e.target.value})} placeholder="任意入力可"/></label>
        <label>FRAC / IRAC<input value={form.fracIrac} onChange={e=>setForm({...form,fracIrac:e.target.value})}/></label>
        <label>予定日<input type="date" value={form.plannedDate} onChange={e=>setForm({...form,plannedDate:e.target.value})}/></label>
        <label>実施日<input type="date" value={form.executedDate} onChange={e=>setForm({...form,executedDate:e.target.value})}/></label>
        <label>状態<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as AnnualPlan['status']})}><option value="planned">予定</option><option value="completed">実施済</option><option value="cancelled">中止</option></select></label>
      </div>
      <label className="full-label">注意事項 / 備考<textarea rows={3} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
      <div className="master-form-actions"><button className="primary-button" onClick={()=>void submit()} disabled={saving}><Save size={17}/>{saving?'保存中…':editingId?'変更を保存':'計画を追加'}</button></div>
    </section>}

    <section className="panel annual-plan-panel"><div className="panel-title"><h2>{year}年 防除計画</h2><span>{shown.length}件</span></div>{shown.length===0?<p className="empty">この年度の計画はありません。</p>:<div className="plan-list">{shown.map(p=><article className={`plan-row ${p.status}`} key={p.id}><div className="plan-date-box"><b>{p.month}月</b><span>{p.period||'—'}</span></div><div className="plan-main"><div className="plan-row-head"><b>{p.target}</b><span className={`plan-pill ${p.status}`}>{statusIcon(p.status)}{statusLabel(p.status)}</span></div><div className="plan-meta"><span><CalendarDays size={13}/>{fieldName(p)}</span>{p.plannedDate&&<span>予定 {p.plannedDate}</span>}{p.executedDate&&<span>実施 {p.executedDate}</span>}</div><div className="plan-pesticide"><span>推奨農薬</span><b>{p.pesticideText||pesticides.find(x=>x.id===p.pesticideId)?.name||'未設定'}</b>{p.fracIrac&&<small>FRAC/IRAC {p.fracIrac}</small>}</div>{p.note&&<p>{p.note}</p>}</div>{role==='admin'&&<div className="plan-actions"><button onClick={()=>beginEdit(p)}><Pencil size={15}/>編集</button><button className="danger-text-button" onClick={()=>void remove(p)}><Trash2 size={15}/>削除</button></div>}</article>)}</div>}</section>
  </div>
}
