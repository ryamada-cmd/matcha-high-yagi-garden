import { supabase } from './supabase'

export type EquipmentCategory='AGRICULTURAL_MACHINE'|'TOOL'|'VEHICLE'|'OTHER'
export type EquipmentStatus='NORMAL'|'CAUTION'|'REPAIR_NEEDED'|'UNDER_REPAIR'|'OUT_OF_SERVICE'|'DISPOSED'
export type FuelType='NONE'|'GASOLINE'|'MIXED_OIL'|'DIESEL'|'ELECTRIC'|'BATTERY'|'OTHER'
export type AcquisitionType='PURCHASED'|'RECEIVED'|'INHERITED'|'LEASED'|'OTHER'
export type ServiceType='REPAIR'|'MAINTENANCE'|'INSPECTION'|'OIL_CHANGE'|'PART_REPLACEMENT'|'VEHICLE_INSPECTION'|'VEHICLE_TAX'|'INSURANCE'|'OTHER'

export type EquipmentAsset={
  id:string;assetNo:string;category:EquipmentCategory;name:string;manufacturer:string;modelNo:string;serialNo:string;
  acquisitionType:AcquisitionType;acquisitionDate:string;purchasePriceYen:number|null;fuelType:FuelType;fuelNote:string;
  storageLocation:string;status:EquipmentStatus;conditionNote:string;vehicleRegistrationNo:string;vehicleInspectionExpiry:string;
  vehicleTaxDueDate:string;insuranceExpiry:string;nextMaintenanceDate:string;currentOdometerKm:number|null;currentHourMeter:number|null;
  note:string;active:boolean;serviceRecordCount:number;repairCount:number;lifetimeServiceCostYen:number;lastServiceDate:string;nextDueDate:string
}
export type EquipmentServiceRecord={
  id:string;equipmentId:string;assetNo:string;equipmentName:string;equipmentCategory:EquipmentCategory;recordType:ServiceType;recordDate:string;
  vendor:string;description:string;costYen:number;odometerKm:number|null;hourMeter:number|null;nextDueDate:string;statusAfter:EquipmentStatus|'';
  conditionAfter:string;note:string
}

const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0
const nullableNumber=(v:unknown)=>v===null||v===undefined||v===''?null:n(v)
const one=(v:any)=>Array.isArray(v)?v[0]:v

export async function loadEquipmentRole(){
  const {data:{user}}=await supabase.auth.getUser();if(!user)return ''
  const {data,error}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();if(error)throw error
  return data?.role||''
}

export async function loadEquipmentAssets():Promise<EquipmentAsset[]>{
  const {data,error}=await supabase.from('equipment_asset_summary').select('*').order('name');if(error)throw error
  return (data||[]).map((r:any)=>({
    id:r.id,assetNo:r.asset_no||'',category:r.category,name:r.name||'',manufacturer:r.manufacturer||'',modelNo:r.model_no||'',serialNo:r.serial_no||'',
    acquisitionType:r.acquisition_type,acquisitionDate:r.acquisition_date||'',purchasePriceYen:nullableNumber(r.purchase_price_yen),fuelType:r.fuel_type,fuelNote:r.fuel_note||'',
    storageLocation:r.storage_location||'',status:r.status,conditionNote:r.condition_note||'',vehicleRegistrationNo:r.vehicle_registration_no||'',vehicleInspectionExpiry:r.vehicle_inspection_expiry||'',vehicleTaxDueDate:r.vehicle_tax_due_date||'',insuranceExpiry:r.insurance_expiry||'',nextMaintenanceDate:r.next_maintenance_date||'',currentOdometerKm:nullableNumber(r.current_odometer_km),currentHourMeter:nullableNumber(r.current_hour_meter),note:r.note||'',active:r.is_active!==false,serviceRecordCount:n(r.service_record_count),repairCount:n(r.repair_count),lifetimeServiceCostYen:n(r.lifetime_service_cost_yen),lastServiceDate:r.last_service_date||'',nextDueDate:r.next_due_date||''
  }))
}

export async function loadEquipmentServiceRecords():Promise<EquipmentServiceRecord[]>{
  const {data,error}=await supabase.from('equipment_service_records').select('*,equipment_assets(asset_no,name,category)').is('deleted_at',null).order('record_date',{ascending:false}).order('created_at',{ascending:false});if(error)throw error
  return (data||[]).map((r:any)=>{const a=one(r.equipment_assets)||{};return {
    id:r.id,equipmentId:r.equipment_id,assetNo:a.asset_no||'',equipmentName:a.name||'設備',equipmentCategory:a.category||'OTHER',recordType:r.record_type,recordDate:r.record_date||'',vendor:r.vendor||'',description:r.description||'',costYen:n(r.cost_yen),odometerKm:nullableNumber(r.odometer_km),hourMeter:nullableNumber(r.hour_meter),nextDueDate:r.next_due_date||'',statusAfter:r.status_after||'',conditionAfter:r.condition_after||'',note:r.note||''
  }})
}

export async function saveEquipmentAsset(input:Partial<EquipmentAsset>&{name:string;category:EquipmentCategory}){
  const payload={
    id:input.id||'',category:input.category,name:input.name,manufacturer:input.manufacturer||'',model_no:input.modelNo||'',serial_no:input.serialNo||'',
    acquisition_type:input.acquisitionType||'PURCHASED',acquisition_date:input.acquisitionDate||'',purchase_price_yen:input.purchasePriceYen??'',fuel_type:input.fuelType||'NONE',fuel_note:input.fuelNote||'',storage_location:input.storageLocation||'',status:input.status||'NORMAL',condition_note:input.conditionNote||'',vehicle_registration_no:input.vehicleRegistrationNo||'',vehicle_inspection_expiry:input.vehicleInspectionExpiry||'',vehicle_tax_due_date:input.vehicleTaxDueDate||'',insurance_expiry:input.insuranceExpiry||'',next_maintenance_date:input.nextMaintenanceDate||'',current_odometer_km:input.currentOdometerKm??'',current_hour_meter:input.currentHourMeter??'',note:input.note||'',is_active:input.active??true
  }
  const {data,error}=await supabase.rpc('admin_save_equipment_asset',{p_payload:payload});if(error)throw error;return data as string
}

export async function saveEquipmentServiceRecord(input:Partial<EquipmentServiceRecord>&{equipmentId:string;recordType:ServiceType;recordDate:string;description:string}){
  const payload={id:input.id||'',equipment_id:input.equipmentId,record_type:input.recordType,record_date:input.recordDate,vendor:input.vendor||'',description:input.description,cost_yen:input.costYen??0,odometer_km:input.odometerKm??'',hour_meter:input.hourMeter??'',next_due_date:input.nextDueDate||'',status_after:input.statusAfter||'',condition_after:input.conditionAfter||'',note:input.note||''}
  const {data,error}=await supabase.rpc('admin_save_equipment_service_record',{p_payload:payload});if(error)throw error;return data as string
}

export async function deleteEquipmentServiceRecord(id:string){
  const {error}=await supabase.rpc('admin_delete_equipment_service_record',{p_id:id});if(error)throw error
}
