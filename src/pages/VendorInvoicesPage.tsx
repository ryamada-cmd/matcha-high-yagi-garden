import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Banknote, CalendarClock, Download, Edit3, ExternalLink, FileImage, FileText, Paperclip, Plus, RefreshCw, Search, Trash2, TriangleAlert, X } from 'lucide-react'
import { useAppPermissions } from '../lib/permissions'
import { deleteVendorInvoice, deleteVendorInvoicePayment, loadVendorInvoices, saveVendorInvoice, saveVendorInvoicePayment, type VendorInvoice, type VendorInvoicePayment } from '../lib/vendorInvoices'
import { recognizeDocument, type DocumentOcrResult } from '../lib/documentOcr'
import { loadVendorDocumentMap, uploadVendorDocument, type VendorDocumentMap } from '../lib/vendorDocuments'

const yen=new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0})
const num=new Intl.NumberFormat('ja-JP',{maximumFractionDigits:3})
const dateInput=(value?:string)=>value?.slice(0,10)||new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)
const monthNow=()=>dateInput().slice(0,7)
const categoryOptions=[['FERTILIZER','肥料代'],['PESTICIDE','農薬代'],['FRESH_LEAF','生葉代'],['TENCHA_PROCESSING','碾茶加工賃'],['MATCHA_PROCESSING','抹茶加工賃'],['PACKAGING','資材・包材'],['SHIPPING','運賃・送料'],['REPAIR','修理・整備費'],['OUTSOURCING','外注費'],['OTHER','その他']] as const
const categoryLabel=(value:string)=>categoryOptions.find(([key])=>key===value)?.[1]||value||'その他'
const statusLabel=(value:string)=>value==='PAID'?'支払済':value==='PARTIAL'?'一部支払':value==='HOLD'?'保留':'未払'
const paymentMethods=['銀行振込','口座振替','クレジットカード','現金','その他']
const csvCell=(value:unknown)=>`"${String(value??'').replace(/"/g,'""')}"`

type InvoiceFormItem={key:string;category:string;description:string;quantity:string;unit:string;unitPrice:string;taxRate:string;note:string}
const newItem=():InvoiceFormItem=>({key:`${Date.now()}-${Math.random()}`,category:'OTHER',description:'',quantity:'1',unit:'',unitPrice:'',taxRate:'10',note:''})
const blankInvoice=()=>({id:'',externalInvoiceNo:'',vendor:'',invoiceDate:dateInput(),paymentDueDate:'',scheduledPaymentDate:'',plannedPaymentMethod:'銀行振込',plannedPaymentAccount:'',isOnHold:false,note:'',items:[newItem()]})
const blankPayment=(invoice:VendorInvoice,payment?:VendorInvoicePayment)=>({id:payment?.id||'',invoiceId:invoice.id,paymentDate:payment?.paymentDate||dateInput(),amountYen:String(payment?.amountYen??Math.max(0,invoice.totalAmountYen-invoice.paidAmountYen)),paymentMethod:payment?.paymentMethod||invoice.plannedPaymentMethod||'銀行振込',paymentAccount:payment?.paymentAccount||invoice.plannedPaymentAccount||'',referenceNo:payment?.referenceNo||'',note:payment?.note||''})

export default function VendorInvoicesPage(){
  const{allowed}=useAppPermissions(),canManage=allowed('vendor_invoices.manage'),canExport=allowed('vendor_invoices.export')
  const[invoices,setInvoices]=useState<VendorInvoice[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const[form,setForm]=useState(blankInvoice),[query,setQuery]=useState(''),[status,setStatus]=useState(''),[month,setMonth]=useState('')
  const[paymentInvoice,setPaymentInvoice]=useState<VendorInvoice|null>(null),[paymentForm,setPaymentForm]=useState<ReturnType<typeof blankPayment>|null>(null)
  const[documentMap,setDocumentMap]=useState<VendorDocumentMap>({}),[invoiceFile,setInvoiceFile]=useState<File|null>(null),[invoiceOcr,setInvoiceOcr]=useState<DocumentOcrResult|null>(null),[invoiceOcrProgress,setInvoiceOcrProgress]=useState('')
  const[paymentFile,setPaymentFile]=useState<File|null>(null),[paymentOcr,setPaymentOcr]=useState<DocumentOcrResult|null>(null),[paymentOcrProgress,setPaymentOcrProgress]=useState('')

  async function refresh(){setLoading(true);setError('');try{const [rows,docs]=await Promise.all([loadVendorInvoices(),loadVendorDocumentMap().catch(()=>({} as VendorDocumentMap))]);setInvoices(rows);setDocumentMap(docs)}catch(e:any){setError(e?.message||'請求書を読み込めませんでした。')}finally{setLoading(false)}}
  useEffect(()=>{void refresh()},[])
  const formTotal=useMemo(()=>form.items.reduce((sum,item)=>sum+Math.round((Number(item.quantity)||0)*(Number(item.unitPrice)||0)),0),[form.items])

  function resetForm(clear=true){setForm(blankInvoice());setInvoiceFile(null);setInvoiceOcr(null);setInvoiceOcrProgress('');setError('');if(clear)setSuccess('')}
  function updateItem(key:string,patch:Partial<InvoiceFormItem>){setForm(old=>({...old,items:old.items.map(item=>item.key===key?{...item,...patch}:item)}))}
  function removeItem(key:string){setForm(old=>({...old,items:old.items.length===1?old.items:old.items.filter(item=>item.key!==key)}))}

  async function runInvoiceOcr(file:File){
    setInvoiceFile(file);setInvoiceOcr(null);setInvoiceOcrProgress('OCRを準備しています…');setError('');setSuccess('')
    try{
      const result=await recognizeDocument(file,'VENDOR_INVOICE',(progress,message)=>setInvoiceOcrProgress(`${message} ${progress}%`))
      setInvoiceOcr(result);setInvoiceOcrProgress('')
      setSuccess('請求書OCRが完了しました。候補値を確認して入力欄へ反映してください。')
    }catch(e:any){setError(e?.message||'請求書をOCRできませんでした。');setInvoiceOcrProgress('')}
  }

  function applyInvoiceOcr(){
    if(!invoiceOcr)return
    setForm(old=>{
      let items=old.items
      const first=items[0]
      const blankFirst=items.length===1&&!first.description.trim()&&!first.unitPrice
      if(blankFirst&&invoiceOcr.totalYen>0){
        const parsed=invoiceOcr.items[0]
        items=[{...first,category:invoiceOcr.suggestedCategory||'OTHER',description:parsed?.description||'請求書記載分',quantity:'1',unit:'式',unitPrice:String(invoiceOcr.totalYen),taxRate:String(parsed?.taxRate??10)}]
      }
      return{...old,vendor:invoiceOcr.vendor||old.vendor,externalInvoiceNo:invoiceOcr.documentNo||old.externalInvoiceNo,invoiceDate:invoiceOcr.date||old.invoiceDate,paymentDueDate:invoiceOcr.dueDate||old.paymentDueDate,items}
    })
    setSuccess('OCR候補を入力欄へ反映しました。原本を確認してから保存してください。')
  }

  async function runPaymentOcr(file:File){
    setPaymentFile(file);setPaymentOcr(null);setPaymentOcrProgress('OCRを準備しています…');setError('');setSuccess('')
    try{
      const result=await recognizeDocument(file,'PAYMENT_PROOF',(progress,message)=>setPaymentOcrProgress(`${message} ${progress}%`))
      setPaymentOcr(result);setPaymentOcrProgress('')
      setSuccess('支払証憑OCRが完了しました。候補値を確認してください。')
    }catch(e:any){setError(e?.message||'支払証憑をOCRできませんでした。');setPaymentOcrProgress('')}
  }

  function applyPaymentOcr(){
    if(!paymentOcr)return
    setPaymentForm(old=>old?{...old,paymentDate:paymentOcr.date||old.paymentDate,amountYen:paymentOcr.totalYen?String(paymentOcr.totalYen):old.amountYen,paymentMethod:paymentOcr.paymentMethod||old.paymentMethod,referenceNo:paymentOcr.referenceNo||old.referenceNo}:old)
    setSuccess('OCR候補を支払入力へ反映しました。内容を確認してから登録してください。')
  }

  async function submitInvoice(event:FormEvent){
    event.preventDefault();if(!canManage)return setError('請求書を変更する権限がありません。');setBusy(true);setError('');setSuccess('')
    try{
      if(!form.vendor.trim())throw new Error('請求元を入力してください。')
      if(!form.invoiceDate)throw new Error('請求日を入力してください。')
      const items=form.items.map((item,index)=>{const quantity=Number(item.quantity),unitPrice=Number(item.unitPrice),taxRate=Number(item.taxRate);if(!item.description.trim())throw new Error(`${index+1}行目の請求内容を入力してください。`);if(!Number.isFinite(quantity)||quantity<=0)throw new Error(`${index+1}行目の数量を確認してください。`);if(!Number.isFinite(unitPrice)||unitPrice<0)throw new Error(`${index+1}行目の税込単価を確認してください。`);if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100)throw new Error(`${index+1}行目の税率を確認してください。`);return{category:item.category,description:item.description,quantity,unit:item.unit,unitPriceYen:unitPrice,taxRate,note:item.note}})
      const id=await saveVendorInvoice({...form,id:form.id||undefined,items})
      let message=form.id?'請求書を更新しました。':'請求書を登録しました。'
      if(invoiceFile){await uploadVendorDocument({file:invoiceFile,invoiceId:id,kind:'INVOICE'});message+=' 原本をOneDriveへ保存しました。'}
      setSuccess(message);resetForm(false);await refresh()
    }catch(e:any){setError(e?.message||'請求書を保存できませんでした。')}finally{setBusy(false)}
  }

  function editInvoice(invoice:VendorInvoice){if(!canManage){setError('請求書を編集する権限がありません。');return}setInvoiceFile(null);setInvoiceOcr(null);setInvoiceOcrProgress('');setForm({id:invoice.id,externalInvoiceNo:invoice.externalInvoiceNo,vendor:invoice.vendor,invoiceDate:invoice.invoiceDate,paymentDueDate:invoice.paymentDueDate,scheduledPaymentDate:invoice.scheduledPaymentDate,plannedPaymentMethod:invoice.plannedPaymentMethod||'銀行振込',plannedPaymentAccount:invoice.plannedPaymentAccount,isOnHold:invoice.isOnHold,note:invoice.note,items:invoice.items.map(item=>({key:item.id,category:item.category,description:item.description,quantity:String(item.quantity),unit:item.unit,unitPrice:String(item.unitPriceYen),taxRate:String(item.taxRate),note:item.note}))});setError('');setSuccess('');window.scrollTo({top:0,behavior:'smooth'})}
  function openPayment(invoice:VendorInvoice,payment?:VendorInvoicePayment){if(!canManage){setError('支払いを登録・編集する権限がありません。');return}setPaymentFile(null);setPaymentOcr(null);setPaymentOcrProgress('');setPaymentInvoice(invoice);setPaymentForm(blankPayment(invoice,payment));setError('');setSuccess('')}
  function closePayment(){if(busy)return;setPaymentInvoice(null);setPaymentForm(null);setPaymentFile(null);setPaymentOcr(null);setPaymentOcrProgress('')}

  async function submitPayment(event:FormEvent){
    event.preventDefault();if(!canManage)return setError('支払いを登録・編集する権限がありません。');if(!paymentForm||!paymentInvoice)return;setBusy(true);setError('');setSuccess('')
    try{const amount=Number(paymentForm.amountYen);if(!paymentForm.paymentDate)throw new Error('支払日を入力してください。');if(!Number.isFinite(amount)||amount<=0)throw new Error('支払金額を確認してください。');const paymentId=await saveVendorInvoicePayment({...paymentForm,id:paymentForm.id||undefined,amountYen:amount});let message=paymentForm.id?'支払記録を更新しました。':'支払いを登録しました。';if(paymentFile){await uploadVendorDocument({file:paymentFile,invoiceId:paymentInvoice.id,kind:'PAYMENT',paymentId});message+=' 支払証憑の原本をOneDriveへ保存しました。'}setSuccess(message);setPaymentInvoice(null);setPaymentForm(null);setPaymentFile(null);setPaymentOcr(null);setPaymentOcrProgress('');await refresh()}catch(e:any){setError(e?.message||'支払いを登録できませんでした。')}finally{setBusy(false)}
  }

  async function removePayment(payment:VendorInvoicePayment){if(!canManage)return setError('支払記録を削除する権限がありません。');const reason=window.prompt('支払記録を削除する理由を入力してください。');if(reason===null)return;if(!reason.trim()){setError('削除理由を入力してください。');return}setBusy(true);setError('');try{await deleteVendorInvoicePayment(payment.id,reason);setSuccess(`${payment.paymentNo} を削除しました。`);await refresh()}catch(e:any){setError(e?.message||'支払記録を削除できませんでした。')}finally{setBusy(false)}}
  async function removeInvoice(invoice:VendorInvoice){if(!canManage)return setError('請求書を削除する権限がありません。');const reason=window.prompt(`${invoice.invoiceNo} を削除する理由を入力してください。`);if(reason===null)return;if(!reason.trim()){setError('削除理由を入力してください。');return}setBusy(true);setError('');try{await deleteVendorInvoice(invoice.id,reason);setSuccess(`${invoice.invoiceNo} を削除しました。`);await refresh()}catch(e:any){setError(e?.message||'請求書を削除できませんでした。')}finally{setBusy(false)}}

  const filtered=useMemo(()=>{const q=query.trim().normalize('NFKC').toLowerCase();return invoices.filter(invoice=>{if(status&&invoice.paymentStatus!==status)return false;if(month&&!invoice.invoiceDate.startsWith(month))return false;if(!q)return true;return`${invoice.invoiceNo} ${invoice.externalInvoiceNo} ${invoice.vendor} ${invoice.note} ${invoice.items.map(item=>`${categoryLabel(item.category)} ${item.description} ${item.note}`).join(' ')} ${invoice.payments.map(payment=>`${payment.paymentMethod} ${payment.paymentAccount} ${payment.referenceNo}`).join(' ')}`.normalize('NFKC').toLowerCase().includes(q)})},[invoices,status,month,query])
  const today=dateInput(),currentMonth=monthNow()
  const outstanding=invoices.filter(i=>i.paymentStatus!=='PAID').reduce((sum,i)=>sum+Math.max(0,i.totalAmountYen-i.paidAmountYen),0)
  const overdue=invoices.filter(i=>i.paymentStatus!=='PAID'&&i.paymentStatus!=='HOLD'&&i.paymentDueDate&&i.paymentDueDate<today)
  const scheduled=invoices.filter(i=>i.paymentStatus!=='PAID'&&i.scheduledPaymentDate.startsWith(currentMonth)).reduce((sum,i)=>sum+Math.max(0,i.totalAmountYen-i.paidAmountYen),0)
  const paidThisMonth=invoices.flatMap(i=>i.payments).filter(p=>p.paymentDate.startsWith(currentMonth)).reduce((sum,p)=>sum+p.amountYen,0)

  function exportCsv(){
    if(!canExport){setError('請求書CSVを出力する権限がありません。');return}
    const header=['管理番号','先方請求書番号','請求元','請求日','支払期限','支払予定日','状態','明細番号','分類','請求内容','数量','単位','税込単価','税率','明細金額','請求額','支払済額','未払額','支払方法','支払口座','備考']
    const rows=filtered.flatMap(invoice=>invoice.items.map(item=>[invoice.invoiceNo,invoice.externalInvoiceNo,invoice.vendor,invoice.invoiceDate,invoice.paymentDueDate,invoice.scheduledPaymentDate,statusLabel(invoice.paymentStatus),item.lineNo,categoryLabel(item.category),item.description,item.quantity,item.unit,item.unitPriceYen,`${item.taxRate}%`,item.lineTotalYen,invoice.totalAmountYen,invoice.paidAmountYen,Math.max(0,invoice.totalAmountYen-invoice.paidAmountYen),invoice.plannedPaymentMethod,invoice.plannedPaymentAccount,invoice.note]))
    const csv='\ufeff'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`請求書支払管理_${month||'全期間'}.csv`;a.click();URL.revokeObjectURL(url)
  }

  return <div className="page vendor-invoices-page">
    <div className="page-head"><div><p className="eyebrow">ACCOUNTS PAYABLE</p><h1>請求書・支払管理</h1><p className="sub">外部から届く請求書を明細単位で登録し、支払予定・支払実績・未払残高を管理します。</p></div><div className="head-actions">{canExport&&<button className="secondary-button" type="button" onClick={exportCsv} disabled={!filtered.length}><Download size={17}/>CSVエクスポート</button>}<button className="icon-button" type="button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div></div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}{success&&<div className="notice success dashboard-notice">{success}</div>}

    <section className="metrics invoice-metrics">
      <div className="metric"><span>未払残高</span><strong>{yen.format(outstanding)}</strong><small>{invoices.filter(i=>i.paymentStatus==='UNPAID'||i.paymentStatus==='PARTIAL'||i.paymentStatus==='HOLD').length}件</small></div>
      <div className="metric warning"><span>支払期限超過</span><strong>{overdue.length}件</strong><small>{yen.format(overdue.reduce((sum,i)=>sum+Math.max(0,i.totalAmountYen-i.paidAmountYen),0))}</small></div>
      <div className="metric"><span>今月の支払予定</span><strong>{yen.format(scheduled)}</strong><small>{currentMonth.replace('-','年')}月</small></div>
      <div className="metric"><span>今月の支払実績</span><strong>{yen.format(paidThisMonth)}</strong><small>支払履歴から集計</small></div>
    </section>

    {canManage&&<form className="panel vendor-invoice-form" onSubmit={submitInvoice}>
      <div className="panel-title"><div><h2>{form.id?'請求書を編集':'請求書を登録'}</h2><p>画像・PDFをOCRすると請求元・日付・金額などを候補入力できます。原本は登録時にOneDriveへ保存します。</p></div><FileText size={20}/></div>
      <section className="vendor-document-upload"><div className="vendor-document-upload-head"><div><Paperclip size={18}/><div><b>仕入請求書の原本</b><span>画像またはPDFを選ぶとOCRを開始します。1ファイル25MBまで。</span></div></div>{invoiceFile&&<strong>{invoiceFile.name}</strong>}</div><label className="secondary-button vendor-file-picker"><FileImage size={16}/>{invoiceOcrProgress||'画像/PDFを選んでOCR'}<input type="file" accept="image/*,.heic,.heif,application/pdf" onChange={e=>{const file=e.currentTarget.files?.[0]||null;if(file)void runInvoiceOcr(file);e.currentTarget.value=''}}/></label>{form.id&&(documentMap[form.id]||[]).filter(x=>x.kind==='INVOICE').length>0&&<div className="vendor-saved-documents">{(documentMap[form.id]||[]).filter(x=>x.kind==='INVOICE').map(doc=><a key={doc.id} href={doc.webUrl} target="_blank" rel="noreferrer"><ExternalLink size={13}/>{doc.fileName}</a>)}</div>}</section>
      {(invoiceOcrProgress||invoiceOcr)&&<section className="document-ocr-panel"><div className="document-ocr-head"><div><Search size={18}/><div><b>請求書OCR結果</b><span>{invoiceOcrProgress||`信頼度の目安 ${invoiceOcr?.confidence??0}%`}</span></div></div>{invoiceOcr&&<button type="button" className="primary-button compact" onClick={applyInvoiceOcr}>入力欄へ反映</button>}</div>{invoiceOcr&&<><div className="document-ocr-fields"><div><span>請求元</span><b>{invoiceOcr.vendor||'—'}</b></div><div><span>先方番号</span><b>{invoiceOcr.documentNo||'—'}</b></div><div><span>請求日</span><b>{invoiceOcr.date||'—'}</b></div><div><span>支払期限</span><b>{invoiceOcr.dueDate||'—'}</b></div><div><span>合計金額</span><b>{invoiceOcr.totalYen?yen.format(invoiceOcr.totalYen):'—'}</b></div></div><details><summary>読み取った文字を確認</summary><pre>{invoiceOcr.rawText}</pre></details></>}</section>}
      <div className="invoice-header-grid">
        <label><span>請求元 *</span><input value={form.vendor} onChange={e=>setForm(v=>({...v,vendor:e.target.value}))} placeholder="例：株式会社○○" required/></label>
        <label><span>先方請求書番号</span><input value={form.externalInvoiceNo} onChange={e=>setForm(v=>({...v,externalInvoiceNo:e.target.value}))} placeholder="請求書に記載の番号"/></label>
        <label><span>請求日 *</span><input type="date" value={form.invoiceDate} onChange={e=>setForm(v=>({...v,invoiceDate:e.target.value}))} required/></label>
        <label><span>支払期限</span><input type="date" value={form.paymentDueDate} onChange={e=>setForm(v=>({...v,paymentDueDate:e.target.value}))}/></label>
        <label><span>支払予定日</span><input type="date" value={form.scheduledPaymentDate} onChange={e=>setForm(v=>({...v,scheduledPaymentDate:e.target.value}))}/></label>
        <label><span>支払方法</span><select value={form.plannedPaymentMethod} onChange={e=>setForm(v=>({...v,plannedPaymentMethod:e.target.value}))}>{paymentMethods.map(method=><option key={method}>{method}</option>)}</select></label>
        <label><span>支払口座・カード</span><input value={form.plannedPaymentAccount} onChange={e=>setForm(v=>({...v,plannedPaymentAccount:e.target.value}))} placeholder="例：京都銀行 普通／法人カード"/></label>
        <label className="invoice-hold"><input type="checkbox" checked={form.isOnHold} onChange={e=>setForm(v=>({...v,isOnHold:e.target.checked}))}/><span><b>支払いを保留</b><small>確認待ち・請求内容に差異がある場合</small></span></label>
      </div>
      <div className="invoice-items-head"><div><b>請求明細</b><span>肥料・農薬・加工賃などを行ごとに登録</span></div><button className="secondary-button compact" type="button" onClick={()=>setForm(v=>({...v,items:[...v.items,newItem()]}))}><Plus size={15}/>明細を追加</button></div>
      <div className="invoice-item-list">{form.items.map((item,index)=><div className="invoice-item-row" key={item.key}>
        <span className="invoice-item-no">{index+1}</span>
        <label><span>分類</span><select value={item.category} onChange={e=>updateItem(item.key,{category:e.target.value})}>{categoryOptions.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>
        <label className="invoice-description"><span>請求内容 *</span><input value={item.description} onChange={e=>updateItem(item.key,{description:e.target.value})} placeholder="例：コーポ敷島 20kg" required/></label>
        <label><span>数量 *</span><input type="number" min="0.001" step="0.001" value={item.quantity} onChange={e=>updateItem(item.key,{quantity:e.target.value})} required/></label>
        <label><span>単位</span><input value={item.unit} onChange={e=>updateItem(item.key,{unit:e.target.value})} placeholder="袋・kg・式"/></label>
        <label><span>税込単価 *</span><input type="number" min="0" step="1" value={item.unitPrice} onChange={e=>updateItem(item.key,{unitPrice:e.target.value})} required/></label>
        <label><span>税率</span><select value={item.taxRate} onChange={e=>updateItem(item.key,{taxRate:e.target.value})}><option value="10">10%</option><option value="8">8%</option><option value="0">0%・非課税</option></select></label>
        <div className="invoice-line-total"><span>明細金額</span><strong>{yen.format(Math.round((Number(item.quantity)||0)*(Number(item.unitPrice)||0)))}</strong></div>
        <button className="invoice-remove" type="button" aria-label={`${index+1}行目を削除`} disabled={form.items.length===1} onClick={()=>removeItem(item.key)}><Trash2 size={16}/></button>
      </div>)}</div>
      <label className="invoice-note"><span>請求書備考</span><textarea rows={3} value={form.note} onChange={e=>setForm(v=>({...v,note:e.target.value}))} placeholder="支払い条件、確認事項など"/></label>
      <div className="invoice-submit-row"><div><span>請求合計</span><strong>{yen.format(formTotal)}</strong></div><div>{form.id&&<button className="secondary-button" type="button" onClick={()=>resetForm()} disabled={busy}>編集を中止</button>}<button className="primary-button" disabled={busy}>{busy?'保存中…':form.id?'請求書を更新':'請求書を登録'}</button></div></div>
    </form>}

    <section className="panel invoice-list-section">
      <div className="panel-title"><div><h2>請求書一覧</h2><p>支払状況と期限を確認します。変更権限がある場合は支払登録・編集もできます。</p></div><span className="audit-count">{filtered.length}件</span></div>
      <div className="invoice-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="請求元・番号・明細内容で検索"/></div><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">全ステータス</option><option value="UNPAID">未払</option><option value="PARTIAL">一部支払</option><option value="PAID">支払済</option><option value="HOLD">保留</option></select><input type="month" value={month} onChange={e=>setMonth(e.target.value)} aria-label="請求月"/></div>
      <div className="vendor-invoice-list">{filtered.map(invoice=>{const remaining=Math.max(0,invoice.totalAmountYen-invoice.paidAmountYen),isOverdue=invoice.paymentStatus!=='PAID'&&invoice.paymentStatus!=='HOLD'&&!!invoice.paymentDueDate&&invoice.paymentDueDate<today;return <article className={`vendor-invoice-card status-${invoice.paymentStatus.toLowerCase()}`} key={invoice.id}>
        <div className="vendor-invoice-head"><div><div className="invoice-badges"><span className={`invoice-status ${invoice.paymentStatus.toLowerCase()}`}>{statusLabel(invoice.paymentStatus)}</span>{isOverdue&&<span className="invoice-overdue"><TriangleAlert size={12}/>期限超過</span>}</div><h3>{invoice.vendor}</h3><small>{invoice.invoiceNo}{invoice.externalInvoiceNo?`｜先方番号 ${invoice.externalInvoiceNo}`:''}</small></div><div className="vendor-invoice-total"><span>請求額</span><strong>{yen.format(invoice.totalAmountYen)}</strong><small>未払 {yen.format(remaining)}</small></div></div>
        <div className="invoice-date-grid"><div><span>請求日</span><b>{invoice.invoiceDate||'—'}</b></div><div className={isOverdue?'overdue':''}><span>支払期限</span><b>{invoice.paymentDueDate||'未設定'}</b></div><div><span>支払予定日</span><b>{invoice.scheduledPaymentDate||'未設定'}</b></div><div><span>支払方法</span><b>{invoice.plannedPaymentMethod||'未設定'}</b></div><div><span>支払口座</span><b>{invoice.plannedPaymentAccount||'未設定'}</b></div></div>
        <div className="vendor-invoice-items">{invoice.items.map(item=><div key={item.id}><span>{item.lineNo}</span><b>{item.description}</b><small>{categoryLabel(item.category)}｜{num.format(item.quantity)}{item.unit?` ${item.unit}`:''} × {yen.format(item.unitPriceYen)}｜税率 {num.format(item.taxRate)}%</small><strong>{yen.format(item.lineTotalYen)}</strong></div>)}</div>
        {invoice.note&&<p className="vendor-invoice-note">{invoice.note}</p>}
        <div className="invoice-payment-block"><div className="invoice-payment-title"><div><Banknote size={16}/><b>支払履歴</b><span>{invoice.payments.length}件</span></div><strong>{yen.format(invoice.paidAmountYen)} / {yen.format(invoice.totalAmountYen)}</strong></div>{invoice.payments.length>0?<div className="invoice-payment-list">{invoice.payments.map(payment=><div key={payment.id}><div><b>{payment.paymentDate}</b><span>{payment.paymentNo}</span></div><div><strong>{yen.format(payment.amountYen)}</strong><span>{[payment.paymentMethod,payment.paymentAccount,payment.referenceNo].filter(Boolean).join('｜')||'支払方法未設定'}</span>{payment.note&&<small>{payment.note}</small>}</div>{canManage&&<div className="invoice-payment-actions"><button type="button" onClick={()=>openPayment(invoice,payment)} aria-label="支払記録を編集"><Edit3 size={14}/></button><button type="button" onClick={()=>void removePayment(payment)} aria-label="支払記録を削除" disabled={busy}><Trash2 size={14}/></button></div>}</div>)}</div>:<p className="invoice-no-payments">支払記録はまだありません。</p>}</div>
        {(documentMap[invoice.id]||[]).length>0&&<div className="vendor-document-links"><b><Paperclip size={14}/>保存済み原本</b><div>{(documentMap[invoice.id]||[]).map(doc=><a key={doc.id} href={doc.webUrl} target="_blank" rel="noreferrer"><span>{doc.kind==='PAYMENT'?'支払証憑':'仕入請求書'}</span><strong>{doc.fileName}</strong><ExternalLink size={13}/></a>)}</div></div>}
        {canManage&&<div className="vendor-invoice-actions"><button type="button" onClick={()=>editInvoice(invoice)}><Edit3 size={15}/>請求書を編集</button>{remaining>0&&<button className="record-payment" type="button" onClick={()=>openPayment(invoice)}><Banknote size={15}/>支払いを登録</button>}<button className="delete-invoice" type="button" onClick={()=>void removeInvoice(invoice)} disabled={busy||invoice.payments.length>0} title={invoice.payments.length?'支払履歴がある請求書は削除できません':''}><Trash2 size={15}/>削除</button></div>}
      </article>})}{!loading&&!filtered.length&&<p className="empty">該当する請求書はありません。</p>}</div>
    </section>

    {canManage&&paymentInvoice&&paymentForm&&<div className="invoice-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closePayment()}}><section className="invoice-payment-modal" role="dialog" aria-modal="true" aria-label="支払いを登録"><div className="invoice-modal-head"><div><p className="eyebrow">PAYMENT</p><h2>{paymentForm.id?'支払記録を編集':'支払いを登録'}</h2><span>{paymentInvoice.vendor}｜未払 {yen.format(Math.max(0,paymentInvoice.totalAmountYen-paymentInvoice.paidAmountYen))}</span></div><button type="button" onClick={closePayment} aria-label="閉じる"><X size={20}/></button></div><form onSubmit={submitPayment} className="invoice-payment-form"><section className="vendor-document-upload payment-proof-upload"><div className="vendor-document-upload-head"><div><Paperclip size={18}/><div><b>支払証憑</b><span>振込控え・カード利用明細などの画像/PDFをOCRできます。原本は登録時にOneDriveへ保存します。</span></div></div>{paymentFile&&<strong>{paymentFile.name}</strong>}</div><label className="secondary-button vendor-file-picker"><FileImage size={16}/>{paymentOcrProgress||'画像/PDFを選んでOCR'}<input type="file" accept="image/*,.heic,.heif,application/pdf" onChange={e=>{const file=e.currentTarget.files?.[0]||null;if(file)void runPaymentOcr(file);e.currentTarget.value=''}}/></label></section>{(paymentOcrProgress||paymentOcr)&&<section className="document-ocr-panel"><div className="document-ocr-head"><div><Search size={18}/><div><b>支払証憑OCR結果</b><span>{paymentOcrProgress||`信頼度の目安 ${paymentOcr?.confidence??0}%`}</span></div></div>{paymentOcr&&<button type="button" className="primary-button compact" onClick={applyPaymentOcr}>入力欄へ反映</button>}</div>{paymentOcr&&<div className="document-ocr-fields"><div><span>支払日</span><b>{paymentOcr.date||'—'}</b></div><div><span>金額</span><b>{paymentOcr.totalYen?yen.format(paymentOcr.totalYen):'—'}</b></div><div><span>支払方法</span><b>{paymentOcr.paymentMethod||'—'}</b></div><div><span>参照番号</span><b>{paymentOcr.referenceNo||'—'}</b></div></div>}</section>}<div className="payment-form-grid"><label><span>支払日 *</span><input type="date" value={paymentForm.paymentDate} onChange={e=>setPaymentForm(v=>v&&({...v,paymentDate:e.target.value}))} required/></label><label><span>支払金額 *</span><input type="number" min="1" step="1" value={paymentForm.amountYen} onChange={e=>setPaymentForm(v=>v&&({...v,amountYen:e.target.value}))} required/></label><label><span>支払方法</span><select value={paymentForm.paymentMethod} onChange={e=>setPaymentForm(v=>v&&({...v,paymentMethod:e.target.value}))}>{paymentMethods.map(method=><option key={method}>{method}</option>)}</select></label><label><span>支払口座・カード</span><input value={paymentForm.paymentAccount} onChange={e=>setPaymentForm(v=>v&&({...v,paymentAccount:e.target.value}))}/></label><label><span>振込番号・参照番号</span><input value={paymentForm.referenceNo} onChange={e=>setPaymentForm(v=>v&&({...v,referenceNo:e.target.value}))}/></label></div><label><span>支払備考</span><textarea rows={3} value={paymentForm.note} onChange={e=>setPaymentForm(v=>v&&({...v,note:e.target.value}))}/></label><div className="invoice-payment-summary"><CalendarClock size={17}/><span>登録後、支払済額と未払残高を自動更新します。</span></div><div className="invoice-modal-actions"><button className="secondary-button" type="button" onClick={closePayment} disabled={busy}>キャンセル</button><button className="primary-button" disabled={busy}><Banknote size={16}/>{busy?'保存中…':paymentForm.id?'支払記録を更新':'支払いを登録'}</button></div></form></section></div>}
  </div>
}