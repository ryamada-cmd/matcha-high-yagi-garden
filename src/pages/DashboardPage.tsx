import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CircleAlert, ClipboardCheck, Database, RefreshCw, ShieldAlert, SprayCan } from 'lucide-react'
import { loadDashboard, type DashboardAlert, type DashboardData } from '../lib/dashboard'
import WeatherPanel from '../components/WeatherPanel'

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })

function AlertIcon({ severity }: { severity: DashboardAlert['severity'] }) {
  if (severity === 'critical') return <ShieldAlert size={20}/>
  if (severity === 'warning') return <AlertTriangle size={20}/>
  return <CircleAlert size={20}/>
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true); setError('')
    try { setData(await loadDashboard()) }
    catch (e: any) { setError(e?.message || 'ダッシュボードを読み込めませんでした。') }
    finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])

  const cards = [
    ['在庫金額', data ? yen.format(data.stockValue) : '—', '現在庫の取得単価ベース'],
    ['在庫ロット', data ? `${data.stockLots}件` : '—', '残量があるロット'],
    ['要確認', data ? `${data.attentionCount}件` : '—', data ? `重要 ${data.criticalCount} / 注意 ${data.warningCount}` : ''],
    ['次回予定', data?.nextPlan?.label || '—', data?.nextPlan?.target || '今後の予定なし'],
  ]

  return <div className="page operations-dashboard">
    <div className="page-head">
      <div><p className="eyebrow">GODAI-ME YAGI ICHIBEI</p><h1>茶園防除ダッシュボード</h1><p className="sub">今日確認すべき防除・在庫・摘採・年間計画を優先度順に表示します。</p></div>
      <div className="head-actions"><span className="status">Supabase 接続済</span><button className="icon-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={18} className={loading ? 'spin' : ''}/></button></div>
    </div>

    {error && <div className="notice error dashboard-notice">{error}</div>}

    <div className="metrics operations-metrics">
      {cards.map(([label, value, note]) => <article className="metric" key={label}><span>{label}</span><strong>{loading && !data ? '…' : value}</strong><small>{note}</small></article>)}
    </div>

    <WeatherPanel/>

    <section className="panel attention-panel">
      <div className="panel-title attention-title"><div><h2>今日の確認事項</h2><p>重要度の高いものから表示しています。</p></div>{data && <span className={data.criticalCount ? 'attention-badge critical' : data.warningCount ? 'attention-badge warning' : 'attention-badge ok'}>{data.criticalCount ? `重要 ${data.criticalCount}` : data.warningCount ? `注意 ${data.warningCount}` : '問題なし'}</span>}</div>
      {!loading && data?.alerts.length === 0 && <div className="all-clear"><CheckCircle2 size={24}/><div><b>現在、自動検出された要確認事項はありません。</b><span>散布前には現物ラベルと最新FAMIC登録を引き続き確認してください。</span></div></div>}
      <div className="attention-list">
        {(data?.alerts || []).slice(0, 10).map((alert) => <article className={`attention-item ${alert.severity}`} key={alert.id}>
          <div className="attention-icon"><AlertIcon severity={alert.severity}/></div>
          <div className="attention-copy"><b>{alert.title}</b><span>{alert.detail}</span></div>
          <Link to={alert.href}>{alert.action}<ArrowRight size={15}/></Link>
        </article>)}
      </div>
    </section>

    <div className="dashboard-ops-grid">
      <section className="panel plan-overview-panel">
        <div className="panel-title"><div><h2>年間計画タイムライン</h2><p>未実施の計画を予定時期順に表示</p></div><Link className="panel-link" to="/plans">年間計画<ArrowRight size={14}/></Link></div>
        <div className="plan-timeline">
          {(data?.planTimeline || []).map((plan) => <div className={`plan-timeline-row ${plan.overdue ? 'overdue' : ''}`} key={plan.legacyId}>
            <div className="timeline-date"><b>{plan.label}</b><span>{plan.overdue ? `${Math.abs(plan.days)}日超過` : plan.days === 0 ? '今日' : `${plan.days}日後`}</span></div>
            <div className="timeline-main"><b>{plan.target || '対象未入力'}</b><span>{plan.pesticide !== '未指定' ? plan.pesticide : plan.note || '推奨農薬未指定'}</span></div>
          </div>)}
          {!loading && !data?.planTimeline.length && <p className="empty">未実施の年間計画はありません。</p>}
        </div>
      </section>

      <section className="panel readiness-panel">
        <div className="panel-title"><div><h2>安全判定データ</h2><p>自動警告に必要な情報の登録状況</p></div><Database size={20}/></div>
        <div className="readiness-row"><div><b>在庫の使用期限</b><span>{data?.readiness.expiryRegistered ?? 0} / {data?.readiness.expiryTotal ?? 0}ロット</span></div><progress max={Math.max(data?.readiness.expiryTotal || 1, 1)} value={data?.readiness.expiryRegistered || 0}/><Link to="/inventory">在庫を確認<ArrowRight size={14}/></Link></div>
        <div className="readiness-row"><div><b>圃場の摘採予定日</b><span>{data?.readiness.harvestRegistered ?? 0} / {data?.readiness.harvestTotal ?? 0}圃場</span></div><progress max={Math.max(data?.readiness.harvestTotal || 1, 1)} value={data?.readiness.harvestRegistered || 0}/><Link to="/fields">圃場を確認<ArrowRight size={14}/></Link></div>
        <p className="readiness-note">未登録でも散布記録はできますが、期限・収穫前日数の自動警告精度が下がります。</p>
      </section>
    </div>

    <div className="dashboard-ops-grid lower">
      <section className="panel usage-watch-panel">
        <div className="panel-title"><div><h2>本剤使用回数</h2><p>今年のアプリ記録とFAMICの本剤使用回数</p></div><ClipboardCheck size={20}/></div>
        <div className="usage-watch-list">
          {(data?.usageWatch || []).map((item) => <div className={`usage-watch-row ${item.remaining !== null && item.remaining <= 1 ? 'near-limit' : ''}`} key={item.pesticideId}>
            <div><b>{item.pesticideName}</b><span>{item.lastDate ? `前回 ${item.lastDate}` : '今年の記録なし'}</span></div>
            <strong>{item.max === null ? `${item.used}回 / 上限要確認` : `${item.used} / ${item.max}回`}</strong>
          </div>)}
          {!loading && !data?.usageWatch.length && <p className="empty">今年の散布記録はありません。</p>}
        </div>
        <Link className="panel-footer-link" to="/spray-history">散布履歴を見る<ArrowRight size={14}/></Link>
      </section>

      <section className="panel harvest-watch-panel">
        <div className="panel-title"><div><h2>近日の摘採予定</h2><p>圃場マスタの摘採予定日から表示</p></div><CalendarDays size={20}/></div>
        <div className="harvest-watch-list">
          {(data?.harvests || []).map((h) => <div className="harvest-watch-row" key={h.fieldId}><div><b>{h.legacyId} {h.name}</b><span>{h.date}</span></div><strong>{h.days === 0 ? '今日' : `${h.days}日後`}</strong></div>)}
          {!loading && !data?.harvests.length && <div className="empty-state-small"><CalendarDays size={22}/><span>今後の摘採予定日は登録されていません。</span></div>}
        </div>
        <Link className="panel-footer-link" to="/fields">圃場予定を管理<ArrowRight size={14}/></Link>
      </section>
    </div>

    <div className="dashboard-ops-grid lower">
      <section className="panel last-spray-panel">
        <div className="panel-title"><div><h2>前回の散布記録</h2>{data?.lastSpray?.legacyId && <span>{data.lastSpray.legacyId}</span>}</div><SprayCan size={20}/></div>
        {data?.lastSpray ? <div className="detail-list"><div><span>散布日</span><b>{data.lastSpray.date}</b></div><div><span>調製量</span><b>{data.lastSpray.preparedL.toLocaleString()}L</b></div><div><span>目的</span><b>{data.lastSpray.target || '未入力'}</b></div><div><span>担当</span><b>{data.lastSpray.operator || '未入力'}</b></div><div><span>天候</span><b>{data.lastSpray.weather || '未入力'}</b></div><div className="detail-wide"><span>使用農薬</span><b>{data.lastSpray.chemicals.length ? data.lastSpray.chemicals.join(' / ') : '明細なし'}</b></div></div> : <p className="empty">散布記録はありません。</p>}
        <Link className="panel-footer-link" to="/spray-history">散布履歴へ<ArrowRight size={14}/></Link>
      </section>

      <section className="panel next-action-panel">
        <div className="panel-title"><div><h2>次の防除</h2><p>年間計画から次の未実施予定を表示</p></div><CalendarDays size={20}/></div>
        {data?.nextPlan ? <div className="next-plan-focus"><span>{data.nextPlan.label}</span><h3>{data.nextPlan.target}</h3><p>{data.nextPlan.pesticide !== '未指定' ? data.nextPlan.pesticide : data.nextPlan.note || '推奨農薬は未指定です。'}</p><b>{data.nextPlan.days === 0 ? '今日' : `${data.nextPlan.days}日後`}</b></div> : <div className="empty-state-small"><CheckCircle2 size={22}/><span>今後の未実施予定はありません。</span></div>}
        <div className="next-action-buttons"><Link to="/plans">計画を確認</Link><Link className="primary-link" to="/sprays">散布を記録<ArrowRight size={14}/></Link></div>
      </section>
    </div>
  </div>
}
