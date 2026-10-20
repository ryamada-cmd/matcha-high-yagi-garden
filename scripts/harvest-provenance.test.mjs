import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validHarvestDate,inspectHarvestProvenance,summarizeHarvestProvenance}
 from '../src/lib/harvestProvenance.ts';

const twoFields=[
 {fieldId:'f1',freshLeafKg:30,harvestedAreaM2:600},
 {fieldId:'f2',freshLeafKg:70,harvestedAreaM2:1400},
];
const confirmed={date:'2026-10-20',freshLeafKg:100,
 fieldYields:twoFields,yieldEntryMode:'PER_FIELD'};
const imported={date:'',freshLeafKg:2297,fieldYields:[],
 yieldEntryMode:'PER_FIELD'};

test('date validation never silently substitutes today for missing or impossible harvest dates',()=>{
 assert.equal(validHarvestDate('2026-10-20'),true);
 for(const date of ['','2026-02-30','2026-13-02','2026-2-1','unknown'])
  assert.equal(validHarvestDate(date),false,date);
});
test('two actual field harvests qualify; sums measured rather than using master field area',()=>{
 const x=inspectHarvestProvenance(confirmed);
 assert.equal(x.status,'ready');
 assert.equal(x.periodAggregationReady,true);
 assert.equal(x.measuredAreaM2,2000);
 assert.equal(x.yieldMeasuredTotal,true);
});
test('legacy unknown provenance excluded even when it contains real stock kilogram total',()=>{
 const result=inspectHarvestProvenance(imported);
 assert.equal(result.status,'unattributed');
 assert.equal(result.periodAggregationReady,false);
 assert.equal(result.measuredAreaM2,null);
});
test('area omission and mismatched quantity do not masquerade as verified harvest',()=>{
 const area=inspectHarvestProvenance({...confirmed,
  fieldYields:[twoFields[0],{...twoFields[1],harvestedAreaM2:null}]});
 assert.equal(area.status,'area_unverified');
 assert.equal(area.measuredAreaM2,null);
 assert.equal(inspectHarvestProvenance({...confirmed,freshLeafKg:99}).status,'quantity_unverified');
 assert.equal(inspectHarvestProvenance({...confirmed,date:''}).status,'unattributed');
});
test('total measured, field-allocated kg stays explicitly labeled as estimate',()=>{
 const state=inspectHarvestProvenance({...confirmed,yieldEntryMode:'TOTAL_AREA_ESTIMATE'});
 assert.equal(state.status,'ready');
 assert.match(state.label,/圃場別kgは推定/);
});
test('summary separates imported undated lots from verified new harvests',()=>{
 const x=summarizeHarvestProvenance(Array(17).fill(imported).concat(confirmed));
 assert.deepEqual(x,{ready:1,incomplete:17,unattributed:17,areaUnverified:0,quantityUnverified:0});
});
test('UI refuses blank dates; DB migration proposal also removes fallback',()=>{
 const page=readFileSync(new URL('../src/pages/HarvestProcessingPage.tsx',import.meta.url),'utf8');
 const save=readFileSync(new URL('../src/lib/harvestProcessing.ts',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../supabase/migrations/20261020143000_require_explicit_harvest_date.sql',import.meta.url),'utf8');
 assert.match(page,/validHarvestDate\(hDate\)/);
 assert.match(page,/摘採日（実際に確認した日付・必須）<input type="date" required/);
 assert.match(page,/\[hDate,setHDate\]=useState\(''\)/);
 assert.match(page,/function resetHarvest\(\)\{setHId\(''\);setHDate\(''\)/);
 assert.match(page,/harvest-provenance-summary/);
 assert.match(page,/reviewReadOnly/);
 assert.match(page,/canManage=allowed\('harvest_processing\.manage'\)&&!reviewReadOnly/);
 assert.match(page,/canDelete=allowed\('harvest_processing\.delete'\)&&!reviewReadOnly/);
 assert.match(save,/if\(!validHarvestDate\(input\.date\)\)/);
 assert.match(migration,/v_date:=nullif\(p_payload->>'harvest_date',''\)::date/);
 assert.doesNotMatch(migration,/coalesce\(nullif\(p_payload->>'harvest_date',''\)::date,current_date\)/);
 assert.match(migration,/require_app_permission_/);
 assert.match(migration,/audit_logs/);
});

test('source aggregate proposal allows verified dated subset without assigning dates to imports',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261020153000_ai_harvest_attributed_subset_proposal.sql',import.meta.url),'utf8');
 assert.match(sql,/IF v_count=0 THEN/);
 assert.doesNotMatch(sql,/IF v_undated OR v_count=0 THEN/);
 assert.match(sql,/'attributed_subset'/);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/x-yagi-ai-readonly-token/);
 assert.match(sql,/harvest_record_fields/);
 // Two missing elements caught by isolated DB execution:
 // a missing statement terminator after the SQL function body, and
 // nullable per-field fresh-leaf weights slipping through SUM validation.
 assert.match(sql,/\$function\$;\s*$/);
 assert.match(sql,/COUNT\(rf\.fresh_leaf_kg\) n_qty/);
 assert.match(sql,/child\.n<>child\.n_qty/);
 assert.match(sql,/child\.field_kg IS NULL/);
 assert.match(sql,/h\.fresh_leaf_kg<=0/);
 assert.doesNotMatch(sql,/UPDATE public\.harvest_records|INSERT INTO public\.harvest_records|DELETE FROM public\.harvest_records/);
});
