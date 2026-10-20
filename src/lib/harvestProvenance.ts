/** Data provenance for harvest history and later read-only AI reports.
 * Does not alter, infer, or backfill source records.
 */
export type HarvestProvenanceInput = {
 date:string;freshLeafKg:number;fieldYields:Array<{
  fieldId:string;freshLeafKg:number;harvestedAreaM2:number|null;
 }>;
 yieldEntryMode:'PER_FIELD'|'TOTAL_AREA_ESTIMATE';
};
export type HarvestProvenance = {
 status:'ready'|'unattributed'|'area_unverified'|'quantity_unverified';
 label:string;periodAggregationReady:boolean;measuredAreaM2:number|null;
 yieldMeasuredTotal:boolean;
};
export function validHarvestDate(date:string):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const time=Date.parse(date+'T00:00:00.000Z');
 return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===date;
}
export function inspectHarvestProvenance(record:HarvestProvenanceInput):HarvestProvenance {
 const base={yieldMeasuredTotal:true};
 if(!validHarvestDate(record.date)||!record.fieldYields.length||
   record.fieldYields.some(f=>!f.fieldId)){
  return {...base,status:'unattributed',label:'日付・摘採元未確定（期間集計対象外）',periodAggregationReady:false,measuredAreaM2:null};
 }
 const actual=record.fieldYields.reduce((sum,field)=>sum+field.freshLeafKg,0);
 if(!Number.isFinite(record.freshLeafKg)||record.freshLeafKg<=0||
    record.fieldYields.some(f=>!Number.isFinite(f.freshLeafKg)||f.freshLeafKg<=0)||
    Math.abs(actual-record.freshLeafKg)>0.001){
  return {...base,status:'quantity_unverified',label:'生葉重量の確認が必要',periodAggregationReady:false,measuredAreaM2:null};
 }
 if(record.fieldYields.some(f=>f.harvestedAreaM2===null||
    !Number.isFinite(f.harvestedAreaM2)||Number(f.harvestedAreaM2)<=0)){
  return {...base,status:'area_unverified',label:'摘採面積未入力（参考値のみ・AI集計対象外）',periodAggregationReady:false,measuredAreaM2:null};
 }
 return {...base,status:'ready',label:record.yieldEntryMode==='TOTAL_AREA_ESTIMATE'
  ?'摘採日・面積・実測合計あり（圃場別kgは推定）':'日付・面積・生葉量の実測記録あり',
  periodAggregationReady:true,
  measuredAreaM2:record.fieldYields.reduce((sum,f)=>sum+Number(f.harvestedAreaM2),0)};
}
export function summarizeHarvestProvenance(rows:HarvestProvenanceInput[]){
 const statuses=rows.map(inspectHarvestProvenance);
 return {
  ready:statuses.filter(x=>x.periodAggregationReady).length,
  incomplete:statuses.filter(x=>!x.periodAggregationReady).length,
  unattributed:statuses.filter(x=>x.status==='unattributed').length,
  areaUnverified:statuses.filter(x=>x.status==='area_unverified').length,
  quantityUnverified:statuses.filter(x=>x.status==='quantity_unverified').length,
 };
}
