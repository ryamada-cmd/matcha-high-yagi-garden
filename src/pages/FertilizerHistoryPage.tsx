import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, Download, Edit3, RefreshCw, Search, Trash2 } from 'lucide-react'
import { deleteFertilizerApplication, loadFertilizerApplications, loadFertilizerFields, loadFertilizerNpkByField, loadFertilizerRole, loadFertilizers, type Fertilizer, type FertilizerApplication, type FertilizerField, type FertilizerFieldNpk } from '../lib/fertilizers'

const num=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:3})
const thisYear=()=>Number(new Intl.DateTimeFormat('en',{year:'numeric'}).format(new Date()))
const norm=(v:unknown)=>String(v??'').normalize('NFKC').toLowerCase()
const csvCell=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`

export default function FertilizerHistoryPage(){
  const navigate=useNavigate()
  const[apps,setApps]=useState<FertilizerApplication[]>([]),[fertilizers,setFertilizers]=useState<Fertilizer[]>([]),[fields,setFields]=useState<FertilizerField[]>([]),[npk,setNpk]=useState<FertilizerFieldNpk[]>([]),[role,setRole]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const[query,setQuery]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState(''),[fertilizerId,setFertilizerId]=useState(''),[fieldId,setFieldId]=useState(''),[year,setYear]=useState(thisYear()),[expanded,setExpanded]=useState<string[]>([])

  async function refresh(){setLoading(true);setError('');try{const[a,f,fi,r]=await Promise.all([loadFertilizerApplications(500),loadFertilizers(),loadFertilizerFields(),loadFertilizerRole()]);setApps(a);setFertilizers(f);setFields(fi);setRole(r);setNpk(await loadFertilizerNpkByField(year))}catch(e:any){setError(e?.message||'施肥履歴を読み込めませんでした。')}finally{setLoading(false)}}
  useEffect(()=>{void refresh()},[])
  useEffect(()=>{void loadFertilizerNpkByField(year).then(setNpk).catch(()=>{})},[year])

  const filtered=useMemo(()=>apps.filter(a=>{
    if(start&&a.date<start)return false;if(end&&a.date>end)return false
    if(fertilizerId&&!a.lines.some(l=>l.fertilizerId===fertilizerId))return false
    if(fieldId&&!a.lines.some(l=>l.fieldId===fieldId))return false
    const q=norm(query.trim());if(!q)return true
    return norm([a.legacyId,a.date,a.operator,a.method,a.weather,a.note,...a.lines.flatMap(l=>[l.fertilizerName,l.fieldLegacyId,l.fieldName])].join(' ')).includes(q)
  }),[apps,start,end,fertilizerId,fieldId,query])

  const summary=useMemo(()=>filtered.reduce((s,a)=>({kg:s.kg+a.totalKg,n:s.n+a.nKg,p:s.p+a.pKg,k:s.k+a.kKg}),{kg:0,n:0,p:0,k:0}),[filtered])

  function toggle(id:string){setExpanded(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id])}
  async function remove(a:FertilizerApplication){const reason=window.prompt('削除理由を入力してください。削除すると肥料在庫へ戻入されます。','入力誤り');if(reason===null)return;setBusy(true);setError('');try{await deleteFertilizerApplication(a.id,reason);await refresh()}catch(e:any){setError(e?.message||'削除に失敗しました。')}finally{setBusy(false)}}
  function exportCsv(){
    const rows:(string|number)[][]=[['施肥日','施肥ID','担当者','方法','天候','圃場','肥料','施肥量kg','kg/10a','N kg','P kg','K kg','備考']]
    for(const a of filtered)for(const l of a.lines)rows.push([a.date,a.legacyId,a.operator,a.method,a.weather,`${l.fieldLegacyId} ${l.fieldName}`,l.fertilizerName,l.amountKg,l.rateKgPer10a,l.nKg,l.pKg,l.kKg,a.note])
    const text='\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const el=document.createElement('a');el.href=url;el.download=`施肥履歴_${new Date().toISOString().slice(0,10)}.csv`;el.click();URL.revokeObjectURL(url)
  }

  return <div className="page fertilizer-page fertilizer-history-page">
    <div className="page-head"><div><p className="eyebrow">FERTILIZATION HISTORY</p><h1>施肥履歴</h1><p className="sub">施肥実績を検索・編集・CSV出力し、圃場別の年間N/P/K投入量を確認します。</p></div><button className="icon-button" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={18} className={loading?'spin':''}/></button></div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}

    <section className="panel fertilizer-history-filter">
      <div className="fertilizer-filter-grid">
        <label className="search-label"><span>検索</span><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="施肥ID・担当者・肥料・圃場・方法"/></div></label>
        <label><span>開始日</span><input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
        <label><span>終了日</span><input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
        <label><span>肥料</span><select value={fertilizerId} onChange={e=>setFertilizerId(e.target.value)}><option value="">すべて</option>{fertilizers.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label><span>圃場</span><select value={fieldId} onChange={e=>setFieldId(e.target.value)}><option value="">すべて</option>{fields.map(f=><option key={f.id} value={f.id}>{f.legacyId} {f.name}</option>)}</select></label>
      </div>
      <div className="fertilizer-history-summary"><div><span>該当記録</span><b>{filtered.length}件</b></div><div><span>肥料</span><b>{num.format(summary.kg)}kg</b></div><div><span>N</span><b>{num.format(summary.n)}kg</b></div><div><span>P</span><b>{num.format(summary.p)}kg</b></div><div><span>K</span><b>{num.format(summary.k)}kg</b></div><button className="secondary-button" onClick={exportCsv} disabled={!filtered.length}><Download size={16}/>CSV出力</button></div>
    </section>

    <section className="panel fertilizer-history-formal">
      <div className="panel-title"><div><h2>施肥実績</h2><p>条件に一致した記録を表示</p></div><span>{filtered.length}件</span></div>
      <div className="fertilizer-history-list formal">
        {filtered.map(a=>{const open=expanded.includes(a.id);return <article key={a.id}>
          <div className="fertilizer-history-head"><button className="fertilizer-history-expand" onClick={()=>toggle(a.id)}><div><span>{a.date}</span><b>{a.legacyId}</b><small>{a.operator||'担当未入力'} / {a.method||'方法未入力'}</small></div><div><strong>{num.format(a.totalKg)}kg</strong>{open?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</div></button><div className="fertilizer-history-actions"><button onClick={()=>navigate(`/fertilizer-applications?edit=${a.id}`)}><Edit3 size={15}/>編集</button>{role==='admin'&&<button className="danger-text-button" disabled={busy} onClick={()=>void remove(a)}><Trash2 size={15}/>削除</button>}</div></div>
          <div className="fertilizer-history-npk"><span>N <b>{num.format(a.nKg)}kg</b></span><span>P <b>{num.format(a.pKg)}kg</b></span><span>K <b>{num.format(a.kKg)}kg</b></span></div>
          {open&&<div className="fertilizer-history-detail"><div className="detail-list"><div><span>天候</span><b>{a.weather||'—'}</b></div><div><span>方法</span><b>{a.method||'—'}</b></div><div className="detail-wide"><span>備考</span><b>{a.note||'—'}</b></div></div><div className="fertilizer-history-lines">{a.lines.map(l=><span key={l.id}><b>{l.fieldLegacyId} {l.fieldName}</b>｜{l.fertilizerName} {num.format(l.amountKg)}kg（{num.format(l.rateKgPer10a)}kg/10a）｜N {num.format(l.nKg)} / P {num.format(l.pKg)} / K {num.format(l.kKg)}kg</span>)}</div></div>}
        </article>})}
        {!loading&&!filtered.length&&<p className="empty">該当する施肥履歴はありません。</p>}
      </div>
    </section>

    <section className="panel fertilizer-npk-panel">
      <div className="panel-title"><div><h2>圃場別 年間N/P/K投入量</h2><p>施肥時点の成分値を基準に集計</p></div><select value={year} onChange={e=>setYear(Number(e.target.value))}>{[thisYear(),thisYear()-1,thisYear()-2,thisYear()-3].map(y=><option value={y} key={y}>{y}年</option>)}</select></div>
      <div className="fertilizer-npk-table"><div className="fertilizer-npk-head"><span>圃場</span><span>肥料</span><span>N</span><span>P</span><span>K</span></div>{npk.map(r=><div className="fertilizer-npk-row" key={r.fieldId}><div><b>{r.legacyId} {r.fieldName}</b><small>{r.location}</small></div><strong>{num.format(r.fertilizerKg)}kg</strong><span>{num.format(r.nKg)}kg</span><span>{num.format(r.pKg)}kg</span><span>{num.format(r.kKg)}kg</span></div>)}{!npk.length&&<p className="empty">{year}年の施肥実績はありません。</p>}</div>
    </section>
  </div>
}
