import { supabase } from './supabase'
import { hasPermission } from './permissions'
import { loadProductionLots, type ProductionLot } from './production'

export type SaleSummary={id:string;legacyId:string;date:string;customerName:string;channel:string;invoiceNo:string;destination:string;note:string;status:string;salesAmountYen:number;costAmountYen:number;grossProfitYen:number;itemCount:number;cancelReason:string}
export type SaleItem={id:string;saleId:string;lotId:string;lotLegacyId:string;materialName:string;quantity:number;unit:string;unitPriceYen:number;salesAmountYen:number;unitCostYen:number;costAmountYen:number;grossProfitYen:number}
export type SaleTrace={salesItemId:string;saleId:string;fieldId:string;fieldLegacyId:string;fieldName:string;sourceShare:number;attributedQty:number;unit:string}
export type SaleBundle={summary:SaleSummary;items:SaleItem[];traces:SaleTrace[]}
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0

export async function loadSalesRole(){return await hasPermission('sales.manage')?'admin':'worker'}
export async function loadSaleableLots():Promise<ProductionLot[]>{const lots=await loadProductionLots();return lots.filter(l=>l.balance>0.0005)}

export async function loadSales(limit=300):Promise<SaleBundle[]>{
 const{data:heads,error:e1}=await supabase.from('sales_record_summary').select('*').order('sale_date',{ascending:false}).order('created_at',{ascending:false}).limit(limit);if(e1)throw e1
 const ids=(heads||[]).map((x:any)=>x.id);if(!ids.length)return[]
 const[{data:items,error:e2},{data:traces,error:e3}]=await Promise.all([
  supabase.from('sales_record_items').select('*').in('sales_record_id',ids),
  supabase.from('sales_item_field_traceability').select('*').in('sales_record_id',ids),
 ]);if(e2)throw e2;if(e3)throw e3
 const itemBy=new Map<string,SaleItem[]>(),traceBy=new Map<string,SaleTrace[]>()
 for(const r of items||[]){const x:SaleItem={id:(r as any).id,saleId:(r as any).sales_record_id,lotId:(r as any).lot_id,lotLegacyId:(r as any).lot_legacy_id_snapshot||'',materialName:(r as any).material_name_snapshot||'',quantity:n((r as any).quantity),unit:(r as any).unit_snapshot||'',unitPriceYen:n((r as any).unit_price_yen),salesAmountYen:n((r as any).sales_amount_yen),unitCostYen:n((r as any).unit_cost_snapshot_yen),costAmountYen:n((r as any).cost_amount_yen),grossProfitYen:n((r as any).gross_profit_yen)};itemBy.set(x.saleId,[...(itemBy.get(x.saleId)||[]),x])}
 for(const r of traces||[]){const x:SaleTrace={salesItemId:(r as any).sales_item_id,saleId:(r as any).sales_record_id,fieldId:(r as any).field_id,fieldLegacyId:(r as any).field_legacy_id||'',fieldName:(r as any).field_name||'',sourceShare:n((r as any).source_share),attributedQty:n((r as any).attributed_sale_qty),unit:(r as any).unit_snapshot||''};traceBy.set(x.saleId,[...(traceBy.get(x.saleId)||[]),x])}
 return(heads||[]).map((r:any)=>({summary:{id:r.id,legacyId:r.legacy_id||'',date:r.sale_date||'',customerName:r.customer_name||'',channel:r.sales_channel||'',invoiceNo:r.invoice_no||'',destination:r.shipping_destination||'',note:r.note||'',status:r.status||'',salesAmountYen:n(r.sales_amount_yen),costAmountYen:n(r.cost_amount_yen),grossProfitYen:n(r.gross_profit_yen),itemCount:n(r.item_count),cancelReason:r.cancel_reason||''},items:itemBy.get(r.id)||[],traces:traceBy.get(r.id)||[]}))
}

export async function registerSale(input:{date:string;customerName:string;channel:string;invoiceNo:string;destination:string;note:string;items:Array<{lotId:string;quantity:number;unitPriceYen:number}>}){
 const{data,error}=await supabase.rpc('admin_register_sale',{p_payload:{sale_date:input.date,customer_name:input.customerName,sales_channel:input.channel,invoice_no:input.invoiceNo,shipping_destination:input.destination,note:input.note,items:input.items.map(x=>({lot_id:x.lotId,quantity:x.quantity,unit_price_yen:x.unitPriceYen}))}});if(error)throw error;return data as string
}
export async function cancelSale(id:string,reason:string){const{error}=await supabase.rpc('admin_cancel_sale',{p_sale_id:id,p_reason:reason});if(error)throw error}