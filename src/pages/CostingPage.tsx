import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDownToLine, Calculator, CheckCircle2, CircleDollarSign, FileCheck2, Leaf, Package, Pencil, Plus, ReceiptText, RefreshCw, Save, Search, Trash2 } from 'lucide-react'
import { useAppPermissions } from '../lib/permissions'
import { deleteCostingPeriod, loadCostingDashboard, saveCostingPeriod, type CostingCostItem, type CostingDashboard, type CostingPeriod, type CostingSourceCandidate, type CostingStatus } from '../lib/costing'

const currentYear=()=>new Date().getFullYear()
const yen=new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0})
const num=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:3})
const categoryOptions=[
 ['FERTILIZER','肥料'],['PESTICIDE','農薬'],['FUEL','燃料'],['LABOR','作業人件費'],['COVERING','被覆・資材'],
 ['REPAIR','修理・整備'],['DEPRECIATION','減価償却'],['LAND_RENT','地代'],['UTILITIES','水道・電気等'],['PROCESSING','製茶・加工委託'],['OTHER','その他']
] as const
const defaultCosts=():CostingCostItem[]=>[
 {category:'FERTILIZER',description:'肥料',plannedAmountYen:0,actualAmountYen:0},
 {category:'PESTICIDE',description:'農薬',plannedAmountYen:0,actualAmountYen:0},
 {category:'FUEL',description:'燃料',plannedAmountYen:0,actualAmountYen:0},
 {category:'LABOR',description:'茶園作業人件費',plannedAmountYen:0,actualAmountYen:0},
 {category:'COVERING',description:'被覆・栽培資材',plannedAmountYen:0,actualAmountYen:0},
 {category:'REPAIR',description:'農機・設備修理',plannedAmountYen:0,actualAmountYen:0},
 {category:'DEPRECIATION',description:'減価償却',plannedAmountYen:0,actualAmountYen:0},
 {category:'LAND_RENT',description:'地代',plannedAmountYen:0,actualAmountYen:0},
 {category:'UTILITIES',description:'水道・電気・共通費',plannedAmountYen:0,actualAmountYen:0},
 {category:'PROCESSING',description:'製茶・加工委託',plannedAmountYen:0,actualAmountYen:0},
]
type FormState={id:string;fiscalYear:number;name:string;scopeLabel:string;harvestSeason:string;status:CostingStatus;plannedOutputKg:string;note:string;costItems:CostingCostItem[];lots:Record<string,string>}
const blank=(year=currentYear()):FormState=>({id:'',fiscalYear:year,name:year+'年度 自社茶',scopeLabel:'',harvestSeason:'一番茶',status:'DRAFT',plannedOutputKg:'',note:'',costItems:defaultCosts(),lots:{}})

export default function CostingPage(){
 const{allowed}=useAppPermissions()
 const canManage=allowed('costing.manage')
 const[year,setYear]=useState(currentYear())
 const[data,setData]=useState<CostingDashboard|null>(null)
 const[form,setForm]=useState<FormState>(()=>blank())
 const[selectedId,setSelectedId]=useState('')
 const[sourceFilter,setSourceFilter]=useState<'ALL'|'EXPENSE_CLAIM'|'VENDOR_INVOICE'>('ALL')
 const[sourceQuery,setSourceQuery]=useState('')
 const[sourceBaseline,setSourceBaseline]=useState<Record<string,number>>({})
 const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
 const[error,setError]=useState(''),[success,setSuccess]=useState('')

 async function refresh(y=year){
   setLoading(true);setError('')
   try{
     const d=await loadCostingDashboard(y);setData(d)
     if(selectedId){
       const found=d.periods.find(p=>p.id===selectedId)
       if(found)editPeriod(found,false)
     }
   }catch(e:any){setError(e?.message||'原価データを読み込めませんでした。')}
   finally{setLoading(false)}
 }
 useEffect(()=>{void refresh(year)},[year])

 const plannedTotal=useMemo(()=>form.costItems.reduce((s,x)=>s+(Number(x.plannedAmountYen)||0),0),[form.costItems])
 const actualTotal=useMemo(()=>form.costItems.reduce((s,x)=>s+(Number(x.actualAmountYen)||0),0),[form.costItems])
 const selectedLots=useMemo(()=>Object.entries(form.lots).map(([id,v])=>({id,qty:Number(v)||0})).filter(x=>x.qty>0),[form.lots])
 const actualOutputKg=selectedLots.reduce((s,x)=>s+x.qty,0)
 const activeTotal=form.status==='FINAL'?actualTotal:plannedTotal
 const denominator=form.status==='FINAL'?actualOutputKg:(Number(form.plannedOutputKg)||actualOutputKg)
 const activeRate=denominator>0?activeTotal/denominator:0
 const thirtyGram=activeRate*.03

 function sourceKey(type:string,id:string){return type+':'+id}
 function sourceTypeLabel(type:string){return type==='EXPENSE_CLAIM'?'経費精算':'仕入請求書'}
 function newPeriod(){setSelectedId('');setSourceBaseline({});setForm(blank(year));setError('');setSuccess('')}
 function editPeriod(p:CostingPeriod,scroll=true){
   setSelectedId(p.id)
   setSourceBaseline(Object.fromEntries(p.costItems.filter(x=>x.sourceType&&x.sourceItemId).map(x=>[sourceKey(x.sourceType||'',x.sourceItemId||''),x.actualAmountYen])))
   setForm({id:p.id,fiscalYear:p.fiscalYear,name:p.name,scopeLabel:p.scopeLabel,harvestSeason:p.harvestSeason,status:p.status,plannedOutputKg:p.plannedOutputKg?String(p.plannedOutputKg):'',note:p.note,
     costItems:p.costItems.length?p.costItems.map(x=>({...x})):defaultCosts(),
     lots:Object.fromEntries(p.lots.map(x=>[x.lotId,String(x.allocatedQtyKg)]))})
   setError('');if(scroll)window.scrollTo({top:0,behavior:'smooth'})
 }
 function updateCost(index:number,patch:Partial<CostingCostItem>){setForm(f=>({...f,costItems:f.costItems.map((x,i)=>i===index?{...x,...patch}:x)}))}
 function removeCost(index:number){setForm(f=>({...f,costItems:f.costItems.filter((_,i)=>i!==index)}))}
 function addCost(){setForm(f=>({...f,costItems:[...f.costItems,{category:'OTHER',description:'',plannedAmountYen:0,actualAmountYen:0}]}))}
 function importSourceCandidate(source:CostingSourceCandidate){
   const key=sourceKey(source.sourceType,source.sourceItemId)
   if(form.costItems.some(x=>sourceKey(x.sourceType||'',x.sourceItemId||'')===key))return
   const available=Math.max(0,source.remainingAmountYen+(sourceBaseline[key]||0))
   if(available<=0){setError('この明細はすでに全額を原価へ配賦済みです。');return}
   setForm(v=>({...v,costItems:[...v.costItems,{category:source.suggestedCategory||'OTHER',description:source.vendor+' / '+source.description,plannedAmountYen:available,actualAmountYen:available,sourceType:source.sourceType,sourceItemId:source.sourceItemId,sourceParentId:source.sourceParentId,sourceRef:source.sourceRef,sourceDate:source.sourceDate,sourceVendor:source.vendor,sourceTotalAmountYen:source.totalAmountYen}]}))
   setError('');setSuccess(sourceTypeLabel(source.sourceType)+' '+source.sourceRef+' の明細を原価プールへ追加しました。金額と費目を確認して保存してください。')
 }
 function toggleLot(id:string,maxKg:number){setForm(f=>{const lots={...f.lots};if(lots[id]!==undefined)delete lots[id];else lots[id]=String(maxKg);return{...f,lots}})}

 async function submit(e:FormEvent){
   e.preventDefault();if(!canManage)return
   setBusy(true);setError('');setSuccess('')
   try{
     if(!form.name.trim())throw new Error('原価期間名を入力してください。')
     if(form.status==='FINAL'&&actualOutputKg<=0)throw new Error('確定するには対象ロットを選択してください。')
     const id=await saveCostingPeriod(form.id||undefined,{fiscalYear:form.fiscalYear,name:form.name.trim(),scopeLabel:form.scopeLabel.trim(),harvestSeason:form.harvestSeason.trim(),status:form.status,plannedOutputKg:Number(form.plannedOutputKg)||0,note:form.note.trim(),costItems:form.costItems.map(x=>({...x,plannedAmountYen:Number(x.plannedAmountYen)||0,actualAmountYen:Number(x.actualAmountYen)||0})),lots:selectedLots.map(x=>({lotId:x.id,allocatedQtyKg:x.qty}))})
     setSelectedId(id);setSuccess(form.status==='FINAL'?'年度原価を確定し、対象ロットへ実績原価を配賦しました。':'暫定原価を保存し、対象ロットへ標準原価を配賦しました。');await refresh(form.fiscalYear)
   }catch(e:any){setError(e?.message||'原価期間を保存できませんでした。')}finally{setBusy(false)}
 }
 async function removePeriod(p:CostingPeriod){
   if(!canManage)return
   const reason=window.prompt('原価期間を削除します。対象ロットの配賦原価は0円へ戻ります。削除理由を入力してください。','入力誤り')
   if(reason===null)return
   setBusy(true);setError('');setSuccess('')
   try{await deleteCostingPeriod(p.id,reason);if(selectedId===p.id)newPeriod();setSuccess('原価期間を削除しました。');await refresh(year)}
   catch(e:any){setError(e?.message||'原価期間を削除できませんでした。')}finally{setBusy(false)}
 }

 const products=(data?.products||[]).filter(p=>['g','kg'].includes(p.contentUnit.toLowerCase())).map(p=>{
   const kg=p.contentUnit.toLowerCase()==='g'?p.netContent/1000:p.netContent
   const raw=activeRate*kg,standard=raw+p.packagingCostYen
   const margin=p.retailPriceYen>0?(p.retailPriceYen-standard)/p.retailPriceYen*100:0
   return{...p,raw,standard,margin}
 })

 return <div className="page costing-page">
   <div className="page-head"><div><p className="eyebrow">ANNUAL COST ALLOCATION</p><h1>原価計算・年度配賦</h1><p className="sub">自社茶は年度・茶園・茶期単位で費用をまとめ、製茶後の販売可能重量へ配賦します。外部調達茶は実仕入原価を使用します。</p></div><div className="head-actions"><select value={year} onChange={e=>{const y=Number(e.target.value);setYear(y);setSelectedId('');setForm(blank(y))}}>{Array.from({length:7},(_,i)=>currentYear()+1-i).map(y=><option key={y} value={y}>{y}年度</option>)}</select>{canManage&&<button className="secondary-button" onClick={newPeriod}><Plus size={16}/>新規原価期間</button>}<button className="icon-button" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={17} className={loading?'spin':''}/></button></div></div>
   {error&&<div className="notice error">{error}</div>}{success&&<div className="notice success">{success}</div>}

   <section className="costing-method-guide"><article><Leaf size={19}/><div><b>自社茶</b><span>年度費用 ÷ 製茶後の対象kg</span></div><strong>配賦原価方式</strong></article><article><Package size={19}/><div><b>外部調達茶</b><span>仕入総額 ÷ 仕入数量</span></div><strong>実仕入原価方式</strong></article></section>

   <div className="metrics costing-reference-metrics">
     <article className="metric"><span>{year}年 承認済み経費（参考）</span><strong>{yen.format(data?.references.approvedExpenseClaimsYen||0)}</strong><small>自動加算しません</small></article>
     <article className="metric"><span>{year}年 仕入請求書（参考）</span><strong>{yen.format(data?.references.vendorInvoicesYen||0)}</strong><small>二重計上防止のため参考値</small></article>
     <article className="metric"><span>今回の原価プール</span><strong>{yen.format(activeTotal)}</strong><small>{form.status==='FINAL'?'実績':'予定'}</small></article>
     <article className="metric"><span>配賦単価</span><strong>{yen.format(activeRate)}/kg</strong><small>30g換算 {yen.format(thirtyGram)}</small></article>
   </div>

   <div className="costing-layout">
     <aside className="panel costing-period-list"><div className="panel-title"><div><h2>{year}年度</h2><p>原価期間</p></div><Calculator size={18}/></div>{(data?.periods||[]).map(p=><button key={p.id} className={selectedId===p.id?'active':''} onClick={()=>editPeriod(p)}><span>{p.status==='FINAL'?'確定':'暫定'}</span><b>{p.name}</b><small>{[p.scopeLabel,p.harvestSeason].filter(Boolean).join(' / ')||'範囲未設定'}</small><strong>{yen.format(p.rateYenPerKg)}/kg</strong></button>)}{!loading&&!data?.periods.length&&<p className="empty">まだ原価期間がありません。</p>}</aside>

     <form className="panel costing-editor" onSubmit={submit}>
       <div className="panel-title"><div><h2>{form.id?'原価期間を編集':'原価期間を作成'}</h2><p>暫定では予定費用、確定では実績費用を使用します。</p></div>{form.status==='FINAL'?<CheckCircle2 size={20}/>:<Pencil size={20}/>}</div>
       <div className="form-grid four"><label>年度<input type="number" value={form.fiscalYear} onChange={e=>setForm({...form,fiscalYear:Number(e.target.value)})}/></label><label>原価期間名<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>茶園・範囲<input value={form.scopeLabel} onChange={e=>setForm({...form,scopeLabel:e.target.value})} placeholder="例：井手町"/></label><label>茶期<input value={form.harvestSeason} onChange={e=>setForm({...form,harvestSeason:e.target.value})} placeholder="例：一番茶"/></label></div>
       <div className="form-grid three"><label>状態<select value={form.status} onChange={e=>setForm({...form,status:e.target.value as CostingStatus})}><option value="DRAFT">暫定原価</option><option value="FINAL">確定原価</option></select></label><label>予定出来高 kg<input type="number" inputMode="decimal" min="0" step="0.001" value={form.plannedOutputKg} onChange={e=>setForm({...form,plannedOutputKg:e.target.value})}/></label><label>実績対象重量<input readOnly value={num.format(actualOutputKg)+' kg'}/></label></div>

       <section className="costing-section costing-source-import"><div className="section-head"><div><h3>① 経費・請求書から取り込み</h3><p>明細単位で原価プールへ追加します。既に配賦した金額は差し引き、元明細額を超える二重計上はできません。</p></div><span>{(data?.sourceCandidates||[]).filter(x=>x.remainingAmountYen>0).length}件 未配賦</span></div>
         <div className="costing-source-toolbar"><div className="costing-source-tabs"><button type="button" className={sourceFilter==='ALL'?'active':''} onClick={()=>setSourceFilter('ALL')}>すべて</button><button type="button" className={sourceFilter==='EXPENSE_CLAIM'?'active':''} onClick={()=>setSourceFilter('EXPENSE_CLAIM')}><ReceiptText size={13}/>経費精算</button><button type="button" className={sourceFilter==='VENDOR_INVOICE'?'active':''} onClick={()=>setSourceFilter('VENDOR_INVOICE')}><FileCheck2 size={13}/>仕入請求書</button></div><div className="search-box"><Search size={14}/><input value={sourceQuery} onChange={e=>setSourceQuery(e.target.value)} placeholder="購入先・内容・番号で検索"/></div></div>
         <div className="costing-source-grid">{(data?.sourceCandidates||[]).filter(x=>sourceFilter==='ALL'||x.sourceType===sourceFilter).filter(x=>{const q=sourceQuery.trim().normalize('NFKC').toLowerCase();return !q||[x.vendor,x.description,x.sourceRef,x.sourceCategory].join(' ').normalize('NFKC').toLowerCase().includes(q)}).map(source=>{const key=sourceKey(source.sourceType,source.sourceItemId);const already=form.costItems.some(x=>sourceKey(x.sourceType||'',x.sourceItemId||'')===key);const available=Math.max(0,source.remainingAmountYen+(sourceBaseline[key]||0));const caution=['PACKAGING','SHIPPING','FRESH_LEAF'].includes(source.sourceCategory);return <article key={key} className={already?'selected':available<=0?'used':''}><div className="costing-source-head"><span>{sourceTypeLabel(source.sourceType)}</span><small>{source.sourceDate} / {source.sourceRef}</small></div><b>{source.vendor}</b><p>{source.description}</p><div className="costing-source-meta"><span>元明細 {yen.format(source.totalAmountYen)}</span>{source.usedAmountYen>0&&<span>配賦済 {yen.format(source.usedAmountYen)}</span>}<strong>未配賦 {yen.format(available)}</strong></div><div className="costing-source-foot"><span>推奨費目：{categoryOptions.find(([v])=>v===source.suggestedCategory)?.[1]||'その他'}</span>{caution&&<em>通常は直接原価・販管費扱いを確認</em>}{canManage&&<button type="button" disabled={already||available<=0} onClick={()=>importSourceCandidate(source)}><ArrowDownToLine size={13}/>{already?'追加済み':available<=0?'配賦済み':'原価へ追加'}</button>}</div></article>})}</div>
       </section>

       <section className="costing-section"><div className="section-head"><div><h3>② 原価プール</h3><p>取り込んだ実績明細に加え、燃料・人件費・減価償却など必要な費用を手入力できます。</p></div>{canManage&&<button type="button" className="secondary-button" onClick={addCost}><Plus size={14}/>費用追加</button>}</div>
         <div className="costing-cost-table"><div className="costing-cost-header"><span>区分</span><span>内容</span><span>予定額</span><span>実績額</span><span/></div>{form.costItems.map((x,i)=><div key={x.id||i}><select disabled={!canManage} value={x.category} onChange={e=>updateCost(i,{category:e.target.value})}>{categoryOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><div className="costing-cost-description"><input disabled={!canManage} value={x.description} onChange={e=>updateCost(i,{description:e.target.value})}/>{x.sourceType&&<small>{sourceTypeLabel(x.sourceType)} / {x.sourceDate} / {x.sourceRef}{x.sourceTotalAmountYen?' / 元明細 '+yen.format(x.sourceTotalAmountYen):''}</small>}</div><input disabled={!canManage} type="number" inputMode="numeric" min="0" step="1" value={x.plannedAmountYen} onChange={e=>updateCost(i,{plannedAmountYen:Number(e.target.value)})}/><input disabled={!canManage} type="number" inputMode="numeric" min="0" step="1" max={x.sourceTotalAmountYen||undefined} value={x.actualAmountYen} onChange={e=>updateCost(i,{actualAmountYen:Number(e.target.value)})}/>{canManage&&<button type="button" onClick={()=>removeCost(i)}><Trash2 size={14}/></button>}</div>)}</div>
         <div className="costing-totals"><span>予定合計 <b>{yen.format(plannedTotal)}</b></span><span>実績合計 <b>{yen.format(actualTotal)}</b></span></div>
       </section>

       <section className="costing-section"><div className="section-head"><div><h3>③ 配賦対象ロット</h3><p>製茶後の販売可能重量を選択します。外部調達茶は選べません。</p></div><span>{selectedLots.length}ロット / {num.format(actualOutputKg)}kg</span></div>
         <div className="costing-lot-grid">{(data?.eligibleLots||[]).map(l=>{const selected=form.lots[l.id]!==undefined;const locked=!!l.costingPeriodId&&l.costingPeriodId!==form.id;return <article key={l.id} className={selected?'selected':locked?'locked':''}><button type="button" disabled={!canManage||locked} onClick={()=>toggleLot(l.id,l.initialQtyKg)}><span>{l.receivedDate}</span><b>{l.materialName}</b><small>{l.legacyId} / {[l.teaType,l.origin,l.variety].filter(Boolean).join(' / ')}</small><strong>{num.format(l.initialQtyKg)}kg</strong>{locked&&<em>他の原価期間へ配賦済み</em>}</button>{selected&&<label>配賦対象kg<input disabled={!canManage} type="number" inputMode="decimal" min="0.001" max={l.initialQtyKg} step="0.001" value={form.lots[l.id]} onChange={e=>setForm(f=>({...f,lots:{...f.lots,[l.id]:e.target.value}}))}/></label>}</article>})}</div>
       </section>

       <div className="costing-live-summary"><div><span>{form.status==='FINAL'?'確定原価':'暫定標準原価'}</span><strong>{yen.format(activeRate)}/kg</strong></div><div><span>30g原料換算</span><strong>{yen.format(thirtyGram)}</strong></div><div><span>対象重量</span><strong>{num.format(denominator)}kg</strong></div></div>
       <label>備考<textarea rows={2} disabled={!canManage} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
       {canManage&&<div className="costing-editor-actions"><button className="primary-button" disabled={busy}><Save size={16}/>{busy?'保存中…':form.status==='FINAL'?'確定原価として保存':'暫定原価を保存'}</button>{form.id&&<button type="button" className="danger-button" disabled={busy} onClick={()=>{const p=data?.periods.find(x=>x.id===form.id);if(p)void removePeriod(p)}}><Trash2 size={15}/>削除</button>}</div>}
     </form>
   </div>

   <section className="panel costing-product-estimates"><div className="panel-title"><div><h2>商品1個あたり標準原価の目安</h2><p>現在の配賦円/kg × 内容量 ＋ 商品マスタの包材費。原価プールは「小分け前のバルク完成」までの費用を含めてください。</p></div><CircleDollarSign size={20}/></div>
     <div className="costing-product-grid">{products.map(p=><article key={p.id}><span>{p.sku}</span><b>{p.productName}</b><dl><div><dt>原料</dt><dd>{yen.format(p.raw)}</dd></div><div><dt>包材</dt><dd>{yen.format(p.packagingCostYen)}</dd></div><div><dt>標準原価</dt><dd>{yen.format(p.standard)}</dd></div><div><dt>小売価格</dt><dd>{yen.format(p.retailPriceYen)}</dd></div></dl><strong>粗利率目安 {p.retailPriceYen?p.margin.toFixed(1)+'%':'—'}</strong></article>)}</div>
   </section>

   <section className="panel costing-external"><div className="panel-title"><div><h2>外部調達茶の実仕入原価</h2><p>外部調達茶には年度配賦をかけず、仕入総額÷数量を原料原価として使用します。</p></div><Package size={20}/></div>
     <div className="costing-external-grid">{(data?.externalLots||[]).map(l=><article key={l.id}><span>{l.receivedDate}</span><b>{l.materialName}</b><small>{[l.teaType,l.origin,l.supplier].filter(Boolean).join(' / ')}</small><strong>{yen.format(l.baseUnitCostYen)} / {l.unit}</strong></article>)}{!data?.externalLots.length&&<p className="empty">外部調達茶はまだありません。</p>}</div>
   </section>
 </div>
}
