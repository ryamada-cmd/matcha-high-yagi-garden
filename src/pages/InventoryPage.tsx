import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArchiveRestore, ClipboardCheck, History, PackagePlus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import {
  adjustInventoryStock,
  disposeInventoryStock,
  loadInventory,
  loadInventoryRole,
  loadInventoryTransactions,
  loadPesticideOptions,
  receiveInventoryLot,
  type InventoryRow,
  type InventoryTransactionRow,
  type PesticideOption,
} from '../lib/inventory'

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })
const typeLabel: Record<string,string> = { PURCHASE:'入庫', SPRAY:'散布', RETURN:'戻入', ADJUSTMENT:'棚卸調整', DISPOSAL:'廃棄' }
const todayLocal = () => new Intl.DateTimeFormat('sv-SE').format(new Date())

type ActionMode = 'receive'|'adjust'|'dispose'|null

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [transactions, setTransactions] = useState<InventoryTransactionRow[]>([])
  const [pesticides, setPesticides] = useState<PesticideOption[]>([])
  const [role, setRole] = useState('')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'stock'|'history'>('stock')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [mode, setMode] = useState<ActionMode>(null)
  const [selectedLot, setSelectedLot] = useState<InventoryRow|null>(null)

  const [receive, setReceive] = useState({
    pesticideId:'', purchaseDate:todayLocal(), supplier:'', purchaseUnitPrice:'', packageCount:'1', packageUnit:'本', packageSize:'500', contentUnit:'ml' as 'ml'|'g', expiryDate:'', storageLocation:'農薬保管庫', manufacturerLotNo:'', note:''
  })
  const [physicalBalance, setPhysicalBalance] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [disposeQty, setDisposeQty] = useState('')
  const [disposeReason, setDisposeReason] = useState('')

  async function refresh() {
    setLoading(true); setError('')
    try {
      const [stock, tx, pesticideList, currentRole] = await Promise.all([
        loadInventory(), loadInventoryTransactions(), loadPesticideOptions(), loadInventoryRole()
      ])
      setRows(stock); setTransactions(tx); setPesticides(pesticideList); setRole(currentRole)
    } catch (e: any) {
      setError(e?.message || '在庫を読み込めませんでした。')
    } finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => `${r.pesticideName} ${r.legacyId} ${r.supplier} ${r.storage} ${r.manufacturerLotNo}`.toLowerCase().includes(q))
  }, [rows, query])

  const active = rows.filter((r) => r.balance > 0)
  const total = active.reduce((sum, r) => sum + r.stockValue, 0)
  const nearExpiry = active.filter((r) => {
    if (!r.expiryDate) return false
    const d = new Date(`${r.expiryDate}T00:00:00`)
    const days = (d.getTime() - Date.now()) / 86400000
    return days >= 0 && days <= 90
  }).length
  const isAdmin = role === 'admin'

  function closeAction() {
    setMode(null); setSelectedLot(null); setPhysicalBalance(''); setAdjustReason(''); setDisposeQty(''); setDisposeReason('')
  }
  function openAdjust(lot: InventoryRow) {
    setSelectedLot(lot); setPhysicalBalance(String(lot.balance)); setAdjustReason(''); setMode('adjust'); setError(''); setSuccess('')
  }
  function openDispose(lot: InventoryRow) {
    setSelectedLot(lot); setDisposeQty(''); setDisposeReason(''); setMode('dispose'); setError(''); setSuccess('')
  }

  async function submitReceive(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setSuccess('')
    try {
      if (!receive.pesticideId) throw new Error('農薬を選択してください。')
      await receiveInventoryLot({
        pesticideId: receive.pesticideId,
        purchaseDate: receive.purchaseDate,
        supplier: receive.supplier,
        purchaseUnitPrice: Number(receive.purchaseUnitPrice || 0),
        packageCount: Number(receive.packageCount),
        packageUnit: receive.packageUnit,
        packageSize: Number(receive.packageSize),
        contentUnit: receive.contentUnit,
        expiryDate: receive.expiryDate,
        storageLocation: receive.storageLocation,
        manufacturerLotNo: receive.manufacturerLotNo,
        note: receive.note,
      })
      setSuccess('入庫を登録しました。在庫と入出庫履歴へ反映しました。')
      setReceive({ pesticideId:'', purchaseDate:todayLocal(), supplier:'', purchaseUnitPrice:'', packageCount:'1', packageUnit:'本', packageSize:'500', contentUnit:'ml', expiryDate:'', storageLocation:'農薬保管庫', manufacturerLotNo:'', note:'' })
      closeAction(); await refresh()
    } catch (e:any) { setError(e?.message || '入庫登録に失敗しました。') }
    finally { setBusy(false) }
  }

  async function submitAdjust(e: FormEvent) {
    e.preventDefault(); if (!selectedLot) return
    setBusy(true); setError(''); setSuccess('')
    try {
      const target = Number(physicalBalance)
      const delta = await adjustInventoryStock(selectedLot.lotId, target, adjustReason)
      setSuccess(delta === 0 ? '在庫差異はありませんでした。' : `棚卸調整を登録しました（差分 ${delta > 0 ? '+' : ''}${num.format(delta)} ${selectedLot.unit}）。`)
      closeAction(); await refresh()
    } catch (e:any) { setError(e?.message || '棚卸調整に失敗しました。') }
    finally { setBusy(false) }
  }

  async function submitDispose(e: FormEvent) {
    e.preventDefault(); if (!selectedLot) return
    setBusy(true); setError(''); setSuccess('')
    try {
      await disposeInventoryStock(selectedLot.lotId, Number(disposeQty), disposeReason)
      setSuccess(`廃棄 ${num.format(Number(disposeQty))} ${selectedLot.unit} を登録しました。`)
      closeAction(); await refresh()
    } catch (e:any) { setError(e?.message || '廃棄登録に失敗しました。') }
    finally { setBusy(false) }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">INVENTORY</p>
          <h1>農薬在庫</h1>
          <p className="sub">在庫は購入・散布・戻入・廃棄・棚卸調整の履歴から自動算出します。</p>
        </div>
        <div className="head-actions">
          {isAdmin && <button className="primary-button inventory-add-button" onClick={()=>{setMode('receive');setError('');setSuccess('')}}><PackagePlus size={17}/>農薬を入庫</button>}
          <button className="icon-button" onClick={() => void refresh()} disabled={loading} aria-label="更新"><RefreshCw size={18} className={loading ? 'spin' : ''}/></button>
        </div>
      </div>

      {error && <div className="notice error dashboard-notice">{error}</div>}
      {success && <div className="notice success dashboard-notice">{success}</div>}

      <div className="metrics inventory-metrics">
        <article className="metric"><span>現在庫金額</span><strong>{yen.format(total)}</strong></article>
        <article className="metric"><span>在庫ありロット</span><strong>{active.length}件</strong></article>
        <article className="metric"><span>90日以内期限</span><strong>{nearExpiry}件</strong></article>
        <article className="metric"><span>入出庫履歴</span><strong>{transactions.length}件</strong></article>
      </div>

      <div className="inventory-tabs">
        <button className={tab==='stock'?'active':''} onClick={()=>setTab('stock')}><ArchiveRestore size={16}/>在庫一覧</button>
        <button className={tab==='history'?'active':''} onClick={()=>setTab('history')}><History size={16}/>入出庫履歴</button>
      </div>

      {tab === 'stock' ? <section className="panel inventory-panel">
        <div className="toolbar">
          <div className="search-box"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="農薬名・ロット・購入先・保管場所を検索"/></div>
          <span className="muted">{filtered.length}件</span>
        </div>
        <div className="table-wrap">
          <table className="data-table inventory-table">
            <thead><tr><th>農薬</th><th>残量</th><th>在庫金額</th><th>期限</th><th>購入先</th><th>保管場所</th><th>ロット</th>{isAdmin&&<th>操作</th>}</tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.lotId} className={r.balance <= 0 ? 'row-zero' : ''}>
                  <td><b>{r.pesticideName}</b>{r.manufacturerLotNo&&<small className="cell-sub">メーカーLot: {r.manufacturerLotNo}</small>}</td>
                  <td><span className={r.balance > 0 ? 'stock-pill' : 'stock-pill zero'}>{num.format(r.balance)} {r.unit}</span></td>
                  <td>{yen.format(r.stockValue)}</td><td>{r.expiryDate || '—'}</td><td>{r.supplier || '—'}</td><td>{r.storage || '—'}</td><td><code>{r.legacyId || '—'}</code></td>
                  {isAdmin&&<td><div className="inventory-row-actions"><button onClick={()=>openAdjust(r)}><ClipboardCheck size={14}/>棚卸</button><button className="danger-text-button" disabled={r.balance<=0} onClick={()=>openDispose(r)}><Trash2 size={14}/>廃棄</button></div></td>}
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={isAdmin?8:7} className="empty-cell">該当する在庫はありません。</td></tr>}
            </tbody>
          </table>
        </div>
      </section> : <section className="panel inventory-panel">
        <div className="section-head"><div><h2>入出庫履歴</h2><p className="muted">購入・散布・戻入・棚卸調整・廃棄を新しい順に表示</p></div><span className="history-count">直近{transactions.length}件</span></div>
        <div className="table-wrap"><table className="data-table transaction-table"><thead><tr><th>日時</th><th>区分</th><th>農薬</th><th>ロット</th><th>増減</th><th>理由</th><th>担当</th></tr></thead><tbody>
          {transactions.map(t=><tr key={t.id}><td>{t.createdAt ? new Date(t.createdAt).toLocaleString('ja-JP') : '—'}</td><td><span className={`tx-kind tx-${t.type.toLowerCase()}`}>{typeLabel[t.type]||t.type}</span></td><td><b>{t.pesticideName}</b></td><td><code>{t.legacyId||'—'}</code></td><td><strong className={t.signedQuantity>=0?'qty-plus':'qty-minus'}>{t.signedQuantity>=0?'+':''}{num.format(t.signedQuantity)} {t.unit}</strong></td><td>{t.reason||'—'}</td><td>{t.createdByName||'—'}</td></tr>)}
          {!loading&&transactions.length===0&&<tr><td colSpan={7} className="empty-cell">入出庫履歴はありません。</td></tr>}
        </tbody></table></div>
      </section>}

      {mode && <div className="inventory-modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget&&!busy)closeAction()}}><section className="panel inventory-modal">
        <div className="section-head"><div><p className="eyebrow">{mode==='receive'?'RECEIVING':mode==='adjust'?'STOCKTAKE':'DISPOSAL'}</p><h2>{mode==='receive'?'農薬を入庫':mode==='adjust'?'棚卸調整':'農薬を廃棄'}</h2></div><button className="close-detail" disabled={busy} onClick={closeAction}><X size={17}/></button></div>

        {mode==='receive'&&<form className="inventory-action-form" onSubmit={submitReceive}>
          <label>農薬<select required value={receive.pesticideId} onChange={e=>setReceive({...receive,pesticideId:e.target.value})}><option value="">選択してください</option>{pesticides.map(p=><option key={p.id} value={p.id}>{p.name}{p.famicRegistrationNo?`（登録 ${p.famicRegistrationNo}）`:''}</option>)}</select></label>
          <div className="form-grid three"><label>購入日<input type="date" value={receive.purchaseDate} onChange={e=>setReceive({...receive,purchaseDate:e.target.value})}/></label><label>購入先<input value={receive.supplier} onChange={e=>setReceive({...receive,supplier:e.target.value})} placeholder="例：古川末三郎商店"/></label><label>1容器単価（円）<input type="number" min="0" step="1" value={receive.purchaseUnitPrice} onChange={e=>setReceive({...receive,purchaseUnitPrice:e.target.value})}/></label></div>
          <div className="form-grid three"><label>容器数<input required type="number" min="0.001" step="0.001" value={receive.packageCount} onChange={e=>setReceive({...receive,packageCount:e.target.value})}/></label><label>容器単位<select value={receive.packageUnit} onChange={e=>setReceive({...receive,packageUnit:e.target.value})}><option>本</option><option>袋</option><option>箱</option><option>個</option></select></label><label>1容器内容量<input required type="number" min="0.001" step="0.001" value={receive.packageSize} onChange={e=>setReceive({...receive,packageSize:e.target.value})}/></label></div>
          <div className="form-grid three"><label>内容量単位<select value={receive.contentUnit} onChange={e=>setReceive({...receive,contentUnit:e.target.value as 'ml'|'g'})}><option value="ml">ml</option><option value="g">g</option></select></label><label>使用期限<input type="date" value={receive.expiryDate} onChange={e=>setReceive({...receive,expiryDate:e.target.value})}/></label><label>保管場所<input value={receive.storageLocation} onChange={e=>setReceive({...receive,storageLocation:e.target.value})}/></label></div>
          <label>メーカーLot No.<input value={receive.manufacturerLotNo} onChange={e=>setReceive({...receive,manufacturerLotNo:e.target.value})}/></label>
          <label>備考<textarea rows={2} value={receive.note} onChange={e=>setReceive({...receive,note:e.target.value})}/></label>
          <div className="inventory-calc-note">入庫総量：<b>{num.format(Number(receive.packageCount||0)*Number(receive.packageSize||0))} {receive.contentUnit}</b></div>
          <button className="primary-button" disabled={busy}>{busy?'登録中…':'入庫を登録'}</button>
        </form>}

        {mode==='adjust'&&selectedLot&&<form className="inventory-action-form" onSubmit={submitAdjust}>
          <div className="selected-lot-card"><b>{selectedLot.pesticideName}</b><span>{selectedLot.legacyId}</span><strong>現在庫 {num.format(selectedLot.balance)} {selectedLot.unit}</strong></div>
          <label>実際に数えた在庫量<input required type="number" min="0" step="0.001" value={physicalBalance} onChange={e=>setPhysicalBalance(e.target.value)}/></label>
          <div className="inventory-calc-note">差分：<b>{Number.isFinite(Number(physicalBalance)) ? `${Number(physicalBalance)-selectedLot.balance>=0?'+':''}${num.format(Number(physicalBalance)-selectedLot.balance)} ${selectedLot.unit}` : '—'}</b></div>
          <label>調整理由<textarea required rows={3} value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} placeholder="例：実地棚卸で開封済み容器の残量を再計量"/></label>
          <button className="primary-button" disabled={busy}>{busy?'反映中…':'棚卸差分を反映'}</button>
        </form>}

        {mode==='dispose'&&selectedLot&&<form className="inventory-action-form" onSubmit={submitDispose}>
          <div className="selected-lot-card"><b>{selectedLot.pesticideName}</b><span>{selectedLot.legacyId}</span><strong>現在庫 {num.format(selectedLot.balance)} {selectedLot.unit}</strong></div>
          <label>廃棄量<input required type="number" min="0.001" max={selectedLot.balance} step="0.001" value={disposeQty} onChange={e=>setDisposeQty(e.target.value)}/></label>
          <label>廃棄理由<textarea required rows={3} value={disposeReason} onChange={e=>setDisposeReason(e.target.value)} placeholder="例：使用期限切れ、容器破損など"/></label>
          <div className="notice warning">廃棄を登録すると在庫から減算され、入出庫履歴と監査ログに残ります。</div>
          <button className="primary-button danger-submit" disabled={busy}>{busy?'反映中…':'廃棄を登録'}</button>
        </form>}
      </section></div>}
    </div>
  )
}
