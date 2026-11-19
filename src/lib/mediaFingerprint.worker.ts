import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

type Result = {type:'progress';bytes:number}|{type:'complete';hash:string}|{type:'error'}
const worker = globalThis as unknown as {
  onmessage:((event:MessageEvent<File>)=>void)|null
  postMessage:(result:Result)=>void
}
worker.onmessage = async ({data:file})=>{
  const digest=sha256.create()
  const reader=file.stream().getReader()
  let bytes=0
  let reported=0
  try {
    while (true) {
      const block=await reader.read()
      if (block.done) break
      digest.update(block.value)
      bytes+=block.value.length
      if (bytes-reported>=8*1024*1024) {
        worker.postMessage({type:'progress',bytes})
        reported=bytes
      }
    }
    if (bytes!==file.size) throw new Error('File length changed')
    worker.postMessage({type:'complete',hash:bytesToHex(digest.digest())})
  } catch {worker.postMessage({type:'error'})}
  finally {reader.releaseLock()}
}
