import { useEffect, useMemo, useState } from 'react'
import { Boxes, Factory, RefreshCw } from 'lucide-react'
import { loadTeaInventoryBatches, type TeaInventoryBatch } from '../lib/teaInventory'

const num=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:3})

export default function TeaInventoryPage(){
  const[rows,setRows]=useState<TeaInventoryBatch[]>([])
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const[year,setYear]=useState('all')
  const[season,setSeason]=useState('all')

  async function refresh(){
    setLoading(true);setError('')
    try{setRows(await loadTeaInventoryBatches())}
    catch(e:any){setError(e?.message||'茶在庫を読み込めませんでした。')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])

  const years=useMemo(()=>[...new Set(rows.map(x=>x.cropYear))].sort((a,b)=>b-a),[rows])
  const seasons=useMemo(()=>[...new Set(rows.map(x=>x.season))],[rows])
  const filtered=useMemo(()=>rows.filter(x=>(year==='all'||String(x.cropYear)===year)&&(season==='all'||x.season===season)),[rows,year,season])

  const fresh=filtered.reduce((s,x)=>s+x.freshLeafKg,0)
  const output=filtered.reduce((s,x)=>s+x.outputKg,0)
  const stock=filtered.reduce((s,x)=>s+x.balanceKg,0)
  const bags=filtered.reduce((s,x)=>s+x.bagCount,0)
  const leaf=filtered.flatMap(x=>x.outputs).filter(x=>x.grade==='葉').reduce((s,x)=>s+x.outputKg,0)
  const leafBags=filtered.flatMap(x=>x.outputs).filter(x=>x.grade==='葉').reduce((s,x)=>s+x.bagCount,0)
  const bone=filtered.flatMap(x=>x.outputs).filter(x=>x.grade==='骨').reduce((s,x)=>s+x.outputKg,0)
  const boneBags=filtered.flatMap(x=>x.outputs).filter(x=>x.grade==='骨').reduce((s,x)=>s+x.bagCount,0)
  const yieldPct=fresh>0?output/fresh*100:0

  return <div className="page harvest-page">
    <div className="page-head">
      <div><p className="eyebrow">TEA INVENTORY</p><h1>茶在庫</h1><p className="sub">生葉投入から碾茶の葉・骨ロット、現在庫まで追跡します。</p></div>
      <button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button>
    </div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}

    <section className="panel">
      <div className="panel-title"><div><h2>表示条件</h2><p>年・茶期で在庫を絞り込みます。</p></div><Boxes size={19}/></div>
      <div className="form-grid four">
        <label>年度<select value={year} onChange={e=>setYear(e.target.value)}><option value="all">すべて</option>{years.map(y=><option key={y} value={y}>{y}年</option>)}</select></label>
        <label>茶期<select value={season} onChange={e=>setSeason(e.target.value)}><option value="all">すべて</option>{seasons.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
      </div>
    </section>

    <div className="notice dashboard-notice">JA出荷日・冷蔵庫持込日は原票の物流日付です。摘採日・製茶日としては扱っていません。</div>

    <div className="metrics harvest-metrics">
      <article className="metric"><span>生葉投入</span><strong>{num.format(fresh)}kg</strong></article>
      <article className="metric"><span>碾茶出来高</span><strong>{num.format(output)}kg</strong></article>
      <article className="metric"><span>現在庫</span><strong>{num.format(stock)}kg</strong></article>
      <article className="metric"><span>歩留</span><strong>{fresh?yieldPct.toFixed(2)+'%':'—'}</strong></article>
    </div>
    <div className="metrics harvest-metrics">
      <article className="metric"><span>葉</span><strong>{num.format(leaf)}kg</strong><small>{leafBags}本</small></article>
      <article className="metric"><span>骨</span><strong>{num.format(bone)}kg</strong><small>{boneBags}本</small></article>
      <article className="metric"><span>合計本数</span><strong>{bags}本</strong></article>
      <article className="metric"><span>ロット数</span><strong>{filtered.length}件</strong></article>
    </div>

    <section className="panel processing-history">
      <div className="panel-title"><div><h2>碾茶ロット</h2><p>生葉投入・葉/骨出来高・実在庫残をロット単位で表示</p></div><Factory size={19}/></div>
      <div className="processing-history-list">
        {filtered.map(b=><article key={b.id}>
          <div className="processing-history-head">
            <div><span>{b.cropYear}年 {b.season}</span><h3>JAロット {b.lotNo}｜{b.variety||'品種未入力'} / {b.pickingMethod||'摘み方未入力'}</h3><small>JA出荷 {b.jaShipmentDate||'—'} / 冷蔵庫持込 {b.coldStorageDate||'—'} / {b.storageLocation||'保管場所未入力'}</small></div>
            <div><strong>{num.format(b.outputKg)}kg</strong><span>歩留 {b.yieldPct.toFixed(2)}%</span></div>
          </div>
          <div className="processing-history-sources">
            {b.outputs.map(o=><span key={o.id}>{o.grade}：{num.format(o.outputKg)}kg / {o.bagCount}本 / 在庫 {num.format(o.balanceKg)}kg</span>)}
          </div>
          <div className="processing-history-foot"><b>生葉投入 {num.format(b.freshLeafKg)}kg</b><span>現在庫 {num.format(b.balanceKg)}kg</span><span>{b.sourceFile||''}</span></div>
        </article>)}
        {!loading&&!filtered.length&&<p className="empty">茶在庫データはありません。</p>}
      </div>
    </section>
  </div>
}
