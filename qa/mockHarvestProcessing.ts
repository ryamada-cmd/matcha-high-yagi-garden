// Synthetic-only data facade for browser UI tests.
// No @supabase/supabase-js import, real project URL, auth, API key, or network call.
const F1='11111111-1111-4111-8111-000000000001';
const F2='11111111-1111-4111-8111-000000000002';
const fields=[
 {id:F1,legacyId:'QA-A',name:'架空圃場A',location:'',areaM2:1000,variety:'架空品種'},
 {id:F2,legacyId:'QA-B',name:'架空圃場B',location:'',areaM2:2000,variety:'架空品種'},
];
const imported=Array.from({length:17},(_,i)=>({
 id:'qa-import-'+i,legacyId:'QA-LOT-'+String(i+1).padStart(2,'0'),date:'',
 fieldId:'',fieldLegacyId:'未特定',fieldName:'圃場未特定',location:'',
 areaM2:0,season:'',method:'',freshLeafKg:10,harvestedAreaM2:null,
 operator:'',destination:'',qualityNote:'',note:'',sourceLotNo:'',variety:'',
 processedKg:0,remainingKg:10,yieldKgPer10a:0,yieldEntryMode:'PER_FIELD',
 fieldYields:[],
}));
let stored=imported;
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
export async function loadHarvestRole(){return 'admin'}
export async function loadHarvestFields(){return clone(fields)}
export async function loadHarvestRecords(){return clone(stored)}
export async function loadProcessingBatches(){return []}
export async function saveHarvestRecord(input:any){
 // This is an in-memory-only fake; no network, no external persistence.
 const id=input.id||'qa-created-'+(stored.length+1);
 const fieldYields=input.fields.map((f:any)=>({
  fieldId:f.fieldId,fieldLegacyId:fields.find(x=>x.id===f.fieldId)?.legacyId||'?',
  fieldName:fields.find(x=>x.id===f.fieldId)?.name||'',areaM2:fields.find(x=>x.id===f.fieldId)?.areaM2||0,
  variety:'架空品種',freshLeafKg:f.freshLeafKg,harvestedAreaM2:f.harvestedAreaM2,
 }));
 const record={
  id,legacyId:id,date:input.date,fieldId:input.fieldId,
  fieldLegacyId:fieldYields.map((x:any)=>x.fieldLegacyId).join('・'),
  fieldName:fieldYields.map((x:any)=>x.fieldName).join('・'),location:'',areaM2:0,
  season:input.season,method:input.method,freshLeafKg:input.freshLeafKg,
  harvestedAreaM2:input.harvestedAreaM2,operator:input.operator,
  destination:input.destination,qualityNote:input.qualityNote,note:input.note,
  sourceLotNo:'',variety:'架空品種',processedKg:0,remainingKg:input.freshLeafKg,
  yieldKgPer10a:0,yieldEntryMode:input.yieldEntryMode,fieldYields,
 };
 stored=stored.filter(r=>r.id!==id).concat(record);
 (window as any).__qa_last_save=clone(input);
 return id;
}
export async function deleteHarvestRecord(id:string){stored=stored.filter(r=>r.id!==id)}
export async function saveProcessingBatch(){throw Error('QA processing write not configured')}
export async function deleteProcessingBatch(){throw Error('QA processing delete not configured')}
export async function finalizeImportedHarvestSource(){throw Error('QA imported lot finalization disabled')}
export function resetQa(){stored=clone(imported);(window as any).__qa_last_save=null}
