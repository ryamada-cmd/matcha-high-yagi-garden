import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CalendarDays, ExternalLink, FolderOpen, Image as ImageIcon, Images, MapPinned, RefreshCw, Search, Tractor, Upload, X } from 'lucide-react'
import { useAppPermissions } from '../lib/permissions'
import { loadPhotoGallery, loadPhotoTargets, loadPhotoThumbnails, uploadPhoto, type PhotoCategory, type PhotoGalleryFile, type PhotoTarget } from '../lib/photoGallery'

const categories: PhotoCategory[] = ['茶摘み','イベント','圃場','機械設備','作業記録','商品・制作','その他']
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date())
const targetKey = (target: PhotoTarget) => `${target.entityType}:${target.entityId}`

function fmtDate(value: string) {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00+09:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'short', day:'numeric' }).format(date)
}

function fmtBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|tiff?|bmp)$/i.test(file.name)
}

export default function PhotoGallerySection() {
  const { allowed } = useAppPermissions()
  const canUpload = allowed('storage.upload')
  const [files,setFiles] = useState<PhotoGalleryFile[]>([])
  const [targets,setTargets] = useState<PhotoTarget[]>([])
  const [thumbs,setThumbs] = useState<Record<string,string>>({})
  const [loading,setLoading] = useState(true)
  const [uploading,setUploading] = useState(false)
  const [progress,setProgress] = useState('')
  const [error,setError] = useState('')
  const [success,setSuccess] = useState('')
  const [category,setCategory] = useState<PhotoCategory>('茶摘み')
  const [album,setAlbum] = useState('')
  const [takenAt,setTakenAt] = useState(today())
  const [note,setNote] = useState('')
  const [relationKey,setRelationKey] = useState('')
  const [selectedFiles,setSelectedFiles] = useState<File[]>([])
  const [filterCategory,setFilterCategory] = useState<'すべて'|PhotoCategory>('すべて')
  const [filterAlbum,setFilterAlbum] = useState('')
  const [query,setQuery] = useState('')
  const [visibleCount,setVisibleCount] = useState(36)
  const [selected,setSelected] = useState<PhotoGalleryFile|null>(null)
  const [largeThumb,setLargeThumb] = useState('')
  const pickerRef = useRef<HTMLInputElement|null>(null)
  const cameraRef = useRef<HTMLInputElement|null>(null)

  async function refresh(showLoader = true) {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const [nextFiles,nextTargets] = await Promise.all([loadPhotoGallery(),loadPhotoTargets()])
      setFiles(nextFiles)
      setTargets(nextTargets)
    } catch (e:any) {
      setError(e?.message || '写真ギャラリーを読み込めませんでした。')
    } finally { if (showLoader) setLoading(false) }
  }

  useEffect(()=>{ void refresh() },[])

  const selectedTarget = useMemo(()=>targets.find(x=>targetKey(x)===relationKey)||null,[targets,relationKey])
  const fieldTargets = useMemo(()=>targets.filter(x=>x.entityType==='field'),[targets])
  const equipmentTargets = useMemo(()=>targets.filter(x=>x.entityType==='equipment'),[targets])
  const albums = useMemo(()=>[...new Set(files.map(x=>String(x.metadata?.album||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja')),[files])

  const filtered = useMemo(()=>{
    const q=query.trim().normalize('NFKC').toLowerCase()
    return files.filter(file=>{
      const link=file.external_file_links?.[0]
      const fileCategory=(file.metadata?.photoCategory||link?.category||'その他') as PhotoCategory
      const fileAlbum=String(file.metadata?.album||'')
      if(filterCategory!=='すべて'&&fileCategory!==filterCategory)return false
      if(filterAlbum&&fileAlbum!==filterAlbum)return false
      if(!q)return true
      return [file.file_name,file.folder_path,fileCategory,fileAlbum,file.metadata?.takenAt,link?.note]
        .join(' ').normalize('NFKC').toLowerCase().includes(q)
    }).sort((a,b)=>String(b.metadata?.takenAt||b.uploaded_at).localeCompare(String(a.metadata?.takenAt||a.uploaded_at)))
  },[files,filterCategory,filterAlbum,query])

  const visible = useMemo(()=>filtered.slice(0,visibleCount),[filtered,visibleCount])
  const visibleKey = visible.map(x=>x.id).join(',')

  useEffect(()=>{
    const ids=visible.map(x=>x.id).filter(id=>!thumbs[id])
    if(!ids.length)return
    let cancelled=false
    void loadPhotoThumbnails(ids,'medium').then(next=>{if(!cancelled)setThumbs(prev=>({...prev,...next}))}).catch(()=>{})
    return()=>{cancelled=true}
  },[visibleKey])

  function addFiles(list: FileList|null) {
    if(!list || !list.length) return
    setSuccess('')
    const allFiles=Array.from(list)
    const incoming=allFiles.filter(isImageFile)
    const unsupported=allFiles.filter(file=>!isImageFile(file))
    const tooLarge=incoming.filter(file=>file.size>25*1024*1024)
    const accepted=incoming.filter(file=>file.size<=25*1024*1024)

    if(accepted.length){
      setSelectedFiles(prev=>[...prev,...accepted].slice(0,50))
    }

    const messages:string[]=[]
    if(unsupported.length) messages.push(`画像として認識できないファイル：${unsupported.map(x=>x.name).join('、')}`)
    if(tooLarge.length) messages.push(`25MBを超える写真：${tooLarge.map(x=>x.name).join('、')}`)
    setError(messages.join(' / '))
  }

  function removeSelected(index:number){setSelectedFiles(prev=>prev.filter((_,i)=>i!==index))}

  async function uploadSelected() {
    if(!canUpload||!selectedFiles.length||uploading)return
    setUploading(true);setError('');setSuccess('')
    try{
      let completed=0
      for(const file of selectedFiles){
        setProgress(`${completed+1} / ${selectedFiles.length}　${file.name}`)
        await uploadPhoto({
          file,
          photoCategory:category,
          album:album.trim()||'未分類',
          takenAt,
          note:note.trim()||undefined,
          entityType:selectedTarget?.entityType,
          entityId:selectedTarget?.entityId,
        })
        completed+=1
      }
      setSuccess(`${completed}枚の写真をOneDriveへ保存しました。`)
      setSelectedFiles([]);setNote('');setProgress('')
      if(pickerRef.current)pickerRef.current.value=''
      if(cameraRef.current)cameraRef.current.value=''
      setThumbs({})
      await refresh(false)
    }catch(e:any){setError(e?.message||'写真を保存できませんでした。')}
    finally{setUploading(false);setProgress('')}
  }

  async function openPhoto(file:PhotoGalleryFile){
    setSelected(file);setLargeThumb(thumbs[file.id]||'')
    try{
      const result=await loadPhotoThumbnails([file.id],'large')
      if(result[file.id])setLargeThumb(result[file.id])
    }catch{/* OneDrive原本リンクをフォールバックとして残す */}
  }

  const directInputStyle = {
    position:'absolute', inset:0, width:'100%', height:'100%', opacity:0, cursor:uploading?'not-allowed':'pointer', zIndex:2,
  } as const

  return <section className="photo-gallery-feature">
    <div className="photo-gallery-hero">
      <div><p className="eyebrow">PHOTO LIBRARY</p><h2><Images size={22}/>写真ギャラリー</h2><p>茶摘み・イベント・圃場・機械設備などの写真をOneDriveへ整理して保存し、アプリでは軽量なサムネイルだけを表示します。</p></div>
      <button className="icon-button" type="button" onClick={()=>void refresh()} disabled={loading||uploading} aria-label="写真を更新"><RefreshCw size={18} className={loading?'spin':''}/></button>
    </div>

    {error&&<div className="notice error photo-gallery-notice">{error}</div>}
    {success&&<div className="notice success photo-gallery-notice">{success}</div>}

    {canUpload&&<div className="photo-upload-card">
      <div className="photo-upload-head"><div><b>写真を追加</b><span>スマホの写真ライブラリ・カメラからそのまま保存できます。</span></div><Upload size={20}/></div>
      <div className="photo-upload-fields">
        <label><span>写真の分類</span><select value={category} onChange={e=>setCategory(e.target.value as PhotoCategory)}>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
        <label><span>アルバム・案件名</span><input value={album} onChange={e=>setAlbum(e.target.value)} placeholder="例：2026 一番茶 手摘み / 西宮イベント"/><small>OneDriveのフォルダ名になります。未入力時は「未分類」です。</small></label>
        <label><span><CalendarDays size={13}/> 撮影日</span><input type="date" value={takenAt} onChange={e=>setTakenAt(e.target.value)}/></label>
        <label><span>関連する圃場・機械設備</span><select value={relationKey} onChange={e=>setRelationKey(e.target.value)}><option value="">関連付けなし</option>{fieldTargets.length>0&&<optgroup label="圃場">{fieldTargets.map(x=><option key={targetKey(x)} value={targetKey(x)}>{x.label}</option>)}</optgroup>}{equipmentTargets.length>0&&<optgroup label="機械設備">{equipmentTargets.map(x=><option key={targetKey(x)} value={targetKey(x)}>{x.label}</option>)}</optgroup>}</select><small>選ぶと、その圃場・設備の専用写真フォルダへ整理されます。</small></label>
        <label className="photo-note-field"><span>メモ</span><input value={note} onChange={e=>setNote(e.target.value)} placeholder="例：手摘み初日、イベント設営、修理前の状態"/></label>
      </div>
      <div className="photo-source-actions">
        <label className="secondary-button" aria-disabled={uploading} style={{position:'relative',overflow:'hidden',cursor:uploading?'not-allowed':'pointer'}}>
          <Images size={17}/>写真を選ぶ
          <input ref={pickerRef} type="file" accept="image/*,.heic,.heif" multiple disabled={uploading} aria-label="写真ライブラリから写真を選ぶ" style={directInputStyle} onClick={e=>{e.currentTarget.value=''}} onChange={e=>addFiles(e.currentTarget.files)}/>
        </label>
        <label className="secondary-button" aria-disabled={uploading} style={{position:'relative',overflow:'hidden',cursor:uploading?'not-allowed':'pointer'}}>
          <Camera size={17}/>カメラで撮る
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" disabled={uploading} aria-label="カメラで写真を撮る" style={directInputStyle} onClick={e=>{e.currentTarget.value=''}} onChange={e=>addFiles(e.currentTarget.files)}/>
        </label>
        <span>JPEG / PNG / HEICなど・1枚25MBまで・最大50枚/回</span>
      </div>
      {selectedFiles.length>0&&<div className="photo-selected-list">{selectedFiles.map((file,index)=><div key={`${file.name}-${file.lastModified}-${index}`}><ImageIcon size={15}/><span>{file.name}</span><small>{fmtBytes(file.size)}</small><button type="button" onClick={()=>removeSelected(index)} disabled={uploading} aria-label={`${file.name}を外す`}><X size={14}/></button></div>)}</div>}
      <div className="photo-upload-footer"><span>{progress||`${selectedFiles.length}枚選択中${selectedTarget?`・${selectedTarget.label}へ関連付け`:''}`}</span><button type="button" className="primary-button" onClick={()=>void uploadSelected()} disabled={!selectedFiles.length||uploading}><Upload size={17}/>{uploading?'OneDriveへ保存中…':'写真をOneDriveへ保存'}</button></div>
    </div>}

    <div className="photo-gallery-toolbar">
      <div className="photo-category-chips"><button className={filterCategory==='すべて'?'active':''} onClick={()=>{setFilterCategory('すべて');setVisibleCount(36)}}>すべて <span>{files.length}</span></button>{categories.map(x=><button key={x} className={filterCategory===x?'active':''} onClick={()=>{setFilterCategory(x);setVisibleCount(36)}}>{x}</button>)}</div>
      <div className="photo-gallery-filters"><div className="storage-search"><Search size={16}/><input value={query} onChange={e=>{setQuery(e.target.value);setVisibleCount(36)}} placeholder="写真・アルバム・メモを検索"/></div><select value={filterAlbum} onChange={e=>{setFilterAlbum(e.target.value);setVisibleCount(36)}}><option value="">すべてのアルバム</option>{albums.map(x=><option key={x}>{x}</option>)}</select></div>
    </div>

    {loading?<div className="photo-gallery-loading"><RefreshCw size={21} className="spin"/>写真を読み込み中…</div>:<>
      <div className="photo-gallery-grid">{visible.map(file=>{
        const link=file.external_file_links?.[0]
        const fileCategory=String(file.metadata?.photoCategory||link?.category||'その他')
        const fileAlbum=String(file.metadata?.album||'未分類')
        const date=String(file.metadata?.takenAt||file.uploaded_at)
        return <button type="button" className="photo-card" key={file.id} onClick={()=>void openPhoto(file)}>
          <div className="photo-card-image">{thumbs[file.id]?<img src={thumbs[file.id]} loading="lazy" alt={file.file_name}/>:<div className="photo-thumb-placeholder"><ImageIcon size={29}/><span>サムネイル読込中</span></div>}<span className="photo-card-category">{fileCategory}</span></div>
          <div className="photo-card-body"><b>{fileAlbum}</b><span>{fmtDate(date)}</span><small>{file.file_name}</small></div>
        </button>
      })}</div>
      {!filtered.length&&<div className="photo-gallery-empty"><Images size={34}/><b>写真はまだありません</b><span>上の「写真を追加」からOneDriveへ保存すると、ここにギャラリー表示されます。</span></div>}
      {visible.length<filtered.length&&<button className="secondary-button photo-load-more" type="button" onClick={()=>setVisibleCount(x=>x+36)}>さらに表示（残り {filtered.length-visible.length}枚）</button>}
    </>}

    {selected&&<div className="photo-lightbox-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><section className="photo-lightbox" role="dialog" aria-modal="true" aria-label="写真詳細">
      <button type="button" className="photo-lightbox-close" onClick={()=>setSelected(null)} aria-label="閉じる"><X size={20}/></button>
      <div className="photo-lightbox-image">{largeThumb?<img src={largeThumb} alt={selected.file_name}/>:<div className="photo-thumb-placeholder"><ImageIcon size={38}/><span>プレビューを取得できません</span></div>}</div>
      <div className="photo-lightbox-info"><div><span className="photo-card-category">{String(selected.metadata?.photoCategory||selected.external_file_links?.[0]?.category||'その他')}</span><h3>{String(selected.metadata?.album||'未分類')}</h3><p>{fmtDate(String(selected.metadata?.takenAt||selected.uploaded_at))}</p></div><dl><div><dt><FolderOpen size={14}/>保存先</dt><dd>{selected.folder_path||'—'}</dd></div>{selected.external_file_links?.[0]?.note&&<div><dt>メモ</dt><dd>{selected.external_file_links[0].note}</dd></div>}<div><dt>ファイル</dt><dd>{selected.file_name}・{fmtBytes(selected.size_bytes)}</dd></div></dl>{selected.web_url&&<a className="primary-button" href={selected.web_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>OneDriveで原本を開く</a>}</div>
    </section></div>}
  </section>
}