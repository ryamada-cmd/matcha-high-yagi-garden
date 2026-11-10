// Strictly isolated fake OneDrive metadata. No Microsoft, Graph, Supabase or network imports.
const copy=<T,>(v:T):T=>JSON.parse(JSON.stringify(v))
const now='2026-11-10T01:00:00+09:00'
const status={enabled:true,tenantId:'qa-fake-tenant',clientId:'qa-fake-client',
 clientSecretConfigured:true,rootFolder:'架空茶園資料',connectedAccount:'qa-only@example.invalid',
 redirectUri:'http://127.0.0.1:5178/storage',fileCount:2,folderStructure:'v2',lastError:''}
const targets=[{entityType:'field',entityId:'qa-field-1',category:'圃場',label:'架空茶園 A区画'}]
const files:any[]=[
 {id:'qa-file-1',file_name:'QA-請求書.pdf',size_bytes:4096,mime_type:'application/pdf',
  folder_path:'/架空茶園資料/請求書',uploaded_at:'2026-11-03T09:00:00+09:00',web_url:'',
  external_file_links:[{id:'qa-link-1',category:'帳票',note:'架空取引先',entity_type:'general',entity_id:''}]},
 {id:'qa-file-2',file_name:'QA-圃場記録.pdf',size_bytes:2048,mime_type:'application/pdf',
  folder_path:'/架空茶園資料/圃場',uploaded_at:'2026-10-02T10:00:00+09:00',web_url:'',
  external_file_links:[{id:'qa-link-2',category:'圃場',note:'記録',entity_type:'field',entity_id:'qa-field-1'}]}
]
export async function getExternalStorageStatus(){return copy({...status,fileCount:files.length})}
export async function loadExternalFiles(){return copy(files)}
export async function loadExternalLinkTargets(){return copy(targets)}
export async function verifyExternalStorage(){(window as any).__qa_storage_verified=true;return getExternalStorageStatus()}
export async function configureExternalStorage(input:any){
 (window as any).__qa_storage_config=copy(input)
 Object.assign(status,{tenantId:input.tenantId,clientId:input.clientId,rootFolder:input.rootFolder})
 return getExternalStorageStatus()
}
export async function startOneDriveAuthorization():Promise<never>{throw Error('External OAuth forbidden in synthetic QA')}
export async function uploadExternalFile(input:any){
 const id='qa-file-'+(files.length+1),file={
  id,file_name:input.file.name,size_bytes:input.file.size,mime_type:input.file.type,
  folder_path:'/架空茶園資料/'+input.category,uploaded_at:now,web_url:'',
  external_file_links:[{id:'qa-link-'+id,category:input.category,note:input.note||'',
   entity_type:input.entityType||'general',entity_id:input.entityId||''}]
 }
 files.unshift(file)
 ;(window as any).__qa_storage_upload=copy({name:input.file.name,category:input.category,
  entityType:input.entityType,entityId:input.entityId})
 return {file:copy(file)}
}
export async function getExternalFileDownloadUrl(id:string){
 const found=files.find(f=>f.id===id)
 if(!found)throw Error('QA document missing')
 return {url:'data:application/pdf;base64,JVBERi0xLjQKJUVPRgo=',mimeType:found.mime_type,fileName:found.file_name}
}
