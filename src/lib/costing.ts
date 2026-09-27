import { supabase } from './supabase'

export type CostingStatus='DRAFT'|'FINAL'
export type CostingCostItem={id?:string;category:string;description:string;plannedAmountYen:number;actualAmountYen:number}
export type CostingPeriodLot={lotId:string;allocatedQtyKg:number;legacyId:string;materialName:string;sourceType:string;receivedDate:string;baseTotalCostYen:number;allocatedCostYen:number}
export type CostingPeriod={
  id:string;fiscalYear:number;name:string;scopeLabel:string;harvestSeason:string;status:CostingStatus;plannedOutputKg:number;note:string;
  plannedTotalYen:number;actualTotalYen:number;actualOutputKg:number;rateYenPerKg:number;costItems:CostingCostItem[];lots:CostingPeriodLot[]
}
export type CostingEligibleLot={
  id:string;legacyId:string;materialName:string;sourceType:string;receivedDate:string;unit:string;initialQty:number;initialQtyKg:number;
  baseTotalCostYen:number;allocatedCostYen:number;costingPeriodId:string;teaType:string;origin:string;variety:string
}
export type CostingExternalLot={id:string;legacyId:string;materialName:string;teaType:string;origin:string;supplier:string;unit:string;initialQty:number;baseUnitCostYen:number;receivedDate:string}
export type CostingProduct={id:string;sku:string;productName:string;category:string;netContent:number;contentUnit:string;packagingCostYen:number;wholesalePriceYen:number;retailPriceYen:number;otherPriceYen:number}
export type CostingDashboard={
  year:number;periods:CostingPeriod[];eligibleLots:CostingEligibleLot[];externalLots:CostingExternalLot[];products:CostingProduct[];
  references:{approvedExpenseClaimsYen:number;vendorInvoicesYen:number}
}
export type CostingPeriodInput={
  fiscalYear:number;name:string;scopeLabel:string;harvestSeason:string;status:CostingStatus;plannedOutputKg:number;note:string;
  costItems:Array<{category:string;description:string;plannedAmountYen:number;actualAmountYen:number}>;
  lots:Array<{lotId:string;allocatedQtyKg:number}>
}

const n=(v:any)=>Number(v||0)
const arr=(v:any)=>Array.isArray(v)?v:[]

export async function loadCostingDashboard(year:number):Promise<CostingDashboard>{
  const{data,error}=await supabase.rpc('get_costing_dashboard',{p_year:year})
  if(error)throw error
  const d:any=data||{}
  return{
    year:n(d.year)||year,
    periods:arr(d.periods).map((p:any)=>({
      id:String(p.id||''),fiscalYear:n(p.fiscalYear),name:String(p.name||''),scopeLabel:String(p.scopeLabel||''),harvestSeason:String(p.harvestSeason||''),
      status:p.status==='FINAL'?'FINAL':'DRAFT',plannedOutputKg:n(p.plannedOutputKg),note:String(p.note||''),plannedTotalYen:n(p.plannedTotalYen),
      actualTotalYen:n(p.actualTotalYen),actualOutputKg:n(p.actualOutputKg),rateYenPerKg:n(p.rateYenPerKg),
      costItems:arr(p.costItems).map((i:any)=>({id:String(i.id||''),category:String(i.category||'OTHER'),description:String(i.description||''),plannedAmountYen:n(i.plannedAmountYen),actualAmountYen:n(i.actualAmountYen)})),
      lots:arr(p.lots).map((x:any)=>({lotId:String(x.lotId||''),allocatedQtyKg:n(x.allocatedQtyKg),legacyId:String(x.legacyId||''),materialName:String(x.materialName||''),sourceType:String(x.sourceType||''),receivedDate:String(x.receivedDate||''),baseTotalCostYen:n(x.baseTotalCostYen),allocatedCostYen:n(x.allocatedCostYen)}))
    })),
    eligibleLots:arr(d.eligibleLots).map((l:any)=>({id:String(l.id||''),legacyId:String(l.legacyId||''),materialName:String(l.materialName||''),sourceType:String(l.sourceType||''),receivedDate:String(l.receivedDate||''),unit:String(l.unit||''),initialQty:n(l.initialQty),initialQtyKg:n(l.initialQtyKg),baseTotalCostYen:n(l.baseTotalCostYen),allocatedCostYen:n(l.allocatedCostYen),costingPeriodId:String(l.costingPeriodId||''),teaType:String(l.teaType||''),origin:String(l.origin||''),variety:String(l.variety||'')})),
    externalLots:arr(d.externalLots).map((l:any)=>({id:String(l.id||''),legacyId:String(l.legacyId||''),materialName:String(l.materialName||''),teaType:String(l.teaType||''),origin:String(l.origin||''),supplier:String(l.supplier||''),unit:String(l.unit||''),initialQty:n(l.initialQty),baseUnitCostYen:n(l.baseUnitCostYen),receivedDate:String(l.receivedDate||'')})),
    products:arr(d.products).map((p:any)=>({id:String(p.id||''),sku:String(p.sku||''),productName:String(p.productName||''),category:String(p.category||''),netContent:n(p.netContent),contentUnit:String(p.contentUnit||''),packagingCostYen:n(p.packagingCostYen),wholesalePriceYen:n(p.wholesalePriceYen),retailPriceYen:n(p.retailPriceYen),otherPriceYen:n(p.otherPriceYen)})),
    references:{approvedExpenseClaimsYen:n(d.references?.approvedExpenseClaimsYen),vendorInvoicesYen:n(d.references?.vendorInvoicesYen)}
  }
}

export async function saveCostingPeriod(id:string|undefined,input:CostingPeriodInput){
  const{data,error}=await supabase.rpc('save_costing_period',{p_period_id:id||null,p_payload:{
    fiscal_year:input.fiscalYear,name:input.name,scope_label:input.scopeLabel,harvest_season:input.harvestSeason,status:input.status,
    planned_output_kg:input.plannedOutputKg,note:input.note,
    cost_items:input.costItems.map(x=>({category:x.category,description:x.description,planned_amount_yen:x.plannedAmountYen,actual_amount_yen:x.actualAmountYen})),
    lots:input.lots.map(x=>({lot_id:x.lotId,allocated_qty_kg:x.allocatedQtyKg}))
  }})
  if(error)throw error
  return String(data||'')
}

export async function deleteCostingPeriod(id:string,reason:string){
  const{error}=await supabase.rpc('delete_costing_period',{p_period_id:id,p_reason:reason})
  if(error)throw error
}
