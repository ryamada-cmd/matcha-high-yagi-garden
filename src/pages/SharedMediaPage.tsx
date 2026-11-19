import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Download, Film, Image as ImageIcon, LogOut, X } from 'lucide-react'
import { MEDIA_CATEGORIES } from '../../supabase/functions/shared-media/format'
import { mediaApi, type MediaApproval, type MediaItem, type MediaMetadata, type MediaOptions } from '../lib/sharedMedia'
import MediaUploadQueue from './MediaUploadQueue'
import '../shared-media.css'

const blank = {category:'その他',albumId:'',fieldId:'',equipmentId:'',takenAt:'',note:''}
const tabs = [['all','すべて'],['photo','写真'],['video','動画'],['albums','アルバム']] as const
type Tab = typeof tabs[number][0]
const emptyFilters = {search:'',category:'',albumId:'',ownerId:'',fieldId:'',from:'',to:''}
type Filters = typeof emptyFilters
const formatSize = (size:number) => size>=1e9 ? (size/1e9).toFixed(2)+' GB' : size>=1e6 ? (size/1e6).toFixed(1)+' MB' : Math.ceil(size/1000)+' KB'
const errorMessage = (error:unknown) => error instanceof Error ? error.message : '共有メディアを読み込めませんでした。'

function MetadataFields({value,onChange,options}:{value:MediaMetadata;onChange:(value:MediaMetadata)=>void;options:MediaOptions}) {
  return <div className="shared-media-fields">
    <label>分類<select value={value.category} onChange={event=>onChange({...value,category:event.target.value})}>{MEDIA_CATEGORIES.map(item=><option key={item}>{item}</option>)}</select></label>
    <label>撮影日<input type="date" value={value.takenAt} onChange={event=>onChange({...value,takenAt:event.target.value})}/></label>
    <label>アルバム<select value={value.albumId} onChange={event=>onChange({...value,albumId:event.target.value})}><option value="">未分類</option>{options.albums.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>圃場<select value={value.fieldId} onChange={event=>onChange({...value,fieldId:event.target.value})}><option value="">指定なし</option>{options.fields.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>機械設備<select value={value.equipmentId} onChange={event=>onChange({...value,equipmentId:event.target.value})}><option value="">指定なし</option>{options.equipment.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="shared-media-note">メモ<textarea maxLength={2000} value={value.note} onChange={event=>onChange({...value,note:event.target.value})}/></label>
  </div>
}

function MediaDialog({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    const element=ref.current
    element?.showModal()
    return ()=>{if(element?.open) element.close()}
  },[])
  return <dialog ref={ref} className="shared-media-dialog" aria-label={title} onCancel={event=>{event.preventDefault();onClose()}}>
    <header><h2>{title}</h2><button type="button" className="secondary-button" aria-label="閉じる" onClick={onClose}><X size={20}/></button></header>
    {children}
  </dialog>
}

function OriginalDownload({item}:{item:MediaItem}) {
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function launch() {
    setBusy(true)
    setError('')
    // Open the tab during the user's click so iOS does not block it after the server check.
    const target=globalThis.open('about:blank','_blank')
    if (target) target.opener=null
    try {
      const {url}=await mediaApi<{url:string}>('original',{id:item.id})
      if (target) target.location.replace(url)
      else globalThis.location.assign(url)
    } catch(value) {target?.close();setError(errorMessage(value))}
    finally {setBusy(false)}
  }
  return <div className="shared-media-original"><button type="button" className="secondary-button" disabled={busy} onClick={()=>void launch()}><Download size={16}/>{busy?'取得中…':'オリジナルをダウンロード'}</button>
    {error && <p role="alert">{error}</p>}
  </div>
}

function Detail({item,thumbnail,options,onClose,onChanged}:{item:MediaItem;thumbnail?:string;options:MediaOptions;onClose:()=>void;onChanged:()=>void}) {
  const [preview,setPreview]=useState('')
  const [previewFailed,setPreviewFailed]=useState(false)
  const [edit,setEdit]=useState(false)
  const [info,setInfo]=useState<MediaMetadata>({category:item.category,albumId:item.album_id||'',fieldId:options.fields.some(f=>f.id===item.field_id)?item.field_id||'':'',equipmentId:options.equipment.some(e=>e.id===item.equipment_id)?item.equipment_id||'':'',takenAt:item.taken_at||'',note:item.note||''})
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [playing,setPlaying]=useState(false)
  const canEdit=options.isAdmin || item.owner_id===options.userId
  useEffect(()=>{
    if (item.kind!=='photo') return
    const controller=new AbortController()
    void mediaApi<{thumbnails:Record<string,string>}>('thumbnails',{ids:[item.id],size:'large'},controller.signal)
      .then(data=>setPreview(data.thumbnails[item.id]||thumbnail||'')).catch(()=>{if(!controller.signal.aborted)setPreview(thumbnail||'')})
    return ()=>controller.abort()
  },[item.id,item.kind,thumbnail])

  async function play() {
    setPlaying(true)
    try {
      const data=await mediaApi<{url:string}>('playback',{id:item.id})
      setPreview(data.url)
    } catch {setPreviewFailed(true)}
    finally {setPlaying(false)}
  }

  async function mutate(action:'edit'|'remove') {
    if (action==='remove' && !globalThis.confirm('OneDriveからこの原本を完全に削除します。元に戻せません。')) return
    setBusy(true)
    setError('')
    try {
      await mediaApi(action,{id:item.id,...(action==='edit'?info:{})})
      onChanged()
      onClose()
    } catch(value) {setError(errorMessage(value))}
    finally {setBusy(false)}
  }

  return <MediaDialog title={item.original_name} onClose={onClose}>
    <div className="shared-media-preview">
      <span>プレビュー</span>
      {item.kind==='photo' && (preview||thumbnail) && !previewFailed && <img src={preview||thumbnail} alt={item.original_name} referrerPolicy="no-referrer" onError={()=>setPreviewFailed(true)}/>}
      {item.kind==='video' && preview && !previewFailed && <video controls playsInline preload="metadata" src={preview} onError={()=>setPreviewFailed(true)}/>}
      {item.kind==='video' && !preview && !previewFailed && <button type="button" className="secondary-button" disabled={playing} onClick={()=>void play()}><Film size={18}/>{playing?'動画を読み込み中…':'動画プレビューを開く'}</button>}
      {((item.kind==='photo' && !preview && !thumbnail)||previewFailed) && <p>プレビューを表示できません。原本を端末に保存できます。</p>}
    </div>
    <dl className="shared-media-meta">
      <div><dt>サイズ</dt><dd>{formatSize(item.size_bytes)}</dd></div>
      <div><dt>撮影日</dt><dd>{item.taken_at||'未登録'}</dd></div>
      <div><dt>投稿者</dt><dd>{options.posters.find(p=>p.id===item.owner_id)?.display_name||'未登録'}</dd></div>
      <div><dt>分類</dt><dd>{item.category}</dd></div>
    </dl>
    {item.note && <p>{item.note}</p>}
    <OriginalDownload item={item}/>
    {canEdit && !edit && <button className="secondary-button" type="button" onClick={()=>setEdit(true)}>投稿情報を編集</button>}
    {edit && <form onSubmit={event=>{event.preventDefault();void mutate('edit')}}>
      <MetadataFields value={info} onChange={setInfo} options={options}/>
      <button type="submit" className="primary-button" disabled={busy}>保存</button>
    </form>}
    {options.isAdmin && !item.legacy && <button type="button" className="secondary-button" disabled={busy} onClick={()=>void mutate('remove')}>原本を完全削除</button>}
    {error && <p role="alert">{error}</p>}
  </MediaDialog>
}

function Approvals({options}:{options:MediaOptions}) {
  const [show,setShow]=useState(false)
  const [rows,setRows]=useState<MediaApproval[]>([])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function get() {
    const data=await mediaApi<{approvals:MediaApproval[]}>('approvals')
    setRows(data.approvals)
  }
  async function update(id:string,approved:boolean) {
    setBusy(true)
    setError('')
    try {
      await mediaApi('approval-set',{id,approved})
      await get()
    } catch(value) {setError(errorMessage(value))}
    finally {setBusy(false)}
  }
  return <details className="panel shared-media-tools" onToggle={event=>{
    if (event.currentTarget.open && !show) {
      setShow(true)
      void get().catch(value=>{setError(errorMessage(value));setShow(false)})
    }
  }}>
    <summary>共有ギャラリーの利用承認</summary>
    {error && <p role="alert">{error}</p>}
    <ul className="shared-media-albums">{rows.map(row=><li key={row.user_id}>
      <strong>{row.profiles?.display_name||'表示名未設定'}</strong>
      <span>{row.approved?'承認済み':'未承認'}</span>
      {row.user_id!==options.userId && row.profiles?.role!=='admin' && <button className="secondary-button" type="button" disabled={busy} onClick={()=>void update(row.user_id,!row.approved)}>{row.approved?'利用を解除':'利用を承認'}</button>}
    </li>)}</ul>
  </details>
}

export default function SharedMediaPage({onSignOut}:{onSignOut?:()=>void}) {
  const [tab,setTab]=useState<Tab>('all')
  const [options,setOptions]=useState<MediaOptions>()
  const [optionsError,setOptionsError]=useState('')
  const [filters,setFilters]=useState<Filters>(emptyFilters)
  const [draft,setDraft]=useState<Filters>(emptyFilters)
  const [info,setInfo]=useState<MediaMetadata>(blank)
  const [items,setItems]=useState<MediaItem[]>([])
  const [thumbnails,setThumbnails]=useState<Record<string,string>>({})
  const [page,setPage]=useState(0)
  const [more,setMore]=useState(false)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [revision,setRevision]=useState(0)
  const [selected,setSelected]=useState<Set<string>>(new Set())
  const [detail,setDetail]=useState<MediaItem>()
  const [albumEdit,setAlbumEdit]=useState<{id?:string;name:string}>()
  const [albumError,setAlbumError]=useState('')
  const [albumBusy,setAlbumBusy]=useState(false)
  const albumActive=tab==='albums' && !filters.albumId

  useEffect(()=>{
    const controller=new AbortController()
    void mediaApi<MediaOptions>('options',{},controller.signal)
      .then(result=>{setOptions(result);setOptionsError('')})
      .catch(value=>{if(!controller.signal.aborted)setOptionsError(errorMessage(value))})
    return ()=>controller.abort()
  },[revision])

  useEffect(()=>{
    if (albumActive) return
    const controller=new AbortController()
    setLoading(true)
    setError('')
    void mediaApi<{items:MediaItem[];hasMore:boolean}>('list',{page,...filters,kind:tab},controller.signal)
      .then(data=>{
        setItems(previous=>page===0?data.items:[...previous,...data.items.filter(item=>!previous.some(p=>p.id===item.id))])
        setMore(data.hasMore)
        if (!data.items.length) return
        void mediaApi<{thumbnails:Record<string,string>}>('thumbnails',{ids:data.items.map(item=>item.id)},controller.signal)
          .then(result=>setThumbnails(previous=>({...previous,...result.thumbnails}))).catch(()=>{})
      })
      .catch(value=>{if(!controller.signal.aborted)setError(errorMessage(value))})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>controller.abort()
  },[albumActive,filters,page,revision,tab])

  function refresh() {setPage(0);setRevision(value=>value+1)}
  function setView(next:Tab,nextFilters:Filters=emptyFilters) {
    setPage(0);setItems([]);setThumbnails({});setMore(false);setSelected(new Set());setTab(next);setFilters({...nextFilters});setDraft(nextFilters)
  }
  function apply(event:FormEvent) {
    event.preventDefault()
    setView(tab==='albums'&&!draft.albumId?'all':tab,{...draft})
  }
  async function saveAlbum(event:FormEvent) {
    event.preventDefault()
    if (!albumEdit) return
    setAlbumBusy(true)
    setAlbumError('')
    try {await mediaApi('album',albumEdit);setAlbumEdit(undefined);refresh()}
    catch(value) {setAlbumError(errorMessage(value))}
    finally {setAlbumBusy(false)}
  }

  return <div className="page astryx-page shared-media-page">
    <div className="page-head"><div><h1>写真・動画ギャラリー</h1><p className="sub">写真・動画を共有し、OneDriveの原本を端末に保存できます。</p></div>
      {onSignOut&&<button type="button" className="secondary-button" onClick={onSignOut}><LogOut size={17}/>ログアウト</button>}
    </div>
    {optionsError && <div className="notice error" role="alert">{optionsError} <button className="secondary-button" type="button" onClick={refresh}>再読み込み</button></div>}
    {options && <>
      <details className="panel shared-media-tools">
        <summary>写真・動画を追加</summary>
        <p>1ファイル20GBまで。複数選択できます。</p>
        <MetadataFields value={info} onChange={setInfo} options={options}/>
        <MediaUploadQueue key={options.userId} userId={options.userId} info={info} onComplete={refresh}/>
      </details>
      <section className="panel shared-media-content" aria-label="共有メディア">
        <nav className="shared-media-actions" aria-label="表示切り替え">{tabs.map(([key,label])=>
          <button key={key} type="button" aria-pressed={key===tab} className={key===tab?'primary-button':'secondary-button'} onClick={()=>setView(key)}>{label}</button>)}</nav>
        {albumActive ? <>
          <button className="secondary-button" type="button" onClick={()=>{setAlbumError('');setAlbumEdit({name:''})}}>アルバムを作成</button>
          <ul className="shared-media-albums">{options.albums.map(album=><li key={album.id}>
            <button className="secondary-button" type="button" onClick={()=>setView('albums',{...emptyFilters,albumId:album.id})}>{album.name}</button>
            {(options.isAdmin || album.created_by===options.userId) && <button type="button" className="secondary-button" onClick={()=>{setAlbumError('');setAlbumEdit(album)}}>名称変更</button>}
          </li>)}</ul>
        </> : <>
          <details className="shared-media-filters">
          <summary>検索・絞り込み</summary>
          <form className="shared-media-fields" onSubmit={apply}>
            <label>ファイル名を検索<input type="search" maxLength={120} value={draft.search} onChange={event=>setDraft({...draft,search:event.target.value})}/></label>
            <label>分類<select value={draft.category} onChange={event=>setDraft({...draft,category:event.target.value})}><option value="">すべて</option>{MEDIA_CATEGORIES.map(value=><option key={value}>{value}</option>)}</select></label>
            <label>アルバム<select value={draft.albumId} onChange={event=>setDraft({...draft,albumId:event.target.value})}><option value="">すべて</option>{options.albums.map(album=><option value={album.id} key={album.id}>{album.name}</option>)}</select></label>
            <label>投稿者<select value={draft.ownerId} onChange={event=>setDraft({...draft,ownerId:event.target.value})}><option value="">すべて</option>{options.posters.map(poster=><option value={poster.id} key={poster.id}>{poster.display_name||'表示名未設定'}</option>)}</select></label>
            <label>圃場<select value={draft.fieldId} onChange={event=>setDraft({...draft,fieldId:event.target.value})}><option value="">すべて</option>{options.fields.map(field=><option value={field.id} key={field.id}>{field.name}</option>)}</select></label>
            <label>撮影日（開始）<input type="date" value={draft.from} max={draft.to||undefined} onChange={event=>setDraft({...draft,from:event.target.value})}/></label>
            <label>撮影日（終了）<input type="date" value={draft.to} min={draft.from||undefined} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>
            <button type="submit" className="secondary-button">絞り込む</button>
          </form>
          </details>
          {selected.size>0 && <div className="shared-media-actions"><span aria-live="polite">{selected.size}件を選択中</span><button className="secondary-button" type="button" onClick={()=>setSelected(new Set())}>選択を解除</button></div>}
          {!loading && !error && !items.length && <p>該当する写真・動画はありません。</p>}
          {error && <p role="alert">{error}</p>}
          <div className="shared-media-grid">{items.map(item=><article key={item.id} className={selected.has(item.id)?'is-selected':''}>
            <button type="button" className="shared-media-thumb" aria-label={item.original_name+'の詳細'} onClick={()=>setDetail(item)}>
              {thumbnails[item.id] ? <img loading="lazy" src={thumbnails[item.id]} alt="" referrerPolicy="no-referrer" onError={()=>setThumbnails(previous=>({...previous,[item.id]:''}))}/> : item.kind==='video' ? <Film size={30}/> : <ImageIcon size={30}/>}
            </button>
            <div className="shared-media-card">
              <label className="shared-media-select"><input type="checkbox" aria-label={item.original_name+'を選択'} checked={selected.has(item.id)} onChange={event=>{
                const checked=event.target.checked
                setSelected(old=>{const next=new Set(old);if(checked)next.add(item.id);else next.delete(item.id);return next})
              }}/><span>{item.original_name}</span></label>
              <small>{item.kind==='video'?'動画':'写真'} ・ {formatSize(item.size_bytes)}</small>
              <OriginalDownload item={item}/>
            </div>
          </article>)}</div>
          {loading && <p role="status">読み込み中…</p>}
          {more && <button className="secondary-button" type="button" disabled={loading} onClick={()=>setPage(previous=>previous+1)}>さらに表示</button>}
          <p className="shared-media-help">iPhoneでは、開いた画面の共有メニューで「ファイルに保存」を選択できます。ダウンロードが始まった場合はSafariのダウンロード一覧から確認できます。</p>
        </>}
      </section>
      {options.isAdmin && <Approvals options={options}/>}
      {detail && <Detail key={detail.id} item={detail} thumbnail={thumbnails[detail.id]} options={options} onClose={()=>setDetail(undefined)} onChanged={refresh}/>}
      {albumEdit && <MediaDialog title={albumEdit.id?'アルバム名の変更':'アルバムを作成'} onClose={()=>setAlbumEdit(undefined)}>
        <form onSubmit={event=>void saveAlbum(event)}><label>アルバム名<input required maxLength={100} value={albumEdit.name} onChange={event=>setAlbumEdit({...albumEdit,name:event.target.value})}/></label>
          <button type="submit" className="primary-button" disabled={albumBusy}>保存</button></form>
        {albumError && <p role="alert">{albumError}</p>}
      </MediaDialog>}
    </>}
  </div>
}
