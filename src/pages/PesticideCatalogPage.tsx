import { useEffect,useState,type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle,BookOpen,CheckCircle2,Database,PackagePlus,RefreshCw,Search,ShieldCheck } from 'lucide-react'
import {
  addPesticideMasterFromFamic,
  loadCatalogStatus,
  loadPesticideMasterMap,
  normalizeFamicText,
  searchPesticideCatalog,
  syncFamic,
  type CatalogSearch,
  type CatalogStatus,
  type OfficialResult,
  type PesticideMasterRef,
} from '../lib/pesticideCatalog'

const empty:CatalogSearch={official:[],guidelines:[],expired:[],counts:{official:0,guidelines:0,expired:0}}

export default function PesticideCatalogPage(){
  const navigate=useNavigate()
  const [status,setStatus]=useState<CatalogStatus|null>(null)
  const [masters,setMasters]=useState<Record<string,PesticideMasterRef>>({})
  const [query,setQuery]=useState('')
  const [result,setResult]=useState<CatalogSearch>(empty)
  const [tab,setTab]=useState<'official'|'guidelines'|'expired'>('official')
  const [loading,setLoading]=useState(true)
  const [searching,setSearching]=useState(false)
  const [syncing,setSyncing]=useState(false)
  const [addingReg,setAddingReg]=useState('')
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  async function refresh(){
    setLoading(true);setError('')
    try{
      const [nextStatus,nextMasters]=await Promise.all([loadCatalogStatus(),loadPesticideMasterMap()])
      setStatus(nextStatus);setMasters(nextMasters)
    }catch(e:any){setError(e?.message||'農薬DBの状態を読み込めませんでした。')}finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])

  async function submit(e?:FormEvent){e?.preventDefault();setSearching(true);setError('');setMessage('');try{setResult(await searchPesticideCatalog(query.trim(),150))}catch(err:any){setError(err?.message||'検索に失敗しました。')}finally{setSearching(false)}}
  async function runSync(){if(!window.confirm('FAMICの最新公開データを取得し、茶の公式登録DBを更新します。よろしいですか？'))return;setSyncing(true);setError('');setMessage('');try{const r=await syncFamic();setMessage(`FAMIC同期完了：${r.rows.toLocaleString()}件 / ${r.sourceDate}`);await refresh();if(query.trim())await submit()}catch(e:any){setError(e?.message||'FAMIC同期に失敗しました。')}finally{setSyncing(false)}}

  async function receiveFromOfficial(r:OfficialResult){
    const reg=String(r.registration_no||'').trim()
    if(!reg){setError('このFAMICデータには登録番号がないため農薬マスタへ追加できません。');return}
    setAddingReg(reg);setError('');setMessage('')
    try{
      const existing=masters[reg]
      const pesticideId=existing?.id||await addPesticideMasterFromFamic(reg,r.pesticide_name)
      navigate(`/inventory?receivePesticide=${encodeURIComponent(pesticideId)}`)
    }catch(e:any){setError(e?.message||'農薬マスタへの追加に失敗しました。')}finally{setAddingReg('')}
  }

  const shown=result[tab]
  return <div className="page pesticide-page">
    <div className="page-head"><div><p className="eyebrow">PESTICIDE DATABASE</p><h1>農薬検索</h1><p className="sub">FAMIC公式登録・2026年防除指針・失効/適用削除を横断検索します。</p></div><div className="head-actions">{status?.role==='admin'&&<button className="secondary-button famic-sync" onClick={()=>void runSync()} disabled={syncing}><RefreshCw size={16} className={syncing?'spin':''}/>{syncing?'同期中…':'FAMIC最新情報を同期'}</button>}<button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div></div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}{message&&<div className="notice success dashboard-notice">{message}</div>}
    <div className="metrics pesticide-metrics"><article className="metric"><span>FAMIC公式登録</span><strong>{status?.official.toLocaleString()??'—'}件</strong></article><article className="metric"><span>防除指針</span><strong>{status?.guidelines.toLocaleString()??'—'}件</strong></article><article className="metric"><span>失効・適用削除</span><strong>{status?.expired.toLocaleString()??'—'}件</strong></article><article className="metric"><span>公式データ取得日</span><strong className="metric-date">{status?.sourceDate||'未同期'}</strong></article></div>
    <section className="panel pesticide-search-panel"><form className="catalog-search" onSubmit={submit}><div className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="農薬名・病害虫・登録番号・有効成分・FRAC/IRACを検索" autoFocus/></div><button className="primary-button" disabled={searching||!query.trim()}>{searching?'検索中…':'検索'}</button></form><div className="catalog-note"><ShieldCheck size={16}/><span>表示内容だけで使用可否を判断せず、実際の使用前に現物ラベルと最新のFAMIC登録内容を確認してください。</span></div></section>
    <div className="catalog-tabs"><button className={tab==='official'?'active':''} onClick={()=>setTab('official')}><Database size={16}/>公式登録 <b>{result.official.length}</b></button><button className={tab==='guidelines'?'active':''} onClick={()=>setTab('guidelines')}><BookOpen size={16}/>防除指針 <b>{result.guidelines.length}</b></button><button className={tab==='expired'?'active':''} onClick={()=>setTab('expired')}><AlertTriangle size={16}/>失効・削除 <b>{result.expired.length}</b></button></div>
    {!query.trim()?<section className="panel"><p className="empty">検索語を入力してください。例：スコア、カンザワハダニ、2000倍、3(G1)、登録番号など。</p></section>:shown.length===0&&!searching?<section className="panel"><p className="empty">この区分に一致するデータはありません。</p></section>:null}
    {tab==='official'&&result.official.length>0&&<div className="catalog-list">{result.official.map(r=>{const master=masters[String(r.registration_no||'').trim()];return <article className="panel catalog-card official" key={`o-${r.id}`}><div className="catalog-card-head"><div><span className="source-badge official">FAMIC公式</span><h2>{normalizeFamicText(r.pesticide_name)}</h2></div><code>登録 {r.registration_no||'—'}</code></div><div className="catalog-grid"><div><span>対象</span><b>{normalizeFamicText(r.target_pest||r.use_purpose||'—')}</b></div><div><span>希釈/使用量</span><b>{normalizeFamicText(r.dilution_or_rate||'—')}</b></div><div><span>使用時期</span><b>{normalizeFamicText(r.use_timing||'—')}</b></div><div><span>本剤使用回数</span><b>{normalizeFamicText(r.product_use_count||'—')}</b></div><div><span>使用方法</span><b>{normalizeFamicText(r.application_method||'—')}</b></div><div><span>会社</span><b>{normalizeFamicText(r.company_name||'—')}</b></div></div>{r.active_ingredient&&<p className="catalog-foot">有効成分：{normalizeFamicText(r.active_ingredient)}</p>}{status?.role==='admin'&&<div className="catalog-card-actions">{master&&<span className="master-linked"><CheckCircle2 size={15}/>農薬マスタ登録済み</span>}<button className={master?'secondary-button':'primary-button'} disabled={addingReg===String(r.registration_no)} onClick={()=>void receiveFromOfficial(r)}><PackagePlus size={16}/>{addingReg===String(r.registration_no)?'処理中…':master?'この農薬を入庫':'マスタ追加して入庫'}</button></div>}</article>})}</div>}
    {tab==='guidelines'&&result.guidelines.length>0&&<div className="catalog-list">{result.guidelines.map(r=><article className="panel catalog-card guideline" key={`g-${r.id}`}><div className="catalog-card-head"><div><span className="source-badge guideline">2026防除指針</span><h2>{r.pesticide_name}</h2></div><code>{r.frac_irac?`FRAC/IRAC ${r.frac_irac}`:r.source_page||''}</code></div><div className="catalog-grid"><div><span>対象/用途</span><b>{r.target_pest_or_use||'—'}</b></div><div><span>希釈倍率等</span><b>{r.dilution||'—'}</b></div><div><span>散布量/使用量</span><b>{r.spray_volume_or_rate||'—'}</b></div><div><span>使用時期</span><b>{r.use_timing||'—'}</b></div><div><span>使用回数</span><b>{r.use_count||'—'}</b></div><div><span>毒性</span><b>{r.toxicity||'—'}</b></div></div>{r.covering_exception&&<div className="catalog-warning">被覆栽培等：{r.covering_exception}</div>}{r.note&&<p className="catalog-foot">{r.note}</p>}</article>)}</div>}
    {tab==='expired'&&result.expired.length>0&&<div className="catalog-list">{result.expired.map(r=><article className="panel catalog-card expired" key={`e-${r.id}`}><div className="catalog-card-head"><div><span className="source-badge expired">要注意</span><h2>{r.pesticide_name}</h2></div><strong>{r.expired_on||'日付未設定'}</strong></div><div className="catalog-warning danger"><b>{r.expiry_type||'登録失効'}</b>{r.note&&<span>{r.note}</span>}</div><p className="catalog-foot">確認状態：{r.verification_status||'—'} / 出典：{r.source_page||'—'}</p></article>)}</div>}
  </div>
}
