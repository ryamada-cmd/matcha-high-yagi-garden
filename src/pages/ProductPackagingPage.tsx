import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Box, Edit3, Factory, PackageCheck, RefreshCw, Trash2 } from 'lucide-react'
import { loadProducts, loadProductRole, type ProductMaster } from '../lib/products'
import { deleteManufacturingBatch, loadProductionLots, type ProductionLot } from '../lib/production'
import { loadProductPackagingBatches, loadProductStockLots, saveProductPackaging, type ProductPackagingBatch, type ProductStockLot } from '../lib/productPackaging'

const today=()=>new Intl.DateTimeFormat('sv-SE').format(new Date())
const num=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:3})
const yen=new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0})

function requiredInput(product:ProductMaster|null,units:number,source:ProductionLot|null){
  if(!product||!source||units<=0||product.netContent<=0)return null
  const p=product.contentUnit.toLowerCase(),s=source.unit.toLowerCase()
  if(p==='g'&&s==='kg')return units*product.netContent/1000
  if(p==='g'&&s==='g')return units*product.netContent
  if(p==='kg'&&s==='kg')return units*product.netContent
  if(p==='kg'&&s==='g')return units*product.netContent*1000
  return null
}

export default function ProductPackagingPage(){
  const[products,setProducts]=useState<ProductMaster[]>([]),[lots,setLots]=useState<ProductionLot[]>([]),[batches,setBatches]=useState<ProductPackagingBatch[]>([]),[stocks,setStocks]=useState<ProductStockLot[]>([]),[role,setRole]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const[batchId,setBatchId]=useState(''),[productId,setProductId]=useState(''),[sourceLotId,setSourceLotId]=useState(''),[units,setUnits]=useState(''),[date,setDate]=useState(today()),[facility,setFacility]=useState('自社'),[processingCost,setProcessingCost]=useState('0'),[otherCost,setOtherCost]=useState('0'),[operator,setOperator]=useState(''),[note,setNote]=useState('')

  async function refresh(){setLoading(true);setError('');try{const[p,l,b,s,r]=await Promise.all([loadProducts(),loadProductionLots(),loadProductPackagingBatches(),loadProductStockLots(),loadProductRole()]);setProducts(p);setLots(l);setBatches(b);setStocks(s);setRole(r)}catch(e:any){setError(e?.message||'商品化データを読み込めませんでした。')}finally{setLoading(false)}}
  useEffect(()=>{void refresh()},[])
  const isAdmin=role==='admin'
  const current=batches.find(b=>b.batchId===batchId)||null
  const activeProducts=products.filter(p=>p.status==='ACTIVE'||p.id===productId)
  const sourceLots=lots.filter(l=>['kg','g'].includes(l.unit.toLowerCase())&&(l.balance+(current?.sourceLotId===l.id?current.contentInputQty:0))>0.0005)
  const product=products.find(p=>p.id===productId)||null
  const source=lots.find(l=>l.id===sourceLotId)||null
  const count=Math.max(0,Math.floor(Number(units||0)))
  const inputQty=requiredInput(product,count,source)
  const available=source?(source.balance+(current?.sourceLotId===source.id?current.contentInputQty:0)):0
  const inherited=inputQty!==null&&source?inputQty*source.unitCostYen:0
  const packCost=(product?.packagingCostYen||0)*count
  const direct=Number(processingCost||0)+Number(otherCost||0)
  const total=inherited+packCost+direct
  const unitCost=count>0?total/count:0
  const grossPerUnit=product?product.standardPriceYen-unitCost:0
  const stockValue=stocks.filter(s=>s.stockUnits>0).reduce((a,s)=>a+s.inventoryValueYen,0)
  const retailValue=stocks.filter(s=>s.stockUnits>0).reduce((a,s)=>a+s.standardSalesValueYen,0)
  const totalUnits=stocks.filter(s=>s.stockUnits>0).reduce((a,s)=>a+s.stockUnits,0)

  function reset(){setBatchId('');setProductId('');setSourceLotId('');setUnits('');setDate(today());setFacility('自社');setProcessingCost('0');setOtherCost('0');setOperator('');setNote('')}
  function edit(b:ProductPackagingBatch){setBatchId(b.batchId);setProductId(b.productId);setSourceLotId(b.sourceLotId);setUnits(String(b.unitsProduced));setDate(b.date);setFacility(b.facility);setProcessingCost(String(b.processingCostYen));setOtherCost(String(b.otherCostYen));setOperator(b.operator);setNote(b.note);window.scrollTo({top:0,behavior:'smooth'})}
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setSuccess('');try{if(!product)throw new Error('商品を選択してください。');if(!source)throw new Error('原料ロットを選択してください。');if(count<=0)throw new Error('商品数量を入力してください。');if(inputQty===null)throw new Error('自動商品化は内容量・原料ともにg/kgの組み合わせに対応しています。');if(inputQty>available+0.0005)throw new Error(`原料在庫が不足しています。必要 ${num.format(inputQty)}${source.unit} / 利用可能 ${num.format(available)}${source.unit}`);await saveProductPackaging({batchId:batchId||undefined,productId:product.id,sourceLotId:source.id,units:count,date,facility,processingCostYen:Number(processingCost||0),otherCostYen:Number(otherCost||0),operator,note});setSuccess(batchId?'商品化実績を更新しました。':'商品化を登録し、SKU在庫へ入庫しました。');reset();await refresh()}catch(e:any){setError(e?.message||'商品化を保存できませんでした。')}finally{setBusy(false)}}
  async function remove(b:ProductPackagingBatch){const r=window.prompt(`「${b.productName}」${b.unitsProduced}個の商品化を削除しますか？\n原料は在庫へ戻ります。削除理由を入力してください。`,'入力誤り');if(r===null)return;setBusy(true);setError('');setSuccess('');try{await deleteManufacturingBatch(b.batchId,r);setSuccess('商品化実績を削除し、原料在庫へ戻入しました。');if(batchId===b.batchId)reset();await refresh()}catch(e:any){setError(e?.message||'商品化実績を削除できませんでした。')}finally{setBusy(false)}}

  return <div className="page product-packaging-page">
    <div className="page-head"><div><p className="eyebrow">PACKAGING / SKU INVENTORY</p><h1>商品化・SKU在庫</h1><p className="sub">原料ロットを商品マスタへ変換し、必要原料量・包材原価・1個原価・商品在庫を自動管理します。</p></div><div className="head-actions"><button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div></div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}{success&&<div className="notice success dashboard-notice">{success}</div>}

    <div className="product-packaging-metrics"><article><span>商品在庫</span><strong>{num.format(totalUnits)}個</strong></article><article><span>在庫原価</span><strong>{yen.format(stockValue)}</strong></article><article><span>標準売価換算</span><strong>{yen.format(retailValue)}</strong></article><article><span>商品化実績</span><strong>{batches.length}件</strong></article></div>

    {isAdmin&&<form className="panel product-packaging-form" onSubmit={submit}>
      <div className="panel-title"><div><h2>{batchId?'商品化実績を編集':'商品化を登録'}</h2><p>SKUと数量を選ぶと、商品マスタの内容量から必要原料量を計算します。</p></div>{batchId&&<button type="button" className="secondary-button" onClick={reset}>新規へ戻る</button>}</div>
      <div className="form-grid three"><label>商品<select required value={productId} onChange={e=>setProductId(e.target.value)}><option value="">商品マスタから選択</option>{activeProducts.map(p=><option key={p.id} value={p.id}>{p.sku}｜{p.productName}（{num.format(p.netContent)}{p.contentUnit}）</option>)}</select></label><label>商品数量（個）<input required type="number" min="1" step="1" value={units} onChange={e=>setUnits(e.target.value)}/></label><label>商品化日<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
      <label>原料ロット<select required value={sourceLotId} onChange={e=>setSourceLotId(e.target.value)}><option value="">原料在庫から選択</option>{sourceLots.map(l=><option key={l.id} value={l.id}>{l.legacyId}｜{l.materialName}｜利用可能 {num.format(l.balance+(current?.sourceLotId===l.id?current.contentInputQty:0))}{l.unit}</option>)}</select></label>
      <div className="product-packaging-preview">
        <div><span>必要原料</span><strong>{inputQty===null?'—':`${num.format(inputQty)} ${source?.unit||''}`}</strong><small>{source&&inputQty!==null?`商品化後 ${num.format(Math.max(0,available-inputQty))}${source.unit} 残`:'商品・原料を選択'}</small></div>
        <div><span>原料原価</span><strong>{yen.format(inherited)}</strong></div><div><span>包材原価</span><strong>{yen.format(packCost)}</strong><small>{product?`${yen.format(product.packagingCostYen)} × ${count}個`:'—'}</small></div><div><span>予定総原価</span><strong>{yen.format(total)}</strong></div><div><span>予定1個原価</span><strong>{yen.format(unitCost)}</strong></div><div><span>標準価格との差</span><strong>{yen.format(grossPerUnit)}</strong><small>1個あたり・販売経費前</small></div>
      </div>
      <div className="form-grid three"><label>商品化・作業費（円）<input type="number" min="0" step="1" value={processingCost} onChange={e=>setProcessingCost(e.target.value)}/></label><label>その他費用（円）<input type="number" min="0" step="1" value={otherCost} onChange={e=>setOtherCost(e.target.value)}/></label><label>作業場所<input value={facility} onChange={e=>setFacility(e.target.value)}/></label></div>
      <div className="form-grid two"><label>担当者<input value={operator} onChange={e=>setOperator(e.target.value)}/></label><label>備考<input value={note} onChange={e=>setNote(e.target.value)}/></label></div>
      <button className="primary-button" disabled={busy}>{busy?'保存中…':batchId?'商品化実績を更新':'商品化してSKU在庫へ入庫'}</button>
    </form>}

    <section className="panel"><div className="panel-title"><div><h2>SKU在庫</h2><p>販売可能な商品ロットを個数・原価・標準売価換算で表示</p></div><span>{stocks.length}ロット</span></div><div className="sku-stock-grid">{stocks.map(s=><article className={`sku-stock-card ${s.stockUnits<=0?'zero':''}`} key={s.lotId}><div className="sku-stock-head"><div><code>{s.sku}</code><h3>{s.productName}</h3><small>{s.legacyId}</small></div><Box size={22}/></div><strong>{num.format(s.stockUnits)}個</strong><dl><div><dt>仕様</dt><dd>{num.format(s.netContent)}{s.contentUnit} / {s.packageType||'包装未設定'}</dd></div><div><dt>1個原価</dt><dd>{yen.format(s.unitCostYen)}</dd></div><div><dt>在庫原価</dt><dd>{yen.format(s.inventoryValueYen)}</dd></div><div><dt>標準売価換算</dt><dd>{yen.format(s.standardSalesValueYen)}</dd></div></dl></article>)}{!loading&&!stocks.length&&<p className="empty">商品在庫はまだありません。</p>}</div></section>

    <section className="panel"><div className="panel-title"><div><h2>商品化履歴</h2><p>原料ロット → SKU在庫の変換と原価を追跡</p></div><span>{batches.length}件</span></div><div className="product-packaging-history">{batches.map(b=><article key={b.batchId}><div className="product-packaging-history-head"><div><span>{b.date} / {b.legacyId}</span><h3>{b.sku}｜{b.productName}</h3><small>{b.sourceLotLegacyId} {b.sourceMaterialName} → {b.unitsProduced}個</small></div><PackageCheck size={21}/></div><div className="product-packaging-history-grid"><span>原料 <b>{num.format(b.contentInputQty)}{b.contentInputUnit}</b></span><span>包材 <b>{yen.format(b.packagingCostYen)}</b></span><span>総原価 <b>{yen.format(b.totalCostYen)}</b></span><span>1個原価 <b>{yen.format(b.unitCostYen)}</b></span><span>現在庫 <b>{num.format(b.stockUnits)}個</b></span></div>{isAdmin&&<div className="product-packaging-history-actions"><button onClick={()=>edit(b)}><Edit3 size={14}/>編集</button><button className="danger-text-button" onClick={()=>void remove(b)} disabled={busy}><Trash2 size={14}/>削除</button></div>}</article>)}{!loading&&!batches.length&&<p className="empty">商品化実績はまだありません。</p>}</div></section>
  </div>
}
