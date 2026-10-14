import type { HarvestField } from './harvestProcessing'

export type HarvestFieldInput = { fieldId:string; freshLeafKg:number; harvestedAreaM2:number|null }

// The recorded total is measured; field allocations are estimates based on area.
// The largest-remainder method preserves the total to the nearest 0.001kg.
export function allocateHarvestTotalByArea(totalKg:number,fields:HarvestField[],areas:Record<string,string>):HarvestFieldInput[]{
 const units=Math.round(totalKg*1000)
 if(!fields.length||!Number.isFinite(totalKg)||units<fields.length)throw new Error('合計収量は選択圃場数×0.001kg以上で入力してください。')
 if(Math.abs(totalKg-units/1000)>0.0000001)throw new Error('収量は小数第3位まで入力してください。')
 const weights=fields.map(f=>Number(areas[f.id])>0?Number(areas[f.id]):f.areaM2)
 const weightTotal=weights.reduce((s,x)=>s+x,0)
 if(weightTotal<=0)throw new Error('圃場の面積を確認してください。')
 const transferable=units-fields.length
 const shares=weights.map(w=>transferable*w/weightTotal)
 const parts=shares.map(q=>Math.floor(q)+1)
 const rest=units-parts.reduce((s,x)=>s+x,0)
 const rank=shares.map((q,i)=>({i,frac:q-Math.floor(q)})).sort((a,b)=>b.frac-a.frac||a.i-b.i)
 for(let i=0;i<rest;i++)parts[rank[i].i]++
 return fields.map((field,i)=>({
  fieldId:field.id,
  freshLeafKg:parts[i]/1000,
  harvestedAreaM2:areas[field.id]?Number(areas[field.id]):null
 }))
}
