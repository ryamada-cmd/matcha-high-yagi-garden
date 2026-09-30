import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Building2,
  CalendarDays,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  Link2,
  RefreshCw,
  Search,
  Tag,
  Upload,
  X,
} from 'lucide-react'
import { useAppPermissions } from '../lib/permissions'
import {
  getExternalFileDownloadUrl,
  getExternalStorageStatus,
  loadExternalLinkTargets,
  uploadExternalFile,
  type ExternalLinkTarget,
  type ExternalStorageStatus,
} from '../lib/externalStorage'
import {
  loadDocumentLibrary,
  saveDocumentLibraryMetadata,
  type LibraryFile,
} from '../lib/documentLibrary'

const documentTypes = [
  '請求書','納品書','見積書','領収書','仕入請求書','仕入納品書','発注書','支払証憑',
  '契約書','生産記録','圃場資料','機械設備資料','農薬・肥料資料','加工・製造資料',
  '品質・検査資料','行政・支援資料','商品・ブランド資料','輸出書類','その他',
]

const categories = [
  '帳票','仕入','経費','茶園・栽培','圃場','機械設備','農薬・肥料','製造・加工',
  '品質・検査','取引先・契約','行政・支援機関','商品・ブランド','輸出','その他',
]

const categoryByType: Record<string,string> = {
  '請求書':'帳票','納品書':'帳票','見積書':'帳票','領収書':'経費',
  '仕入請求書':'仕入','仕入納品書':'仕入','発注書':'仕入','支払証憑':'仕入',
  '契約書':'取引先・契約','生産記録':'茶園・栽培','圃場資料':'圃場',
  '機械設備資料':'機械設備','農薬・肥料資料':'農薬・肥料','加工・製造資料':'製造・加工',
  '品質・検査資料':'品質・検査','行政・支援資料':'行政・支援機関',
  '商品・ブランド資料':'商品・ブランド','輸出書類':'輸出','その他':'その他',
}

function storageCategoryForType(type: string) {
  if (type === '機械設備資料') return '機械設備'
  return type
}

function fmtDate(value: string) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T00:00:00+09:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' }).format(date)
}

function fmtDateTime(value: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', { dateStyle:'short', timeStyle:'short' }).format(date)
}

function fmtBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"','""')}"`
}

const targetKey = (target: Pick<ExternalLinkTarget,'entityType'|'entityId'>) => `${target.entityType}:${target.entityId}`

export default function LibraryPage() {
  const { allowed } = useAppPermissions()
  const canUpload = allowed('storage.upload')
  const [storageStatus, setStorageStatus] = useState<ExternalStorageStatus | null>(null)
  const [items, setItems] = useState<LibraryFile[]>([])
  const [targets, setTargets] = useState<ExternalLinkTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [selected, setSelected] = useState<LibraryFile | null>(null)
  const [preview, setPreview] = useState<{url:string;mime:string;name:string}|null>(null)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [documentType, setDocumentType] = useState('その他')
  const [documentDate, setDocumentDate] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [category, setCategory] = useState('その他')
  const [tags, setTags] = useState('')
  const [note, setNote] = useState('')
  const [relationKey, setRelationKey] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  async function refresh(showLoader = true) {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const [status, library, linkTargets] = await Promise.all([
        getExternalStorageStatus(),
        loadDocumentLibrary(),
        loadExternalLinkTargets(),
      ])
      setStorageStatus(status)
      setItems(library)
      setTargets(linkTargets)
    } catch (e:any) {
      setError(e?.message || '資料ライブラリを読み込めませんでした。')
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const groupedTargets = useMemo(() => {
    const map = new Map<string, ExternalLinkTarget[]>()
    for (const target of targets) {
      const list = map.get(target.category) || []
      list.push(target)
      map.set(target.category, list)
    }
    return [...map.entries()]
  }, [targets])

  const yearOptions = useMemo(() => {
    const years = new Set<number>()
    for (const item of items) {
      const year = item.library?.fiscalYear
        || (item.library?.documentDate ? Number(item.library.documentDate.slice(0,4)) : 0)
        || (item.file.uploaded_at ? new Date(item.file.uploaded_at).getFullYear() : 0)
      if (year) years.add(year)
    }
    return [...years].sort((a,b)=>b-a)
  }, [items])

  const visible = useMemo(() => {
    const q = query.trim().normalize('NFKC').toLowerCase()
    return items.filter(item => {
      const meta = item.library
      const linkText = (item.file.external_file_links || []).flatMap(link => [link.category,link.note,link.entity_type,link.entity_id]).join(' ')
      const haystack = [
        meta?.title,
        item.file.file_name,
        meta?.documentType,
        meta?.category,
        meta?.counterpartyName,
        ...(meta?.tags || []),
        meta?.note,
        meta?.ocrText,
        item.file.folder_path,
        linkText,
      ].filter(Boolean).join(' ').normalize('NFKC').toLowerCase()
      const itemYear = String(meta?.fiscalYear || (meta?.documentDate ? meta.documentDate.slice(0,4) : new Date(item.file.uploaded_at).getFullYear()))
      if (q && !haystack.includes(q)) return false
      if (typeFilter && (meta?.documentType || 'その他') !== typeFilter) return false
      if (categoryFilter && (meta?.category || 'その他') !== categoryFilter) return false
      if (yearFilter && itemYear !== yearFilter) return false
      return true
    })
  }, [items, query, typeFilter, categoryFilter, yearFilter])

  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = items.filter(item => {
      const d = new Date(item.file.uploaded_at)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }).length
    const totalBytes = items.reduce((sum,item)=>sum + (item.file.size_bytes || 0), 0)
    const categoriesCount = new Set(items.map(x=>x.library?.category || 'その他')).size
    return { thisMonth, totalBytes, categoriesCount }
  }, [items])

  function changeDocumentType(value: string) {
    setDocumentType(value)
    setCategory(categoryByType[value] || 'その他')
  }

  function resetUpload() {
    setSelectedFile(null)
    setTitle('')
    setDocumentType('その他')
    setDocumentDate('')
    setCounterparty('')
    setCategory('その他')
    setTags('')
    setNote('')
    setRelationKey('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function upload() {
    if (!canUpload || !selectedFile) return
    setBusy('upload'); setError(''); setSuccess('')
    try {
      const target = targets.find(x => targetKey(x) === relationKey) || null
      const result = await uploadExternalFile({
        file: selectedFile,
        category: storageCategoryForType(documentType),
        entityType: target?.entityType || 'general',
        entityId: target?.entityId,
        note,
      })
      await saveDocumentLibraryMetadata(result.file.id, {
        title: title.trim() || result.file.file_name,
        documentType,
        documentDate,
        counterpartyName: counterparty,
        fiscalYear: documentDate ? Number(documentDate.slice(0,4)) : new Date().getFullYear(),
        category,
        tags: tags.split(/[、,\n]/).map(x=>x.trim()).filter(Boolean),
        note,
      })
      setSuccess(`${result.file.file_name} を資料ライブラリへ保存しました。`)
      resetUpload()
      setUploadOpen(false)
      await refresh(false)
    } catch (e:any) {
      setError(e?.message || '資料を保存できませんでした。')
      await refresh(false)
    } finally { setBusy('') }
  }

  async function openPreview(item: LibraryFile) {
    setBusy(`preview:${item.file.id}`)
    setError('')
    try {
      const result = await getExternalFileDownloadUrl(item.file.id)
      const mime = result.mimeType || item.file.mime_type || ''
      if (mime.startsWith('image/') || mime === 'application/pdf') {
        setPreview({ url: result.url, mime, name: result.fileName || item.file.file_name })
      } else {
        window.open(item.file.web_url || result.webUrl || result.url, '_blank', 'noopener,noreferrer')
      }
    } catch (e:any) {
      setError(e?.message || '資料を開けませんでした。')
    } finally { setBusy('') }
  }

  async function downloadFile(item: LibraryFile) {
    setBusy(`download:${item.file.id}`)
    setError('')
    try {
      const result = await getExternalFileDownloadUrl(item.file.id)
      const anchor = document.createElement('a')
      anchor.href = result.url
      anchor.download = result.fileName || item.file.file_name
      anchor.rel = 'noopener noreferrer'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch (e:any) {
      setError(e?.message || 'ダウンロードURLを取得できませんでした。')
    } finally { setBusy('') }
  }

  function exportCsv() {
    const header = ['資料名','資料種別','分類','資料日','年度','取引先','タグ','ファイル名','サイズ(bytes)','OneDriveフォルダ','登録日時','OneDrive URL']
    const rows = visible.map(item => {
      const meta = item.library
      return [
        meta?.title || item.file.file_name,
        meta?.documentType || 'その他',
        meta?.category || 'その他',
        meta?.documentDate || '',
        meta?.fiscalYear || '',
        meta?.counterpartyName || '',
        (meta?.tags || []).join(' / '),
        item.file.file_name,
        item.file.size_bytes,
        item.file.folder_path || '',
        item.file.uploaded_at,
        item.file.web_url || '',
      ]
    })
    const csv = '\ufeff' + [header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `資料ライブラリ_${new Date().toISOString().slice(0,10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <div className="page document-library-page">
    <div className="page-head">
      <div><p className="eyebrow">DOCUMENT LIBRARY</p><h1>資料ライブラリ</h1><p className="sub">茶事業の請求書・納品書・見積書・契約書・生産資料などをOneDriveへ保管し、アプリから横断検索・閲覧・エクスポートします。</p></div>
      <div className="head-actions">
        <button className="secondary-button" type="button" onClick={exportCsv} disabled={!visible.length}><Download size={17}/>CSVエクスポート</button>
        {canUpload&&<button className="primary-button" type="button" onClick={()=>setUploadOpen(v=>!v)}><Upload size={17}/>{uploadOpen?'登録を閉じる':'資料を追加'}</button>}
        <button className="icon-button" type="button" onClick={()=>void refresh()} disabled={loading||!!busy}><RefreshCw size={18} className={loading?'spin':''}/></button>
      </div>
    </div>

    {error&&<div className="notice error dashboard-notice">{error}</div>}
    {success&&<div className="notice success dashboard-notice">{success}</div>}
    {!storageStatus?.enabled&&<div className="notice dashboard-notice">OneDriveが未接続です。既存資料の台帳は閲覧できますが、新規アップロードには「ファイル・OneDrive」画面から接続設定が必要です。</div>}

    <section className="metrics library-metrics">
      <div className="metric"><span>登録資料</span><strong>{items.length}件</strong><small>OneDrive台帳と統合</small></div>
      <div className="metric"><span>今月追加</span><strong>{stats.thisMonth}件</strong><small>{new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'long'}).format(new Date())}</small></div>
      <div className="metric"><span>分類</span><strong>{stats.categoriesCount}</strong><small>横断検索可能</small></div>
      <div className="metric"><span>保存容量</span><strong>{fmtBytes(stats.totalBytes)}</strong><small>登録ファイル合計</small></div>
    </section>

    {uploadOpen&&canUpload&&<section className="panel library-upload-panel">
      <div className="panel-title"><div><h2>資料を追加</h2><p>実ファイルはOneDrive、検索用情報はSupabaseへ保存します。既存の経費・請求書基盤と同じ保存方式です。</p></div><Archive size={20}/></div>
      <div className="library-upload-grid">
        <label className="library-file-picker"><span>ファイル *</span><input ref={inputRef} type="file" onChange={e=>setSelectedFile(e.target.files?.[0]||null)}/><small>{selectedFile?`${selectedFile.name} / ${fmtBytes(selectedFile.size)}`:'PDF・画像・Word・Excel・PowerPoint等 / 25MBまで'}</small></label>
        <label><span>資料名</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={selectedFile?.name || '空欄ならファイル名を使用'}/></label>
        <label><span>資料種別 *</span><select value={documentType} onChange={e=>changeDocumentType(e.target.value)}>{documentTypes.map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span>分類 *</span><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span>資料日</span><input type="date" value={documentDate} onChange={e=>setDocumentDate(e.target.value)}/></label>
        <label><span>取引先・発行元</span><input value={counterparty} onChange={e=>setCounterparty(e.target.value)} placeholder="例：京都やましろ農業協同組合"/></label>
        <label className="library-relation"><span><Link2 size={13}/> 関連する業務データ</span><select value={relationKey} onChange={e=>setRelationKey(e.target.value)}><option value="">関連付けなし</option>{groupedTargets.map(([group,list])=><optgroup key={group} label={group}>{list.map(target=><option key={targetKey(target)} value={targetKey(target)}>{target.label}</option>)}</optgroup>)}</select></label>
        <label><span>タグ</span><input value={tags} onChange={e=>setTags(e.target.value)} placeholder="JA, 農薬, 2026一番茶"/></label>
        <label className="library-note"><span>メモ</span><textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="用途、確認事項など"/></label>
      </div>
      <div className="library-upload-actions"><span>{storageStatus?.enabled?'OneDriveへ直接保存します。':'OneDrive未接続のため保存できません。'}</span><button className="primary-button" type="button" onClick={()=>void upload()} disabled={!storageStatus?.enabled||!selectedFile||busy==='upload'}><Upload size={16}/>{busy==='upload'?'保存中…':'資料ライブラリへ保存'}</button></div>
    </section>}

    <section className="panel library-list-panel">
      <div className="panel-title"><div><h2>資料一覧</h2><p>既存の請求書・納品書・仕入請求書も同じライブラリから確認できます。</p></div><span className="audit-count">{visible.length}件</span></div>
      <div className="library-toolbar">
        <div className="search-box library-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="資料名・取引先・タグ・内容・ファイル名で検索"/></div>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="">全資料種別</option>{documentTypes.map(x=><option key={x}>{x}</option>)}</select>
        <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">全分類</option>{categories.map(x=><option key={x}>{x}</option>)}</select>
        <select value={yearFilter} onChange={e=>setYearFilter(e.target.value)}><option value="">全年度</option>{yearOptions.map(y=><option key={y} value={y}>{y}年</option>)}</select>
      </div>

      <div className="library-file-list">
        {visible.map(item=>{
          const meta=item.library
          return <article className="library-file-card" key={item.file.id}>
            <div className="library-file-icon"><FileText size={22}/></div>
            <button className="library-file-main" type="button" onClick={()=>setSelected(item)}>
              <span className="library-file-title">{meta?.title || item.file.file_name}</span>
              <span className="library-file-meta"><b>{meta?.documentType || 'その他'}</b><span>{meta?.category || 'その他'}</span>{meta?.counterpartyName&&<span>{meta.counterpartyName}</span>}</span>
              <small>{meta?.documentDate?fmtDate(meta.documentDate):fmtDateTime(item.file.uploaded_at)}　・　{fmtBytes(item.file.size_bytes)}　・　{item.file.folder_path||'保存先未取得'}</small>
              {(meta?.tags||[]).length>0&&<span className="library-tag-row">{meta!.tags.map(tag=><em key={tag}>{tag}</em>)}</span>}
            </button>
            <div className="library-file-actions">
              <button type="button" onClick={()=>void openPreview(item)} disabled={busy===`preview:${item.file.id}`}><Eye size={15}/>閲覧</button>
              <button type="button" onClick={()=>void downloadFile(item)} disabled={busy===`download:${item.file.id}`}><Download size={15}/>保存</button>
              {item.file.web_url&&<a href={item.file.web_url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>OneDrive</a>}
            </div>
          </article>
        })}
        {!loading&&!visible.length&&<p className="empty">条件に一致する資料はありません。</p>}
      </div>
    </section>

    {selected&&<div className="library-detail-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
      <aside className="library-detail" role="dialog" aria-modal="true" aria-label="資料詳細">
        <div className="library-detail-head"><div><p className="eyebrow">DOCUMENT DETAIL</p><h2>{selected.library?.title || selected.file.file_name}</h2></div><button type="button" onClick={()=>setSelected(null)} aria-label="閉じる"><X size={20}/></button></div>
        <div className="library-detail-actions">
          <button className="primary-button" type="button" onClick={()=>void openPreview(selected)}><Eye size={16}/>資料を閲覧</button>
          <button className="secondary-button" type="button" onClick={()=>void downloadFile(selected)}><Download size={16}/>ダウンロード</button>
          {selected.file.web_url&&<a className="secondary-button" href={selected.file.web_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>OneDrive</a>}
        </div>
        <div className="library-detail-grid">
          <div><span><FileText size={14}/>資料種別</span><b>{selected.library?.documentType || 'その他'}</b></div>
          <div><span><FolderOpen size={14}/>分類</span><b>{selected.library?.category || 'その他'}</b></div>
          <div><span><CalendarDays size={14}/>資料日</span><b>{selected.library?.documentDate?fmtDate(selected.library.documentDate):'未設定'}</b></div>
          <div><span><Building2 size={14}/>取引先・発行元</span><b>{selected.library?.counterpartyName || '未設定'}</b></div>
          <div><span><Tag size={14}/>タグ</span><b>{(selected.library?.tags||[]).join(' / ') || '未設定'}</b></div>
          <div><span>ファイルサイズ</span><b>{fmtBytes(selected.file.size_bytes)}</b></div>
        </div>
        <section className="library-detail-section"><h3>保存情報</h3><p><b>ファイル名：</b>{selected.file.file_name}</p><p><b>保存先：</b>{selected.file.folder_path||'—'}</p><p><b>登録日時：</b>{fmtDateTime(selected.file.uploaded_at)}</p>{selected.library?.note&&<p><b>メモ：</b>{selected.library.note}</p>}</section>
        <section className="library-detail-section"><h3>業務データとの紐付け</h3>{(selected.file.external_file_links||[]).length?<div className="library-link-list">{selected.file.external_file_links!.map(link=><div key={link.id}><Link2 size={14}/><span>{link.category||link.entity_type}{link.note?`｜${link.note}`:''}</span></div>)}</div>:<p className="muted">関連付けなし</p>}</section>
      </aside>
    </div>}

    {preview&&<div className="library-preview-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setPreview(null)}}>
      <section className="library-preview-modal" role="dialog" aria-modal="true" aria-label="資料プレビュー">
        <div className="library-preview-head"><b>{preview.name}</b><button type="button" onClick={()=>setPreview(null)} aria-label="閉じる"><X size={20}/></button></div>
        <div className="library-preview-body">{preview.mime.startsWith('image/')?<img src={preview.url} alt={preview.name}/>:<iframe src={preview.url} title={preview.name}/>}</div>
      </section>
    </div>}
  </div>
}
