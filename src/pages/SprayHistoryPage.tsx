import { Table, TableHeader, TableBody, TableRow, TableCell, TableHeaderCell } from '@astryxdesign/core/Table'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Download, Pencil, RefreshCw, Trash2 } from 'lucide-react'
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

  return <div className="page spray-history-page astryx-page astryx-spray-history">
    <div className="page-head">
      <div><p className="eyebrow">SPRAY HISTORY</p><h1>散布履歴</h1><p className="sub">散布記録を日付・農薬・圃場・担当者・病害虫で検索し、CSV出力できます。</p></div>
      <div className="head-actions">
        <Button className="ui-astryx-action" variant="secondary" label="CSV出力" icon={<Download size={16}/>} isDisabled={!filtered.length} onClick={() => downloadSprayHistoryCsv(filtered)}/>
        <Button className="ui-astryx-action ui-astryx-refresh" variant="secondary" label="散布履歴を更新" icon={<RefreshCw size={18} className={loading?'spin':''}/>} isIconOnly isDisabled={loading} onClick={() => void refresh()}/>
      </div>
    </div>

    {error&&<div className="notice error dashboard-notice">{error}</div>}
    {success&&<div className="notice success dashboard-notice">{success}</div>}

    <div className="metrics history-metrics">
      <Card className="metric astryx-kpi"><span>該当記録</span><strong>{filtered.length}件</strong></Card>
      <Card className="metric astryx-kpi"><span>調製量合計</span><strong>{num.format(totalL)}L</strong></Card>
      <Card className="metric astryx-kpi"><span>使用農薬</span><strong>{uniquePesticides}種</strong></Card>
      <Card className="metric astryx-kpi"><span>散布圃場</span><strong>{uniqueFields}圃場</strong></Card>
    </div>

    <Card className="panel history-filter-panel astryx-section">
      <div className="history-filter-grid">
        <TextInput containerClassName="history-search astryx-search-field" label="キーワード" type="search" value={query} onChange={setQuery} placeholder="調製ID・担当・病害虫・農薬・圃場" hasClear width="100%"/>
        <label><span>開始日</span><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label>
        <label><span>終了日</span><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label>
        <label><span>農薬</span><select value={pesticideId} onChange={e=>setPesticideId(e.target.value)}><option value="">すべて</option>{pesticideOptions.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label>
        <label><span>圃場</span><select value={fieldId} onChange={e=>setFieldId(e.target.value)}><option value="">すべて</option>{fieldOptions.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label>
      </div>
      <div className="history-filter-foot"><span>{rows.length}件中 {filtered.length}件を表示</span><button onClick={resetFilters}>条件をクリア</button></div>
    </Card>

    <Card className="panel history-table-panel astryx-section">
      <div className="table-wrap"><Table className="data-table full-history-table" aria-label="散布履歴一覧" density="compact" dividers="rows" hasHover>
        <TableHeader><TableRow isHeaderRow><TableHeaderCell>散布日</TableHeaderCell><TableHeaderCell>調製ID</TableHeaderCell><TableHeaderCell>担当</TableHeaderCell><TableHeaderCell>目的</TableHeaderCell><TableHeaderCell>農薬</TableHeaderCell><TableHeaderCell>圃場</TableHeaderCell><TableHeaderCell>調製量</TableHeaderCell><TableHeaderCell>操作</TableHeaderCell></TableRow></TableHeader>
        <TableBody>
          {filtered.map(r => {
            const isOpen = expanded.includes(r.id)
            return <Fragment key={r.id}>
              <TableRow>
                <TableCell><b>{r.sprayDate}</b></TableCell><TableCell><code>{r.legacyId}</code></TableCell><TableCell>{r.operator||'—'}</TableCell><TableCell>{r.target||'—'}</TableCell>
                <TableCell><div className="history-chip-list">{r.chemicals.map(c=><span key={`${r.id}-${c.pesticideId}`}>{c.pesticideName}</span>)}</div></TableCell>
                <TableCell>{r.fields.length}圃場</TableCell><TableCell><b>{num.format(r.preparedL)}L</b></TableCell>
                <TableCell><div className="history-page-actions"><button title="明細を展開" onClick={()=>toggle(r.id)}>{isOpen?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button>{canEdit&&<button title="散布画面で編集" onClick={()=>navigate('/sprays')}><Pencil size={15}/></button>}{canDelete&&<button className="delete-action" title="削除" disabled={deletingId===r.id} onClick={()=>void remove(r)}><Trash2 size={15}/></button>}</div></TableCell>
              </TableRow>
              {isOpen&&<TableRow className="history-expanded-row"><TableCell colSpan={8}><div className="history-expanded">
                <div><h3>使用農薬</h3>{r.chemicals.map(c=><p key={`${r.id}-chem-${c.pesticideId}`}><b>{c.pesticideName}</b><span>{num.format(c.dilution)}倍 / {num.format(c.quantity)}{c.unit}</span></p>)}</div>
                <div><h3>圃場別散布量</h3>{r.fields.map(f=><p key={`${r.id}-field-${f.fieldId}`}><b>{f.legacyId} {f.name}</b><span>{num.format(f.actualL)}L</span></p>)}</div>
                <div><h3>基本情報</h3><p><b>天候 / 気温</b><span>{r.weather||'—'} / {r.temperatureC?`${r.temperatureC}℃`:'—'}</span></p><p><b>備考</b><span>{r.note||'—'}</span></p></div>
              </div></TableCell></TableRow>}
            </Fragment>
          })}
          {!loading&&!filtered.length&&<TableRow><TableCell colSpan={8} className="empty-cell">条件に一致する散布履歴はありません。</TableCell></TableRow>}
        </TableBody>
      </Table></div>
    </Card>
  </div>
}
