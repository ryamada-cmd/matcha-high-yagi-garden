import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { loadInventory, type InventoryRow } from '../lib/inventory'

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      setRows(await loadInventory())
    } catch (e: any) {
      setError(e?.message || '在庫を読み込めませんでした。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => `${r.pesticideName} ${r.legacyId} ${r.supplier} ${r.storage}`.toLowerCase().includes(q))
  }, [rows, query])

  const active = rows.filter((r) => r.balance > 0)
  const total = active.reduce((sum, r) => sum + r.stockValue, 0)
  const nearExpiry = active.filter((r) => {
    if (!r.expiryDate) return false
    const d = new Date(`${r.expiryDate}T00:00:00`)
    const days = (d.getTime() - Date.now()) / 86400000
    return days >= 0 && days <= 90
  }).length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">INVENTORY</p>
          <h1>農薬在庫</h1>
          <p className="sub">在庫は購入・散布・戻入・廃棄・棚卸調整の履歴から自動算出します。</p>
        </div>
        <button className="icon-button" onClick={() => void refresh()} disabled={loading} aria-label="更新">
          <RefreshCw size={18} className={loading ? 'spin' : ''}/>
        </button>
      </div>

      {error && <div className="notice error dashboard-notice">{error}</div>}

      <div className="metrics inventory-metrics">
        <article className="metric"><span>現在庫金額</span><strong>{yen.format(total)}</strong></article>
        <article className="metric"><span>在庫ありロット</span><strong>{active.length}件</strong></article>
        <article className="metric"><span>90日以内期限</span><strong>{nearExpiry}件</strong></article>
        <article className="metric"><span>登録ロット</span><strong>{rows.length}件</strong></article>
      </div>

      <section className="panel inventory-panel">
        <div className="toolbar">
          <div className="search-box"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="農薬名・ロット・購入先・保管場所を検索"/></div>
          <span className="muted">{filtered.length}件</span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>農薬</th><th>残量</th><th>在庫金額</th><th>期限</th><th>購入先</th><th>保管場所</th><th>ロット</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.lotId} className={r.balance <= 0 ? 'row-zero' : ''}>
                  <td><b>{r.pesticideName}</b></td>
                  <td><span className={r.balance > 0 ? 'stock-pill' : 'stock-pill zero'}>{r.balance.toLocaleString()} {r.unit}</span></td>
                  <td>{yen.format(r.stockValue)}</td>
                  <td>{r.expiryDate || '—'}</td>
                  <td>{r.supplier || '—'}</td>
                  <td>{r.storage || '—'}</td>
                  <td><code>{r.legacyId || '—'}</code></td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={7} className="empty-cell">該当する在庫はありません。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
