import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CircleAlert, Factory, Leaf, PackageCheck, RefreshCw, Scissors, ShieldAlert, ShoppingCart, SprayCan, Tractor } from 'lucide-react'
import WeatherPanel from '../components/WeatherPanel'
import { loadDashboard, type DashboardAlert, type DashboardData } from '../lib/dashboard'
import { loadFertilizerDashboard, type FertilizerDashboardData } from '../lib/fertilizerDashboard'
import { loadHarvestRecords, loadProcessingBatches, type HarvestRecord, type ProcessingBatch } from '../lib/harvestProcessing'
import { loadManufacturingBatches, loadProductionLots, type ManufacturingBatch, type ProductionLot } from '../lib/production'
import { loadSalesDashboard, type SalesDashboardData } from '../lib/salesDashboard'
import { loadEquipmentDashboard, type EquipmentDashboardData } from '../lib/equipmentDashboard'
import { useAppPermissions } from '../lib/permissions'

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 })
const currentYear = () => Number(new Intl.DateTimeFormat('en', { year: 'numeric' }).format(new Date()))

function AlertIcon({ severity }: { severity: DashboardAlert['severity'] }) {
  if (severity === 'critical') return <ShieldAlert size={20}/>
  if (severity === 'warning') return <AlertTriangle size={20}/>
  return <CircleAlert size={20}/>
}

type HomeData = {
  defense: DashboardData | null
  fertilizer: FertilizerDashboardData | null
  harvests: HarvestRecord[]
  processing: ProcessingBatch[]
  lots: ProductionLot[]
  manufacturing: ManufacturingBatch[]
  sales: SalesDashboardData | null
  equipment: EquipmentDashboardData | null
}

type OverviewCard = { label:string; value:string; note:string; tone?:string }

export default function HomeDashboardPage() {
  const { allowed } = useAppPermissions()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canSprays = allowed('sprays.view')
  const canCreateSprays = allowed('sprays.create')
  const canPesticideInventory = allowed('pesticide_inventory.view')
  const canSprayPlans = allowed('spray_plans.view')
  const canDefense = canSprays || canPesticideInventory || canSprayPlans

  const canFertilizerApplications = allowed('fertilizer_applications.view')
  const canCreateFertilizerApplications = allowed('fertilizer_applications.create')
  const canFertilizerInventory = allowed('fertilizer_inventory.view')
  const canFertilizerPlans = allowed('fertilizer_plans.view')
  const canFertilizer = canFertilizerApplications || canFertilizerInventory || canFertilizerPlans

  const canHarvest = allowed('harvest_processing.view')
  const canManageHarvest = allowed('harvest_processing.manage')
  const canProduction = allowed('production.view')
  const canManageProduction = allowed('production.process_manage')
  const canPackaging = allowed('packaging.view')
  const canSales = allowed('sales.view')
  const canManageSales = allowed('sales.manage')
  const canEquipment = allowed('equipment.view')
  const canFields = allowed('fields.view')

  async function refresh() {
    setLoading(true); setError(''); setData(null)
    try {
      const [defense, fertilizer, harvests, processing, lots, manufacturing, sales, equipment] = await Promise.all([
        canDefense ? loadDashboard() : Promise.resolve(null),
        canFertilizer ? loadFertilizerDashboard() : Promise.resolve(null),
        canHarvest ? loadHarvestRecords(300) : Promise.resolve([] as HarvestRecord[]),
        canHarvest ? loadProcessingBatches(200) : Promise.resolve([] as ProcessingBatch[]),
        canProduction || canPackaging ? loadProductionLots() : Promise.resolve([] as ProductionLot[]),
        canProduction ? loadManufacturingBatches(100) : Promise.resolve([] as ManufacturingBatch[]),
        canSales ? loadSalesDashboard() : Promise.resolve(null),
        canEquipment ? loadEquipmentDashboard() : Promise.resolve(null),
      ])
      setData({ defense, fertilizer, harvests, processing, lots, manufacturing, sales, equipment })
    } catch (e: any) {
      setError(e?.message || '茶園ダッシュボードを読み込めませんでした。')
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [canDefense, canFertilizer, canHarvest, canProduction, canPackaging, canSales, canEquipment])

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
      inventoryValue: activeLots.reduce((s, x) => s + x.inventoryValueYen, 0),
      productLots: productLots.length,
      productValue: productLots.reduce((s, x) => s + x.inventoryValueYen, 0),
      lastManufacturing: manufacturing[0] || null,
    }
  }, [data, year])

  function alertAllowed(alert:DashboardAlert) {
    if (alert.href.startsWith('/inventory')) return canPesticideInventory
    if (alert.href.startsWith('/plans')) return canSprayPlans
    if (alert.href.startsWith('/sprays') || alert.href.startsWith('/spray-history')) return canSprays
    if (alert.href.startsWith('/fields')) return canFields
    if (alert.href.startsWith('/equipment')) return canEquipment
    return false
  }

  const combinedAlerts = useMemo(() => {
    if (!data) return [] as DashboardAlert[]
    const alerts = [
      ...(data.defense?.alerts || []).filter(alertAllowed),
      ...(canEquipment ? data.equipment?.alerts || [] : []),
    ] as DashboardAlert[]
    const rank = (severity: DashboardAlert['severity']) => severity === 'critical' ? 0 : severity === 'warning' ? 1 : 2
    return alerts.sort((a, b) => rank(a.severity) - rank(b.severity) || a.title.localeCompare(b.title, 'ja'))
  }, [data, canSprays, canPesticideInventory, canSprayPlans, canFields, canEquipment])

  const criticalCount = combinedAlerts.filter(x => x.severity === 'critical').length
  const warningCount = combinedAlerts.filter(x => x.severity === 'warning').length
  const attentionCount = criticalCount + warningCount
  const hasAttentionSources = canDefense || canEquipment

  const topCards:OverviewCard[] = []
  if (hasAttentionSources) topCards.push({ label: '今日の要確認', value: data ? `${attentionCount}件` : '—', note: data ? `重要 ${criticalCount} / 注意 ${warningCount}` : '', tone: criticalCount ? 'danger' : warningCount ? 'warning' : 'ok' })
  if (canFields && data?.defense) topCards.push({ label: '管理圃場', value: `${data.defense.readiness.harvestTotal}圃場`, note: '許可された作業情報と連動' })
  if (canPesticideInventory) topCards.push({ label: '農薬在庫', value: data?.defense ? `${data.defense.stockLots}ロット` : '—', note: data?.defense ? yen.format(data.defense.stockValue) : '' })
  if (canFertilizerInventory) topCards.push({ label: '肥料在庫', value: data?.fertilizer ? `${num.format(data.fertilizer.stockKg)}kg` : '—', note: data?.fertilizer ? `${data.fertilizer.stockLots}ロット` : '' })
  if (canHarvest) topCards.push({ label: `${year}年 生葉収量`, value: summary ? `${num.format(summary.freshLeafKg)}kg` : '—', note: summary ? `${summary.harvestCount}回摘採` : '' })
  if (canProduction || canPackaging) topCards.push({ label: '製品在庫額', value: summary ? yen.format(summary.productValue) : '—', note: summary ? `製品 ${summary.productLots}ロット / 全在庫 ${yen.format(summary.inventoryValue)}` : '' })
  if (canSales) {
    topCards.push({ label: '今月売上', value: data?.sales ? yen.format(data.sales.monthSalesYen) : '—', note: data?.sales ? `${data.sales.monthSaleCount}件 / ${data.sales.monthKey}` : '' })
    topCards.push({ label: '今月粗利', value: data?.sales ? yen.format(data.sales.monthGrossProfitYen) : '—', note: data?.sales ? `粗利率 ${data.sales.monthGrossMarginPct.toFixed(1)}%` : '' })
  }

  const hasQuickActions = canCreateSprays || canCreateFertilizerApplications || canManageHarvest || canManageProduction || canManageSales
  const hasModules = canDefense || canFertilizer || canHarvest || canProduction || canPackaging || canSales || canEquipment
  const hasNextWork = canSprayPlans || canFertilizerPlans || canFields || canEquipment

  return <div className="page home-dashboard">
    <div className="page-head home-dashboard-head">
      <div><p className="eyebrow">GODAI-ME YAGI ICHIBEI</p><h1>茶園管理ダッシュボード</h1><p className="sub">あなたに許可された防除・施肥・収穫・製造・在庫・販売・設備の状況をまとめて確認します。</p></div>
      <div className="head-actions"><span className="status">茶園管理 接続済</span><button className="icon-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={18} className={loading ? 'spin' : ''}/></button></div>
    </div>

    {error && <div className="notice error dashboard-notice">{error}</div>}

    {topCards.length > 0 && <div className="home-overview-metrics">
      {topCards.map(card => <article className={`home-overview-card ${card.tone || ''}`} key={card.label}><span>{card.label}</span><strong>{loading && !data ? '…' : card.value}</strong><small>{card.note}</small></article>)}
    </div>}

    {hasQuickActions && <section className="home-quick-actions" aria-label="主要作業">
      {canCreateSprays && <Link to="/sprays"><span className="home-action-icon spray"><SprayCan size={20}/></span><div><b>散布を記録</b><small>農薬・圃場・散布量</small></div><ArrowRight size={17}/></Link>}
      {canCreateFertilizerApplications && <Link to="/fertilizer-applications"><span className="home-action-icon fertilizer"><Leaf size={20}/></span><div><b>施肥を記録</b><small>肥料・施肥量・N/P/K</small></div><ArrowRight size={17}/></Link>}
      {canManageHarvest && <Link to="/harvests"><span className="home-action-icon harvest"><Scissors size={20}/></span><div><b>摘採・製茶</b><small>生葉収量・歩留</small></div><ArrowRight size={17}/></Link>}
      {canManageProduction && <Link to="/production"><span className="home-action-icon production"><Factory size={20}/></span><div><b>製造・製品在庫</b><small>二次加工・原価</small></div><ArrowRight size={17}/></Link>}
      {canManageSales && <Link to="/sales"><span className="home-action-icon sales"><ShoppingCart size={20}/></span><div><b>販売・出庫</b><small>売上・粗利・ロット追跡</small></div><ArrowRight size={17}/></Link>}
    </section>}

    <WeatherPanel/>

    {hasAttentionSources && <section className="panel attention-panel home-attention-panel">
      <div className="panel-title attention-title"><div><h2>今日の確認事項</h2><p>権限のある在庫・予定・機械設備に関する自動チェック</p></div>{data && <span className={criticalCount ? 'attention-badge critical' : warningCount ? 'attention-badge warning' : 'attention-badge ok'}>{criticalCount ? `重要 ${criticalCount}` : warningCount ? `注意 ${warningCount}` : '問題なし'}</span>}</div>
      {!loading && combinedAlerts.length === 0 && <div className="all-clear"><CheckCircle2 size={24}/><div><b>現在、表示対象の要確認事項はありません。</b><span>権限が付与されている機能の登録内容を引き続き確認してください。</span></div></div>}
      <div className="attention-list">{combinedAlerts.slice(0, 10).map(alert => <article className={`attention-item ${alert.severity}`} key={alert.id}><div className="attention-icon"><AlertIcon severity={alert.severity}/></div><div className="attention-copy"><b>{alert.title}</b><span>{alert.detail}</span></div><Link to={alert.href}>{alert.action}<ArrowRight size={15}/></Link></article>)}</div>
    </section>}

    {hasModules && <div className="home-module-grid">
      {canDefense && data?.defense && <section className="panel home-module-card defense">
        <div className="home-module-title"><span><SprayCan size={19}/></span><div><h2>防除</h2><p>許可された農薬在庫・年間計画・散布実績</p></div></div>
        <div className="home-module-stats">
          {canPesticideInventory && <div><span>農薬在庫評価</span><b>{yen.format(data.defense.stockValue)}</b></div>}
          {canSprayPlans && <div><span>次の防除</span><b>{data.defense.nextPlan?.label || '予定なし'}</b><small>{data.defense.nextPlan?.target || ''}</small></div>}
          {canSprays && <div><span>前回散布</span><b>{data.defense.lastSpray?.date || '記録なし'}</b><small>{data.defense.lastSpray?.target || ''}</small></div>}
        </div>
        <div className="home-module-links">{canSprays && <><Link to="/sprays">散布</Link><Link to="/spray-history">履歴</Link></>}{canPesticideInventory && <Link to="/inventory">農薬在庫</Link>}{canSprayPlans && <Link to="/plans">年間計画</Link>}</div>
      </section>}

      {canFertilizer && data?.fertilizer && <section className="panel home-module-card fertilizer">
        <div className="home-module-title"><span><Leaf size={19}/></span><div><h2>施肥</h2><p>許可された肥料在庫・施肥実績・年間計画</p></div></div>
        <div className="home-module-stats">
          {canFertilizerInventory && <div><span>肥料在庫</span><b>{num.format(data.fertilizer.stockKg)}kg</b><small>{data.fertilizer.stockLots}ロット</small></div>}
          {canFertilizerApplications && <div><span>今年のN / P / K</span><b>{num.format(data.fertilizer.nKg)} / {num.format(data.fertilizer.pKg)} / {num.format(data.fertilizer.kKg)}kg</b></div>}
          {canFertilizerPlans && <div><span>次回施肥</span><b>{data.fertilizer.nextPlan?.label || '予定なし'}</b><small>{data.fertilizer.nextPlan?.purpose || ''}</small></div>}
        </div>
        <div className="home-module-links">{canFertilizerApplications && <><Link to="/fertilizer-applications">施肥</Link><Link to="/fertilizer-history">履歴</Link></>}{canFertilizerInventory && <Link to="/fertilizer-inventory">肥料在庫</Link>}{canFertilizerPlans && <Link to="/fertilizer-plans">年間計画</Link>}</div>
      </section>}

      {(canHarvest || canProduction || canPackaging) && <section className="panel home-module-card production">
        <div className="home-module-title"><span><Factory size={19}/></span><div><h2>収穫・製造</h2><p>許可された摘採・製茶・二次加工・製品在庫</p></div></div>
        <div className="home-module-stats">
          {canHarvest && <div><span>今年の生葉 / 一次製茶</span><b>{summary ? `${num.format(summary.freshLeafKg)} / ${num.format(summary.primaryOutputKg)}kg` : '—'}</b><small>{summary ? `摘採 ${summary.harvestCount}回 / 製茶 ${summary.processingCount}回` : ''}</small></div>}
          {(canProduction || canPackaging) && <div><span>原料・製品在庫</span><b>{summary ? yen.format(summary.inventoryValue) : '—'}</b><small>{summary ? `製品評価 ${yen.format(summary.productValue)}` : ''}</small></div>}
          {canProduction && <div><span>直近の二次加工</span><b>{summary?.lastManufacturing ? `${summary.lastManufacturing.date}｜${summary.lastManufacturing.outputMaterial}` : '記録なし'}</b><small>{summary?.lastManufacturing ? `原価 ${yen.format(summary.lastManufacturing.totalCostYen)} / ${num.format(summary.lastManufacturing.outputQty)}${summary.lastManufacturing.outputUnit}` : ''}</small></div>}
        </div>
        <div className="home-module-links">{canHarvest && <Link to="/harvests"><Scissors size={13}/>摘採・製茶</Link>}{canProduction && <Link to="/production"><PackageCheck size={13}/>製造・製品在庫</Link>}{canPackaging && <Link to="/product-packaging"><PackageCheck size={13}/>商品化・SKU在庫</Link>}{canFields && <Link to="/fields">圃場カルテ</Link>}</div>
      </section>}

      {canSales && data?.sales && <section className="panel home-module-card sales">
        <div className="home-module-title"><span><ShoppingCart size={19}/></span><div><h2>販売・粗利</h2><p>販売実績・売上原価・製品ロット追跡</p></div></div>
        <div className="home-module-stats"><div><span>今月売上</span><b>{yen.format(data.sales.monthSalesYen)}</b><small>{data.sales.monthSaleCount}件 / {data.sales.monthKey}</small></div><div><span>今月粗利</span><b>{yen.format(data.sales.monthGrossProfitYen)}</b><small>売上原価 {yen.format(data.sales.monthCostYen)} / 粗利率 {data.sales.monthGrossMarginPct.toFixed(1)}%</small></div><div><span>直近販売</span><b>{data.sales.latest ? `${data.sales.latest.date}｜${data.sales.latest.customerName}` : '記録なし'}</b><small>{data.sales.latest ? `${data.sales.latest.channel || '—'} / 売上 ${yen.format(data.sales.latest.salesAmountYen)} / 粗利 ${yen.format(data.sales.latest.grossProfitYen)}` : ''}</small></div></div>
        <div className="home-module-links"><Link to="/sales"><ShoppingCart size={13}/>販売・出庫</Link>{canProduction && <Link to="/production"><PackageCheck size={13}/>製品在庫</Link>}{!canProduction && canPackaging && <Link to="/product-packaging"><PackageCheck size={13}/>SKU在庫</Link>}</div>
      </section>}

      {canEquipment && data?.equipment && <section className="panel home-module-card equipment">
        <div className="home-module-title"><span><Tractor size={19}/></span><div><h2>機械設備</h2><p>農機具・車両・修理状態・期限管理</p></div></div>
        <div className="home-module-stats"><div><span>稼働設備</span><b>{data.equipment.activeCount}件</b><small>取得金額 {yen.format(data.equipment.acquisitionValueYen)}</small></div><div><span>要確認</span><b>{data.equipment.attentionCount}件</b><small>重要 {data.equipment.criticalCount} / 注意 {data.equipment.warningCount}</small></div><div><span>次の期限</span><b>{data.equipment.nextDue ? `${data.equipment.nextDue.date}｜${data.equipment.nextDue.label}` : '予定なし'}</b><small>{data.equipment.nextDue ? `${data.equipment.nextDue.assetNo} ${data.equipment.nextDue.name}`.trim() : '車検・税金・保険・整備'}</small></div></div>
        <div className="home-module-links"><Link to="/equipment"><Tractor size={13}/>機械設備管理</Link></div>
      </section>}
    </div>}

    {hasNextWork && <section className="panel home-next-work">
      <div className="panel-title"><div><h2>次の作業</h2><p>権限のある予定・期限から直近の作業を確認</p></div><CalendarDays size={20}/></div>
      <div className="home-next-grid">
        {canSprayPlans && <Link to="/plans"><span>防除</span><b>{data?.defense?.nextPlan?.label || '予定なし'}</b><small>{data?.defense?.nextPlan?.target || '年間防除計画を確認'}</small></Link>}
        {canFertilizerPlans && <Link to="/fertilizer-plans"><span>施肥</span><b>{data?.fertilizer?.nextPlan?.label || '予定なし'}</b><small>{data?.fertilizer?.nextPlan?.purpose || '年間施肥計画を確認'}</small></Link>}
        {canFields && <Link to="/fields"><span>摘採</span><b>{data?.defense?.harvests[0]?.date || '圃場で確認'}</b><small>{data?.defense?.harvests[0] ? `${data.defense.harvests[0].legacyId} ${data.defense.harvests[0].name}` : '圃場カルテ・摘採予定を確認'}</small></Link>}
        {canEquipment && <Link to="/equipment"><span>設備</span><b>{data?.equipment?.nextDue ? `${data.equipment.nextDue.date}｜${data.equipment.nextDue.label}` : '予定なし'}</b><small>{data?.equipment?.nextDue ? data.equipment.nextDue.name : '車検・税金・保険・整備期限を確認'}</small></Link>}
      </div>
    </section>}
  </div>
}
