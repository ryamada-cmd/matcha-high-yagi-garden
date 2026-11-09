// Playwright-only synthetic inventory. The QA Vite plugin redirects the real
// InventoryPage imports here; no Supabase import is allowed.
type Lot = {
 lotId:string; legacyId:string; pesticideId:string; pesticideName:string;
 balance:number; unit:string; packageSize:number; packageCount:number;
 packageUnit:string; unitPrice:number; stockValue:number; purchaseDate:string;
 supplier:string; expiryDate:string; storage:string; manufacturerLotNo:string; note:string;
}
const initial:Lot[]=[
 {lotId:'qa-lot-a',legacyId:'QA-INV-A',pesticideId:'qa-pesticide-a',pesticideName:'架空農薬A',balance:1200,unit:'ml',packageSize:500,packageCount:3,packageUnit:'本',unitPrice:1800,stockValue:4320,purchaseDate:'2026-09-01',supplier:'架空仕入先A',expiryDate:'2028-01-01',storage:'QA保管庫',manufacturerLotNo:'QA-2026-A',note:''},
 {lotId:'qa-lot-b',legacyId:'QA-INV-B',pesticideId:'qa-pesticide-b',pesticideName:'架空農薬B',balance:250,unit:'g',packageSize:250,packageCount:1,packageUnit:'袋',unitPrice:1500,stockValue:1500,purchaseDate:'2026-09-01',supplier:'架空仕入先B',expiryDate:'2028-01-01',storage:'QA保管庫',manufacturerLotNo:'QA-2026-B',note:''},
];
let lots=initial.map(v=>({...v}));
const events=[{id:'qa-event-1',type:'PURCHASE',quantity:1200,signedQuantity:1200,unit:'ml',reason:'架空データ',createdAt:'2026-09-01T00:00:00Z',lotId:'qa-lot-a',legacyId:'QA-INV-A',pesticideName:'架空農薬A',createdByName:'QA担当'}];
export async function loadInventory(){return lots.map(x=>({...x}))}
export async function loadInventoryTransactions(){return events.map(x=>({...x}))}
export async function loadPesticideOptions(){return [
 {id:'qa-pesticide-a',name:'架空農薬A',legacyId:'QA-A',famicRegistrationNo:''},
 {id:'qa-pesticide-b',name:'架空農薬B',legacyId:'QA-B',famicRegistrationNo:''},
]}
export async function receiveInventoryLot(input:any){
 const id='qa-lot-'+(lots.length+1);
 const row:Lot={lotId:id,legacyId:'QA-INV-C',pesticideId:input.pesticideId,pesticideName:input.pesticideId==='qa-pesticide-a'?'架空農薬A':'架空農薬B',balance:input.packageCount*input.packageSize,unit:input.contentUnit,packageCount:input.packageCount,packageSize:input.packageSize,packageUnit:input.packageUnit,unitPrice:input.purchaseUnitPrice,stockValue:input.purchaseUnitPrice*input.packageCount,purchaseDate:input.purchaseDate,supplier:input.supplier,expiryDate:input.expiryDate,storage:input.storageLocation,manufacturerLotNo:input.manufacturerLotNo,note:input.note};
 lots=[...lots,row];(window as any).__qa_inventory_write=input;return id;
}
export async function adjustInventoryStock(id:string,target:number,_reason:string){
 const item=lots.find(x=>x.lotId===id);
 if(!item)throw Error('架空ロットが見つかりません');
 const diff=target-item.balance;
 item.balance=target;
 (window as any).__qa_inventory_adjust={id,target};
 return diff;
}
export async function disposeInventoryStock(id:string,qty:number,_reason:string){
 const item=lots.find(x=>x.lotId===id);
 if(!item||qty>item.balance)throw Error('在庫不足');
 item.balance-=qty;
 (window as any).__qa_inventory_dispose={id,qty};
}
