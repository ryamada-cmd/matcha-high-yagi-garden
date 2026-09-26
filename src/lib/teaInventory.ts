import { supabase } from './supabase'

export type TeaInventoryOutput = {
  id:string
  batchId:string
  grade:string
  outputKg:number
  bagCount:number
  productionLotId:string
  balanceKg:number
}

export type TeaInventoryBatch = {
  id:string
  cropYear:number
  season:string
  lotNo:string
  variety:string
  pickingMethod:string
  freshLeafKg:number
  jaShipmentDate:string
  coldStorageDate:string
  storageLocation:string
  sourceFile:string
  note:string
  outputs:TeaInventoryOutput[]
  outputKg:number
  bagCount:number
  balanceKg:number
  yieldPct:number
}

const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0

export async function loadTeaInventoryBatches():Promise<TeaInventoryBatch[]>{
  const {data:batches,error:e1}=await supabase
    .from('tea_inventory_batches')
    .select('id,crop_year,season,lot_no,variety,picking_method,fresh_leaf_kg,ja_shipment_date,cold_storage_date,storage_location,source_file,note')
    .order('crop_year',{ascending:false})
    .order('ja_shipment_date',{ascending:true})
    .order('lot_no',{ascending:true})
  if(e1)throw e1

  const ids=(batches||[]).map((x:any)=>x.id)
  if(!ids.length)return[]

  const {data:outputs,error:e2}=await supabase
    .from('tea_inventory_outputs')
    .select('id,batch_id,grade,output_kg,bag_count,production_lot_id')
    .in('batch_id',ids)
    .order('grade',{ascending:true})
  if(e2)throw e2

  const lotIds=(outputs||[]).map((x:any)=>x.production_lot_id).filter(Boolean)
  const balances=new Map<string,number>()
  if(lotIds.length){
    const {data:stock,error:e3}=await supabase
      .from('production_inventory_balances')
      .select('lot_id,balance')
      .in('lot_id',lotIds)
    if(e3)throw e3
    for(const row of stock||[])balances.set((row as any).lot_id,n((row as any).balance))
  }

  const byBatch=new Map<string,TeaInventoryOutput[]>()
  for(const row of outputs||[]){
    const x:TeaInventoryOutput={
      id:(row as any).id,
      batchId:(row as any).batch_id,
      grade:(row as any).grade||'',
      outputKg:n((row as any).output_kg),
      bagCount:n((row as any).bag_count),
      productionLotId:(row as any).production_lot_id||'',
      balanceKg:balances.get((row as any).production_lot_id)||0,
    }
    byBatch.set(x.batchId,[...(byBatch.get(x.batchId)||[]),x])
  }

  return(batches||[]).map((r:any)=>{
    const os=byBatch.get(r.id)||[]
    const outputKg=os.reduce((s,x)=>s+x.outputKg,0)
    const bagCount=os.reduce((s,x)=>s+x.bagCount,0)
    const balanceKg=os.reduce((s,x)=>s+x.balanceKg,0)
    const fresh=n(r.fresh_leaf_kg)
    return{
      id:r.id,
      cropYear:n(r.crop_year),
      season:r.season||'',
      lotNo:r.lot_no||'',
      variety:r.variety||'',
      pickingMethod:r.picking_method||'',
      freshLeafKg:fresh,
      jaShipmentDate:r.ja_shipment_date||'',
      coldStorageDate:r.cold_storage_date||'',
      storageLocation:r.storage_location||'',
      sourceFile:r.source_file||'',
      note:r.note||'',
      outputs:os,
      outputKg,
      bagCount,
      balanceKg,
      yieldPct:fresh>0?outputKg/fresh*100:0,
    }
  })
}
