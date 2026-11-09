// Synthetic, isolated expense claim service (never makes network requests).
const entries:any[]=[]
const user={id:'qa-user',displayName:'架空担当者',role:'admin'}
const copy=(v:any)=>JSON.parse(JSON.stringify(v))
export async function loadExpenseUser(){return {...user}}
export async function loadExpenseClaims(){return copy(entries)}
export async function saveExpenseClaim(input:any){
 const id=input.id||'qa-expense-'+(entries.length+1)
 const items=input.items.map((x:any,i:number)=>({...x,
  id:'qa-expense-item-'+(i+1),lineNo:i+1,lineTotalYen:Math.round(x.quantity*x.unitPriceYen)}))
 const totalAmountYen=items.reduce((n:number,x:any)=>n+x.lineTotalYen,0)
 const item={...input,id,claimNo:'QA-EXP-'+(entries.length+1),status:'SUBMITTED',
  applicantId:user.id,applicantName:user.displayName,items,totalAmountYen,
  submittedAt:'2026-11-10T12:00:00+09:00',reviewedAt:'',reviewerName:'',reviewComment:''}
 const i=entries.findIndex(x=>x.id===id)
 if(i<0)entries.unshift(item);else entries[i]=item
 ;(window as any).__qa_expense_saved=copy(item)
 return id
}
export async function reviewExpenseClaim():Promise<never>{throw Error('Approval workflow deliberately prohibited in QA')}
