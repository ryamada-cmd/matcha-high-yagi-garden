import { useEffect, useMemo, useState } from 'react'
import { Edit3, RefreshCw, Save, Search, Tags, X } from 'lucide-react'
import { loadProducts, saveProduct, type ProductMaster } from '../lib/products'
import { useAppPermissions } from '../lib/permissions'

const yen=new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0})

export default function PriceListPage(){
  const {allowed}=useAppPermissions(); const canManage=allowed('products.manage')
  const [rows,setRows]=useState<ProductMaster[]>([]); const [loading,setLoading]=useState(true); const [query,setQuery]=useState(''); const [category,setCategory]=useState('');
  const [editing,setEditing]=useState<ProductMaster|null>(null); const [prices,setPrices]=useState({wholesale:'0',retail:'0',other:'0'}); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [success,setSuccess]=useState('')
  async function refresh(){setLoading(true);setError('');try{setRows(await loadProducts())}catch(e:any){setError(e?.message||'価格表を読み込めませんでした。')}finally{setLoading(false)}}
  useEffect(()=>{void refresh()},[])
  const categories=useMemo(()=>[...new Set(rows.map(r=>r.category).filter(Boolean))].sort(),[rows])
  const filtered=useMemo(()=>{const q=query.trim().normalize('NFKC').toLowerCase();return rows.filter(r=>r.status==='ACTIVE'&&(!category||r.category===category)&&(!q||`${r.productName} ${r.sku} ${r.category} ${r.packageType}`.normalize('NFKC').toLowerCase().includes(q)))},[rows,query,category])
  function openEdit(r:ProductMaster){if(!canManage)return;setEditing(r);setPrices({wholesale:String(r.wholesalePriceYen),retail:String(r.retailPriceYen),other:String(r.otherPriceYen)});setError('');setSuccess('')}
  async function save(){if(!editing||!canManage)return;const w=Number(prices.wholesale),r=Number(prices.retail),o=Number(prices.other);if([w,r,o].some(v=>!Number.isFinite(v)||v<0))return setError('価格は0以上で入力してください。');setBusy(true);setError('');try{await saveProduct({...editing,wholesalePriceYen:w,retailPriceYen:r,otherPriceYen:o,standardPriceYen:r});setSuccess(`${editing.productName} の価格を更新しました。`);setEditing(null);await refresh()}catch(e:any){setError(e?.message||'価格を保存できませんでした。')}finally{setBusy(false)}}
  return <div className="page price-list-page">
    <div className="page-head"><div><p className="eyebrow">PRODUCT PRICE LIST</p><h1>商品価格表</h1><p className="sub">商品ごとの卸・小売・その他価格を一覧で確認します。帳票作成時の単価にも連動します。</p></div><button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}{success&&<div className="notice success dashboard-notice">{success}</div>}
    <section className="panel"><div className="toolbar price-list-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="商品名・SKU・カテゴリを検索"/></div><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">全カテゴリ</option>{categories.map(c=><option key={c}>{c}</option>)}</select><span className="muted">{filtered.length}件</span></div>
      <div className="price-list-table-wrap"><table className="price-list-table"><thead><tr><th>商品</th><th>規格</th><th>SKU</th><th>卸</th><th>小売</th><th>その他</th>{canManage&&<th/>}</tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td><b>{row.productName}</b><small>{row.category}</small></td><td>{row.netContent} {row.contentUnit} / {row.packageType||'—'}</td><td><code>{row.sku}</code></td><td className="money">{yen.format(row.wholesalePriceYen)}</td><td className="money">{yen.format(row.retailPriceYen)}</td><td className="money">{yen.format(row.otherPriceYen)}</td>{canManage&&<td><button className="table-icon-button" onClick={()=>openEdit(row)}><Edit3 size={15}/>編集</button></td>}</tr>)}</tbody></table>{!loading&&!filtered.length&&<p className="empty">販売中の商品がありません。</p>}</div>
    </section>
    {editing&&<div className="inventory-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setEditing(null)}}><section className="panel inventory-modal price-edit-modal"><div className="section-head"><div><p className="eyebrow">PRICE</p><h2>{editing.productName}</h2><p>{editing.netContent} {editing.contentUnit} / {editing.packageType}</p></div><button className="close-detail" onClick={()=>setEditing(null)}><X size={17}/></button></div><div className="price-edit-grid"><label><Tags size={16}/>卸価格<input type="number" min="0" step="1" value={prices.wholesale} onChange={e=>setPrices({...prices,wholesale:e.target.value})}/></label><label><Tags size={16}/>小売価格<input type="number" min="0" step="1" value={prices.retail} onChange={e=>setPrices({...prices,retail:e.target.value})}/></label><label><Tags size={16}/>その他価格<input type="number" min="0" step="1" value={prices.other} onChange={e=>setPrices({...prices,other:e.target.value})}/></label></div><button className="primary-button" onClick={()=>void save()} disabled={busy}><Save size={16}/>{busy?'保存中…':'価格を保存'}</button></section></div>}
  </div>
}
