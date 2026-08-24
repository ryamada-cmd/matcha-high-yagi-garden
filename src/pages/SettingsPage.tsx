import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw, Save, Search, Settings2, ShieldCheck, Users } from 'lucide-react'
import { changeUserRole, loadAdminConsole, saveAppSettings, type AdminConsoleData, type AuditLogRow } from '../lib/adminConsole'

function fmtDate(value: string) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'medium' }).format(d)
}

function actionLabel(action: string) {
  const map: Record<string,string> = { CREATE: '作成', UPDATE: '更新', DELETE: '削除', SYNC: '同期' }
  return map[action] || action
}

function entityLabel(entity: string) {
  const map: Record<string,string> = {
    spray_batch: '散布記録', inventory_lot: '在庫ロット', inventory_transaction: '入出庫', pesticide: '農薬マスタ',
    pesticide_catalog: 'FAMIC公式DB', field: '圃場', annual_spray_plan: '年間計画', app_settings: 'アプリ設定', profile_role: 'ユーザー権限',
  }
  return map[entity] || entity
}

function JsonBox({value}:{value:unknown}) {
  if (value === null || value === undefined) return <span className="audit-empty">—</span>
  return <pre>{JSON.stringify(value, null, 2)}</pre>
}

export default function SettingsPage() {
  const [data, setData] = useState<AdminConsoleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingUser, setChangingUser] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<number[]>([])
  const [lowStock, setLowStock] = useState('20')
  const [expiryDays, setExpiryDays] = useState('90')
  const [planDays, setPlanDays] = useState('14')
  const [harvestDays, setHarvestDays] = useState('30')

  async function refresh() {
    setLoading(true); setError('')
    try {
      const next = await loadAdminConsole(100)
      setData(next)
      setLowStock(String(next.settings.low_stock_threshold_percent))
      setExpiryDays(String(next.settings.expiry_warning_days))
      setPlanDays(String(next.settings.upcoming_plan_warning_days))
      setHarvestDays(String(next.settings.upcoming_harvest_warning_days))
    } catch (e:any) { setError(e?.message || '管理画面を読み込めませんでした。') }
    finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])

  const filteredLogs = useMemo(() => {
    const q = query.trim().normalize('NFKC').toLowerCase()
    if (!q) return data?.audit_logs || []
    return (data?.audit_logs || []).filter((r) => [r.action, r.entity_type, r.entity_id, r.user_name, r.user_email, JSON.stringify(r.before_data), JSON.stringify(r.after_data)].join(' ').normalize('NFKC').toLowerCase().includes(q))
  }, [data, query])

  async function saveSettings() {
    const vals = [Number(lowStock), Number(expiryDays), Number(planDays), Number(harvestDays)]
    if (vals.some(v => !Number.isFinite(v) || v < 0)) return setError('設定値は0以上の数字で入力してください。')
    setSaving(true); setError(''); setSuccess('')
    try {
      await saveAppSettings({ lowStockPercent: vals[0], expiryDays: vals[1], planDays: vals[2], harvestDays: vals[3] })
      setSuccess('警告基準を更新しました。ダッシュボードへ即時反映されます。')
      await refresh()
    } catch (e:any) { setError(e?.message || '設定の保存に失敗しました。') }
    finally { setSaving(false) }
  }

  async function updateRole(userId: string, role: 'admin'|'worker') {
    if (!window.confirm(`このユーザーの権限を「${role === 'admin' ? '管理者' : '作業者'}」へ変更しますか？`)) return
    setChangingUser(userId); setError(''); setSuccess('')
    try {
      await changeUserRole(userId, role)
      setSuccess('ユーザー権限を変更しました。')
      await refresh()
    } catch (e:any) { setError(e?.message || '権限変更に失敗しました。') }
    finally { setChangingUser('') }
  }

  function toggle(id:number) { setExpanded(old => old.includes(id) ? old.filter(x=>x!==id) : [...old,id]) }

  return <div className="page settings-page">
    <div className="page-head">
      <div><p className="eyebrow">ADMIN</p><h1>設定・監査</h1><p className="sub">警告基準、ユーザー権限、操作履歴を管理します。</p></div>
      <button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button>
    </div>

    {error&&<div className="notice error dashboard-notice">{error}</div>}
    {success&&<div className="notice success dashboard-notice">{success}</div>}

    <section className="panel settings-section">
      <div className="panel-title"><div><h2>ダッシュボード警告基準</h2><p>現場に合わせて注意喚起のタイミングを変更できます。</p></div><Settings2 size={20}/></div>
      <div className="settings-grid">
        <label><span>在庫残量警告</span><div className="unit-input"><input type="number" min="0" max="100" step="1" value={lowStock} onChange={e=>setLowStock(e.target.value)}/><b>%以下</b></div><small>購入時数量に対する現在庫の割合</small></label>
        <label><span>使用期限警告</span><div className="unit-input"><input type="number" min="0" max="3650" step="1" value={expiryDays} onChange={e=>setExpiryDays(e.target.value)}/><b>日前</b></div><small>期限切れ前の注意表示</small></label>
        <label><span>防除予定の事前通知</span><div className="unit-input"><input type="number" min="0" max="365" step="1" value={planDays} onChange={e=>setPlanDays(e.target.value)}/><b>日前</b></div><small>年間計画の次回予定</small></label>
        <label><span>摘採予定の事前通知</span><div className="unit-input"><input type="number" min="0" max="365" step="1" value={harvestDays} onChange={e=>setHarvestDays(e.target.value)}/><b>日前</b></div><small>圃場の摘採予定</small></label>
      </div>
      <div className="settings-save-row"><span>最終更新：{fmtDate(data?.settings.updated_at || '')}</span><button className="primary-button compact" onClick={()=>void saveSettings()} disabled={saving}><Save size={16}/>{saving?'保存中…':'設定を保存'}</button></div>
    </section>

    <section className="panel settings-section">
      <div className="panel-title"><div><h2>ユーザー権限</h2><p>管理者は全変更操作、作業者は日常の散布・閲覧操作を担当します。</p></div><Users size={20}/></div>
      <div className="admin-users-list">
        {(data?.users||[]).map(user=><div className="admin-user-row" key={user.id}>
          <div className="admin-user-avatar"><ShieldCheck size={18}/></div>
          <div className="admin-user-main"><b>{user.display_name || user.email || 'ユーザー'}</b><span>{user.email || 'メール未取得'}｜登録 {fmtDate(user.created_at)}</span></div>
          <select value={user.role} disabled={changingUser===user.id} onChange={e=>void updateRole(user.id,e.target.value as 'admin'|'worker')}><option value="admin">管理者</option><option value="worker">作業者</option></select>
        </div>)}
        {!loading&&!data?.users.length&&<p className="empty">ユーザーはありません。</p>}
      </div>
      <p className="settings-footnote">最後の管理者1名は作業者へ変更できないようデータベース側で保護しています。</p>
    </section>

    <section className="panel settings-section audit-section">
      <div className="panel-title"><div><h2>監査ログ</h2><p>最新100件の作成・更新・削除・同期操作を表示します。</p></div><span className="audit-count">{filteredLogs.length}件</span></div>
      <div className="audit-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="操作・対象・ユーザー・IDで検索"/></div>
      <div className="audit-list">
        {filteredLogs.map((log:AuditLogRow)=>{
          const open=expanded.includes(log.id)
          return <article className="audit-row" key={log.id}>
            <button className="audit-summary" onClick={()=>toggle(log.id)}>
              <span className={`audit-action ${log.action.toLowerCase()}`}>{actionLabel(log.action)}</span>
              <div className="audit-main"><b>{entityLabel(log.entity_type)}{log.entity_id?`｜${log.entity_id}`:''}</b><span>{log.user_name || log.user_email || 'システム'}｜{fmtDate(log.created_at)}</span></div>
              {open?<ChevronUp size={17}/>:<ChevronDown size={17}/>} 
            </button>
            {open&&<div className="audit-detail"><div><h3>変更前</h3><JsonBox value={log.before_data}/></div><div><h3>変更後</h3><JsonBox value={log.after_data}/></div></div>}
          </article>
        })}
        {!loading&&!filteredLogs.length&&<p className="empty">該当する監査ログはありません。</p>}
      </div>
    </section>
  </div>
}
