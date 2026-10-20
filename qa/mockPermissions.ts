// Fake permission provider for isolated Playwright QA ONLY.
// Vite QA-only plugin aliases the actual harvest page's import to this module.
// NEVER shipped by the normal Vite Production build.
export function useAppPermissions() {
 return {role:'admin',loading:false,error:'',allowed:(_permission:string)=>true,refresh:async()=>{}};
}