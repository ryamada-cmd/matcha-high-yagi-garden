// Dashboard's complete service surface is aliased to this in-memory QA source.
// No production data, auth, weather API, or network access.
const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x))
const day=(delta:number)=>{
 const now=new Date()
 const dt=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+delta))
 return dt.toISOString().slice(0,10)
}
const tasks:any[]=[
 {id:'qa-home-overdue',title:'架空の圃場点検',status:'TODO',category:'GENERAL',
  dueDate:day(-2),dueTime:'09:00',assignees:[]},
 {id:'qa-home-today',title:'架空の茶園作業',status:'IN_PROGRESS',category:'HARVEST',
  dueDate:day(0),dueTime:'14:00',assignees:[{id:'qa-member',name:'架空担当'}]},
 {id:'qa-home-week',title:'架空の施肥予定',status:'TODO',category:'FERTILIZER',
  dueDate:day(3),dueTime:'10:00',assignees:[{id:'qa-member',name:'架空担当'}]}
]
export async function loadDashboard(){
 return clone({alerts:[
  {id:'qa-alert-1',severity:'warning',title:'架空農薬の期限注意',detail:'合成データの警告です',
   href:'/inventory',action:'在庫を見る'}
 ],readiness:{harvestTotal:12},stockLots:4,stockValue:36000,
 nextPlan:{label:'架空防除予定',target:'架空A'},lastSpray:{date:day(-3),target:'架空A'},
 harvests:[]})
}
export async function loadFertilizerDashboard(){
 return clone({stockKg:150,stockLots:3,nKg:2,pKg:1,kKg:3,nextPlan:{label:'架空施肥計画',purpose:'合成テスト'}})
}
export async function loadHarvestRecords(){
 return clone([{id:'qa-harvest-1',date:String(new Date().getFullYear())+'-05-16',freshLeafKg:77}])
}
export async function loadProcessingBatches(){
 return clone([{id:'qa-processing-1',date:String(new Date().getFullYear())+'-05-22',outputKg:15}])
}
export async function loadProductionLots(){
 return clone([
  {id:'qa-product-1',category:'製品',balance:8,inventoryValueYen:48000},
  {id:'qa-raw-1',category:'原料',balance:10,inventoryValueYen:30000}
 ])
}
export async function loadManufacturingBatches(){
 return clone([{id:'qa-batch-1',date:String(new Date().getFullYear())+'-06-01',
 outputMaterial:'架空抹茶',totalCostYen:12000,outputQty:6,outputUnit:'kg'}])
}
export async function loadSalesDashboard(){
 return clone({monthSalesYen:120000,monthCostYen:45000,monthGrossProfitYen:75000,
 monthSaleCount:3,monthKey:'QA-MONTH',monthGrossMarginPct:62.5,latest:{
 date:day(-1),customerName:'架空商店',channel:'卸',salesAmountYen:25000,grossProfitYen:15000}})
}
export async function loadEquipmentDashboard(){
 return clone({activeCount:4,acquisitionValueYen:700000,attentionCount:1,
 criticalCount:0,warningCount:1,nextDue:{date:day(3),label:'架空設備点検',
 assetNo:'QA-01',name:'架空製茶機'},alerts:[]})
}
export async function loadCalendarData(){
 return clone({currentUserId:'qa-member',members:[{id:'qa-member',name:'架空担当'}],fields:[],
 tasks,sprayPlans:[],fertilizerPlans:[],harvestPlans:[]})
}
export async function setCalendarTaskStatus(id:string,status:string){
 const row=tasks.find(x=>x.id===id)
 if(!row)throw new Error('Missing QA task')
 row.status=status
 ;(window as any).__qa_home_task_changed={id,status}
}
