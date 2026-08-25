import { supabase } from './supabase'

export type ProductPackagingBatch={
  id:string;batchId:string;legacyId:string;date:string;productId:string;sku:string;productName:string;category:string;
  netContent:number;contentUnit:string;packageType:string;standardPriceYen:number;packagingCostPerUnitYen:number;unitsProduced:number;
  sourceLotId:string;sourceLotLegacyId:string;sourceMaterialName:string;contentInputQty:number;contentInputUnit:string;
  processingCostYen:number;packagingCostYen:number;otherCostYen:number;inheritedInputCostYen:number;totalCostYen:number;unitCostYen:number;
  outputLotId:string;stockUnits:number;facility:string;operator:string;note:string
}

export type ProductStockLot={
  lotId:string;legacyId:string;productId:string;sku:string;productName:string;category:string;packageType:string;
  netContent:number;contentUnit:string;standardPriceYen:number;stockUnits:number;unitCostYen:number;inventoryValueYen:number;
  standardSalesValueYen:number;receivedDate:string;storageLocation:string;manufacturingBatchId:string;unitsProduced:number;
  contentInputQty:number;contentInputUnit:string
}

const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0

export async function loadProductPackagingBatches(limit=200):Promise<ProductPackagingBatch[]>{
  const{data,error}=await supabase.from('product_packaging_summary').select('*').is('deleted_at',null).order('manufacturing_date',{ascending:false}).order('legacy_id',{ascending:false}).limit(limit)
  if(error)throw error
  return(data||[]).map((r:any)=>({
    id:r.id,batchId:r.manufacturing_batch_id,legacyId:r.legacy_id||'',date:r.manufacturing_date||'',productId:r.product_master_id||'',sku:r.product_sku_snapshot||'',productName:r.product_name_snapshot||'',category:r.product_category_snapshot||'',
    netContent:n(r.net_content_snapshot),contentUnit:r.content_unit_snapshot||'',packageType:r.package_type_snapshot||'',standardPriceYen:n(r.standard_price_snapshot_yen),packagingCostPerUnitYen:n(r.packaging_cost_per_unit_snapshot_yen),unitsProduced:n(r.units_produced),
    sourceLotId:r.source_lot_id||'',sourceLotLegacyId:r.source_lot_legacy_id||'',sourceMaterialName:r.source_material_name||'',contentInputQty:n(r.content_input_qty),contentInputUnit:r.content_input_unit||'',
    processingCostYen:n(r.processing_cost_yen),packagingCostYen:n(r.packaging_cost_yen),otherCostYen:n(r.other_cost_yen),inheritedInputCostYen:n(r.inherited_input_cost_yen),totalCostYen:n(r.total_manufacturing_cost_yen),unitCostYen:n(r.unit_cost_yen),
    outputLotId:r.output_lot_id||'',stockUnits:n(r.stock_units),facility:r.facility||'',operator:r.operator_name_snapshot||'',note:r.note||''
  }))
}

export async function loadProductStockLots():Promise<ProductStockLot[]>{
  const{data,error}=await supabase.from('product_stock_lots').select('*').order('received_date',{ascending:false}).order('legacy_id',{ascending:false})
  if(error)throw error
  return(data||[]).map((r:any)=>({
    lotId:r.lot_id,legacyId:r.legacy_id||'',productId:r.product_master_id||'',sku:r.sku||'',productName:r.product_name||'',category:r.product_category||'',packageType:r.package_type||'',netContent:n(r.net_content),contentUnit:r.content_unit||'',standardPriceYen:n(r.standard_price_yen),stockUnits:n(r.stock_units),unitCostYen:n(r.unit_cost_yen),inventoryValueYen:n(r.inventory_value_yen),standardSalesValueYen:n(r.standard_sales_value_yen),receivedDate:r.received_date||'',storageLocation:r.storage_location||'',manufacturingBatchId:r.manufacturing_batch_id||'',unitsProduced:n(r.units_produced),contentInputQty:n(r.content_input_qty),contentInputUnit:r.content_input_unit||''
  }))
}

export async function saveProductPackaging(input:{batchId?:string;productId:string;sourceLotId:string;units:number;date:string;facility:string;processingCostYen:number;otherCostYen:number;operator:string;note:string}){
  const{data,error}=await supabase.rpc('admin_save_product_packaging',{p_batch_id:input.batchId||null,p_payload:{product_id:input.productId,source_lot_id:input.sourceLotId,units:input.units,manufacturing_date:input.date,facility:input.facility,processing_cost_yen:input.processingCostYen,other_cost_yen:input.otherCostYen,operator_name:input.operator,note:input.note}})
  if(error)throw error
  return data as string
}
