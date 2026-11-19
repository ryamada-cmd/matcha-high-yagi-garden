// QA-only Supabase API shim. No imports, credentials, database or network access.
type FakeSession={user:{id:string;email:string}}
const params=new URLSearchParams(window.location.search)
let sessionFailure=params.get('sessionError')==='1'
let role=params.get('role')||'worker'
const mediaApproval=params.get('mediaApproval')==='1'
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
 functions:{
  async invoke(name:string,{body}:{body:Record<string,any>}){
   if(name!=='shared-media'||!mediaApproval) return {error:{context:new Response('{"error":"未承認"}',{status:403})}}
   ;(window as any).__qa_media_calls=[...((window as any).__qa_media_calls||[]),body.action]
   const id='00000000-0000-4000-8000-000000000100'
   const item={id,kind:'photo',original_name:'一番茶.jpeg',mime_type:'image/jpeg',size_bytes:1234,category:'茶摘み',
     album_id:null,taken_at:'2026-11-19',note:'',field_id:null,equipment_id:null,owner_id:'qa-synthetic-user',posted_at:'2026-11-19T00:00:00Z',legacy:true}
   ;(window as any).__qa_media_requests=[...((window as any).__qa_media_requests||[]),{action:body.action,id:body.id}]
   if(body.action==='status'&&(window as any).__qa_expire_upload){
    ;(window as any).__qa_expire_upload=false
    return {data:{id:body.id,state:'expired'},error:null}
   }
   const session={id:body.id,state:'open',uploadUrl:'https://qa-onedrive.invalid/upload',nextExpectedRanges:['0-']}
   const actions:Record<string,unknown>={
    options:{albums:[],fields:[],equipment:[],posters:[{id:'qa-synthetic-user',display_name:'検証用'}],isAdmin:role==='admin',userId:'qa-synthetic-user'},
    list:{items:body.kind==='video'?[]:[item],hasMore:false},thumbnails:{thumbnails:{}},
    begin:session,status:session,finalize:{id:body.id,state:'finalized',mediaId:id},
    cancel:{id:body.id,state:'cancelled'},original:{url:'https://qa-onedrive.invalid/original'},
    edit:{ok:true},album:{id},approvals:{approvals:[]}
   }
   return Object.hasOwn(actions,body.action) ? {data:actions[body.action],error:null} : {error:{message:'Unexpected media action'}}
  }
 },
 async rpc(name:string,input?:any){
  ;(window as any).__qa_rpc_calls=[...((window as any).__qa_rpc_calls||[]),name]
  if(name==='get_my_app_permissions'){
   if(remainingFailures>0){remainingFailures--;return{data:null,error:{message:'架空権限DB読込エラー'}}}
   return{data:{role,permissions:permissions()},error:null}
  }
  if(name==='media_can_access')return{data:mediaApproval,error:null}
  if(name==='has_app_permission')return{data:permissions()[input?.p_permission_key]===true,error:null}
  return{data:null,error:{message:'Unexpected RPC in isolated QA: '+name}}
 }
}
;(window as any).__qa_auth={setSessionFailure(value:boolean){sessionFailure=value},setRole(next:string){role=next},getRole(){return role},
 getSession(){return session},rpcCalls(){return (window as any).__qa_rpc_calls||[]}}
