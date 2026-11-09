// In-memory equipment service. No Supabase imports and no real APIs.
const assets:any[]=[
  {id:'qa-asset-01',assetNo:'QA-EQ-001',category:'AGRICULTURAL_MACHINE',
   name:'架空動力噴霧器',manufacturer:'架空農機メーカー',modelNo:'QA-SP-01',serialNo:'QA-0001',
   acquisitionType:'PURCHASED',acquisitionDate:'2025-01-01',purchasePriceYen:120000,
   fuelType:'GASOLINE',fuelNote:'',storageLocation:'架空倉庫',status:'NORMAL',
   conditionNote:'',vehicleRegistrationNo:'',vehicleInspectionExpiry:'',vehicleTaxDueDate:'',
   insuranceExpiry:'',nextMaintenanceDate:'',currentOdometerKm:null,currentHourMeter:30,
   note:'',active:true,serviceRecordCount:0,repairCount:0,
   lifetimeServiceCostYen:0,lastServiceDate:'',nextDueDate:''}
]
const records:any[]=[]
export async function loadEquipmentAssets(){return assets.map(a=>({...a}))}
export async function loadEquipmentServiceRecords(){return records.map(r=>({...r}))}
export async function saveEquipmentAsset(input:any){
 const id=input.id||'qa-asset-'+(assets.length+1)
 const index=assets.findIndex(a=>a.id===id)
 const result={...input,id,assetNo:index<0?'QA-EQ-NEW-'+(assets.length+1):assets[index].assetNo,
   serviceRecordCount:0,repairCount:0,lifetimeServiceCostYen:0,lastServiceDate:'',
   nextDueDate:input.nextMaintenanceDate||''}
 if(index<0)assets.push(result);else assets[index]=result
 ;(window as any).__qa_equipment_asset={...result}
 return id
}
export async function saveEquipmentServiceRecord(input:any){
 const id=input.id||'qa-service-'+(records.length+1)
 const asset=assets.find(a=>a.id===input.equipmentId)
 const result={...input,id,assetNo:asset?.assetNo||'',
  equipmentName:asset?.name||'架空設備',equipmentCategory:asset?.category||'OTHER'}
 const index=records.findIndex(x=>x.id===id)
 if(index<0)records.unshift(result);else records[index]=result
 ;(window as any).__qa_equipment_service={...result}
 return id
}
export async function deleteEquipmentServiceRecord(id:string){
 const i=records.findIndex(r=>r.id===id)
 if(i>=0)records.splice(i,1)
}
