import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Cloud, Copy, ExternalLink, FileUp, FolderOpen, HardDrive, Link2, RefreshCw, Save, Search, ShieldCheck } from 'lucide-react'
import { useAppPermissions } from '../lib/permissions'
import {
  configureExternalStorage,
  getExternalStorageStatus,
  loadExternalFiles,
  loadExternalLinkTargets,
  startOneDriveAuthorization,
  uploadExternalFile,
  verifyExternalStorage,
  type ExternalFileRow,
  type ExternalLinkTarget,
  type ExternalStorageStatus,
} from '../lib/externalStorage'

const categories = ['請求書・納品書','仕入請求書','経費・領収書','圃場','機械設備','農薬','肥料','その他']

function fmtDate(value: string) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('ja-JP', { dateStyle:'short', timeStyle:'short' }).format(d)
}

function fmtBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function explainStorageError(value: string) {
  const message = String(value || '').trim()
  if (!message) return ''
  if (message.includes('AADSTS700025')) {
    return 'Microsoft Entra側でこのアプリが「公開クライアント」として登録されています。認証 → プラットフォーム構成で、この画面に表示されているリダイレクトURIを「Web」として登録してください。SPA／モバイル／デスクトップ側に同じURIがある場合は削除し、「パブリック クライアント フローを許可する」は「いいえ」にしてください。設定保存後、OneDriveに接続をもう一度実行してください。'
  }
  if (message.includes('AADSTS7000215')) {
    return 'Client Secretが正しくありません。Microsoft Entraの「証明書とシークレット」で、Secret IDではなく作成時に表示される「値（Value）」を入力してください。値が分からない場合は新しいClient Secretを作成してください。'
  }
  if (message.includes('AADSTS700016')) {
    return 'Tenant IDとClient IDが同じMicrosoft Entraアプリの組み合わせになっていません。同じアプリの「概要」画面に表示されるDirectory (tenant) IDとApplication (client) IDを使用してください。'
  }
  return message
}

const targetKey = (target: Pick<ExternalLinkTarget,'entityType'|'entityId'>) => `${target.entityType}:${target.entityId}`

export default function StoragePage() {
  const { allowed } = useAppPermissions()
  const canUpload = allowed('storage.upload')
  const canManage = allowed('storage.manage')
  const [status, setStatus] = useState<ExternalStorageStatus | null>(null)
  const [files, setFiles] = useState<ExternalFileRow[]>([])
  const [targets, setTargets] = useState<ExternalLinkTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [query, setQuery] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [rootFolder, setRootFolder] = useState('五代目八木一兵衛')
  const [category, setCategory] = useState(categories[0])
  const [relationKey, setRelationKey] = useState('')
  const [note, setNote] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  async function refresh(showLoader = true) {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const [nextStatus, nextFiles, nextTargets] = await Promise.all([getExternalStorageStatus(), loadExternalFiles(), loadExternalLinkTargets()])
      setStatus(nextStatus)
      setFiles(nextFiles)
      setTargets(nextTargets)
      setTenantId(nextStatus.tenantId)
      setClientId(nextStatus.clientId)
      setRootFolder(nextStatus.rootFolder || '五代目八木一兵衛')
    } catch (e:any) {
      setError(explainStorageError(e?.message || '外部ストレージ情報を読み込めませんでした。'))
    } finally { if (showLoader) setLoading(false) }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('storage_connected') === '1') setSuccess('OneDriveとの接続が完了しました。')
    const storageError = params.get('storage_error')
    if (storageError) setError(explainStorageError(storageError))
    void refresh()
  }, [])

  const selectedTarget = useMemo(() => targets.find(x => targetKey(x) === relationKey) || null, [targets, relationKey])
  const targetLabelMap = useMemo(() => new Map(targets.map(x => [targetKey(x), x.label])), [targets])
  const groupedTargets = useMemo(() => {
    const groups = new Map<string, ExternalLinkTarget[]>()
    for (const target of targets) {
      const list = groups.get(target.category) || []
      list.push(target)
      groups.set(target.category, list)
    }
    return [...groups.entries()]
  }, [targets])

  const filtered = useMemo(() => {
    const q = query.trim().normalize('NFKC').toLowerCase()
    if (!q) return files
    return files.filter((file) => [file.file_name,file.folder_path,file.mime_type,...(file.external_file_links || []).flatMap(x=>[x.category,x.note,x.entity_type,x.entity_id,targetLabelMap.get(`${x.entity_type}:${x.entity_id}`)])]
      .join(' ').normalize('NFKC').toLowerCase().includes(q))
  }, [files, query, targetLabelMap])

  function chooseRelation(value: string) {
    setRelationKey(value)
    const target = targets.find(x => targetKey(x) === value)
    if (target) setCategory(target.category)
  }

  async function saveConfig() {
    if (!canManage) return
    setBusy('config'); setError(''); setSuccess('')
    try {
      const next = await configureExternalStorage({ tenantId, clientId, clientSecret, rootFolder })
      setStatus(next)
      setClientSecret('')
      setSuccess('Microsoft接続設定を安全に保存しました。Client SecretはVaultへ暗号化保存されています。')
    } catch (e:any) { setError(explainStorageError(e?.message || '接続設定を保存できませんでした。')) }
    finally { setBusy('') }
  }

  async function connect() {
    if (!canManage) return
    setBusy('connect'); setError(''); setSuccess('')
    try {
      const result = await startOneDriveAuthorization(`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/,'')}/storage`)
      window.location.assign(result.url)
    } catch (e:any) {
      setError(explainStorageError(e?.message || 'Microsoft認証を開始できませんでした。'))
      setBusy('')
    }
  }

  async function verify() {
    setBusy('verify'); setError(''); setSuccess('')
    try {
      const next = await verifyExternalStorage()
      setStatus(next)
      setSuccess('OneDriveへの接続とフォルダ構成を確認しました。')
      await refresh(false)
    } catch (e:any) { setError(explainStorageError(e?.message || '接続確認に失敗しました。')) }
    finally { setBusy('') }
  }

  async function upload() {
    if (!canUpload || !selectedFile) return
    setBusy('upload'); setError(''); setSuccess('')
    try {
      const result = await uploadExternalFile({
        file:selectedFile,
        category,
        note,
        entityType:selectedTarget?.entityType || 'general',
        entityId:selectedTarget?.entityId || undefined,
      })
      setSuccess(`${result.file.file_name} をOneDriveへ保存${selectedTarget?`し、「${selectedTarget.label}」へ紐付け`:''}しました。`)
      setSelectedFile(null); setNote('')
      if (inputRef.current) inputRef.current.value = ''
      await refresh(false)
    } catch (e:any) { setError(explainStorageError(e?.message || 'ファイルをアップロードできませんでした。')) }
    finally { setBusy('') }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setSuccess('コピーしました。') } catch { setError('コピーできませんでした。') }
  }

  return <div className="page storage-page">
    <div className="page-head">
      <div><p className="eyebrow">EXTERNAL STORAGE</p><h1>ファイル・OneDrive</h1><p className="sub">PDF・画像・添付ファイルはOneDrive、業務データと検索用台帳はSupabaseで管理します。</p></div>
      <button className="icon-button" onClick={()=>void refresh()} disabled={loading||!!busy}><RefreshCw size={18} className={loading?'spin':''}/></button>
    </div>

    {error&&<div className="notice error dashboard-notice">{error}</div>}
    {success&&<div className="notice success dashboard-notice">{success}</div>}

    <section className={`panel storage-status ${status?.enabled?'connected':'disconnected'}`}>
      <div className="storage-status-icon">{status?.enabled?<CheckCircle2 size={25}/>:<Cloud size={25}/>}</div>
      <div className="storage-status-main">
        <span>{status?.enabled?'OneDrive 接続済み':'OneDrive 未接続'}</span>
        <b>{status?.connectedAccount || 'Microsoft 365 / OneDriveを接続してください'}</b>
        <small>保存先：{status?.rootFolder || '五代目八木一兵衛'}　/　登録ファイル {status?.fileCount ?? 0}件　/　フォルダ構成：{status?.folderStructure==='v2'?'整理済み':'標準'}</small>
      </div>
      {status?.enabled&&canManage&&<button className="secondary-button compact" onClick={()=>void verify()} disabled={busy==='verify'}><ShieldCheck size={16}/>{busy==='verify'?'確認中…':'接続・フォルダ確認'}</button>}
    </section>

    {canManage&&<section className="panel storage-config-panel">
      <div className="panel-title"><div><h2>Microsoft 365 接続設定</h2><p>業務用OneDriveを1つ接続します。既存のSupabaseデータは移動・削除しません。</p></div><HardDrive size={20}/></div>
      <div className="storage-setup-guide">
        <div><b>1</b><span>Microsoft EntraでWebアプリを登録</span></div>
        <div><b>2</b><span>委任アクセス許可：User.Read / Files.ReadWrite / offline_access</span></div>
        <div><b>3</b><span>下記リダイレクトURIを「Web」として登録（SPA／モバイル／デスクトップではない）</span></div>
        <div><b>4</b><span>認証の詳細設定で「パブリック クライアント フローを許可する」＝ いいえ</span></div>
      </div>
      <div className="storage-redirect-row"><code>{status?.redirectUri || '読み込み中…'}</code><button type="button" className="icon-button" disabled={!status?.redirectUri} onClick={()=>status?.redirectUri&&void copy(status.redirectUri)}><Copy size={16}/></button></div>
      <div className="storage-config-grid">
        <label><span>Tenant ID</span><input value={tenantId} onChange={e=>setTenantId(e.target.value)} placeholder="Microsoft Entra の Directory (tenant) ID"/></label>
        <label><span>Client ID</span><input value={clientId} onChange={e=>setClientId(e.target.value)} placeholder="Application (client) ID"/></label>
        <label><span>Client Secret</span><input type="password" value={clientSecret} onChange={e=>setClientSecret(e.target.value)} placeholder={status?.clientSecretConfigured?'登録済み（変更時のみ入力）':'Client Secretを入力'}/><small>保存後は画面に再表示しません。Supabase Vaultへ暗号化保存します。</small></label>
        <label><span>OneDrive ルートフォルダ</span><input value={rootFolder} onChange={e=>setRootFolder(e.target.value)} placeholder="五代目八木一兵衛"/></label>
      </div>
      <div className="storage-config-actions">
        <button className="secondary-button" onClick={()=>void saveConfig()} disabled={!tenantId.trim()||!clientId.trim()||busy==='config'}><Save size={16}/>{busy==='config'?'保存中…':'接続設定を保存'}</button>
        <button className="primary-button" onClick={()=>void connect()} disabled={!status?.clientSecretConfigured||busy==='connect'}><Cloud size={16}/>{busy==='connect'?'認証開始中…':status?.enabled?'Microsoftアカウントを再接続':'OneDriveに接続'}</button>
      </div>
      {status?.lastError&&<p className="storage-last-error">前回エラー：{explainStorageError(status.lastError)}</p>}
    </section>}

    {canUpload&&<section className="panel storage-upload-panel">
      <div className="panel-title"><div><h2>ファイルを保存・業務データへ紐付け</h2><p>保存時に帳票・仕入・経費・圃場・機械設備・農薬・肥料へ自動整理し、年月別にOneDriveへ格納します。圃場と機械設備は関連付け先ごとの専用フォルダになります。1ファイル25MBまでです。</p></div><FileUp size={20}/></div>
      <div className="storage-upload-grid">
        <label className="storage-link-target"><span><Link2 size={13}/> 関連する記録</span><select value={relationKey} onChange={e=>chooseRelation(e.target.value)}><option value="">関連付けなし（一般ファイル）</option>{groupedTargets.map(([group,list])=><optgroup key={group} label={group}>{list.map(target=><option key={targetKey(target)} value={targetKey(target)}>{target.label}</option>)}</optgroup>)}</select><small>閲覧権限がある記録だけ候補に表示されます。</small></label>
        <label><span>分類</span><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="storage-file-input"><span>ファイル</span><input ref={inputRef} type="file" onChange={e=>setSelectedFile(e.target.files?.[0]||null)}/><small>{selectedFile?`${selectedFile.name} / ${fmtBytes(selectedFile.size)}`:'PDF・画像・Officeファイルなど'}</small></label>
        <label className="storage-upload-note"><span>メモ</span><input value={note} onChange={e=>setNote(e.target.value)} placeholder="任意：用途や関連内容"/></label>
      </div>
      <div className="storage-upload-actions"><span>{status?.enabled?'OneDriveへ直接保存し、Supabaseには台帳と関連付けだけを記録します。':'OneDrive接続後にアップロードできます。'}</span><button className="primary-button" disabled={!status?.enabled||!selectedFile||busy==='upload'} onClick={()=>void upload()}><FileUp size={16}/>{busy==='upload'?'アップロード中…':'OneDriveへ保存'}</button></div>
    </section>}

    <section className="panel storage-files-panel">
      <div className="panel-title"><div><h2>ファイル台帳</h2><p>OneDrive上のファイルをアプリから検索・確認できます。削除操作は設けていません。</p></div><FolderOpen size={20}/></div>
      <div className="storage-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ファイル名・関連記録・フォルダ・分類・メモで検索"/></div>
      <div className="storage-file-list">
        {filtered.map(file=>{
          const link=file.external_file_links?.[0]
          const linkedLabel=link?.entity_id?targetLabelMap.get(`${link.entity_type}:${link.entity_id}`):''
          return <article key={file.id} className="storage-file-row">
            <div className="storage-file-type"><FolderOpen size={19}/></div>
            <div className="storage-file-main"><b>{file.file_name}</b><span>{link?.category||'その他'}　・　{fmtBytes(file.size_bytes)}　・　{fmtDate(file.uploaded_at)}</span>{linkedLabel&&<span className="storage-linked-record"><Link2 size={12}/>{linkedLabel}</span>}<small>{file.folder_path||'—'}{link?.note?`｜${link.note}`:''}</small></div>
            {file.web_url?<a className="secondary-button compact" href={file.web_url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>OneDrive</a>:<span className="muted">URLなし</span>}
          </article>
        })}
        {!loading&&!filtered.length&&<p className="empty">登録ファイルはありません。</p>}
      </div>
    </section>
  </div>
}