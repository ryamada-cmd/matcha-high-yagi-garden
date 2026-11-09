// In-memory SALES DOCUMENTS data for isolated browser QA only.
// Never imported by the normal production Vite build.
type Customer={id:string;customerCode:string;name:string;postalCode:string;address1:string;address2:string;department:string;contactName:string;honorific:string;email:string;phone:string;note:string}
const customers:Customer[]=[{id:'qa-customer-initial',customerCode:'QA-000',name:'架空卸売店',postalCode:'000-0000',address1:'架空住所',address2:'',department:'',contactName:'',honorific:'御中',email:'',phone:'',note:''}]
const docs:any[]=[]
const company={
 companyName:'架空茶業株式会社',companyNameEn:'QA Matcha Co.',registrationNo:'',postalCode:'',
 address1:'架空住所',address2:'',address1En:'',address2En:'',phone:'',
 bankName:'',bankBranch:'',bankAccountType:'普通',bankAccountNo:'',bankAccountName:'',
 bankNameEn:'',bankBranchEn:'',bankAccountTypeEn:'',bankAccountNameEn:'',note:'',noteEn:''
}
export async function loadDocumentCustomers(){return customers.map(c=>({...c}))}
export async function loadSalesDocuments(){return docs.map(x=>({...x,items:x.items.map((v:any)=>({...v}))}))}
export async function loadCompanyDocumentSettings(){return {...company}}
export async function saveDocumentCustomer(value:any){
 const id=value.id||'qa-customer-'+(customers.length+1)
 const entry={...value,id}
 const i=customers.findIndex(x=>x.id===id)
 if(i<0)customers.push(entry);else customers[i]=entry
 ;(window as any).__qa_doc_customer={...entry}
 return id
}
export async function deleteDocumentCustomer(id:string){const i=customers.findIndex(x=>x.id===id);if(i>=0)customers.splice(i,1)}
export async function saveSalesDocument(value:any){
 const id=value.id||'qa-doc-'+(docs.length+1)
 const entry={...value,id,totalYen:(value.items||[]).reduce((n:number,x:any)=>n+Math.round(x.unitPriceYen*x.quantity*(1+x.taxRate)),0),
  items:value.items||[],createdAt:'2026-11-10',updatedAt:'2026-11-10'}
 const i=docs.findIndex(x=>x.id===id)
 if(i<0)docs.push(entry);else docs[i]=entry
 ;(window as any).__qa_document_saved={...entry}
 return id
}
export async function deleteSalesDocument(id:string){const i=docs.findIndex(x=>x.id===id);if(i>=0)docs.splice(i,1)}
export async function saveCompanyDocumentSettings(value:any){Object.assign(company,value);(window as any).__qa_document_company={...company}}
