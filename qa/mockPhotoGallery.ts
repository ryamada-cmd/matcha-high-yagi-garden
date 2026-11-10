// Isolated synthetic photo gallery: all bytes, metadata and thumbnails are fake.
// This module is never linked by the production Vite entry.
const copy=<T,>(x:T):T=>JSON.parse(JSON.stringify(x))
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/jfXkAAAAASUVORK5CYII='
const photos:any[]=Array.from({length:39},(_,i)=>({
 id:'qa-photo-'+String(i+1),provider:'qa',drive_id:'qa',provider_item_id:'qa-item-'+i,
 file_name:i===0?'QA-茶摘み初日.png':i===1?'QA-設備点検.png':'QA-イベント-'+String(i+1)+'.png',
 mime_type:'image/png',size_bytes:1024,folder_path:'/架空写真/'+(i<2?'現場':'イベント'),
 web_url:null,uploaded_at:'2026-11-01T10:00:00+09:00',
 metadata:{kind:'photo',photoCategory:i===0?'茶摘み':i===1?'機械設備':'イベント',
  album:i===0?'一番茶':i===1?'機械点検':'架空イベント',takenAt:i===0?'2026-05-16':'2026-11-01'},
 external_file_links:[{id:'qa-link-photo-'+i,entity_type:'field',entity_id:'qa-field-1',
  category:i===0?'茶摘み':i===1?'機械設備':'イベント',note:i===0?'架空手摘み初日':'架空写真',created_at:'2026-11-01'}]
}))
export async function loadPhotoGallery(){return copy(photos)}
export async function loadPhotoTargets(){return copy([
 {entityType:'field',entityId:'qa-field-1',label:'架空茶園A区画'},
 {entityType:'equipment',entityId:'qa-equipment-1',label:'架空製茶設備'}
])}
export async function loadPhotoThumbnails(ids:string[],size:'medium'|'large'){
 (window as any).__qa_photo_thumbnails=(window as any).__qa_photo_thumbnails||[]
 ;(window as any).__qa_photo_thumbnails.push({ids:copy(ids),size})
 return Object.fromEntries(ids.map(id=>[id,png]))
}
export async function uploadPhoto(input:any){
 const item={id:'qa-photo-upload-'+(photos.length+1),provider:'qa',drive_id:'qa',
  provider_item_id:'qa-item-new',file_name:input.file.name,mime_type:input.file.type,
  size_bytes:input.file.size,folder_path:'/架空写真/'+input.album,web_url:null,
  uploaded_at:'2026-11-10T08:00:00+09:00',
  metadata:{kind:'photo',photoCategory:input.photoCategory,album:input.album,takenAt:input.takenAt},
  external_file_links:[{id:'qa-link-new',entity_type:input.entityType||'general',
   entity_id:input.entityId||'',category:input.photoCategory,note:input.note||'',created_at:'2026-11-10'}]}
 photos.unshift(item)
 ;(window as any).__qa_photo_uploads=[...((window as any).__qa_photo_uploads||[]),{
  fileName:input.file.name,category:input.photoCategory,album:input.album,
  entityType:input.entityType||'',entityId:input.entityId||'',note:input.note||''
 }]
 return {ok:true,file:copy(item)}
}
