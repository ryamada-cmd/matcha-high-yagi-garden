// Read-only, synchronous, in-memory stand-in for the CRM document selector.
const chain=(table:string)=>{
 const result=Promise.resolve({data:[],error:null})
 const self:any={select:()=>self,is:()=>self,order:()=>self,limit:()=>result}
 return self
}
export const supabase={from:chain}
