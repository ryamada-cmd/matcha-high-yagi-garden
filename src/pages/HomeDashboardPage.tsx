import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CircleAlert, Factory, Leaf, PackageCheck, RefreshCw, Scissors, ShieldAlert, SprayCan } from 'lucide-react'
import WeatherPanel from '../components/WeatherPanel'
import { loadDashboard, type DashboardAlert, type DashboardData } from '../lib/dashboard'
import { loadFertilizerDashboard, type FertilizerDashboardData } from '../lib/fertilizerDashboard'
import { loadHarvestRecords, loadProcessingBatches, type HarvestRecord, type ProcessingBatch } from '../lib/harvestProcessing'
import { loadManufacturingBatches, loadProductionLots, type ManufacturingBatch, type ProductionLot } from '../lib/production'

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const currentYear = () => Number(new Intl.DateTimeFormat('en', { year: 'numeric' }).format(new Date()))

function AlertIcon({ severity }: { severity: DashboardAlert['severity'] }) {
  if (severity === 'critical') return <ShieldAlert size={20}/>
  if (severity === 'warning') return <AlertTriangle size={20}/>
  return <CircleAlert size={20}/>
}

type HomeData = {
  defense: DashboardData
  fertilizer: FertilizerDashboardData
  harvests: HarvestRecord[]
  processing: ProcessingBatch[]
  lots: ProductionLot[]
  manufacturing: ManufacturingBatch[]
}

export default function HomeDashboardPage() {
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true); setError('')
    try {
      const [defense, fertilizer, harvests, processing, lots, manufacturing] = await Promise.all([
        loadDashboard(), loadFertilizerDashboard(), loadHarvestRecords(300), loadProcessingBatches(200), loadProductionLots(), loadManufacturingBatches(100),
      ])
      setData({ defense, fertilizer, harvests, processing, lots, manufacturing })
    } catch (e: any) {
      setError(e?.message || '茶園ダッシュボードを読み込めませんでした。')
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])

  const year = currentYear()
  const summary = useMemo(() => {
    if (!data) return null
    const yearText = String(year)
    const harvests = data.harvests.filter(x => x.date.startsWith(yearText))
    const processing = data.processing.filter(x => x.date.startsWith(yearText))
    const manufacturing = data.manufacturing.filter(x => x.date.startsWith(yearText))
    const activeLots = data.lots.filter(x => x.balance > 0.0005)
    const productLots = activeLots.filter(x => x.category === '製品')
    return {
      freshLeafKg: harvests.reduce((s, x) => s + x.freshLeafKg, 0),
      harvestCount: harvests.length,
      primaryOutputKg: processing.reduce((s, x) => s + x.outputKg, 0),
      processingCount: processing.length,
      manufacturingCount: manufacturing.length,
      inventoryValue: activeLots.reduce((s, x) => s + x.inventoryValueYen, 0),
      activeLots: activeLots.length,
      productLots: productLots.length,
      productValue: productLots.reduce((s, x) => s + x.inventoryValueYen, 0),
      lastManufacturing: manufacturing[0] || null,
    }
  }, [data, year])

  const topCards = [
    { label: '今日の要確認', value: data ? `${data.defense.attentionCount}件` : '—', note: data ? `重要 ${data.defense.criticalCount} / 注意 ${data.defense.warningCount}` : '', tone: data?.defense.criticalCount ? 'danger' : data?.defense.warningCount ? 'warning' : 'ok' },
    { label: '管理圃場', value: data ? `${data.defense.readiness.harvestTotal}圃場` : '—', note: '防除・施肥・収穫を共通管理' },
    { label: '農薬在庫', value: data ? `${data.defense.stockLots}ロット` : '—', note: data ? yen.format(data.defense.stockValue) : '' },
    { label: '肥料在庫', value: data ? `${num.format(data.fertilizer.stockKg)}kg` : '—', note: data ? `${data.fertilizer.stockLots}ロット` : '' },
    { label: `${year}年 生葉収量`, value: summary ? `${num.format(summary.freshLeafKg)}kg` : '—', note: summary ? `${summary.harvestCount}回摘採` : '' },
    { label: '原料・製品在庫評価', value: summary ? yen.format(summary.inventoryValue) : '—', note: summary ? `${summary.activeLots}ロット / 製品 ${summary.productLots}` : '' },
  ]

  return <div className="page home-dashboard">
    <div className="page-head home-dashboard-head">
      <div><p className="eyebrow">GODAI-ME YAGI ICHIBEI</p><h1>茶園管理ダッシュボード</h1><p className="sub">防除・施肥・摘採・製茶・製造・在庫・原価をひとつのホーム画面で確認します。</p></div>
      <div className="head-actions"><span className="status">茶園管理 接続済</span><button className="icon-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={18} className={loading ? 'spin' : ''}/></button></div>
    </div>

    {error && <div className="notice error dashboard-notice">{error}</div>}

    <div className="home-overview-metrics">
      {topCards.map(card => <article className={`home-overview-card ${card.tone || ''}`} key={card.label}><span>{card.label}</span><strong>{loading && !data ? '…' : card.value}</strong><small>{card.note}</small></article>)}
    </div>

    <section className="home-quick-actions" aria-label="主要作業">
      <Link to="/sprays"><span className="home-action-icon spray"><SprayCan size={20}/></span><div><b>散布を記録</b><small>農薬・圃場・散布量</small></div><ArrowRight size={17}/></Link>
      <Link to="/fertilizer-applications"><span className="home-action-icon fertilizer"><Leaf size={20}/></span><div><b>施肥を記録</b><small>肥料・施肥量・N/P/K</small></div><ArrowRight size={17}/></Link>
      <Link to="/harvests"><span className="home-action-icon harvest"><Scissors size={20}/></span><div><b>摘採・製茶</b><small>生葉収量・歩留</small></div><ArrowRight size={17}/></Link>
      <Link to="/production"><span className="home-action-icon production"><Factory size={20}/></span><div><b>製造・製品在庫</b><small>二次加工・原価</small></div><ArrowRight size={17}/></Link>
    </section>

    <WeatherPanel/>

    <section className="panel attention-panel home-attention-panel">
      <div className="panel-title attention-title"><div><h2>今日の確認事項</h2><p>安全・在庫・予定に関する自動チェック</p></div>{data && <span className={data.defense.criticalCount ? 'attention-badge critical' : data.defense.warningCount ? 'attention-badge warning' : 'attention-badge ok'}>{data.defense.criticalCount ? `重要 ${data.defense.criticalCount}` : data.defense.warningCount ? `注意 ${data.defense.warningCount}` : '問題なし'}</span>}</div>
      {!loading && data?.defense.alerts.length === 0 && <div className="all-clear"><CheckCircle2 size={24}/><div><b>現在、自動検出された要確認事項はありません。</b><span>防除・施肥・収穫・製造の登録内容を引き続き確認してください。</span></div></div>}
      <div className="attention-list">{(data?.defense.alerts || []).slice(0, 8).map(alert => <article className={`attention-item ${alert.severity}`} key={alert.id}><div className="attention-icon"><AlertIcon severity={alert.severity}/></div><div className="attention-copy"><b>{alert.title}</b><span>{alert.detail}</span></div><Link to={alert.href}>{alert.action}<ArrowRight size={15}/></Link></article>)}</div>
    </section>

    <div className="home-module-grid">
      <section className="panel home-module-card defense">
        <div className="home-module-title"><span><SprayCan size={19}/></span><div><h2>防除</h2><p>農薬在庫・年間計画・散布実績</p></div></div>
        <div className="home-module-stats"><div><span>農薬在庫評価</span><b>{data ? yen.format(data.defense.stockValue) : '—'}</b></div><div><span>次の防除</span><b>{data?.defense.nextPlan?.label || '予定なし'}</b><small>{data?.defense.nextPlan?.target || ''}</small></div><div><span>前回散布</span><b>{data?.defense.lastSpray?.date || '記録なし'}</b><small>{data?.defense.lastSpray?.target || ''}</small></div></div>
        <div className="home-module-links"><Link to="/sprays">散布</Link><Link to="/spray-history">履歴</Link><Link to="/inventory">農薬在庫</Link><Link to="/plans">年間計画</Link></div>
      </section>

      <section className="panel home-module-card fertilizer">
        <div className="home-module-title"><span><Leaf size={19}/></span><div><h2>施肥</h2><p>肥料在庫・年間施肥・N/P/K</p></div></div>
        <div className="home-module-stats"><div><span>肥料在庫</span><b>{data ? `${num.format(data.fertilizer.stockKg)}kg` : '—'}</b><small>{data ? `${data.fertilizer.stockLots}ロット` : ''}</small></div><div><span>今年のN / P / K</span><b>{data ? `${num.format(data.fertilizer.nKg)} / ${num.format(data.fertilizer.pKg)} / ${num.format(data.fertilizer.kKg)}kg` : '—'}</b></div><div><span>次回施肥</span><b>{data?.fertilizer.nextPlan?.label || '予定なし'}</b><small>{data?.fertilizer.nextPlan?.purpose || ''}</small></div></div>
        <div className="home-module-links"><Link to="/fertilizer-applications">施肥</Link><Link to="/fertilizer-history">履歴</Link><Link to="/fertilizer-inventory">肥料在庫</Link><Link to="/fertilizer-plans">年間計画</Link></div>
      </section>

      <section className="panel home-module-card production">
        <div className="home-module-title"><span><Factory size={19}/></span><div><h2>収穫・製造</h2><p>摘採・製茶・二次加工・製品原価</p></div></div>
        <div className="home-module-stats"><div><span>今年の生葉 / 一次製茶</span><b>{summary ? `${num.format(summary.freshLeafKg)} / ${num.format(summary.primaryOutputKg)}kg` : '—'}</b><small>{summary ? `摘採 ${summary.harvestCount}回 / 製茶 ${summary.processingCount}回` : ''}</small></div><div><span>原料・製品在庫</span><b>{summary ? yen.format(summary.inventoryValue) : '—'}</b><small>{summary ? `製品評価 ${yen.format(summary.productValue)}` : ''}</small></div><div><span>直近の二次加工</span><b>{summary?.lastManufacturing ? `${summary.lastManufacturing.date}｜${summary.lastManufacturing.outputMaterial}` : '記録なし'}</b><small>{summary?.lastManufacturing ? `原価 ${yen.format(summary.lastManufacturing.totalCostYen)} / ${num.format(summary.lastManufacturing.outputQty)}${summary.lastManufacturing.outputUnit}` : ''}</small></div></div>
        <div className="home-module-links"><Link to="/harvests"><Scissors size={13}/>摘採・製茶</Link><Link to="/production"><PackageCheck size={13}/>製造・製品在庫</Link><Link to="/fields">圃場カルテ</Link></div>
      </section>
    </div>

    <section className="panel home-next-work">
      <div className="panel-title"><div><h2>次の作業</h2><p>登録済み予定から直近の作業を確認</p></div><CalendarDays size={20}/></div>
      <div className="home-next-grid">
        <Link to="/plans"><span>防除</span><b>{data?.defense.nextPlan?.label || '予定なし'}</b><small>{data?.defense.nextPlan?.target || '年間防除計画を確認'}</small></Link>
        <Link to="/fertilizer-plans"><span>施肥</span><b>{data?.fertilizer.nextPlan?.label || '予定なし'}</b><small>{data?.fertilizer.nextPlan?.purpose || '年間施肥計画を確認'}</small></Link>
        <Link to="/fields"><span>摘採</span><b>{data?.defense.harvests[0]?.date || '予定なし'}</b><small>{data?.defense.harvests[0] ? `${data.defense.harvests[0].legacyId} ${data.defense.harvests[0].name}` : '圃場の摘採予定日を設定'}</small></Link>
      </div>
    </section>
  </div>
}
