import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harvestEvidenceRow,harvestEvidenceSummary,harvestEvidenceCsv,HARVEST_EVIDENCE_MISSING_LABELS}
 from '../src/lib/harvestEvidenceReview.ts';

const imported={
 id:'synthetic-lot-1',legacyId:'LOT-01',sourceLotNo:'JA-01',
 date:'',fieldId:'',fieldYields:[],freshLeafKg:150,
};
const verified={
 ...imported,id:'synthetic-new-1',legacyId:'LOT-02',date:'2026-10-19',
 fieldId:'field-1',fieldYields:[{
  fieldId:'field-1',fieldLegacyId:'QA-A',freshLeafKg:60,harvestedAreaM2:1000,
  areaM2:1200
 },{
  fieldId:'field-2',fieldLegacyId:'QA-B',freshLeafKg:90,harvestedAreaM2:1800,
  areaM2:2200
 }],
};
test('17 synthetic imported undated lots are not marked documented or approved',()=>{
 const list=Array.from({length:17},(_,i)=>({...imported,id:'synthetic-'+i,legacyId:'LOT-'+i}));
 const summary=harvestEvidenceSummary(list);
 assert.equal(summary.total,17);
 assert.equal(summary.needsEvidence,17);
 assert.equal(summary.recordedComplete,0);
 assert.equal(summary.dateMissing,17);
 assert.equal(summary.fieldMissing,17);
 assert.equal(summary.areaMissing,17);
 assert.equal(summary.evidenceDocumentsLinked,null); // never invent link count
 for(const lot of list){
  const x=harvestEvidenceRow(lot);
  assert.equal(x.evidenceReviewed,false);
  assert.equal(x.status,'needs_evidence');
  assert.deepEqual(x.missing,['date','field','measured_area','field_yield']);
  assert.equal(x.recordedDate,'');
  assert.equal(x.recordedFields,'');
  assert.equal(x.freshLeafKg,150); // source qty is real, not dated production
 }
});
test('fully recorded synthetic lot still needs separate documentary review',()=>{
 const x=harvestEvidenceRow(verified);
 assert.equal(x.status,'recorded_complete');
 assert.equal(x.evidenceReviewed,false);
 assert.equal(x.recordedDate,'2026-10-19');
 assert.equal(x.recordedFields,'QA-A・QA-B');
 assert.deepEqual(x.missing,[]);
});
test('insufficient/contradictory source values remain flagged without inferring master acreage',()=>{
 const missingArea=harvestEvidenceRow({...verified,fieldYields:verified.fieldYields.map(x=>({...x,harvestedAreaM2:null}))});
 assert.deepEqual(missingArea.missing,['measured_area']);
 assert.equal(missingArea.evidenceReviewed,false);
 const wrongKg=harvestEvidenceRow({...verified,freshLeafKg:200});
 assert.deepEqual(wrongKg.missing,['field_yield']);
 const invalidDate=harvestEvidenceRow({...verified,date:'2026-02-30'});
 assert.deepEqual(invalidDate.missing,['date']);
});
test('CSV exports source values + empty human-only evidence columns without fake dates',()=>{
 const s=harvestEvidenceCsv([imported,verified]);
 assert.ok(s.startsWith('\uFEFF'));
 assert.match(s,/LOT-01/);
 assert.match(s,/LOT-02/);
 assert.match(s,/JA-01/);
 assert.match(s,/摘採日（登録値・未照合）/);
 assert.match(s,/根拠資料による確認結果（手入力）/);
 assert.match(s,/証拠資料名・保管場所（手入力）/);
 assert.match(s,/摘採日が未登録/);
 assert.match(s,/圃場が未登録/);
 assert.doesNotMatch(s,/2026-10-20/);
 assert.equal(s.trim().split('\r\n').length,3);
 const first=s.trim().split('\r\n')[1];
 assert.equal(first.split(',').length,14);
 assert.ok(first.endsWith(',"",""'));
});
test('spreadsheet formula injection is blocked in source lot fields',()=>{
 const s=harvestEvidenceCsv([
  {...imported,legacyId:'=HYPERLINK("https://fake.example")',sourceLotNo:' \t@SUM(1)'},
  {...imported,legacyId:'+1+2',sourceLotNo:'-5*2'},
 ]);
 assert.match(s,/"'=HYPERLINK\(""https:\/\/fake\.example""\)"/);
 assert.match(s,/"' \t@SUM\(1\)"/);
 assert.match(s,/"'\+1\+2"/);
 assert.match(s,/"'-5\*2"/);
});
test('no data writes or automatic document linking in evidence helper',()=>{
 const code=readFileSync(new URL('../src/lib/harvestEvidenceReview.ts',import.meta.url),'utf8');
 const page=readFileSync(new URL('../src/pages/HarvestProcessingPage.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(code,/supabase\.|\.from\(|fetch\(|\.rpc\(|\.insert\(|\.update\(|\.upsert\(|file\.upload/i);
 assert.match(page,/資料照合用CSVを出力/);
 assert.match(page,/資料ライブラリを見る/);
 assert.match(page,/exportEvidenceChecklist/);
 assert.match(page,/harvestEvidenceSummary\(harvests\)/);
 assert.match(page,/CSV編集は元の摘採データへ反映されません/);
 assert.equal(Object.keys(HARVEST_EVIDENCE_MISSING_LABELS).length,4);
});
