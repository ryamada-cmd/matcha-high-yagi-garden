// Fake receipt storage: in-memory only, never OneDrive or Supabase.
const map:Record<string,any[]>={}
export async function loadExpenseReceiptMap(){return {...map}}
export async function uploadExpenseReceipt(file:File,claimId:string){
 const receipt={id:'qa-receipt-'+file.name,fileName:file.name,mimeType:file.type,
  sizeBytes:file.size,folderPath:'QA-no-external-path',webUrl:'',uploadedAt:'2026-11-10'}
 ;(map[claimId]||(map[claimId]=[])).push(receipt)
 ;(window as any).__qa_expense_receipt={...receipt,claimId}
 return receipt
}
