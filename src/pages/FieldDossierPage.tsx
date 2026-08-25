import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Leaf, MapPinned, RefreshCw, SprayCan } from 'lucide-react'
import { loadFieldDossier, type DossierEvent, type FieldDossier } from '../lib/fieldDossier'

const currentYear=()=>Number(new Intl.DateTimeFormat('en',{year:'numeric'}).format(new Date()))
const num=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:3})
function label(type:DossierEvent['type']){if(type==='spray')return '散布';if(type==='fertilizer')return '施肥';if(type==='spray_plan')return '防除計画';if(type==='fertilizer_plan')return '施肥計画';return '摘採'}
function icon(type:DossierEvent['type']){if(type==='spray'||type==='spray_plan')return <SprayCan size={18}/>;if(type==='fertilizer'||type==='fertilizer_plan')return <Leaf size={18}/>;return <CalendarDays size={18}/>}
export default function FieldDossierPage(){
 const {fieldId}=useParams();const navigate=useNavigate();const[year,setYear]=useState(currentYear()),[data,setData]=useState<FieldDossier|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 async function refresh(y=year){if(!fieldId)return;setLoading(true);setError('');try{setData(await loadFieldDossier(fieldId,y))}catch(e:any){setError(e?.message||'圃場カルテを読み込めませんでした。')}finally{setLoading(false)}}
 useEffect(()=>{void refresh(year)},[fieldId,year])
 const years=useMemo(()=>{const s=new Set([currentYear(),year,...(data?.years||[])]);return [...s].sort((a,b)=>b-a)},[data,year])
 return <div className="page field-dossier-page">
  <div className="page-head"><div><button className="back-link-button" onClick={()=>navigate('/fields')}><ArrowLeft size={16}/>圃場一覧</button><p className="eyebrow">FIELD DOSSIER</p><h1>{data?`${data.field.legacyId} ${data.field.name}`:'圃場カルテ'}</h1><p className="sub">防除・施肥・N/P/K・年間計画・摘採予定を圃場単位で一元表示します。</p></div><div className="head-actions"><select value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y} value={y}>{y}年</option>)}</select><button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div></div>
  {error&&<div className="notice error dashboard-notice">{error}</div>}
  {data&&<>
   <section className="panel dossier-field-header"><div className="dossier-field-main"><div className="dossier-map-icon"><MapPinned size={24}/></div><div><b>{data.field.location||'場所未設定'}</b><span>{data.field.variety||'品種未設定'} / {data.field.cultivationType||'栽培区分未設定'}</span></div></div><div className="dossier-field-meta"><div><span>面積</span><b>{num.format(data.field.areaM2)}㎡</b><small>{(data.field.areaM2/1000).toFixed(4)}反</small></div><div><span>摘採予定</span><b>{data.field.harvestDate||'未登録'}</b></div><div><span>状態</span><b>{data.field.status==='active'?'有効':'休止'}</b></div></div>{data.field.note&&<p>{data.field.note}</p>}</section>
   <div className="dossier-metrics"><article><span>散布実績</span><strong>{data.summary.sprayCount}回</strong><small>{data.summary.pesticides.length?data.summary.pesticides.join(' / '):'使用農薬なし'}</small></article><article><span>施肥実績</span><strong>{data.summary.fertilizerCount}回</strong><small>{num.format(data.summary.fertilizerKg)}kg</small></article><article><span>N投入</span><strong>{num.format(data.summary.nKg)}kg</strong></article><article><span>P投入</span><strong>{num.format(data.summary.pKg)}kg</strong></article><article><span>K投入</span><strong>{num.format(data.summary.kKg)}kg</strong></article></div>
   <section className="panel dossier-timeline-panel"><div className="panel-title"><div><h2>{year}年 作業タイムライン</h2><p>実績と予定を同じ時系列で表示</p></div><span>{data.events.length}件</span></div><div className="dossier-timeline">{data.events.map(ev=><article className={`dossier-event ${ev.type}`} key={ev.id}><div className="dossier-event-rail"><span>{icon(ev.type)}</span></div><div className="dossier-event-body"><div className="dossier-event-top"><div><span className="dossier-event-type">{label(ev.type)}</span><b>{ev.date}</b></div>{ev.status&&<span className={`status-pill ${ev.status}`}>{ev.status==='completed'?'実施済':ev.status==='cancelled'?'中止':'予定'}</span>}</div><h3>{ev.title}</h3><p>{ev.subtitle}</p><small>{ev.detail}</small>{ev.type==='fertilizer'&&<div className="dossier-event-npk"><span>N {num.format(ev.n||0)}kg</span><span>P {num.format(ev.p||0)}kg</span><span>K {num.format(ev.k||0)}kg</span></div>}</div></article>)}{!loading&&!data.events.length&&<p className="empty">{year}年の作業記録・予定はありません。</p>}</div></section>
  </>}
 </div>
}
