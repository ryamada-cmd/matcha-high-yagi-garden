import { supabase } from './supabase'

export type ProductionLot={
 id:string;legacyId:string;materialName:string;category:string;unit:string;receivedDate:string;initialQty:number;balance:number;
 totalCostYen:number;unitCostYen:number;inventoryValueYen:number;sourceType:string;sourceId:string;supplier:string;storageLocation:string;note:string
}
export type ManufacturingInput={id:string;lotId:string;lotLegacyId:string;materialName:string;inputQty:number;unit:string;unitCostYen:number;inputCostYen:number}
export type ManufacturingBatch={
 id:string;legacyId:string;date:string;processType:string;outputMaterial:string;outputQty:number;outputUnit:string;facility:string;
 processingCostYen:number;packagingCostYen:number;otherCostYen:number;inheritedInputCostYen:number;totalCostYen:number;outputLotId:string;
 operator:string;note:string;inputs:ManufacturingInput[]
}
export type ProductionTransaction={id:string;lotId:string;lotLegacyId:string;materialName:string;unit:string;type:string;quantity:number;reason:string;createdAt:string}
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0
const one=(v:any)=>Array.isArray(v)?v[0]:v

export async function loadProductionRole(){const{data:{user}}=await supabase.auth.getUser();if(!user)return'';const{data,error}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();if(error)throw error;return data?.role||''}

export async function loadProductionLots():Promise<ProductionLot[]>{
 const{data,error}=await supabase.from('production_inventory_balances').select('*').is('deleted_at',null).order('received_date',{ascending:false}).order('legacy_id',{ascending:false});if(error)throw error
 return(data||[]).map((r:any)=>({id:r.lot_id,legacyId:r.legacy_id||'',materialName:r.material_name||'',category:r.category||'',unit:r.unit||'',receivedDate:r.received_date||'',initialQty:n(r.initial_qty),balance:n(r.balance),totalCostYen:n(r.total_cost_yen),unitCostYen:n(r.unit_cost_yen),inventoryValueYen:n(r.inventory_value_yen),sourceType:r.source_type||'',sourceId:r.source_id||'',supplier:r.supplier||'',storageLocation:r.storage_location||'',note:r.note||''}))
}

export async function loadManufacturingBatches(limit=200):Promise<ManufacturingBatch[]>{
 const{data:batches,error:e1}=await supabase.from('manufacturing_batches').select('*').is('deleted_at',null).order('manufacturing_date',{ascending:false}).order('created_at',{ascending:false}).limit(limit);if(e1)throw e1
 const ids=(batches||[]).map((b:any)=>b.id);if(!ids.length)return[]
 const{data:inputs,error:e2}=await supabase.from('manufacturing_batch_inputs').select('id,manufacturing_batch_id,lot_id,input_qty,input_unit_snapshot,unit_cost_snapshot_yen,input_cost_yen,production_lots(legacy_id,material_name)').in('manufacturing_batch_id',ids);if(e2)throw e2
 const by=new Map<string,ManufacturingInput[]>();for(const r of inputs||[]){const l=one((r as any).production_lots);const arr=by.get((r as any).manufacturing_batch_id)||[];arr.push({id:(r as any).id,lotId:(r as any).lot_id,lotLegacyId:l?.legacy_id||'',materialName:l?.material_name||'原料',inputQty:n((r as any).input_qty),unit:(r as any).input_unit_snapshot||'',unitCostYen:n((r as any).unit_cost_snapshot_yen),inputCostYen:n((r as any).input_cost_yen)});by.set((r as any).manufacturing_batch_id,arr)}
 return(batches||[]).map((b:any)=>({id:b.id,legacyId:b.legacy_id||'',date:b.manufacturing_date||'',processType:b.process_type||'',outputMaterial:b.output_material||'',outputQty:n(b.output_qty),outputUnit:b.output_unit||'',facility:b.facility||'',processingCostYen:n(b.processing_cost_yen),packagingCostYen:n(b.packaging_cost_yen),otherCostYen:n(b.other_cost_yen),inheritedInputCostYen:n(b.inherited_input_cost_yen),totalCostYen:n(b.total_manufacturing_cost_yen),outputLotId:b.output_lot_id||'',operator:b.operator_name_snapshot||'',note:b.note||'',inputs:by.get(b.id)||[]}))
}

export async function loadProductionTransactions(limit=300):Promise<ProductionTransaction[]>{
 const{data,error}=await supabase.from('production_transactions').select('id,lot_id,transaction_type,quantity,reason,created_at,production_lots(legacy_id,material_name,unit)').order('created_at',{ascending:false}).limit(limit);if(error)throw error
 return(data||[]).map((r:any)=>{const l=one(r.production_lots);return{id:r.id,lotId:r.lot_id,lotLegacyId:l?.legacy_id||'',materialName:l?.material_name||'',unit:l?.unit||'',type:r.transaction_type||'',quantity:n(r.quantity),reason:r.reason||'',createdAt:r.created_at||''}})
}

export async function receiveProductionLot(input:{materialName:string;category:string;unit:string;receivedDate:string;quantity:number;totalCostYen:number;supplier:string;storageLocation:string;note:string}){
 const{data,error}=await supabase.rpc('admin_receive_production_lot',{p_payload:{material_name:input.materialName,category:input.category,unit:input.unit,received_date:input.receivedDate,quantity:input.quantity,total_cost_yen:input.totalCostYen,supplier:input.supplier,storage_location:input.storageLocation,note:input.note}});if(error)throw error;return data as string
}
export async function adjustProductionLot(id:string,targetQty:number,reason:string){const{error}=await supabase.rpc('admin_adjust_production_lot',{p_lot_id:id,p_target_qty:targetQty,p_reason:reason});if(error)throw error}
export async function disposeProductionLot(id:string,qty:number,reason:string){const{error}=await supabase.rpc('admin_dispose_production_lot',{p_lot_id:id,p_qty:qty,p_reason:reason});if(error)throw error}

export async function saveManufacturingBatch(input:{id?:string;date:string;processType:string;outputMaterial:string;outputQty:number;outputUnit:string;category:string;facility:string;processingCostYen:number;packagingCostYen:number;otherCostYen:number;operator:string;note:string;inputs:Array<{lotId:string;inputQty:number}>}){
 const{data,error}=await supabase.rpc('save_manufacturing_batch',{p_payload:{id:input.id||'',manufacturing_date:input.date,process_type:input.processType,output_material:input.outputMaterial,output_qty:input.outputQty,output_unit:input.outputUnit,category:input.category,facility:input.facility,processing_cost_yen:input.processingCostYen,packaging_cost_yen:input.packagingCostYen,other_cost_yen:input.otherCostYen,operator_name:input.operator,note:input.note,inputs:input.inputs.map(x=>({lot_id:x.lotId,input_qty:x.inputQty}))}});if(error)throw error;return data as string
}
export async function deleteManufacturingBatch(id:string,reason:string){const{error}=await supabase.rpc('delete_manufacturing_batch',{p_id:id,p_reason:reason});if(error)throw error}
