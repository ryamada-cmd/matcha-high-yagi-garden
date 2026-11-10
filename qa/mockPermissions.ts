// Synthetic-only permission response for browser QA.
// NEVER imported into production bundles. The dedicated Vite QA plugin aliases this module.
export function useAppPermissions() {
 const viewOnly=new URLSearchParams(window.location.search).get('viewOnly')==='1'
 return {role:viewOnly?'worker':'admin',loading:false,error:'',
  allowed:(permission:string)=>!(viewOnly&&(permission.endsWith('.manage')||
   permission==='storage.upload'||permission==='storage.delete'||permission==='audit.export')),
  refresh:async()=>{}}
}
