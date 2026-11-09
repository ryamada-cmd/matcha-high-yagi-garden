// Synthetic-only calendar service. This module contains no production API imports.
// The Playwright fixture intercepts every external request and fails if attempted.
type Task = {
 id:string;title:string;description:string;category:string;priority:string;status:string;
 startDate:string;startTime:string;dueDate:string;dueTime:string;fieldId:string;fieldName:string;
 linkType:string;linkId:string;createdBy:string;createdByName:string;completedAt:string;
 assignees:Array<{id:string;name:string}>;
 checklist:Array<{id:string;label:string;sortOrder:number;isDone:boolean;completedAt:string}>;
}
const tasks:Task[]=[]
const harvestPlans:any[]=[]
const members=[{id:'qa-member',name:'テスト担当',role:'admin'}]
const fields=[{id:'qa-field',legacyId:'QA-A',name:'架空茶園A',location:'京都の架空圃場'}]
export async function loadCalendarData(_from:string,_to:string){
 return {currentUserId:'qa-member',members,fields,tasks:tasks.map(t=>({...t})),
  sprayPlans:[],fertilizerPlans:[],harvestPlans:harvestPlans.map(x=>({...x}))}
}
export async function saveCalendarTask(id:string|undefined,input:any){
 const item:Task={id:id||'qa-calendar-task-'+(tasks.length+1),...input,fieldName:'',
  createdBy:'qa-member',createdByName:'テスト担当',completedAt:'',
  assignees:members.filter(m=>input.assigneeIds?.includes(m.id)).map(m=>({id:m.id,name:m.name})),
  checklist:(input.checklist||[]).map((x:any,i:number)=>({...x,id:x.id||'qa-check-'+i,sortOrder:i,completedAt:''}))}
 const index=tasks.findIndex(x=>x.id===id)
 if(index<0)tasks.push(item);else tasks[index]=item
 ;(window as any).__qa_calendar_task={...item}
 return item.id
}
export async function saveHarvestPlan(id:string|undefined,input:any){
 const result={id:id||'qa-harvest-'+(harvestPlans.length+1),
  legacyId:'QA-HARVEST',date:input.plannedStartDate||'2026-11-10',
  year:input.planYear,month:input.month,period:input.period,
  title:input.season,material:'',method:input.harvestMethod||'',
  fieldId:input.fieldId||'',fieldName:input.allFields?'全圃場':'架空茶園A',
  status:input.status,note:input.note||''}
 const index=harvestPlans.findIndex(x=>x.id===id)
 if(index<0)harvestPlans.push(result);else harvestPlans[index]=result
 ;(window as any).__qa_calendar_harvest={...input}
 return result.id
}
export async function deleteCalendarTask(id:string,_reason:string){const i=tasks.findIndex(x=>x.id===id);if(i>=0)tasks.splice(i,1)}
export async function deleteHarvestPlan(id:string){const i=harvestPlans.findIndex(x=>x.id===id);if(i>=0)harvestPlans.splice(i,1)}
export async function setCalendarChecklistItem(_id:string,_done:boolean){}
export async function setCalendarTaskStatus(id:string,status:string){const item=tasks.find(x=>x.id===id);if(item)item.status=status}
