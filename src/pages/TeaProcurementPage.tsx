import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Boxes, Factory, PackagePlus, RefreshCw, Search, Shuffle, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppPermissions } from '../lib/permissions'
import {
  deleteManufacturingBatch,
  loadManufacturingBatches,
  loadProductionLots,
  receiveProcuredTeaLot,
  saveTeaBlendBatch,
  type ManufacturingBatch,
  type ProductionLot,
} from '../lib/production'

const today=()=>new Intl.DateTimeFormat('sv-SE').format(new Date())
const num=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:3})
const yen=new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0})
const teaTypes=['抹茶','碾茶','玉露','煎茶','ほうじ茶','京番茶','番茶','玄米茶','和紅茶','茎茶','粉茶','その他']
type Tab='procure'|'blend'|'stock'

const blankProcure=()=>({
  materialName:'',teaType:'抹茶',origin:'',variety:'',grade:'',supplier:'',supplierLotNo:'',purchaseDocumentNo:'',
  receivedDate:today(),quantity:'',unit:'kg',totalCostYen:'',storageLocation:'製品保管庫',note:'',
})
const blankBlend=()=>({
  id:'',date:today(),outputMaterial:'',outputQty:'',outputUnit:'kg',teaType:'抹茶',origin:'ブレンド',
  variety:'',grade:'',facility:'自社',processingCostYen:'0',otherCostYen:'0',operator:'',note:'',
})

function toKg(qty:number,unit:string){return unit.toLowerCase()==='g'?qty/1000:qty}
function fromKg(qtyKg:number,unit:string){return unit.toLowerCase()==='g'?qtyKg*1000:qtyKg}
function sourceLabel(sourceType:string){return sourceType==='EXTERNAL_PURCHASE'?'外部調達':sourceType==='MANUFACTURING'?'加工・ブレンド':sourceType==='TEA_INVENTORY'||sourceType==='PRIMARY_PROCESSING'?'自社製茶':sourceType==='MANUAL_RECEIPT'?'手入力入庫':'その他'}

export default function TeaProcurementPage(){
  const{allowed}=useAppPermissions()
  const canInventoryManage=allowed('production.inventory_manage')
  const canProcessManage=allowed('production.process_manage')
  const canProcessDelete=allowed('production.process_delete')
  const[tab,setTab]=useState<Tab>('procure')
  const[lots,setLots]=useState<ProductionLot[]>([])
  const[batches,setBatches]=useState<ManufacturingBatch[]>([])
  const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
  const[error,setError]=useState(''),[success,setSuccess]=useState('')
  const[procure,setProcure]=useState(blankProcure)
  const[blend,setBlend]=useState(blankBlend)
  const[inputs,setInputs]=useState<Record<string,string>>({})
  const[blendQuery,setBlendQuery]=useState('')

  async function refresh(){
    setLoading(true);setError('')
    try{const[l,b]=await Promise.all([loadProductionLots(),loadManufacturingBatches()]);setLots(l);setBatches(b)}
    catch(e:any){setError(e?.message||'調達・ブレンドデータを読み込めませんでした。')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])

  const procuredLots=useMemo(()=>lots.filter(l=>l.sourceType==='EXTERNAL_PURCHASE'),[lots])
  const blendBatches=useMemo(()=>batches.filter(b=>b.processType==='茶ブレンド'),[batches])
  const blendOutputIds=useMemo(()=>new Set(blendBatches.map(b=>b.outputLotId)),[blendBatches])
  const managedLots=useMemo(()=>lots.filter(l=>l.sourceType==='EXTERNAL_PURCHASE'||blendOutputIds.has(l.id)),[lots,blendOutputIds])
  const activeManaged=managedLots.filter(l=>l.balance>0.0005)
  const procurementValue=procuredLots.filter(l=>l.balance>0.0005).reduce((s,l)=>s+l.inventoryValueYen,0)
  const managedKg=activeManaged.reduce((s,l)=>s+(['kg','g'].includes(l.unit.toLowerCase())?toKg(l.balance,l.unit):0),0)

  const currentBatch=blend.id?blendBatches.find(b=>b.id===blend.id):undefined
  const oldInput=new Map((currentBatch?.inputs||[]).map(i=>[i.lotId,i.inputQty]))
  const q=blendQuery.trim().normalize('NFKC').toLowerCase()
  const selectableLots=lots.filter(l=>{
    if(l.id===currentBatch?.outputLotId||l.category==='製品'||!['kg','g'].includes(l.unit.toLowerCase()))return false
    const available=l.balance+(oldInput.get(l.id)||0)
    if(available<=0.0005)return false
    if(!q)return true
    return [l.materialName,l.teaType,l.origin,l.variety,l.grade,l.supplier,l.legacyId].join(' ').normalize('NFKC').toLowerCase().includes(q)
  })
  const inputRows=lots.filter(l=>inputs[l.id]!==undefined).map(l=>({lot:l,qty:Number(inputs[l.id]||0),available:l.balance+(oldInput.get(l.id)||0)})).filter(x=>x.qty>0)
  const inputKg=inputRows.reduce((s,x)=>s+toKg(x.qty,x.lot.unit),0)
  const inputInOutputUnit=fromKg(inputKg,blend.outputUnit)
  const inheritedCost=inputRows.reduce((s,x)=>s+x.qty*x.lot.unitCostYen,0)
  const directCost=Number(blend.processingCostYen||0)+Number(blend.otherCostYen||0)
  const blendTotalCost=inheritedCost+directCost
  const blendUnitCost=Number(blend.outputQty||0)>0?blendTotalCost/Number(blend.outputQty):0
  const lossPct=inputKg>0&&Number(blend.outputQty)>0?Math.max(0,(inputKg-toKg(Number(blend.outputQty),blend.outputUnit))/inputKg*100):0
  const procureUnitCost=Number(procure.quantity)>0?Number(procure.totalCostYen||0)/Number(procure.quantity):0

  function chooseTeaType(type:string){setProcure(f=>({...f,teaType:type,materialName:f.materialName||type}))}
  function toggleInput(lot:ProductionLot){
    setInputs(old=>{const next={...old};if(next[lot.id]!==undefined)delete next[lot.id];else next[lot.id]=String(Math.min(lot.balance+(oldInput.get(lot.id)||0),1).toFixed(3));return next})
  }
  function resetBlend(){setBlend(blankBlend());setInputs({});setBlendQuery('')}
  function editBlend(batch:ManufacturingBatch){
    if(!canProcessManage)return setError('ブレンド実績を編集する権限がありません。')
    const output=lots.find(l=>l.id===batch.outputLotId)
    setTab('blend')
    setBlend({id:batch.id,date:batch.date,outputMaterial:batch.outputMaterial,outputQty:String(batch.outputQty),outputUnit:batch.outputUnit,teaType:output?.teaType||'',origin:output?.origin||'ブレンド',variety:output?.variety||'',grade:output?.grade||'',facility:batch.facility||'自社',processingCostYen:String(batch.processingCostYen),otherCostYen:String(batch.otherCostYen),operator:batch.operator||'',note:batch.note||''})
    setInputs(Object.fromEntries(batch.inputs.map(i=>[i.lotId,String(i.inputQty)])))
    window.scrollTo({top:0,behavior:'smooth'})
  }

  async function submitProcure(e:FormEvent){
    e.preventDefault()
    if(!canInventoryManage)return setError('調達茶を登録する権限がありません。')
    setBusy(true);setError('');setSuccess('')
    try{
      const qty=Number(procure.quantity),cost=Number(procure.totalCostYen||0)
      if(!Number.isFinite(qty)||qty<=0)throw new Error('仕入数量を入力してください。')
      if(!Number.isFinite(cost)||cost<0)throw new Error('仕入金額を確認してください。')
      await receiveProcuredTeaLot({...procure,quantity:qty,totalCostYen:cost})
      setSuccess('調達茶を入庫しました。ブレンドなしなら、このロットから直接商品化できます。')
      setProcure(blankProcure());setTab('stock');await refresh()
    }catch(e:any){setError(e?.message||'調達茶を登録できませんでした。')}
    finally{setBusy(false)}
  }

  async function submitBlend(e:FormEvent){
    e.preventDefault()
    if(!canProcessManage)return setError('ブレンドを登録する権限がありません。')
    setBusy(true);setError('');setSuccess('')
    try{
      if(inputRows.length<2)throw new Error('ブレンドする原料を2ロット以上選択してください。')
      for(const x of inputRows)if(x.qty>x.available+0.0005)throw new Error(x.lot.legacyId+' の在庫を超えています。')
      const out=Number(blend.outputQty)
      if(!Number.isFinite(out)||out<=0)throw new Error('出来高を入力してください。')
      await saveTeaBlendBatch({id:blend.id||undefined,date:blend.date,outputMaterial:blend.outputMaterial,outputQty:out,outputUnit:blend.outputUnit,teaType:blend.teaType,origin:blend.origin,variety:blend.variety,grade:blend.grade,facility:blend.facility,processingCostYen:Number(blend.processingCostYen||0),otherCostYen:Number(blend.otherCostYen||0),operator:blend.operator,note:blend.note,inputs:inputRows.map(x=>({lotId:x.lot.id,inputQty:x.qty}))})
      setSuccess(blend.id?'ブレンド実績を更新しました。':'ブレンドを登録し、新しい原料ロットを作成しました。')
      resetBlend();setTab('stock');await refresh()
    }catch(e:any){setError(e?.message||'ブレンドを保存できませんでした。')}
    finally{setBusy(false)}
  }

  async function removeBlend(batch:ManufacturingBatch){
    if(!canProcessDelete)return setError('ブレンド実績を削除する権限がありません。')
    const reason=window.prompt('ブレンド実績を削除します。後工程で未使用の場合、原料は在庫へ戻ります。削除理由を入力してください。','入力誤り')
    if(reason===null)return
    setBusy(true);setError('');setSuccess('')
    try{await deleteManufacturingBatch(batch.id,reason);setSuccess('ブレンド実績を削除し、原料を在庫へ戻しました。');if(blend.id===batch.id)resetBlend();await refresh()}
    catch(e:any){setError(e?.message||'ブレンド実績を削除できませんでした。')}
    finally{setBusy(false)}
  }

  return <div className="page tea-procurement-page">
    <div className="page-head">
      <div><p className="eyebrow">TEA PROCUREMENT & BLENDING</p><h1>茶の調達・ブレンド</h1><p className="sub">外部から仕入れた抹茶・ほうじ茶・京番茶などをロット管理し、ブレンド有無を選んで小分け商品化・販売へつなげます。</p></div>
      <div className="head-actions"><Link className="secondary-button" to="/product-packaging">商品化・小分け<ArrowRight size={15}/></Link><button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div>
    </div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}{success&&<div className="notice success dashboard-notice">{success}</div>}

    <section className="tea-route-guide">
      <article><span>ブレンドなし</span><b>外部調達</b><ArrowRight size={16}/><b>小分け商品化</b><ArrowRight size={16}/><b>販売</b></article>
      <article><span>ブレンドあり</span><b>外部調達</b><ArrowRight size={16}/><b>ブレンド</b><ArrowRight size={16}/><b>小分け商品化</b><ArrowRight size={16}/><b>販売</b></article>
    </section>

    <div className="metrics tea-procurement-metrics">
      <article className="metric"><span>調達ロット</span><strong>{procuredLots.length}件</strong></article>
      <article className="metric"><span>調達・ブレンド在庫</span><strong>{num.format(managedKg)}kg</strong></article>
      <article className="metric"><span>調達茶在庫原価</span><strong>{yen.format(procurementValue)}</strong></article>
      <article className="metric"><span>ブレンド実績</span><strong>{blendBatches.length}件</strong></article>
    </div>

    <div className="tea-procurement-tabs">
      <button className={tab==='procure'?'active':''} onClick={()=>setTab('procure')}><PackagePlus size={16}/>外部調達を登録</button>
      <button className={tab==='blend'?'active':''} onClick={()=>setTab('blend')}><Shuffle size={16}/>ブレンド</button>
      <button className={tab==='stock'?'active':''} onClick={()=>setTab('stock')}><Boxes size={16}/>調達・ブレンド在庫</button>
    </div>

    {tab==='procure'&&<section className="panel">
      <div className="panel-title"><div><h2>外部から仕入れた茶を入庫</h2><p>仕入茶は自社茶園由来と分けて、仕入先・産地・茶種・ロットを保持します。</p></div><PackagePlus size={20}/></div>
      {!canInventoryManage?<p className="empty">調達茶の登録は閲覧のみです。</p>:<form className="tea-procure-form" onSubmit={submitProcure}>
        <div className="tea-type-quick">{teaTypes.map(t=><button type="button" key={t} className={procure.teaType===t?'active':''} onClick={()=>chooseTeaType(t)}>{t}</button>)}</div>
        <div className="form-grid three"><label>茶種<input required list="tea-type-list" value={procure.teaType} onChange={e=>setProcure({...procure,teaType:e.target.value})}/><datalist id="tea-type-list">{teaTypes.map(t=><option key={t} value={t}/>)}</datalist></label><label>品目名<input required value={procure.materialName} onChange={e=>setProcure({...procure,materialName:e.target.value})} placeholder="例：鹿児島抹茶 おくみどり"/></label><label>仕入日<input type="date" value={procure.receivedDate} onChange={e=>setProcure({...procure,receivedDate:e.target.value})}/></label></div>
        <div className="form-grid three"><label>仕入先<input required value={procure.supplier} onChange={e=>setProcure({...procure,supplier:e.target.value})}/></label><label>産地<input value={procure.origin} onChange={e=>setProcure({...procure,origin:e.target.value})} placeholder="例：鹿児島県"/></label><label>品種<input value={procure.variety} onChange={e=>setProcure({...procure,variety:e.target.value})} placeholder="例：おくみどり"/></label></div>
        <div className="form-grid three"><label>等級・規格<input value={procure.grade} onChange={e=>setProcure({...procure,grade:e.target.value})} placeholder="例：加工用A"/></label><label>仕入先Lot No.<input value={procure.supplierLotNo} onChange={e=>setProcure({...procure,supplierLotNo:e.target.value})}/></label><label>仕入伝票・請求書No.<input value={procure.purchaseDocumentNo} onChange={e=>setProcure({...procure,purchaseDocumentNo:e.target.value})}/></label></div>
        <div className="form-grid four"><label>仕入数量<input required type="number" inputMode="decimal" min="0.001" step="0.001" value={procure.quantity} onChange={e=>setProcure({...procure,quantity:e.target.value})}/></label><label>単位<select value={procure.unit} onChange={e=>setProcure({...procure,unit:e.target.value})}><option>kg</option><option>g</option></select></label><label>仕入総額（円）<input type="number" inputMode="numeric" min="0" step="1" value={procure.totalCostYen} onChange={e=>setProcure({...procure,totalCostYen:e.target.value})}/></label><label>保管場所<input value={procure.storageLocation} onChange={e=>setProcure({...procure,storageLocation:e.target.value})}/></label></div>
        <div className="tea-procure-cost-preview"><span>仕入単価</span><b>{procureUnitCost?yen.format(procureUnitCost)+' / '+procure.unit:'—'}</b></div>
        <label>備考<textarea rows={2} value={procure.note} onChange={e=>setProcure({...procure,note:e.target.value})}/></label>
        <button className="primary-button" disabled={busy}>{busy?'登録中…':'調達茶を入庫'}</button>
      </form>}
    </section>}

    {tab==='blend'&&<section className="panel tea-blend-panel">
      <div className="panel-title"><div><h2>{blend.id?'ブレンド実績を編集':'茶をブレンド'}</h2><p>2ロット以上を配合し、新しいブレンド原料ロットを作ります。自社茶と調達茶の混合も可能です。</p></div>{blend.id&&<button className="secondary-button" type="button" onClick={resetBlend}>新規へ戻る</button>}</div>
      {!canProcessManage?<p className="empty">ブレンド実績は閲覧のみです。</p>:<form className="tea-blend-form" onSubmit={submitBlend}>
        <div className="search-box tea-blend-search"><Search size={16}/><input value={blendQuery} onChange={e=>setBlendQuery(e.target.value)} placeholder="茶種・品目・産地・品種・仕入先・ロットで原料検索"/></div>
        <div className="tea-blend-source-grid">{selectableLots.map(l=>{const selected=inputs[l.id]!==undefined,available=l.balance+(oldInput.get(l.id)||0);return <article className={selected?'selected':''} key={l.id}><button type="button" onClick={()=>toggleInput(l)}><span>{sourceLabel(l.sourceType)}</span><b>{l.materialName}</b><small>{[l.teaType,l.origin,l.variety,l.grade].filter(Boolean).join(' / ')||l.legacyId}</small><strong>{num.format(available)} {l.unit}</strong></button>{selected&&<label>使用量<input type="number" inputMode="decimal" min="0.001" max={available} step="0.001" value={inputs[l.id]} onChange={e=>setInputs({...inputs,[l.id]:e.target.value})}/></label>}</article>})}{!selectableLots.length&&<p className="empty">ブレンドに使える重量在庫がありません。</p>}</div>
        <div className="tea-blend-input-summary"><span>選択 {inputRows.length}ロット</span><b>投入合計 {num.format(inputKg)}kg</b><button type="button" onClick={()=>setBlend({...blend,outputQty:String(Number(inputInOutputUnit.toFixed(3)))})}>投入重量を出来高に反映</button></div>
        <div className="form-grid three"><label>ブレンド日<input type="date" value={blend.date} onChange={e=>setBlend({...blend,date:e.target.value})}/></label><label>出来上がり茶種<input required list="blend-tea-type-list" value={blend.teaType} onChange={e=>setBlend({...blend,teaType:e.target.value})}/><datalist id="blend-tea-type-list">{teaTypes.map(t=><option key={t} value={t}/>)}</datalist></label><label>出来上がり品目<input required value={blend.outputMaterial} onChange={e=>setBlend({...blend,outputMaterial:e.target.value})} placeholder="例：抹茶ブレンド No.1"/></label></div>
        <div className="form-grid four"><label>出来高<input required type="number" inputMode="decimal" min="0.001" step="0.001" value={blend.outputQty} onChange={e=>setBlend({...blend,outputQty:e.target.value})}/></label><label>単位<select value={blend.outputUnit} onChange={e=>setBlend({...blend,outputUnit:e.target.value})}><option>kg</option><option>g</option></select></label><label>産地表記<input value={blend.origin} onChange={e=>setBlend({...blend,origin:e.target.value})}/></label><label>等級・規格<input value={blend.grade} onChange={e=>setBlend({...blend,grade:e.target.value})}/></label></div>
        <div className="form-grid three"><label>品種・配合名<input value={blend.variety} onChange={e=>setBlend({...blend,variety:e.target.value})} placeholder="例：やぶきた＋おくみどり"/></label><label>ブレンド作業費（円）<input type="number" inputMode="numeric" min="0" step="1" value={blend.processingCostYen} onChange={e=>setBlend({...blend,processingCostYen:e.target.value})}/></label><label>その他直接費（円）<input type="number" inputMode="numeric" min="0" step="1" value={blend.otherCostYen} onChange={e=>setBlend({...blend,otherCostYen:e.target.value})}/></label></div>
        <div className="form-grid two"><label>作業場所<input value={blend.facility} onChange={e=>setBlend({...blend,facility:e.target.value})}/></label><label>担当者<input value={blend.operator} onChange={e=>setBlend({...blend,operator:e.target.value})}/></label></div>
        <div className="tea-blend-preview"><div><span>投入重量</span><b>{num.format(inputKg)}kg</b></div><div><span>出来高</span><b>{blend.outputQty?num.format(Number(blend.outputQty))+blend.outputUnit:'—'}</b></div><div><span>ロス率</span><b>{inputKg&&blend.outputQty?lossPct.toFixed(2)+'%':'—'}</b></div><div><span>原料＋直接費</span><b>{yen.format(blendTotalCost)}</b></div><div><span>予定単位原価</span><b>{blendUnitCost?yen.format(blendUnitCost)+' / '+blend.outputUnit:'—'}</b></div></div>
        <label>備考<textarea rows={2} value={blend.note} onChange={e=>setBlend({...blend,note:e.target.value})}/></label>
        <button className="primary-button" disabled={busy||inputRows.length<2||!blend.outputMaterial||!blend.teaType||Number(blend.outputQty)<=0}>{busy?'保存中…':blend.id?'ブレンド変更を保存':'ブレンドして新ロットを作成'}</button>
      </form>}
      <div className="tea-blend-history"><div className="section-head"><div><h3>ブレンド履歴</h3><p>配合元ロットと使用量を保持します。</p></div><span>{blendBatches.length}件</span></div>{blendBatches.map(b=>{const output=lots.find(l=>l.id===b.outputLotId);return <article key={b.id}><div><span>{b.date} / {b.legacyId}</span><b>{b.outputMaterial}</b><small>{[output?.teaType,output?.origin,output?.grade].filter(Boolean).join(' / ')}</small></div><div className="tea-blend-lineage">{b.inputs.map(i=><span key={i.id}>{i.lotLegacyId} {i.materialName}：{num.format(i.inputQty)}{i.unit}</span>)}</div><strong>{num.format(b.outputQty)} {b.outputUnit}</strong><div className="tea-blend-actions"><Link to={'/product-packaging?source='+b.outputLotId}>商品化へ<ArrowRight size={13}/></Link>{canProcessManage&&<button onClick={()=>editBlend(b)}>編集</button>}{canProcessDelete&&<button className="danger-text-button" disabled={busy} onClick={()=>void removeBlend(b)}><Trash2 size={13}/>削除</button>}</div></article>})}{!blendBatches.length&&<p className="empty">ブレンド実績はまだありません。</p>}</div>
    </section>}

    {tab==='stock'&&<section className="panel">
      <div className="panel-title"><div><h2>調達・ブレンド在庫</h2><p>外部調達ロットと、その原料から作成したブレンドロットを一覧表示します。</p></div><Factory size={20}/></div>
      <div className="tea-procured-stock-grid">{managedLots.map(l=><article className={l.balance<=0.0005?'zero':''} key={l.id}><div className="tea-procured-stock-head"><div><span>{sourceLabel(l.sourceType)}</span><h3>{l.materialName}</h3><small>{l.legacyId}</small></div><b>{l.teaType||'茶種未設定'}</b></div><strong>{num.format(l.balance)} {l.unit}</strong><dl><div><dt>産地</dt><dd>{l.origin||'—'}</dd></div><div><dt>品種</dt><dd>{l.variety||'—'}</dd></div><div><dt>等級・規格</dt><dd>{l.grade||'—'}</dd></div><div><dt>仕入先</dt><dd>{l.supplier||'—'}</dd></div><div><dt>仕入先Lot</dt><dd>{l.supplierLotNo||'—'}</dd></div><div><dt>単位原価</dt><dd>{yen.format(l.unitCostYen)} / {l.unit}</dd></div></dl><div className="tea-procured-stock-actions">{l.balance>0.0005&&<Link to={'/product-packaging?source='+l.id}>このロットを小分け商品化<ArrowRight size={14}/></Link>}<Link to="/production">棚卸・廃棄</Link></div></article>)}{!loading&&!managedLots.length&&<p className="empty">調達・ブレンド在庫はまだありません。</p>}</div>
    </section>}
  </div>
}
