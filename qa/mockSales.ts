// Synthetic-only sales ledger. Never imports Supabase, payment providers or credentials.
type QAItem={lotId:string;quantity:number;unitPriceYen:number}
type QASaleInput={date:string;customerName:string;channel:string;invoiceNo:string;destination:string;note:string;items:QAItem[]}
const copy=<T,>(value:T):T=>JSON.parse(JSON.stringify(value))
const lots=[{
 id:'qa-lot-sale-1',legacyId:'QA-PROD-001',materialName:'架空宇治抹茶 30g',category:'商品',
 unit:'個',receivedDate:'2026-11-01',initialQty:20,balance:20,totalCostYen:12000,
 unitCostYen:600,inventoryValueYen:12000,sourceType:'MANUFACTURING',sourceId:'qa-man-1',
 supplier:'',storageLocation:'架空倉庫',note:'',teaType:'抹茶',origin:'架空井手町',
 variety:'',grade:'',supplierLotNo:'',purchaseDocumentNo:''
}]
const sales:any[]=[]
export async function loadSaleableLots(){return copy(lots)}
export async function loadSales(){return copy(sales)}
export async function registerSale(input:QASaleInput){
 if(!input.customerName.trim()||!input.items.length)throw Error('QA販売入力が不足しています')
 for(const item of input.items){
  const lot=lots.find(x=>x.id===item.lotId)
  if(!lot||item.quantity<=0||item.quantity>lot.balance||item.unitPriceYen<0)throw Error('QA在庫を超過しています')
 }
 const id='qa-sale-'+(sales.length+1)
 const items=input.items.map((item,index)=>{
  const lot=lots.find(x=>x.id===item.lotId)!
  const saleAmount=item.quantity*item.unitPriceYen,cost=item.quantity*lot.unitCostYen
  return {id:'qa-sale-item-'+(index+1),saleId:id,lotId:lot.id,lotLegacyId:lot.legacyId,
   materialName:lot.materialName,quantity:item.quantity,unit:lot.unit,unitPriceYen:item.unitPriceYen,
   salesAmountYen:saleAmount,unitCostYen:lot.unitCostYen,costAmountYen:cost,grossProfitYen:saleAmount-cost}
 })
 const revenue=items.reduce((a,x)=>a+x.salesAmountYen,0),cost=items.reduce((a,x)=>a+x.costAmountYen,0)
 const record={
  summary:{id,legacyId:'QA-SALE-'+String(sales.length+1).padStart(3,'0'),date:input.date,
   customerName:input.customerName,channel:input.channel,invoiceNo:input.invoiceNo,
   destination:input.destination,note:input.note,status:'ACTIVE',salesAmountYen:revenue,
   costAmountYen:cost,grossProfitYen:revenue-cost,itemCount:items.length,cancelReason:''},
  items,traces:[]
 }
 for(const item of input.items){lots.find(x=>x.id===item.lotId)!.balance-=item.quantity}
 sales.unshift(record)
 ;(window as any).__qa_sale_created=copy(record)
 ;(window as any).__qa_sale_stock_after=lots[0].balance
 return id
}
export async function cancelSale(id:string,reason:string){
 const record=sales.find(x=>x.summary.id===id)
 if(!record||record.summary.status!=='ACTIVE')throw Error('QA販売はすでに取消済みです')
 record.summary.status='CANCELLED'
 record.summary.cancelReason=reason
 for(const item of record.items){const lot=lots.find(x=>x.id===item.lotId);if(lot)lot.balance+=item.quantity}
 ;(window as any).__qa_sale_cancelled=copy(record)
 ;(window as any).__qa_sale_stock_restored=lots[0].balance
}
