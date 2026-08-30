import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Pencil, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppPermissions } from '../lib/permissions'
import { deleteSpray } from '../lib/sprays'
import { downloadSprayHistoryCsv, loadFullSprayHistory, type FullSprayHistoryRow } from '../lib/sprayHistory'

const num = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 })

export default function SprayHistoryPage() {
  const { allowed } = useAppPermissions()
  const canEdit = allowed('sprays.edit')
  const canDelete = allowed('sprays.delete')
  const navigate = useNavigate()
  const [rows, setRows] = useState<FullSprayHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [pesticideId, setPesticideId] = useState('')
  const [fieldId, setFieldId] = useState('')
  const [expanded, setExpanded] = useState<string[]>([])

  async function refresh() {
    setLoading(true); setError('')
    try {
      const data = await loadFullSprayHistory()
      setRows(data.rows)
    } catch (e: any) {
      setError(e?.message || '散布履歴を読み込めませんでした。')
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])

  const pesticideOptions = useMemo(() => {
    const map = new Map<string,string>()
    rows.forEach(r => r.chemicals.forEach(c => map.set(c.pesticideId, c.pesticideName)))
    return [...map.entries()].sort((a,b) => a[1].localeCompare(b[1], 'ja'))
  }, [rows])

  const fieldOptions = useMemo(() => {
    const map = new Map<string,string>()
    rows.forEach(r => r.fields.forEach(f => map.set(f.fieldId, `${f.legacyId} ${f.name}`.trim())))
    return [...map.entries()].sort((a,b) => a[1].localeCompare(b[1], 'ja'))
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().normalize('NFKC').toLowerCase()
    return rows.filter(r => {
      if (fromDate && r.sprayDate < fromDate) return false
      if (toDate && r.sprayDate > toDate) return false
      if (pesticideId && !r.chemicals.some(c => c.pesticideId === pesticideId)) return false
      if (fieldId && !r.fields.some(f => f.fieldId === fieldId)) return false
      if (!q) return true
      const haystack = [
        r.legacyId, r.sprayDate, r.operator, r.target, r.weather, r.note,
        ...r.chemicals.flatMap(c => [c.pesticideName, String(c.dilution)]),
        ...r.fields.flatMap(f => [f.legacyId, f.name, f.location]),
      ].join(' ').normalize('NFKC').toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, query, fromDate, toDate, pesticideId, fieldId])

  const totalL = filtered.reduce((s,r) => s + r.preparedL, 0)
  const uniquePesticides = new Set(filtered.flatMap(r => r.chemicals.map(c => c.pesticideId))).size
  const uniqueFields = new Set(filtered.flatMap(r => r.fields.map(f => f.fieldId))).size

  function resetFilters() {
    setQuery(''); setFromDate(''); setToDate(''); setPesticideId(''); setFieldId('')
  }

  function toggle(id: string) {
    setExpanded(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id])
  }

  async function remove(row: FullSprayHistoryRow) {
    if (!canDelete) return setError('散布記録を削除する権限がありません。')
    if (!window.confirm(`${row.legacyId} を削除しますか？\n使用した農薬は在庫へ戻入し、監査履歴を残します。`)) return
    const reason = window.prompt('削除理由を入力してください（任意）', '')
    if (reason === null) return
    setDeletingId(row.id); setError(''); setSuccess('')
    try {
      const result = await deleteSpray(row.id, reason)
      setSuccess(`${result.legacy_id} を削除しました。使用量は在庫へ戻入済みです。`)
      await refresh()
    } catch (e: any) {
      setError(e?.message || '散布記録の削除に失敗しました。')
    } finally { setDeletingId('') }
  }

  return <div className="page spray-history-page">
    <div className="page-head">
      <div><p className="eyebrow">SPRAY HISTORY</p><h1>散布履歴</h1><p className="sub">散布記録を日付・農薬・圃場・担当者・病害虫で検索し、CSV出力できます。</p></div>
      <div className="head-actions">
        <button className="secondary-button" disabled={!filtered.length} onClick={() => downloadSprayHistoryCsv(filtered)}><Download size={16}/>CSV出力</button>
        <button className="icon-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button>
      </div>
    </div>

    {error&&<div className="notice error dashboard-notice">{error}</div>}
    {success&&<div className="notice success dashboard-notice">{success}</div>}

    <div className="metrics history-metrics">
      <article className="metric"><span>該当記録</span><strong>{filtered.length}件</strong></article>
      <article className="metric"><span>調製量合計</span><strong>{num.format(totalL)}L</strong></article>
      <article className="metric"><span>使用農薬</span><strong>{uniquePesticides}種</strong></article>
      <article className="metric"><span>散布圃場</span><strong>{uniqueFields}圃場</strong></article>
    </div>

    <section className="panel history-filter-panel">
      <div className="history-filter-grid">
        <label className="history-search"><span>キーワード</span><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="調製ID・担当・病害虫・農薬・圃場"/></div></label>
        <label><span>開始日</span><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label>
        <label><span>終了日</span><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label>
        <label><span>農薬</span><select value={pesticideId} onChange={e=>setPesticideId(e.target.value)}><option value="">すべて</option>{pesticideOptions.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label>
        <label><span>圃場</span><select value={fieldId} onChange={e=>setFieldId(e.target.value)}><option value="">すべて</option>{fieldOptions.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label>
      </div>
      <div className="history-filter-foot"><span>{rows.length}件中 {filtered.length}件を表示</span><button onClick={resetFilters}>条件をクリア</button></div>
    </section>

    <section className="panel history-table-panel">
      <div className="table-wrap"><table className="data-table full-history-table">
        <thead><tr><th>散布日</th><th>調製ID</th><th>担当</th><th>目的</th><th>農薬</th><th>圃場</th><th>調製量</th><th>操作</th></tr></thead>
        <tbody>
          {filtered.map(r => {
            const isOpen = expanded.includes(r.id)
            return <Fragment key={r.id}>
              <tr>
                <td><b>{r.sprayDate}</b></td><td><code>{r.legacyId}</code></td><td>{r.operator||'—'}</td><td>{r.target||'—'}</td>
                <td><div className="history-chip-list">{r.chemicals.map(c=><span key={`${r.id}-${c.pesticideId}`}>{c.pesticideName}</span>)}</div></td>
                <td>{r.fields.length}圃場</td><td><b>{num.format(r.preparedL)}L</b></td>
                <td><div className="history-page-actions"><button title="明細を展開" onClick={()=>toggle(r.id)}>{isOpen?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button>{canEdit&&<button title="散布画面で編集" onClick={()=>navigate('/sprays')}><Pencil size={15}/></button>}{canDelete&&<button className="delete-action" title="削除" disabled={deletingId===r.id} onClick={()=>void remove(r)}><Trash2 size={15}/></button>}</div></td>
              </tr>
              {isOpen&&<tr className="history-expanded-row"><td colSpan={8}><div className="history-expanded">
                <div><h3>使用農薬</h3>{r.chemicals.map(c=><p key={`${r.id}-chem-${c.pesticideId}`}><b>{c.pesticideName}</b><span>{num.format(c.dilution)}倍 / {num.format(c.quantity)}{c.unit}</span></p>)}</div>
                <div><h3>圃場別散布量</h3>{r.fields.map(f=><p key={`${r.id}-field-${f.fieldId}`}><b>{f.legacyId} {f.name}</b><span>{num.format(f.actualL)}L</span></p>)}</div>
                <div><h3>基本情報</h3><p><b>天候 / 気温</b><span>{r.weather||'—'} / {r.temperatureC?`${r.temperatureC}℃`:'—'}</span></p><p><b>備考</b><span>{r.note||'—'}</span></p></div>
              </div></td></tr>}
            </Fragment>
          })}
          {!loading&&!filtered.length&&<tr><td colSpan={8} className="empty-cell">条件に一致する散布履歴はありません。</td></tr>}
        </tbody>
      </table></div>
    </section>
  </div>
}
