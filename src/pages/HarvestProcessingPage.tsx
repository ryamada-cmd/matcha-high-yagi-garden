import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Edit3, Factory, Leaf, RefreshCw, Scissors, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAppPermissions } from '../lib/permissions'
import { allocateHarvestTotalByArea } from '../lib/harvestAllocations'
import { inspectHarvestProvenance, summarizeHarvestProvenance, validHarvestDate } from '../lib/harvestProvenance'
import { deleteHarvestRecord, deleteProcessingBatch, finalizeImportedHarvestSource, loadHarvestFields, loadHarvestRecords, loadProcessingBatches, saveHarvestRecord, saveProcessingBatch, type HarvestField, type HarvestRecord, type ProcessingBatch } from '../lib/harvestProcessing'

const today=()=>new Intl.DateTimeFormat('sv-SE').format(new Date())
const num=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:3})
export default function HarvestProcessingPage(){
 const{allowed}=useAppPermissions(),canManage=allowed('harvest_processing.manage'),canDelete=allowed('harvest_processing.delete')
 const[params]=useSearchParams();const[tab,setTab]=useState<'harvest'|'process'>('harvest');const[fields,setFields]=useState<HarvestField[]>([]),[harvests,setHarvests]=useState<HarvestRecord[]>([]),[batches,setBatches]=useState<ProcessingBatch[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const[hId,setHId]=useState(''),[hDate,setHDate]=useState(today()),[hFieldQty,setHFieldQty]=useState<Record<string,string>>(()=>params.get('field')?{[params.get('field')!] : ''}:{}),[hFieldAreas,setHFieldAreas]=useState<Record<string,string>>({}),[hSeason,setHSeason]=useState(''),[hMethod,setHMethod]=useState(''),[hOperator,setHOperator]=useState(''),[hDestination,setHDestination]=useState(''),[hQuality,setHQuality]=useState(''),[hNote,setHNote]=useState('')
 const[hEntryMode,setHEntryMode]=useState<'PER_FIELD'|'TOTAL_AREA_ESTIMATE'>('PER_FIELD'),[hTotalQty,setHTotalQty]=useState('')
 const[showHarvestDetails,setShowHarvestDetails]=useState(false)
 const[sourceFixId,setSourceFixId]=useState(''),[sourceFixField,setSourceFixField]=useState(''),[sourceFixDate,setSourceFixDate]=useState('')
 const[pId,setPId]=useState(''),[pDate,setPDate]=useState(today()),[pType,setPType]=useState('生葉→碾茶'),[pOutputMaterial,setPOutputMaterial]=useState('碾茶'),[pOutput,setPOutput]=useState(''),[pFacility,setPFacility]=useState(''),[pCost,setPCost]=useState('0'),[pOperator,setPOperator]=useState(''),[pNote,setPNote]=useState(''),[sourceInputs,setSourceInputs]=useState<Record<string,string>>({})
 async function refresh(){setLoading(true);setError('');try{const[f,h,b]=await Promise.all([loadHarvestFields(),loadHarvestRecords(),loadProcessingBatches()]);setFields(f);setHarvests(h);setBatches(b)}catch(e:any){setError(e?.message||'摘採・製茶データを読み込めませんでした。')}finally{setLoading(false)}}useEffect(()=>{void refresh()},[])
 const selectedFieldIds=Object.keys(hFieldQty)
 const hField=selectedFieldIds[0]||''
 const selectedFields=fields.filter(f=>selectedFieldIds.includes(f.id))
 const hQty=hEntryMode==='TOTAL_AREA_ESTIMATE'?hTotalQty:String(selectedFieldIds.reduce((total,id)=>total+Number(hFieldQty[id]||0),0))
 const areaBasis=selectedFields.reduce((total,f)=>total+(Number(hFieldAreas[f.id])>0?Number(hFieldAreas[f.id]):f.areaM2),0)
 const hasAllAreas=selectedFieldIds.every(id=>Number(hFieldAreas[id])>0)
 const hArea=hasAllAreas?String(selectedFieldIds.reduce((total,id)=>total+Number(hFieldAreas[id]||0),0)):''
 const hYield=Number(hQty)>0&&areaBasis>0?Number(hQty)/(areaBasis/1000):0
 const varieties=[...new Set(selectedFields.map(f=>f.variety).filter(Boolean))].join('・')||'—'
 const isTotalMode=hEntryMode==='TOTAL_AREA_ESTIMATE'
 const totalIsValid=Number.isFinite(Number(hQty))&&Number(hQty)>0&&Number(hQty)*1000>=selectedFieldIds.length&&!(!isTotalMode&&selectedFieldIds.some(id=>Number(hFieldQty[id])<=0))
 const previewIsReference=selectedFields.some(f=>!hFieldAreas[f.id])
 function changeEntryMode(mode:'PER_FIELD'|'TOTAL_AREA_ESTIMATE'){
  if(mode===hEntryMode)return
  if(mode==='TOTAL_AREA_ESTIMATE')setHTotalQty(Number(hQty)>0?hQty:'')
  else setHFieldQty(old=>Object.fromEntries(Object.keys(old).map(id=>[id,''])))
  setHEntryMode(mode)
 }
 function toggleHarvestField(id:string){
   setHFieldQty(old=>{const next={...old};if(id in next)delete next[id];else next[id]='';return next})
   setHFieldAreas(old=>{const next={...old};delete next[id];return next})
 }
 const currentBatch=batches.find(b=>b.id===pId);const currentSource=new Map((currentBatch?.sources||[]).map(s=>[s.harvestId,s.inputKg]));const availableHarvests=harvests.filter(h=>h.remainingKg+(currentSource.get(h.id)||0)>0)
 const sourceRows=useMemo(()=>availableHarvests.filter(h=>sourceInputs[h.id]!==undefined).map(h=>({h,input:Number(sourceInputs[h.id]||0),available:h.remainingKg+(currentSource.get(h.id)||0)})),[availableHarvests,sourceInputs,pId,batches]);const inputTotal=sourceRows.reduce((s,x)=>s+x.input,0),yieldPct=inputTotal>0?Number(pOutput||0)/inputTotal*100:0
 function resetHarvest(){setHId('');setHDate(today());setHEntryMode('PER_FIELD');setHTotalQty('');setHFieldQty(params.get('field')?{[params.get('field')!] : ''}:{});setHFieldAreas({});setHSeason('');setHMethod('');setHOperator('');setHDestination('');setHQuality('');setHNote('');setShowHarvestDetails(false)}
 function editHarvest(h:HarvestRecord){if(!canManage){setError('摘採記録を編集する権限がありません。');return}
 setTab('harvest');setHId(h.id);setHDate(h.date);setHEntryMode(h.yieldEntryMode);setHTotalQty(String(h.freshLeafKg));
 setHFieldQty(Object.fromEntries(h.fieldYields.map(f=>[f.fieldId,String(f.freshLeafKg)])))
 setHFieldAreas(Object.fromEntries(h.fieldYields.filter(f=>f.harvestedAreaM2!==null).map(f=>[f.fieldId,String(f.harvestedAreaM2)])))
 setHSeason(h.season);setHMethod(h.method);setHOperator(h.operator);setHDestination(h.destination);setHQuality(h.qualityNote);setHNote(h.note);setShowHarvestDetails(true);window.scrollTo({top:0,behavior:'smooth'})
 }
 async function submitHarvest(e:FormEvent){e.preventDefault();if(!canManage)return setError('摘採記録を登録・編集する権限がありません。')
 setBusy(true);setError('');setSuccess('')
 try{
   if(!validHarvestDate(hDate))throw new Error('実際に確認した摘採日を入力してください。日付を自動補完しません。')
   if(!selectedFieldIds.length)throw new Error('圃場を1件以上選択してください。')
   if(!totalIsValid)throw new Error('生葉収量を入力してください。')
   const selected=isTotalMode?allocateHarvestTotalByArea(Number(hQty),selectedFieldIds.map(id=>{
    const field=fields.find(f=>f.id===id)
    if(!field)throw new Error('圃場が見つかりません。')
    return field
   }),hFieldAreas):selectedFieldIds.map(id=>({fieldId:id,freshLeafKg:Number(hFieldQty[id]),harvestedAreaM2:hFieldAreas[id]?Number(hFieldAreas[id]):null}))
   for(const f of selected){
     if(!Number.isFinite(f.freshLeafKg)||f.freshLeafKg<=0)throw new Error('選択したすべての圃場に生葉収量を入力してください。')
     const master=fields.find(x=>x.id===f.fieldId)
     if(!master)throw new Error('圃場が見つかりません。')
     if(f.harvestedAreaM2!==null&&(f.harvestedAreaM2<=0||f.harvestedAreaM2>master.areaM2))throw new Error(master.name+' の摘採面積を確認してください。')
   }
   await saveHarvestRecord({id:hId||undefined,date:hDate,fieldId:hField,yieldEntryMode:hEntryMode,fields:selected,season:hSeason,method:hMethod,freshLeafKg:Number(hQty),harvestedAreaM2:hArea?Number(hArea):null,operator:hOperator,destination:hDestination,qualityNote:hQuality,note:hNote})
   setSuccess(hId?'摘採ロットを更新しました。':'摘採ロットを登録しました。')
   resetHarvest();await refresh()
 }catch(e:any){setError(e?.message||'摘採記録の保存に失敗しました。')}finally{setBusy(false)}
 }
 async function finalizeSource(h:HarvestRecord){
   if(!canManage)return setError('摘採元を確定する権限がありません。')
   if(!sourceFixField)return setError('圃場を選択してください。')
   const field=fields.find(f=>f.id===sourceFixField)
   if(!field)return setError('圃場が見つかりません。')
   const label=h.sourceLotNo?'JAロット '+h.sourceLotNo:h.legacyId
   if(!window.confirm(label+' の圃場を「'+field.legacyId+' '+field.name+'」として確定しますか？'))return
   setBusy(true);setError('')
   try{
     await finalizeImportedHarvestSource(h.id,sourceFixField,sourceFixDate||undefined)
     setSuccess(label+' の摘採元を確定しました。販売までのトレーサビリティへ反映されます。')
     setSourceFixId('');setSourceFixField('');setSourceFixDate('')
     await refresh()
   }catch(e:any){setError(e?.message||'摘採元を確定できませんでした。')}finally{setBusy(false)}
 }
 async function removeHarvest(h:HarvestRecord){if(!canDelete)return setError('摘採記録を削除する権限がありません。');const reason=window.prompt('摘採記録を削除する理由を入力してください。','入力誤り');if(reason===null)return;setBusy(true);try{await deleteHarvestRecord(h.id,reason);setSuccess('摘採記録を削除しました。');await refresh()}catch(e:any){setError(e?.message||'削除できませんでした。')}finally{setBusy(false)}}
 function resetProcess(){setPId('');setPDate(today());setPType('生葉→碾茶');setPOutputMaterial('碾茶');setPOutput('');setPFacility('');setPCost('0');setPOperator('');setPNote('');setSourceInputs({})}
 function editProcess(b:ProcessingBatch){if(!canManage){setError('製茶実績を編集する権限がありません。');return}setTab('process');setPId(b.id);setPDate(b.date);setPType(b.processType);setPOutputMaterial(b.outputMaterial);setPOutput(String(b.outputKg));setPFacility(b.facility);setPCost(String(b.costYen));setPOperator(b.operator);setPNote(b.note);setSourceInputs(Object.fromEntries(b.sources.map(s=>[s.harvestId,String(s.inputKg)])));window.scrollTo({top:0,behavior:'smooth'})}
 function startTenchaProcessing(h:HarvestRecord){
   if(!canManage||h.remainingKg<=0)return
   resetProcess();setSourceInputs({[h.id]:String(Number(h.remainingKg.toFixed(3)))})
   setTab('process');window.scrollTo({top:0,behavior:'smooth'})
 }
 function toggleSource(h:HarvestRecord){setSourceInputs(old=>{const next={...old};if(next[h.id]!==undefined)delete next[h.id];else next[h.id]=String((h.remainingKg+(currentSource.get(h.id)||0)).toFixed(3));return next})}
 async function submitProcess(e:FormEvent){e.preventDefault();if(!canManage)return setError('製茶実績を登録・編集する権限がありません。');setBusy(true);setError('');setSuccess('');try{const sources=sourceRows.filter(x=>x.input>0);if(!sources.length)throw new Error('原料となる摘採記録を選択してください。');for(const x of sources)if(x.input>x.available+0.0005)throw new Error(`${x.h.legacyId} の未加工残量を超えています。`);if(Number(pOutput)<=0)throw new Error('出来高を入力してください。');if(Number(pOutput)>inputTotal+0.0005)throw new Error('出来高が生葉投入量を超えています。');await saveProcessingBatch({id:pId||undefined,date:pDate,processType:pType,outputMaterial:pOutputMaterial,outputKg:Number(pOutput),facility:pFacility,costYen:Number(pCost||0),operator:pOperator,note:pNote,sources:sources.map(x=>({harvestId:x.h.id,inputKg:x.input}))});setSuccess(pId?'製茶実績を更新しました。':'製茶実績を登録しました。');resetProcess();await refresh()}catch(e:any){setError(e?.message||'製茶実績の保存に失敗しました。')}finally{setBusy(false)}}
 async function removeProcess(b:ProcessingBatch){if(!canDelete)return setError('製茶実績を削除する権限がありません。');const reason=window.prompt('製茶実績を削除する理由を入力してください。削除すると原料の未加工残量へ戻ります。','入力誤り');if(reason===null)return;setBusy(true);try{await deleteProcessingBatch(b.id,reason);setSuccess('製茶実績を削除しました。');await refresh()}catch(e:any){setError(e?.message||'削除できませんでした。')}finally{setBusy(false)}}
 const harvestReadiness=useMemo(()=>summarizeHarvestProvenance(harvests),[harvests]);
 const freshTotal=harvests.reduce((s,h)=>s+h.freshLeafKg,0),unprocessedTotal=harvests.reduce((s,h)=>s+h.remainingKg,0),processedOutput=batches.reduce((s,b)=>s+b.totalOutputKg,0)
 return <div className="page harvest-page"><div className="page-head"><div><p className="eyebrow">HARVEST & PROCESSING</p><h1>摘採・製茶</h1><p className="sub">圃場の生葉収量から製茶バッチ・歩留までつなげて記録します。</p></div><button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div>{error&&<div className="notice error dashboard-notice">{error}</div>}{success&&<div className="notice success dashboard-notice">{success}</div>}
 <div className="metrics harvest-metrics"><article className="metric"><span>生葉収量</span><strong>{num.format(freshTotal)}kg</strong></article><article className="metric"><span>未加工生葉</span><strong>{num.format(unprocessedTotal)}kg</strong></article><article className="metric"><span>製茶バッチ</span><strong>{batches.length}件</strong></article><article className="metric"><span>製茶総出来高</span><strong>{num.format(processedOutput)}kg</strong></article></div>
 <div className="harvest-tabs"><button className={tab==='harvest'?'active':''} onClick={()=>setTab('harvest')}><Scissors size={17}/>摘採</button><button className={tab==='process'?'active':''} onClick={()=>setTab('process')}><Factory size={17}/>製茶</button></div>
 {tab==='harvest'?<>{canManage&&<form className="panel harvest-form" onSubmit={submitHarvest}><div className="panel-title"><div><h2>{hId?'摘採記録を編集':'摘採を記録'}</h2><p>現場では「日付・圃場・茶期・摘採方法・生葉量」だけで登録できます。</p></div>{hId&&<button type="button" className="secondary-button" onClick={resetHarvest}>新規へ戻る</button>}</div><div className="form-grid harvest-core-grid"><label>摘採日（実際の日付・必須）<input type="date" required value={hDate} onChange={e=>setHDate(e.target.value)}/></label><label className="harvest-season-input">茶期<input list="season-list" value={hSeason} onChange={e=>setHSeason(e.target.value)} placeholder="一番茶"/><datalist id="season-list"><option value="一番茶"/><option value="二番茶"/><option value="秋番茶"/><option value="刈番茶"/></datalist></label><label className="harvest-method-input">摘採方法<input list="harvest-method-list" value={hMethod} onChange={e=>setHMethod(e.target.value)} placeholder="手摘み / ハサミ"/><datalist id="harvest-method-list"><option value="手摘み"/><option value="ハサミ摘み"/><option value="乗用摘採"/></datalist></label><label className="harvest-qty-input">生葉合計（kg）<input type="number" inputMode="decimal" step="0.001" min="0.001" required={isTotalMode} value={isTotalMode?hTotalQty:Number(hQty).toFixed(3)} readOnly={!isTotalMode} onChange={e=>setHTotalQty(e.target.value)} placeholder={isTotalMode?'合計kgを入力':'圃場別収量の合計'} /></label></div>
 <div className="harvest-entry-mode" role="group" aria-label="生葉収量の入力方法">
  <div className="harvest-entry-switch"><button type="button" className={!isTotalMode?'selected':''} aria-pressed={!isTotalMode} onClick={()=>changeEntryMode('PER_FIELD')}>圃場別に入力</button><button type="button" className={isTotalMode?'selected':''} aria-pressed={isTotalMode} onClick={()=>changeEntryMode('TOTAL_AREA_ESTIMATE')}>合計のみ入力</button></div>
  <p>{isTotalMode?'合計の実測kgのみを入力できます。圃場別収量は面積比で参考按分し、実測値と区別して保存します。':'選択した圃場ごとの実測生葉量を入力すると、合計を自動計算します。'}</p>
 </div><div className="harvest-multi-field-picker">
  <div className="field-picker-head"><b>圃場を複数選択</b><span>選択 {selectedFieldIds.length}圃場 / 生葉合計 {num.format(Number(hQty))}kg</span></div>
  <div className="harvest-multi-field-list">{fields.map(f=>{
    const selected=f.id in hFieldQty
    return <div key={f.id} className={`harvest-multi-field-row ${selected?'selected':''}`}>
      <label className="harvest-field-check"><input type="checkbox" checked={selected} onChange={()=>toggleHarvestField(f.id)}/><span><b>{f.legacyId} {f.name}</b><small>{num.format(f.areaM2)}㎡{f.variety?` / ${f.variety}`:''}</small></span></label>
      {selected&&<div className="harvest-field-values">
 {!isTotalMode&&<label>生葉収量（kg）<input type="number" inputMode="decimal" min="0.001" step="0.001" required value={hFieldQty[f.id]} onChange={e=>setHFieldQty(old=>({...old,[f.id]:e.target.value}))} placeholder="例：12.5"/></label>}
 <label>摘採面積（㎡・任意）<input type="number" inputMode="decimal" min="0.1" max={f.areaM2} step="0.1" value={hFieldAreas[f.id]||''} onChange={e=>setHFieldAreas(old=>({...old,[f.id]:e.target.value}))} placeholder={String(f.areaM2)}/></label>
 </div>}
    </div>
  })}</div>
 </div><div className="harvest-quick-picks"><div><span>茶期</span><button type="button" className={hSeason==="一番茶"?"active":""} onClick={()=>setHSeason("一番茶")}>一番茶</button><button type="button" className={hSeason==="二番茶"?"active":""} onClick={()=>setHSeason("二番茶")}>二番茶</button><button type="button" className={hSeason==="秋番茶"?"active":""} onClick={()=>setHSeason("秋番茶")}>秋番茶</button></div><div><span>摘採方法</span><button type="button" className={hMethod==="手摘み"?"active":""} onClick={()=>setHMethod("手摘み")}>手摘み</button><button type="button" className={hMethod==="ハサミ摘み"?"active":""} onClick={()=>setHMethod("ハサミ摘み")}>ハサミ</button><button type="button" className={hMethod==="乗用摘採"?"active":""} onClick={()=>setHMethod("乗用摘採")}>乗用</button></div></div><div className="harvest-yield-preview"><div><span>計算面積{previewIsReference?"（圃場全面積を含む参考）":"（実測）"}</span><b>{areaBasis?`${num.format(areaBasis)}㎡`:'—'}</b></div><div><span>参考：1反（1,000㎡）あたり平均収量</span><b>{hYield?`${num.format(hYield)}kg/反`:'—'}</b></div><div><span>圃場品種</span><b>{varieties}</b></div></div>{selectedFieldIds.length>0&&<p className="harvest-area-note">{previewIsReference?'※ 摘採面積が未入力の圃場は、登録済みの圃場全面積を用いた参考計算です。':'※ 入力した摘採面積を合算して計算しています。'}{isTotalMode?' 圃場別の生葉量は面積按分の推定値です。':''}{previewIsReference?' 実測した摘採面積がない記録は、AIの面積・収量集計では未確定と扱います。':''}</p>}<button type="button" className="harvest-detail-toggle" onClick={()=>setShowHarvestDetails(v=>!v)}>{showHarvestDetails?'詳細入力を閉じる' :'担当者・搬入先・品質メモを入力'}</button>{showHarvestDetails&&<div className="harvest-detail-panel"><div className="form-grid three"><div className="harvest-area-help">摘採面積は上の圃場別入力欄で指定できます。</div><label>担当者<input value={hOperator} onChange={e=>setHOperator(e.target.value)}/></label><label>搬入先・販売先<input value={hDestination} onChange={e=>setHDestination(e.target.value)} placeholder="製茶工場 / 生葉売却先"/></label></div><label>品質メモ<textarea rows={2} value={hQuality} onChange={e=>setHQuality(e.target.value)} placeholder="芽の状態、水分、等級など"/></label><label>備考<textarea rows={2} value={hNote} onChange={e=>setHNote(e.target.value)}/></label></div>}<button className="primary-button harvest-save" disabled={busy||!selectedFieldIds.length||!totalIsValid||!hSeason||!hMethod}>{busy?'保存中…':hId?'変更を保存':'摘採を登録'}</button></form>}
 <section className="panel harvest-history"><div className="panel-title"><div><h2>摘採履歴</h2><p>未加工残量も自動追跡 ／ AI集計に必要な日付・圃場・実測面積を区別</p></div><Leaf size={19}/></div><p className="harvest-provenance-summary">期間別集計に必要な記録が揃った摘採：{harvestReadiness.ready}件 ／ 未確定：{harvestReadiness.incomplete}件（出所未特定 {harvestReadiness.unattributed}件・面積未確認 {harvestReadiness.areaUnverified}件・重量要確認 {harvestReadiness.quantityUnverified}件）。未確定の履歴を自動補完しません。</p><div className="harvest-history-list">{harvests.map(h=><article key={h.id}>
<div><span>{h.date||'摘採日未特定'}｜{h.season||'茶期未入力'}</span><h3>{h.fieldLegacyId} {h.fieldName}</h3><small><strong>摘採LOT：{h.legacyId}</strong><span className={`harvest-provenance-tag ${inspectHarvestProvenance(h).periodAggregationReady?"verified":"needs-evidence"}`}>{inspectHarvestProvenance(h).label}</span>{h.yieldEntryMode==='TOTAL_AREA_ESTIMATE'?' / 圃場別収量は面積按分（推定）':''}{h.sourceLotNo?' / JAロット '+h.sourceLotNo:''}{h.variety?' / '+h.variety:''} / {h.method||'方法未入力'} / {h.operator||'担当未入力'}</small>{h.fieldYields.length>0&&<div className="harvest-field-breakdown">{h.fieldYields.map(f=><span key={f.fieldId}>{f.fieldLegacyId} {f.fieldName}：{num.format(f.freshLeafKg)}kg{h.yieldEntryMode==='TOTAL_AREA_ESTIMATE'?'（推定）':''}</span>)}</div>}</div>
<div className="harvest-qty"><strong>{num.format(h.freshLeafKg)}kg</strong><span>{h.yieldKgPer10a?'参考平均 '+num.format(h.yieldKgPer10a)+'kg/反':'参考平均 未算定'}</span></div>
<div className="harvest-use"><span>製茶使用 {num.format(h.processedKg)}kg</span><b>未加工 {num.format(h.remainingKg)}kg</b></div>
{(canManage||canDelete)&&<div className="harvest-row-actions">
 {canManage&&h.fieldId&&h.date&&<button onClick={()=>editHarvest(h)}><Edit3 size={14}/>編集</button>}{canManage&&h.remainingKg>0&&<button type="button" onClick={()=>startTenchaProcessing(h)}><Factory size={14}/>このLOTを碾茶加工</button>}
 {canManage&&(!h.fieldId||!h.date)&&<button onClick={()=>{setSourceFixId(h.id);setSourceFixField(h.fieldId||'');setSourceFixDate(h.date||'')}}><Edit3 size={14}/>摘採元を確定</button>}
 {canDelete&&<button className="danger-text-button" onClick={()=>void removeHarvest(h)} disabled={busy}><Trash2 size={14}/>削除</button>}
</div>}
{sourceFixId===h.id&&<div className="harvest-source-fix">
 <div><b>摘採元を確定</b><span>過去の取り込みロットは確かな資料で確認できた圃場・日付だけを登録してください。圃場は確定後、この画面から別圃場へ変更できません。日付不明なら空欄のままにしてください。</span></div>
 <label>圃場<select value={sourceFixField} disabled={!!h.fieldId} onChange={e=>setSourceFixField(e.target.value)}><option value="">選択</option>{fields.map(f=><option key={f.id} value={f.id}>{f.legacyId} {f.name}</option>)}</select></label>
 <label>摘採日（資料で確認できた場合のみ）<input type="date" value={sourceFixDate} onChange={e=>setSourceFixDate(e.target.value)}/></label>
 <div><button type="button" className="secondary-button" onClick={()=>{setSourceFixId('');setSourceFixField('');setSourceFixDate('')}}>キャンセル</button><button type="button" className="primary-button" disabled={busy||!sourceFixField} onClick={()=>void finalizeSource(h)}>確定</button></div>
</div>}
</article>)}{!loading&&!harvests.length&&<p className="empty">摘採記録はまだありません。</p>}</div></section></>:
 <>{canManage&&<form className="panel processing-form" onSubmit={submitProcess}><div className="panel-title"><div><h2>{pId?'製茶実績を編集':'製茶を記録'}</h2><p>複数圃場の摘採を1つの製茶バッチへまとめられます。</p></div>{pId&&<button type="button" className="secondary-button" onClick={resetProcess}>新規へ戻る</button>}</div><div className="form-grid four"><label>製茶日<input type="date" value={pDate} onChange={e=>setPDate(e.target.value)}/></label><label>工程<input list="process-type-list" value={pType} onChange={e=>setPType(e.target.value)} required placeholder="生葉→碾茶"/><datalist id="process-type-list"><option value="生葉→碾茶"/><option value="生葉→玉露"/><option value="生葉→煎茶"/><option value="生葉→番茶"/></datalist></label><label>出来上がり品目<input value={pOutputMaterial} onChange={e=>setPOutputMaterial(e.target.value)} required placeholder="碾茶"/></label><label>製茶工場<input value={pFacility} onChange={e=>setPFacility(e.target.value)}/></label><label>出来高（kg）<input type="number" inputMode="decimal" min="0.001" step="0.001" value={pOutput} onChange={e=>setPOutput(e.target.value)} required/></label><label>加工費（円・合計）<input type="number" inputMode="numeric" min="0" step="1" value={pCost} onChange={e=>setPCost(e.target.value)}/></label><label>担当者<input value={pOperator} onChange={e=>setPOperator(e.target.value)}/></label></div><div className="processing-sources"><div className="section-head"><div><h3>原料となる摘採</h3><p className="muted">選択した摘採の投入kgを指定</p></div><b>{Object.keys(sourceInputs).length}件</b></div>{availableHarvests.map(h=>{const selected=sourceInputs[h.id]!==undefined;const available=h.remainingKg+(currentSource.get(h.id)||0);return <div className={`processing-source-row ${selected?'selected':''}`} key={h.id}><button type="button" onClick={()=>toggleSource(h)}><span>{h.date}｜摘採LOT {h.legacyId}</span><b>{h.fieldName} / {h.season||'茶期未入力'}</b><small>利用可能 {num.format(available)}kg</small></button>{selected&&<label>投入kg<input type="number" inputMode="decimal" min="0.001" max={available} step="0.001" value={sourceInputs[h.id]} onChange={e=>setSourceInputs(old=>({...old,[h.id]:e.target.value}))}/></label>}</div>})}{!availableHarvests.length&&<p className="empty">製茶に使える未加工の摘採記録がありません。</p>}</div><div className="processing-summary"><div><span>生葉投入</span><b>{num.format(inputTotal)}kg</b></div><div><span>出来高</span><b>{num.format(Number(pOutput||0))}kg</b></div><div><span>歩留</span><b>{inputTotal?`${yieldPct.toFixed(2)}%`:'—'}</b></div></div><label>備考<textarea rows={2} value={pNote} onChange={e=>setPNote(e.target.value)}/></label><button className="primary-button harvest-save" disabled={busy}>{busy?'保存中…':pId?'変更を保存':'製茶を登録'}</button></form>}
 <section className="panel processing-history"><div className="panel-title"><div><h2>製茶履歴</h2><p>生葉投入・出来高・歩留</p></div><Factory size={19}/></div><div className="processing-history-list">{batches.map(b=><article key={b.id}><div className="processing-history-head"><div><span>{b.date}</span><h3>{b.outputMaterial}｜{b.processType}</h3><small>{b.legacyId}{b.sourceLotNo?` / JAロット ${b.sourceLotNo}`:''}{b.variety?` / ${b.variety}`:''} / {b.facility||'工場未入力'}</small></div><div><strong>葉 {num.format(b.outputKg)}kg</strong><span>骨 {num.format(b.stemOutputKg)}kg / 総歩留 {b.yieldPct.toFixed(2)}%</span></div></div><div className="processing-history-sources">{b.sources.map(s=><span key={s.id}>摘採LOT {s.harvestLegacyId} / {s.fieldLegacyId} {s.fieldName}：{num.format(s.inputKg)}kg</span>)}</div><div className="processing-history-foot"><b>生葉投入 {num.format(b.inputKg)}kg / 総出来高 {num.format(b.totalOutputKg)}kg</b><span>葉歩留 {b.leafYieldPct.toFixed(2)}%{b.costYen?` / 加工費 ¥${Math.round(b.costYen).toLocaleString()}`:' / 加工費未入力'}</span>{(canManage||canDelete)&&<div>{canManage&&<button onClick={()=>editProcess(b)}><Edit3 size={14}/>編集</button>}{canDelete&&<button className="danger-text-button" onClick={()=>void removeProcess(b)} disabled={busy}><Trash2 size={14}/>削除</button>}</div>}</div></article>)}{!loading&&!batches.length&&<p className="empty">製茶実績はまだありません。</p>}</div></section></>}
 </div>
}