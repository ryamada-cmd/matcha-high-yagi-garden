// QA-only Supabase API shim. No imports, credentials, database or network access.
type FakeSession={user:{id:string;email:string}}
const params=new URLSearchParams(window.location.search)
let sessionFailure=params.get('sessionError')==='1'
let role=params.get('role')||'worker'
let remainingFailures=params.get('rpcError')==='1'?Infinity:params.get('rpcError')==='once'?1:0
let session:FakeSession|null=params.get('anonymous')==='1'?null:{
 user:{id:'qa-synthetic-user',email:'qa-user@example.invalid'}
}
const callbacks=new Set<(event:string,session:FakeSession|null)=>void>()
const defaultKeys=[
 'dashboard.view','sprays.view','sprays.create','pesticide_inventory.view',
 'pesticides.view','spray_plans.view','fertilizer_applications.view',
 'fertilizer_applications.create','fertilizer_inventory.view',
 'fertilizers.view','fertilizer_plans.view','harvest_processing.view',
 'harvest_processing.manage','production.view','production.process_manage',
 'products.view','packaging.view','sales.view','sales.manage',
 'documents.view','costing.view','crm.view','equipment.view','calendar.view',
 'calendar.manage','daily_reports.view','expenses.view','vendor_invoices.view',
 'fields.view','storage.view','storage.upload','manual.view','settings.view'
]
function permissions(){
 if(role==='viewer')return{}
 const keys=role==='admin'?defaultKeys:['dashboard.view','sales.view','manual.view']
 return Object.fromEntries(keys.map(k=>[k,true]))
}
async function emit(event:string){
 for(const cb of callbacks)cb(event,session)
}
export const supabase={
 auth:{
  async getSession(){return sessionFailure?{data:{session:null},error:{message:'QA session unavailable'}}:{data:{session},error:null}},
  onAuthStateChange(cb:(event:string,session:FakeSession|null)=>void){
   callbacks.add(cb)
   return {data:{subscription:{unsubscribe:()=>callbacks.delete(cb)}}}
  },
  async signInWithPassword(input:{email:string;password:string}){
   if(input.password!=='qa-password-123')return{data:{user:null,session:null},error:{message:'架空認証：パスワードが違います'}}
   session={user:{id:'qa-synthetic-user',email:input.email}}
   await emit('SIGNED_IN')
   return{data:{session,user:session.user},error:null}
  },
  async signUp(input:{email:string}){
   return{data:{session:null,user:{email:input.email}},error:null}
  },
  async signOut(){
   session=null
   await emit('SIGNED_OUT')
   return{error:null}
  }
 },
 async rpc(name:string,input?:any){
  ;(window as any).__qa_rpc_calls=[...((window as any).__qa_rpc_calls||[]),name]
  if(name==='get_my_app_permissions'){
   if(remainingFailures>0){remainingFailures--;return{data:null,error:{message:'架空権限DB読込エラー'}}}
   return{data:{role,permissions:permissions()},error:null}
  }
  if(name==='has_app_permission')return{data:permissions()[input?.p_permission_key]===true,error:null}
  return{data:null,error:{message:'Unexpected RPC in isolated QA: '+name}}
 }
}
;(window as any).__qa_auth={setSessionFailure(value:boolean){sessionFailure=value},setRole(next:string){role=next},getRole(){return role},
 getSession(){return session},rpcCalls(){return (window as any).__qa_rpc_calls||[]}}
