import { useEffect, useState } from 'react'
import { ArrowRight, Factory, PackageCheck, RefreshCw, Scissors } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadManufacturingBatches, loadProductionLots } from '../lib/production'
const yen=new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0})
const num=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:3})
export default function ProductionDashboardPanel(){
 const[value,setValue]=useState(0),[lots,setLots]=useState(0),[products,setProducts]=useState(0),[last,setLast]=useState<{date:string;process:string;material:string;qty:number;unit:string}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 async function refresh(){setLoading(true);setError('');try{const[l,b]=await Promise.all([loadProductionLots(),loadManufacturingBatches(1)]);const active=l.filter(x=>x.balance>0.0005);setValue(active.reduce((s,x)=>s+x.inventoryValueYen,0));setLots(active.length);setProducts(active.filter(x=>x.category==='製品').length);const x=b[0];setLast(x?{date:x.date,process:x.processType,material:x.outputMaterial,qty:x.outputQty,unit:x.outputUnit}:null)}catch(e:any){setError(e?.message||'製造情報を取得できませんでした。')}finally{setLoading(false)}}
 useEffect(()=>{void refresh()},[])
 return <section className="panel production-dashboard-panel"><div className="panel-title"><div><h2>摘採・製茶・製造</h2><p>製茶出来高から二次加工・製品在庫・原価まで</p></div><button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16} className={loading?'spin':''}/></button></div>{error&&<div className="notice error">{error}</div>}<div className="production-dashboard-metrics"><div><span>原料・製品在庫評価</span><b>{yen.format(value)}</b></div><div><span>在庫ありロット</span><b>{lots}件</b></div><div><span>製品ロット</span><b>{products}件</b></div></div><div className="production-dashboard-last"><Factory size={19}/><div><span>直近の二次加工</span>{last?<><b>{last.date}｜{last.process}</b><small>{last.material} {num.format(last.qty)} {last.unit}</small></>:<b>記録なし</b>}</div></div><div className="production-dashboard-actions"><Link to="/harvests"><Scissors size={14}/>摘採・製茶</Link><Link to="/production"><PackageCheck size={14}/>製造・製品在庫<ArrowRight size={14}/></Link></div></section>
}
