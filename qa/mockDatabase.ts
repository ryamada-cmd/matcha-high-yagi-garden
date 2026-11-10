// Fail-closed local fixture for the remaining operational screens. Real service
// mapping code runs against these synthetic rows. No network or credentials.
const field = { id:'qa-field', legacy_id:'QA-A', name:'架空茶園', location:'架空地域', area_m2:1000, variety:'やぶきた', cultivation_type:'茶園', standard_spray_l_per_10a:200, status:'active' }
const rows: Record<string, any[]> = {
  fields:[field], profiles:[{role:'admin'}],
  fertilizers:[{id:'qa-fertilizer',name:'架空肥料',is_active:true,nitrogen_percent:10,phosphate_percent:5,potassium_percent:5}],
  production_inventory_balances:[{lot_id:'qa-lot',legacy_id:'QA-LOT',material_name:'架空碾茶',category:'原料',unit:'kg',received_date:'2026-11-01',initial_qty:10,balance:10,total_cost_yen:10000,unit_cost_yen:1000,inventory_value_yen:10000,source_type:'EXTERNAL_PURCHASE'}],
}
const params = new URLSearchParams(window.location.search)
function builder(table: string) {
  let single = false
  const chain: any = new Proxy({}, {get(_target,key) {
    if (key === 'then') return (resolve: any, reject: any) => Promise.resolve({
      data:single ? (rows[table]?.[0] ?? null) : (rows[table] ?? []),
      count:rows[table]?.length ?? 0,
      error:params.get('dataError') === '1' ? {message:'架空の通信エラー'} : null,
    }).then(resolve,reject)
    if (['insert','update','delete','upsert'].includes(String(key))) return () => {throw new Error('QA rejects unconfigured writes')}
    return () => {if(key==='single'||key==='maybeSingle')single=true; return chain}
  }})
  return chain
}
export const supabase = {
  from:builder,
  auth:{async getUser(){return {data:{user:{id:'qa-user'}},error:null}}},
  async rpc(name:string,payload:any) {
    if(name==='has_app_permission')return {data:params.get('viewOnly')!=='1'||payload.p_permission_key.endsWith('.view'),error:null}
    if(name==='search_pesticide_catalog')return {data:{official:[],guidelines:[],expired:[],counts:{official:0,guidelines:0,expired:0}},error:null}
    // Only specific form saves are allowed, recorded in memory for assertions.
    if(['admin_receive_production_lot','admin_save_fertilizer_plan','save_field','save_annual_plan'].includes(name)) {
      ;(window as any).__qa_operation={name,payload}
      return {data:'qa-saved',error:null}
    }
    throw new Error(`QA rejects unconfigured RPC: ${name}`)
  },
  functions:{async invoke(){throw new Error('QA rejects external functions')}},
}
