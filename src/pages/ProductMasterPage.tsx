import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Edit3, Package, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { deleteProduct, loadProductRole, loadProducts, saveProduct, type ProductMaster } from '../lib/products'

const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 3 })

const blank = {
  id: '', sku: '', productName: '', category: '抹茶', brandName: '五代目八木一兵衛', janCode: '',
  netContent: '30', contentUnit: 'g', packageType: '缶', standardPriceYen: '0', packagingCostYen: '0',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE', note: '',
}

export default function ProductMasterPage() {
  const [rows, setRows] = useState<ProductMaster[]>([])
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [form, setForm] = useState(blank)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function refresh() {
    setLoading(true); setError('')
    try {
      const [r, ro] = await Promise.all([loadProducts(), loadProductRole()])
      setRows(r); setRole(ro)
    } catch (e: any) {
      setError(e?.message || '商品マスタを読み込めませんでした。')
    } finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])

  const categories = useMemo(() => [...new Set(rows.map(r => r.category).filter(Boolean))].sort(), [rows])
  const filtered = useMemo(() => {
    const q = query.trim().normalize('NFKC').toLowerCase()
    return rows.filter(r => {
      if (category && r.category !== category) return false
      if (!q) return true
      return `${r.sku} ${r.productName} ${r.category} ${r.brandName} ${r.janCode} ${r.packageType}`.normalize('NFKC').toLowerCase().includes(q)
    })
  }, [rows, query, category])

  const activeCount = rows.filter(r => r.status === 'ACTIVE').length
  const standardValue = rows.filter(r => r.status === 'ACTIVE').reduce((s, r) => s + r.standardPriceYen, 0)
  const isAdmin = role === 'admin'

  function edit(r: ProductMaster) {
    setForm({
      id: r.id, sku: r.sku, productName: r.productName, category: r.category, brandName: r.brandName,
      janCode: r.janCode, netContent: String(r.netContent), contentUnit: r.contentUnit, packageType: r.packageType,
      standardPriceYen: String(r.standardPriceYen), packagingCostYen: String(r.packagingCostYen), status: r.status, note: r.note,
    })
    setOpen(true); setError(''); setSuccess('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setSuccess('')
    try {
      const netContent = Number(form.netContent)
      const standardPriceYen = Number(form.standardPriceYen)
      const packagingCostYen = Number(form.packagingCostYen)
      if (!form.sku.trim()) throw new Error('SKUを入力してください。')
      if (!form.productName.trim()) throw new Error('商品名を入力してください。')
      if (!Number.isFinite(netContent) || netContent < 0) throw new Error('内容量は0以上で入力してください。')
      if (!Number.isFinite(standardPriceYen) || standardPriceYen < 0) throw new Error('標準販売価格は0以上で入力してください。')
      if (!Number.isFinite(packagingCostYen) || packagingCostYen < 0) throw new Error('包材原価は0以上で入力してください。')
      await saveProduct({
        id: form.id || undefined,
        sku: form.sku,
        productName: form.productName,
        category: form.category,
        brandName: form.brandName,
        janCode: form.janCode,
        netContent,
        contentUnit: form.contentUnit,
        packageType: form.packageType,
        standardPriceYen,
        packagingCostYen,
        status: form.status,
        note: form.note,
      })
      setSuccess(form.id ? '商品マスタを更新しました。' : '商品マスタへ追加しました。')
      setOpen(false); setForm(blank); await refresh()
    } catch (e: any) {
      setError(e?.message || '商品を保存できませんでした。')
    } finally { setBusy(false) }
  }

  async function remove(r: ProductMaster) {
    if (!window.confirm(`「${r.productName}」を商品マスタから削除しますか？\n過去データ保護のため内部では履歴を保持します。`)) return
    setBusy(true); setError(''); setSuccess('')
    try {
      await deleteProduct(r.id)
      setSuccess(`${r.productName} を削除しました。`)
      await refresh()
    } catch (e: any) {
      setError(e?.message || '商品を削除できませんでした。')
    } finally { setBusy(false) }
  }

  return <div className="page product-master-page">
    <div className="page-head">
      <div><p className="eyebrow">PRODUCT / SKU MASTER</p><h1>商品マスタ</h1><p className="sub">販売商品のSKU・JAN・内容量・価格・包材原価を管理します。管理者は登録・編集・削除できます。</p></div>
      <div className="head-actions">
        {isAdmin && <button className="primary-button" onClick={() => { setForm(blank); setOpen(true); setError(''); setSuccess('') }}><Plus size={17}/>商品を追加</button>}
        <button className="icon-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={18} className={loading ? 'spin' : ''}/></button>
      </div>
    </div>
    {error && <div className="notice error dashboard-notice">{error}</div>}
    {success && <div className="notice success dashboard-notice">{success}</div>}

    <div className="product-master-metrics">
      <article><span>登録商品</span><strong>{rows.length}SKU</strong></article>
      <article><span>販売中</span><strong>{activeCount}SKU</strong></article>
      <article><span>カテゴリ</span><strong>{categories.length}種</strong></article>
      <article><span>標準価格合計</span><strong>{yen.format(standardValue)}</strong><small>販売中SKUの参考値</small></article>
    </div>

    <section className="panel">
      <div className="toolbar product-master-toolbar">
        <div className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="商品名・SKU・JAN・カテゴリを検索"/></div>
        <select value={category} onChange={e => setCategory(e.target.value)}><option value="">全カテゴリ</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
        <span className="muted">{filtered.length}件</span>
      </div>
      <div className="product-master-grid">
        {filtered.map(r => <article className={`product-master-card ${r.status === 'INACTIVE' ? 'inactive' : ''}`} key={r.id}>
          <div className="product-card-head"><div><span>{r.category || 'その他'}</span><h3>{r.productName}</h3><small>{r.brandName || 'ブランド未設定'}</small></div><Package size={23}/></div>
          <div className="product-card-identifiers"><code>{r.sku}</code>{r.janCode && <span>JAN {r.janCode}</span>}</div>
          <div className="product-card-specs"><div><span>内容量</span><b>{num.format(r.netContent)} {r.contentUnit}</b></div><div><span>容器</span><b>{r.packageType || '未設定'}</b></div><div><span>標準価格</span><b>{yen.format(r.standardPriceYen)}</b></div><div><span>包材原価</span><b>{yen.format(r.packagingCostYen)}</b></div></div>
          {r.note && <p>{r.note}</p>}
          <div className="product-card-foot"><span className={`product-status ${r.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{r.status === 'ACTIVE' ? '販売中' : '休止'}</span>{isAdmin && <div><button onClick={() => edit(r)}><Edit3 size={14}/>編集</button><button className="danger-text" onClick={() => void remove(r)} disabled={busy}><Trash2 size={14}/>削除</button></div>}</div>
        </article>)}
        {!loading && !filtered.length && <p className="empty">該当する商品はありません。</p>}
      </div>
    </section>

    {open && <div className="inventory-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setOpen(false) }}>
      <section className="panel inventory-modal product-master-modal">
        <div className="section-head"><div><p className="eyebrow">PRODUCT MASTER</p><h2>{form.id ? '商品を編集' : '商品を追加'}</h2></div><button className="close-detail" onClick={() => setOpen(false)} disabled={busy}><X size={17}/></button></div>
        <form className="inventory-action-form" onSubmit={submit}>
          <div className="form-grid two"><label>SKU<input required value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="例：MATCHA-YABUKITA-30-CAN"/></label><label>JANコード<input inputMode="numeric" value={form.janCode} onChange={e => setForm({...form, janCode: e.target.value})} placeholder="任意"/></label></div>
          <label>商品名<input required value={form.productName} onChange={e => setForm({...form, productName: e.target.value})} placeholder="例：宇治抹茶 やぶきた 30g缶"/></label>
          <div className="form-grid two"><label>カテゴリ<input list="product-category-list" value={form.category} onChange={e => setForm({...form, category: e.target.value})}/><datalist id="product-category-list"><option value="抹茶"/><option value="玉露"/><option value="煎茶"/><option value="ほうじ茶"/><option value="京番茶"/><option value="碾茶"/><option value="ティーバッグ"/><option value="ギフト"/><option value="その他"/></datalist></label><label>ブランド<input value={form.brandName} onChange={e => setForm({...form, brandName: e.target.value})}/></label></div>
          <div className="form-grid three"><label>内容量<input type="number" min="0" step="0.001" value={form.netContent} onChange={e => setForm({...form, netContent: e.target.value})}/></label><label>内容量単位<select value={form.contentUnit} onChange={e => setForm({...form, contentUnit: e.target.value})}><option>g</option><option>kg</option><option>ml</option><option>個</option><option>袋</option><option>本</option></select></label><label>容器・包装<input list="package-type-list" value={form.packageType} onChange={e => setForm({...form, packageType: e.target.value})}/><datalist id="package-type-list"><option value="缶"/><option value="アルミ袋"/><option value="紙箱"/><option value="ティーバッグ袋"/><option value="化粧箱"/><option value="バルク"/></datalist></label></div>
          <div className="form-grid two"><label>標準販売価格（税込想定）<input type="number" min="0" step="1" value={form.standardPriceYen} onChange={e => setForm({...form, standardPriceYen: e.target.value})}/></label><label>包材原価 / 1商品<input type="number" min="0" step="1" value={form.packagingCostYen} onChange={e => setForm({...form, packagingCostYen: e.target.value})}/></label></div>
          <label>備考<textarea rows={3} value={form.note} onChange={e => setForm({...form, note: e.target.value})}/></label>
          <label className="check-line"><input type="checkbox" checked={form.status === 'ACTIVE'} onChange={e => setForm({...form, status: e.target.checked ? 'ACTIVE' : 'INACTIVE'})}/>販売中の商品として表示</label>
          <button className="primary-button" disabled={busy}>{busy ? '保存中…' : '保存'}</button>
        </form>
      </section>
    </div>}
  </div>
}
