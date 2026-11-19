import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { MEDIA_ACCEPT, MEDIA_MAX_BYTES, matchMediaSignature, mediaFormat } from '../../supabase/functions/shared-media/format'
import { fileFingerprint, mediaApi, MediaRequestError, runTransfer, type MediaMetadata, type UploadSession } from '../lib/sharedMedia'

type JobState = 'waiting'|'checking'|'uploading'|'paused'|'failed'|'done'
type Job = {
  localId:string; serverId?:string; name:string; size:number; fingerprint?:string; info:MediaMetadata
  state:JobState; progress:number; error?:string; file?:File
}

function restored(key: string): Job[] {
  try {
    const value = JSON.parse(localStorage.getItem(key)||'[]')
    if (!Array.isArray(value)) return []
    return value.map(job=>({...job,state:'paused',file:undefined}))
  } catch { return [] }
}

export default function MediaUploadQueue({userId,info,onComplete}:{userId:string;info:MediaMetadata;onComplete:()=>void}) {
  const key = 'shared-media:queue:'+userId
  const [jobs,setJobs] = useState<Job[]>(()=>restored(key))
  const [active,setActive] = useState<string>()
  const current = useRef<{id:string;controller:AbortController}|null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const replacements = useRef<HTMLInputElement>(null)
  const replacing = useRef<string | undefined>(undefined)
  const persisted=useRef('')
  const [message,setMessage] = useState('')
  const latestComplete = useRef(onComplete)
  latestComplete.current = onComplete

  function patch(localId:string,changes:Partial<Job>) {
    setJobs(previous=>previous.map(job=>job.localId===localId ? {...job,...changes} : job))
  }

  useEffect(()=>{
    try {
      const serialized=JSON.stringify(jobs.filter(job=>job.state!=='done').map(({file:_file,...job})=>({...job,progress:0})))
      if (serialized!==persisted.current) {
        localStorage.setItem(key,serialized)
        persisted.current=serialized
      }
    } catch { /* File references and credentials are never persisted. */ }
  },[jobs,key])

  useEffect(()=>()=>{
    current.current?.controller.abort()
    current.current=null
  },[])

  useEffect(()=>{
    if (active || current.current) return
    const job = jobs.find(item=>item.state==='waiting' && item.file)
    if (!job?.file) return
    const file = job.file
    const {localId} = job
    const controller = new AbortController()
    const {signal} = controller
    current.current={id:localId,controller}
    setActive(localId)
    patch(localId,{state:job.fingerprint?'uploading':'checking',progress:0,error:undefined})
    void (async()=>{
      try {
        const format=mediaFormat(file.name)
        if (!format || !matchMediaSignature(format,new Uint8Array(await file.slice(0,4096).arrayBuffer()))) {
          throw new Error('ファイルの内容と拡張子を確認してください。')
        }
        const fingerprint = job.fingerprint || await fileFingerprint(file,signal,progress=>patch(localId,{progress}))
        signal.throwIfAborted()
        patch(localId,{fingerprint,state:'uploading',progress:0})
        const begin = (id:string) => {
          patch(localId,{serverId:id})
          return mediaApi<UploadSession>('begin',{id,name:file.name,size:file.size,fingerprint,...job.info},signal)
        }
        let session:UploadSession
        try {
          session=job.serverId ? await mediaApi<UploadSession>('status',{id:job.serverId},signal) : await begin(localId)
        } catch(error) {
          if (!(error instanceof MediaRequestError) || error.code!=='session_not_found' || !job.serverId) throw error
          session=await begin(job.serverId)
        }
        if (session.state==='expired' || session.state==='cancelled') session=await begin(crypto.randomUUID())
        const completed = await runTransfer({file,session,signal,
          onProgress:progress=>patch(localId,{progress}),
          onSession:serverId=>patch(localId,{serverId}),
        })
        if (completed.state==='expired') {
          patch(localId,{state:'failed',error:'転送の有効期限が切れました。再開すると最初から送信します。',progress:0})
        } else if (completed.state!=='finalized') {
          patch(localId,{state:'failed',error:'アップロードを確定できませんでした。'})
        } else {
          patch(localId,{state:'done',file:undefined,progress:file.size})
          latestComplete.current()
        }
      } catch(error) {
        if (!signal.aborted) patch(localId,{state:'failed',error:error instanceof Error?error.message:'アップロードに失敗しました。'})
      } finally {
        if (current.current?.controller===controller) {
          current.current=null
          setActive(undefined)
        }
      }
    })()
  },[active,jobs])

  function add(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files||[])
    event.currentTarget.value=''
    const candidates = files.filter(file=>mediaFormat(file.name) && file.size>0 && file.size<=MEDIA_MAX_BYTES)
    const available = Math.max(0,50-jobs.filter(job=>job.state!=='done').length)
    setMessage(candidates.length!==files.length ? '対応形式・容量の条件を満たすファイルを追加しました。' : candidates.length>available ? '一度に50件までキューに登録できます。' : '')
    setJobs(previous=>[...previous.filter(job=>job.state!=='done'),...candidates.slice(0,available).map(file=>({
      localId:crypto.randomUUID(),name:file.name,size:file.size,info:{...info},state:'waiting' as const,progress:0,file,
    }))])
  }

  function pause(job: Job) {
    if (current.current?.id===job.localId) current.current.controller.abort()
    patch(job.localId,{state:'paused'})
  }

  async function cancel(job: Job) {
    pause(job)
    try {
      if (job.serverId) {
        const response = await mediaApi<UploadSession>('cancel',{id:job.serverId})
        if (response.state==='verify' || response.state==='finalized') {
          patch(job.localId,{error:'転送済みです。再開して登録状態を確認してください。'})
          return
        }
        if (response.state==='creating') {
          patch(job.localId,{error:'転送準備中です。時間をおいてキャンセルしてください。'})
          return
        }
      }
      setJobs(previous=>previous.filter(item=>item.localId!==job.localId))
    } catch(error) {
      if (error instanceof MediaRequestError && error.code==='session_not_found') {
        setJobs(previous=>previous.filter(item=>item.localId!==job.localId))
      } else {
        patch(job.localId,{error:error instanceof Error?error.message:'キャンセルに失敗しました。'})
      }
    }
  }

  function resume(job: Job) {
    if (job.file) return patch(job.localId,{state:'waiting',error:undefined})
    replacing.current=job.localId
    replacements.current?.click()
  }

  async function reselect(event: ChangeEvent<HTMLInputElement>) {
    const file=event.currentTarget.files?.[0]
    event.currentTarget.value=''
    const job=jobs.find(item=>item.localId===replacing.current)
    if (!file || !job) return
    try {
      if (file.name!==job.name || file.size!==job.size || (job.fingerprint && await fileFingerprint(file)!==job.fingerprint)) {
        throw new Error('アップロード開始時と同じファイルを選んでください。')
      }
      patch(job.localId,{file,state:'waiting',error:undefined})
    } catch(error) {patch(job.localId,{error:error instanceof Error?error.message:'ファイルを読み取れませんでした。'})}
  }

  return <div className="shared-media-queue">
    <input ref={picker} type="file" multiple accept={MEDIA_ACCEPT} hidden onChange={add}/>
    <input ref={replacements} type="file" accept={MEDIA_ACCEPT} hidden onChange={event=>void reselect(event)}/>
    <button className="primary-button" type="button" onClick={()=>picker.current?.click()}>ファイルを選択</button>
    {message && <p role="status">{message}</p>}
    {jobs.length>0 && <ul className="shared-media-jobs" aria-label="アップロード状況">{jobs.map(job=>
      <li key={job.localId}>
        <strong>{job.name}</strong>
        <span aria-live="polite">{{waiting:'待機中',checking:'原本を確認中',uploading:'アップロード中',paused:'一時停止',failed:'要確認',done:'登録済み'}[job.state]}</span>
        <progress aria-label={job.name+'のアップロード進捗'} max={job.size} value={job.progress}/>
        {job.error && <p role="alert">{job.error}</p>}
        {job.state!=='done' && <div className="shared-media-actions">
          {(job.state==='checking'||job.state==='uploading'||job.state==='waiting') && <button type="button" className="secondary-button" onClick={()=>pause(job)}>一時停止</button>}
          {(job.state==='paused'||job.state==='failed') && <button type="button" className="secondary-button" onClick={()=>resume(job)}>{job.file?'再開':'ファイルを選び直して再開'}</button>}
          <button type="button" className="secondary-button" onClick={()=>void cancel(job)}>キャンセル</button>
        </div>}
      </li>,
    )}</ul>}
  </div>
}
