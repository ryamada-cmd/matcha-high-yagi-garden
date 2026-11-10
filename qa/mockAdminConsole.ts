// Nonpersistent synthetic administrator state. No real auth, RLS, audit or Supabase access.
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v))
const settings:any={low_stock_threshold_percent:20,expiry_warning_days:90,
 upcoming_plan_warning_days:14,upcoming_harvest_warning_days:30,
 updated_at:'2026-11-01T09:00:00+09:00'}
const users:any[]=[
 {id:'qa-admin-1',role:'admin',display_name:'架空管理者',email:'qa-admin@example.invalid',created_at:'2026-01-01'},
 {id:'qa-worker-1',role:'worker',display_name:'架空作業者',email:'qa-worker@example.invalid',created_at:'2026-02-01'},
 {id:'qa-viewer-1',role:'viewer',display_name:'架空承認待ち',email:'qa-viewer@example.invalid',created_at:'2026-11-01'}
]
const audit_logs:any[]=[
 {id:1,action:'UPDATE',entity_type:'field',entity_id:'QA-FIELD-A',user_name:'架空管理者',
 user_email:'qa-admin@example.invalid',created_at:'2026-11-03T09:00:00+09:00',
 before_data:{name:'架空A'},after_data:{name:'架空茶園A'}},
 {id:2,action:'CREATE',entity_type:'vendor_invoice',entity_id:'QA-INVOICE',
 user_name:'架空作業者',user_email:'qa-worker@example.invalid',
 created_at:'2026-11-02T10:00:00+09:00',before_data:null,after_data:{total:1000}}
]
const definitions:any[]=[
 {permission_key:'dashboard.view',feature_key:'dashboard',feature_label:'ダッシュボード',
 item_label:'閲覧',description:'ホームを見る',admin_allowed:true,worker_allowed:true,locked:false},
 {permission_key:'storage.upload',feature_key:'storage',feature_label:'ファイル',
 item_label:'アップロード',description:'資料登録',admin_allowed:true,worker_allowed:false,locked:false},
 {permission_key:'users.manage',feature_key:'users',feature_label:'ユーザー',
 item_label:'管理',description:'管理者限定',admin_allowed:true,worker_allowed:false,locked:true}
]
export async function loadAdminConsole(){return clone({settings,users,audit_logs})}
export async function loadRolePermissionMatrix(){return clone({definitions})}
export async function saveAppSettings(input:any){
 Object.assign(settings,{low_stock_threshold_percent:input.lowStockPercent,expiry_warning_days:input.expiryDays,
 upcoming_plan_warning_days:input.planDays,upcoming_harvest_warning_days:input.harvestDays})
 ;(window as any).__qa_settings_saved=clone(input)
}
export async function changeUserRole(id:string,role:'admin'|'worker'|'viewer'){
 const user=users.find(u=>u.id===id)
 if(!user)throw Error('QA user not found')
 user.role=role
 ;(window as any).__qa_user_role_saved={id,role}
}
export async function saveRolePermissions(role:'admin'|'worker',permissions:Record<string,boolean>){
 for(const row of definitions){
  if(row.locked)continue
  if(Object.hasOwn(permissions,row.permission_key))row[role+'_allowed']=permissions[row.permission_key]
 }
 ;(window as any).__qa_role_permission_saved={role,permissions:clone(permissions)}
}
