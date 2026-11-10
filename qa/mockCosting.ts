// Synthetic-only costing service, not linked to financial records or Supabase.
const deep=<T,>(value:T):T=>JSON.parse(JSON.stringify(value))
const periods:any[]=[]
const lots=[{
 id:'qa-cost-lot-1',legacyId:'QA-TENCHA-001',materialName:'架空一番茶碾茶',
 sourceType:'IN_HOUSE',receivedDate:'2026-05-25',unit:'kg',initialQty:20,initialQtyKg:20,
 baseTotalCostYen:0,allocatedCostYen:0,costingPeriodId:'',teaType:'碾茶',
 origin:'架空井手町',variety:'おくみどり'
}]
const sources=[
 {sourceType:'EXPENSE_CLAIM',sourceItemId:'qa-expense-line-1',sourceParentId:'qa-expense-1',
  sourceRef:'QA-EXP-001',sourceDate:'2026-05-11',vendor:'架空肥料商店',
  sourceCategory:'FERTILIZER',description:'架空施肥資材',
  totalAmountYen:12000,usedAmountYen:0,remainingAmountYen:12000,
  suggestedCategory:'FERTILIZER',sourceStatus:'APPROVED'}
]
export async function loadCostingDashboard(year:number){
 return deep({year,periods,eligibleLots:lots,
  externalLots:[{id:'qa-external-1',legacyId:'QA-EXTERNAL-001',
   materialName:'架空仕入ほうじ茶',teaType:'ほうじ茶',origin:'架空産地',
   supplier:'架空問屋',unit:'kg',initialQty:5,baseUnitCostYen:2400,receivedDate:'2026-07-08'}],
  products:[{id:'qa-product-1',sku:'QA-MATCHA-30',productName:'架空抹茶30g',
   category:'抹茶',netContent:30,contentUnit:'g',packagingCostYen:100,
   wholesalePriceYen:2500,retailPriceYen:3500,otherPriceYen:2800}],
  sourceCandidates:sources,
  references:{approvedExpenseClaimsYen:12000,vendorInvoicesYen:5000}})
}
export async function saveCostingPeriod(id:string|undefined,input:any){
 if(!input.name.trim())throw Error('QA原価期間名がありません')
 if(input.status==='FINAL'&&!input.lots.length)throw Error('QA配賦対象ロットがありません')
 const periodId=id||'qa-cost-period-'+(periods.length+1)
 const planned=input.costItems.reduce((n:number,x:any)=>n+Number(x.plannedAmountYen||0),0)
 const actual=input.costItems.reduce((n:number,x:any)=>n+Number(x.actualAmountYen||0),0)
 const actualKg=input.lots.reduce((n:number,x:any)=>n+Number(x.allocatedQtyKg||0),0)
 const denominator=input.status==='FINAL'?actualKg:Number(input.plannedOutputKg)||actualKg
 const rate=denominator>0?(input.status==='FINAL'?actual:planned)/denominator:0
 const record={...input,id:periodId,plannedTotalYen:planned,actualTotalYen:actual,
  actualOutputKg:actualKg,rateYenPerKg:rate,
  lots:input.lots.map((l:any)=>({...l,legacyId:'QA-TENCHA-001',materialName:'架空一番茶碾茶',
   sourceType:'IN_HOUSE',receivedDate:'2026-05-25',baseTotalCostYen:0,allocatedCostYen:rate*l.allocatedQtyKg}))}
 const index=periods.findIndex(x=>x.id===periodId)
 if(index===-1)periods.unshift(record);else periods[index]=record
 ;(window as any).__qa_costing_saved=deep(record)
 return periodId
}
export async function deleteCostingPeriod(id:string,reason:string){
 if(!reason.trim())throw Error('QA削除理由がありません')
 const index=periods.findIndex(x=>x.id===id)
 if(index>=0)periods.splice(index,1)
 ;(window as any).__qa_costing_deleted=id
}
