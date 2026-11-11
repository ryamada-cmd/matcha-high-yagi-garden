import { Dialog, DialogHeader } from '../components/AppDialog'
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHeaderCell } from '@astryxdesign/core/Table'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Button } from '@astryxdesign/core/Button'
import { useEffect, useMemo, useState } from 'react'
import { Edit3, RefreshCw, Save, Tags } from 'lucide-react'
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
  return <div className="page price-list-page astryx-page astryx-price-list">
    <div className="page-head"><div><p className="eyebrow">PRODUCT PRICE LIST</p><h1>商品価格表</h1><p className="sub">商品ごとの卸・小売・その他価格を一覧で確認します。帳票作成時の単価にも連動します。</p></div><Button className="ui-astryx-action ui-astryx-refresh" variant="secondary" label="商品価格表を更新" icon={<RefreshCw size={18} className={loading?'spin':''}/>} isIconOnly onClick={()=>void refresh()} isDisabled={loading}/></div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}{success&&<div className="notice success dashboard-notice">{success}</div>}
    <section className="panel"><div className="toolbar price-list-toolbar"><TextInput containerClassName="astryx-search-field" label="商品価格を検索" isLabelHidden type="search" value={query} onChange={setQuery} placeholder="商品名・SKU・カテゴリを検索" hasClear width="100%"/><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">全カテゴリ</option>{categories.map(c=><option key={c}>{c}</option>)}</select><span className="muted">{filtered.length}件</span></div>
      <div className="price-list-table-wrap"><Table className="price-list-table" aria-label="商品価格一覧" density="compact" dividers="rows" hasHover><TableHeader><TableRow isHeaderRow><TableHeaderCell>商品</TableHeaderCell><TableHeaderCell>規格</TableHeaderCell><TableHeaderCell>SKU</TableHeaderCell><TableHeaderCell>卸</TableHeaderCell><TableHeaderCell>小売</TableHeaderCell><TableHeaderCell>その他</TableHeaderCell>{canManage&&<TableHeaderCell/>}</TableRow></TableHeader><TableBody>{filtered.map(row=><TableRow key={row.id}><TableCell><b>{row.productName}</b><small>{row.category}</small></TableCell><TableCell>{row.netContent} {row.contentUnit} / {row.packageType||'—'}</TableCell><TableCell><code>{row.sku}</code></TableCell><TableCell className="money">{yen.format(row.wholesalePriceYen)}</TableCell><TableCell className="money">{yen.format(row.retailPriceYen)}</TableCell><TableCell className="money">{yen.format(row.otherPriceYen)}</TableCell>{canManage&&<TableCell><button className="table-icon-button" onClick={()=>openEdit(row)}><Edit3 size={15}/>編集</button></TableCell>}</TableRow>)}</TableBody></Table>{!loading&&!filtered.length&&<p className="empty">販売中の商品がありません。</p>}</div>
    </section>
    {editing&&<Dialog error={error} className="astryx-inventory-dialog astryx-price-dialog" isOpen={true} width="min(560px, 95vw)" maxHeight="88dvh" purpose="form" onOpenChange={open=>{if(!open&&!busy)setEditing(null)}}><DialogHeader title={editing.productName} subtitle={editing.netContent+' '+editing.contentUnit+' / '+(editing.packageType||'—')} onOpenChange={open=>{if(!open&&!busy)setEditing(null)}}/><div className="astryx-inventory-dialog-body"><div className="price-edit-grid"><label><Tags size={16}/>卸価格<input type="number" min="0" step="1" value={prices.wholesale} onChange={e=>setPrices({...prices,wholesale:e.target.value})}/></label><label><Tags size={16}/>小売価格<input type="number" min="0" step="1" value={prices.retail} onChange={e=>setPrices({...prices,retail:e.target.value})}/></label><label><Tags size={16}/>その他価格<input type="number" min="0" step="1" value={prices.other} onChange={e=>setPrices({...prices,other:e.target.value})}/></label></div><Button isLoading={busy}  className="ui-astryx-action" variant="primary" label={busy?'保存中…':'価格を保存'} icon={<Save size={16}/>} onClick={()=>void save()} isDisabled={busy}/></div></Dialog>}
  </div>
}
