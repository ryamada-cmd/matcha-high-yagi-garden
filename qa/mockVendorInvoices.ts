// Isolated vendor invoice and payment ledger with clearly synthetic data.
// Never imports Supabase, credentials or external storage.
const invoices:any[]=[
 {
  id:'qa-vendor-invoice-01',invoiceNo:'QA-VI-001',externalInvoiceNo:'QA-INV-001',
  vendor:'架空資材商事',invoiceDate:'2026-11-01',paymentDueDate:'2026-12-01',
  scheduledPaymentDate:'2026-11-20',plannedPaymentMethod:'銀行振込',
  plannedPaymentAccount:'架空銀行',discountAmountYen:0,totalAmountYen:12000,
  paidAmountYen:0,paymentStatus:'UNPAID',isOnHold:false,note:'',
  createdAt:'2026-11-01',updatedAt:'2026-11-01',
  items:[{id:'qa-line-1',lineNo:1,category:'PACKAGING',description:'架空資材10セット',quantity:10,
   unit:'セット',unitPriceYen:1200,taxRate:10,lineTotalYen:12000,note:''}],
  payments:[]
 }
]
const deep=(x:any)=>JSON.parse(JSON.stringify(x))
export async function loadVendorInvoices(){return deep(invoices)}
export async function saveVendorInvoice(input:any){
 const id=input.id||'qa-invoice-'+(invoices.length+1)
 const items=(input.items||[]).map((x:any,i:number)=>({...x,id:'qa-line-'+i,lineNo:i+1,
  lineTotalYen:Math.round(x.quantity*x.unitPriceYen)}))
 const totalAmountYen=Math.max(0,items.reduce((sum:number,x:any)=>sum+x.lineTotalYen,0)-Number(input.discountAmountYen||0))
 const index=invoices.findIndex(v=>v.id===id)
 const old=index<0?null:invoices[index]
 const item={...input,id,invoiceNo:old?.invoiceNo||'QA-VI-'+(invoices.length+1),
  totalAmountYen,paidAmountYen:old?.paidAmountYen||0,
  paymentStatus:'UNPAID',createdAt:'2026-11-10',updatedAt:'2026-11-10',
  items,payments:old?.payments||[]}
 if(index<0)invoices.unshift(item);else invoices[index]=item
 ;(window as any).__qa_vendor_invoice=deep(item)
 return id
}
export async function saveVendorInvoicePayment(input:any){
 const invoice=invoices.find(v=>v.id===input.invoiceId)
 if(!invoice)throw Error('QA架空請求書が見つかりません')
 const amount=Number(input.amountYen)
 if(!Number.isFinite(amount)||amount<=0)throw Error('QA金額が不正です')
 const id=input.id||'qa-payment-'+(invoice.payments.length+1)
 const item={...input,id,paymentNo:'QA-PAY-'+(invoice.payments.length+1),
  createdAt:'2026-11-10T12:00:00+09:00'}
 const at=invoice.payments.findIndex((p:any)=>p.id===id)
 if(at<0)invoice.payments.push(item);else invoice.payments[at]=item
 invoice.paidAmountYen=invoice.payments.reduce((sum:number,x:any)=>sum+Number(x.amountYen),0)
 invoice.paymentStatus=invoice.paidAmountYen>=invoice.totalAmountYen?'PAID':'PARTIAL'
 ;(window as any).__qa_vendor_payment=deep(item)
 return id
}
export async function deleteVendorInvoicePayment(id:string){
 const invoice=invoices.find(v=>v.payments.some((p:any)=>p.id===id))
 if(!invoice)throw Error('支払履歴がありません')
 invoice.payments=invoice.payments.filter((x:any)=>x.id!==id)
 invoice.paidAmountYen=invoice.payments.reduce((sum:number,x:any)=>sum+x.amountYen,0)
 invoice.paymentStatus=invoice.paidAmountYen===0?'UNPAID':invoice.paidAmountYen>=invoice.totalAmountYen?'PAID':'PARTIAL'
}
export async function deleteVendorInvoice(id:string){const i=invoices.findIndex(v=>v.id===id);if(i>=0)invoices.splice(i,1)}
