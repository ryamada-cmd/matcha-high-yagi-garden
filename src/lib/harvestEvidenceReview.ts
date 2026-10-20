/**
 * Local, read-only evidence reconciliation view for harvest records.
 * No OCR inference, guessed dates/fields, document association, writes or
 * external data transfer. Confirmation of evidence is a human action.
 */
// Keep this lightweight helper self-contained so the same review logic can
// run in Node's no-network TypeScript safety tests without a bundler.
const validHarvestDate=(value:string):boolean=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const time=Date.parse(value+'T00:00:00.000Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
};
import type {HarvestRecord} from './harvestProcessing';

export type HarvestEvidenceMissing = 'date'|'field'|'measured_area'|'field_yield';
export type HarvestEvidenceRow = {
 id:string;legacyId:string;sourceLotNo:string;
 recordedDate:string;recordedFields:string;
 freshLeafKg:number|null;
 missing:HarvestEvidenceMissing[];
 status:'needs_evidence'|'recorded_complete';
 // Having DB fields populated is NOT equivalent to documents being reviewed.
 evidenceReviewed:false;
};

export function harvestEvidenceRow(record:HarvestRecord):HarvestEvidenceRow {
 const missing:HarvestEvidenceMissing[]=[];
 if(!validHarvestDate(record.date))missing.push('date');
 const allocations=Array.isArray(record.fieldYields)?record.fieldYields:[];
 if(allocations.length===0||allocations.some(f=>!f.fieldId))missing.push('field');
 if(allocations.length===0||allocations.some(f=>f.harvestedAreaM2===null||
   !Number.isFinite(f.harvestedAreaM2)||f.harvestedAreaM2<=0))missing.push('measured_area');
 const quantityValid=Number.isFinite(record.freshLeafKg)&&record.freshLeafKg>0&&
   allocations.length>0 && allocations.every(f=>Number.isFinite(f.freshLeafKg)&&f.freshLeafKg>0)&&
   Math.abs(allocations.reduce((s,f)=>s+f.freshLeafKg,0)-record.freshLeafKg)<=0.001;
 if(!quantityValid)missing.push('field_yield');
 const recordedFields=allocations.length>0?allocations.map(f=>f.fieldLegacyId||'').filter(Boolean).join('・'):'';
 return {
   id:String(record.id||''),legacyId:String(record.legacyId||''),
   sourceLotNo:String(record.sourceLotNo||''),recordedDate:validHarvestDate(record.date)?record.date:'',
   recordedFields,
   freshLeafKg:Number.isFinite(record.freshLeafKg)&&record.freshLeafKg>=0?record.freshLeafKg:null,
   missing,status:missing.length===0?'recorded_complete':'needs_evidence',
   evidenceReviewed:false,
 };
}
export function harvestEvidenceSummary(rows:HarvestRecord[]) {
 const details=rows.map(harvestEvidenceRow);
 const needsEvidence=details.filter(r=>r.status==='needs_evidence');
 return {
  total:details.length,needsEvidence:needsEvidence.length,recordedComplete:details.length-needsEvidence.length,
  dateMissing:details.filter(r=>r.missing.includes('date')).length,
  fieldMissing:details.filter(r=>r.missing.includes('field')).length,
  areaMissing:details.filter(r=>r.missing.includes('measured_area')).length,
  quantityMissing:details.filter(r=>r.missing.includes('field_yield')).length,
  evidenceDocumentsLinked:null as number|null, // not read from DB; never invent a count
 };
}
export const HARVEST_EVIDENCE_MISSING_LABELS:Record<HarvestEvidenceMissing,string>={
 date:'摘採日が未登録',field:'圃場が未登録',
 measured_area:'実測摘採面積が未登録',field_yield:'圃場別生葉量の照合が必要',
};
function csvCell(input:string|number|null|undefined) {
 let x=String(input??'');
 // Prevent CSV spreadsheet formula injection, including Unicode whitespace
 // followed by = + - @, without deleting user-entered source identifiers.
 if(/^[\u0000-\u0020\uFEFF\u200B]*[=+\-@]/u.test(x))x="'"+x;
 return '"'+x.replace(/"/g,'""')+'"';
}
export function harvestEvidenceCsv(rows:HarvestRecord[]) {
 const header=[
  '摘採LOT（登録値）','JAロット（登録値）','生葉重量kg（登録値）',
  '摘採日（登録値・未照合）','圃場番号（登録値・未照合）','不足・確認項目',
  '証拠資料名・保管場所（手入力）','摘採日を裏付ける記載（手入力）',
  '圃場を裏付ける記載（手入力）','実測面積の根拠（手入力）',
  '収量の照合資料（手入力）','確認者（手入力）','確認日（手入力）',
  '根拠資料による確認結果（手入力）',
 ];
 const safeRows=rows.map(row=>{
  const x=harvestEvidenceRow(row);
  return [x.legacyId,x.sourceLotNo,x.freshLeafKg,x.recordedDate,x.recordedFields,
   x.missing.map(k=>HARVEST_EVIDENCE_MISSING_LABELS[k]).join('・'),
   '','','','','','','',''];
 });
 return '\uFEFF'+[header,...safeRows].map(values=>values.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
