import { supabase } from './supabase'
import { MEDIA_CHUNK_BYTES } from '../../supabase/functions/shared-media/format'

export const SHARED_MEDIA_ENABLED = import.meta.env.VITE_SHARED_MEDIA_ENABLED === '1'

export type MediaMetadata = {category:string; albumId:string; fieldId:string; equipmentId:string; takenAt:string; note:string}
export type MediaItem = {
  id:string; kind:'photo'|'video'; original_name:string; mime_type:string|null; size_bytes:number
  category:string; album_id:string|null; taken_at:string|null; note:string|null; field_id:string|null; equipment_id:string|null
  owner_id:string|null; posted_at:string; legacy:boolean
}
export type MediaOptions = {
  albums:{id:string;name:string;created_by:string|null}[]
  fields:{id:string;name:string;legacy_id:string|null}[]
  equipment:{id:string;name:string}[]
  posters:{id:string;display_name:string|null}[]
  userId:string; isAdmin:boolean
}
export type MediaApproval = {user_id:string;approved:boolean;profiles:{display_name:string|null;role:string}}
export type UploadSession = {
  id:string; state:'open'|'creating'|'verify'|'expired'|'finalized'|'rejected'|'cancelled'|'incomplete'
  uploadUrl?:string; nextExpectedRanges?:string[]; mediaId?:string
}

export class MediaRequestError extends Error {
  constructor(message: string, public status: number, public code?: string, public retryAfter?: string|null) { super(message) }
}
export async function mediaApi<T>(action: string, params: Record<string,unknown>={}, signal?: AbortSignal): Promise<T> {
  for (let attempt=0;attempt<2;attempt++) {
    const {data,error} = await supabase.functions.invoke<T>('shared-media',{body:{action,...params},signal})
    if (!error) return data as T
    if (signal?.aborted) throw signal.reason
    if (error.context instanceof Response) {
      const response = error.context
      if (response.status===401 && attempt===0) {
        const refresh = await supabase.auth.refreshSession()
        if (!refresh.error) continue
      }
      const payload = await response.json().catch(()=>null)
      throw new MediaRequestError(payload?.error || '共有ギャラリーとの通信に失敗しました。',response.status,payload?.code,response.headers.get('Retry-After'))
    }
    throw new MediaRequestError('通信状況を確認してください。',0)
  }
  throw new MediaRequestError('ログインの有効期限を確認してください。',401)
}

export function fileFingerprint(file: File,signal?:AbortSignal,onProgress?:(bytes:number)=>void) {
  return new Promise<string>((resolve,reject)=>{
    if (signal?.aborted) return reject(signal.reason)
    const worker=new Worker(new URL('./mediaFingerprint.worker.ts',import.meta.url),{type:'module'})
    const stop = () => {worker.terminate();signal?.removeEventListener('abort',abort)}
    const abort = () => {stop();reject(signal?.reason)}
    const failed = () => {stop();reject(new Error('元ファイルを読み取れませんでした。ファイルを選び直してください。'))}
    worker.onmessage=({data})=>{
      if (data.type==='progress') onProgress?.(data.bytes)
      else if (data.type==='complete') {stop();resolve(data.hash)}
      else failed()
    }
    worker.onerror=failed
    signal?.addEventListener('abort',abort,{once:true})
    worker.postMessage(file)
  })
}

export function nextOffset(ranges: unknown,total: number) {
  if (!Array.isArray(ranges) || !ranges.length) throw new MediaRequestError('OneDriveの受信範囲を確認できません。',502)
  const starts = ranges.map(value=>typeof value==='string' && /^\d+-\d*$/.test(value) ? Number(value.split('-')[0]) : NaN)
  if (starts.some(value=>!Number.isSafeInteger(value)||value<0||value>=total)) {
    throw new MediaRequestError('OneDriveが無効な受信範囲を返しました。',502)
  }
  return Math.min(...starts)
}

function retryDelay(retryAfter: string|null|undefined,attempt: number) {
  const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter)*1000 : NaN
  const date = retryAfter ? Date.parse(retryAfter)-Date.now() : NaN
  return Number.isFinite(seconds) ? seconds : Number.isFinite(date) ? Math.max(0,date) : Math.min(30000,1000*2**attempt)
}
function wait(ms: number,signal: AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    if (signal.aborted) return reject(signal.reason)
    const abort = () => {clearTimeout(timer);reject(signal.reason)}
    const timer = setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms)
    signal.addEventListener('abort',abort,{once:true})
  })
}
function putChunk(url: string,file: File,start: number,end: number,signal: AbortSignal,onProgress: (value:number)=>void) {
  return new Promise<{status:number;ranges?:string[]}>((resolve,reject)=>{
    if (signal.aborted) return reject(signal.reason)
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    xhr.open('PUT',url)
    xhr.timeout = 120000
    xhr.responseType = 'json'
    xhr.setRequestHeader('Content-Range',`bytes ${start}-${end-1}/${file.size}`)
    xhr.upload.onprogress = event => onProgress(start+Math.min(event.loaded,end-start))
    xhr.onload = () => {
      if ([200,201,202].includes(xhr.status)) resolve({status:xhr.status,ranges:xhr.response?.nextExpectedRanges})
      else reject(new MediaRequestError(
        xhr.status===507 ? 'OneDriveの空き容量が不足しています。' : `OneDriveの転送に失敗しました（${xhr.status}）。`,
        xhr.status,undefined,xhr.getResponseHeader('Retry-After'),
      ))
    }
    xhr.ontimeout = xhr.onerror = () => reject(new MediaRequestError('通信が中断されました。',0))
    xhr.onabort = () => reject(signal.reason)
    xhr.onloadend = () => signal.removeEventListener('abort',abort)
    signal.addEventListener('abort',abort,{once:true})
    xhr.send(file.slice(start,end,'application/octet-stream'))
  })
}

function canRetry(error: unknown) {
  return error instanceof MediaRequestError &&
    ([0,404,408,410,416,429].includes(error.status) || (error.status>=500 && error.status!==507))
}
export async function runTransfer(args: {
  file: File; session: UploadSession; signal: AbortSignal; onProgress:(bytes:number)=>void;
  onSession:(id:string)=>void;
}) {
  const {file,signal,onProgress,onSession} = args
  let session = args.session
  let retries = 0
  while (true) {
    signal.throwIfAborted()
    onSession(session.id)
    if (session.state==='finalized') {onProgress(file.size);return session}
    if (['expired','rejected','cancelled'].includes(session.state)) return session
    if (session.state==='creating' || session.state==='incomplete') {
      if (retries++>=5) throw new MediaRequestError('アップロードの準備に時間がかかっています。再開を押してください。',409)
      await wait(retryDelay(null,retries),signal)
      session = await mediaApi<UploadSession>('status',{id:session.id},signal)
      continue
    }
    try {
      if (session.state==='verify') {
        session = await mediaApi<UploadSession>('finalize',{id:session.id},signal)
        continue
      }
      if (!session.uploadUrl) throw new MediaRequestError('転送先を取得できませんでした。',502)
      const offset = nextOffset(session.nextExpectedRanges,file.size)
      const end = Math.min(offset+MEDIA_CHUNK_BYTES,file.size)
      const result = await putChunk(session.uploadUrl,file,offset,end,signal,onProgress)
      if (result.status===202) {
        const acknowledged = nextOffset(result.ranges,file.size)
        if (acknowledged<=offset) throw new MediaRequestError('OneDriveの受信範囲を確認します。',416)
        onProgress(acknowledged)
        session = {...session,nextExpectedRanges:result.ranges}
      } else {
        onProgress(file.size)
        session = {state:'verify',id:session.id}
      }
      retries = 0
    } catch (error) {
      if (signal.aborted || !canRetry(error) || retries>=5) throw error
      let failure = error as MediaRequestError
      for (;;) {
        await wait(retryDelay(failure.retryAfter,retries++),signal)
        try {session=await mediaApi<UploadSession>('status',{id:session.id},signal);break}
        catch (statusError) {
          if (!canRetry(statusError) || retries>=5) throw statusError
          failure=statusError as MediaRequestError
        }
      }
    }
  }
}
