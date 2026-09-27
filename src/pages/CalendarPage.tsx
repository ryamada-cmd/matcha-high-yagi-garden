import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, CircleAlert, ClipboardCheck, Edit3, ListChecks, Plus, RefreshCw, Sprout, Trash2, Users, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppPermissions } from '../lib/permissions'
import {
  deleteCalendarTask, deleteHarvestPlan, loadCalendarData, saveCalendarTask, saveHarvestPlan, setCalendarChecklistItem, setCalendarTaskStatus,
  type CalendarChecklistDraft, type CalendarData, type CalendarPlan, type CalendarTask, type CalendarTaskInput, type HarvestPlanInput
} from '../lib/calendar'

const pad=(n:number)=>String(n).padStart(2,'0')
const iso=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const fromIso=(s:string)=>new Date(`${s}T00:00:00`)
const today=()=>iso(new Date())
const addDays=(s:string,n:number)=>{const d=fromIso(s);d.setDate(d.getDate()+n);return iso(d)}
const monthAnchor=(d=new Date())=>new Date(d.getFullYear(),d.getMonth(),1)
const monthLabel=(d:Date)=>`${d.getFullYear()}年${d.getMonth()+1}月`
const weekday=['日','月','火','水','木','金','土']
const categoryLabel:Record<string,string>={GENERAL:'一般',SPRAY:'防除',FERTILIZER:'施肥',HARVEST:'収穫',PROCESSING:'製造',MAINTENANCE:'設備',SALES:'販売',OTHER:'その他'}
const priorityLabel:Record<string,string>={LOW:'低',NORMAL:'通常',HIGH:'高',URGENT:'緊急'}
const statusLabel:Record<string,string>={TODO:'未着手',IN_PROGRESS:'進行中',DONE:'完了',CANCELLED:'中止'}
const blankData:CalendarData={currentUserId:'',members:[],fields:[],tasks:[],sprayPlans:[],fertilizerPlans:[],harvestPlans:[]}
const blankTask=(date=today()):CalendarTaskInput=>({title:'',description:'',category:'GENERAL',priority:'NORMAL',status:'TODO',startDate:'',startTime:'',dueDate:date,dueTime:'',fieldId:'',linkType:'',linkId:'',assigneeIds:[],checklist:[]})
const blankHarvest=(date=today()):HarvestPlanInput=>{const d=fromIso(date);return{planYear:d.getFullYear(),month:d.getMonth()+1,period:'上旬',fieldId:'',allFields:false,season:'一番茶',harvestMethod:'',plannedStartDate:date,plannedEndDate:'',status:'planned',note:''}}

type EventKind='TASK'|'SPRAY'|'FERTILIZER'|'HARVEST'
type CalendarEvent={
  key:string;kind:EventKind;date:string;title:string;subtitle:string;status:string;priority?:string;
  task?:CalendarTask;plan?:CalendarPlan;linkType?:string
}

export default function CalendarPage(){
  const{allowed}=useAppPermissions(),canManage=allowed('calendar.manage')
  const[anchor,setAnchor]=useState(monthAnchor()),[selectedDate,setSelectedDate]=useState(today())
  const[data,setData]=useState<CalendarData>(blankData),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
  const[error,setError]=useState(''),[success,setSuccess]=useState(''),[checkBusy,setCheckBusy]=useState('')
  const[kindFilter,setKindFilter]=useState<'ALL'|EventKind>('ALL'),[assigneeFilter,setAssigneeFilter]=useState('')
  const[taskOpen,setTaskOpen]=useState(false),[taskId,setTaskId]=useState(''),[taskForm,setTaskForm]=useState<CalendarTaskInput>(()=>blankTask())
  const[planDetail,setPlanDetail]=useState<{kind:'spray_plan'|'fertilizer_plan'|'harvest_plan';plan:CalendarPlan}|null>(null)
  const[harvestOpen,setHarvestOpen]=useState(false),[harvestId,setHarvestId]=useState(''),[harvestForm,setHarvestForm]=useState<HarvestPlanInput>(()=>blankHarvest())
  const[completionTask,setCompletionTask]=useState<CalendarTask|null>(null)

  const grid=useMemo(()=>{const first=new Date(anchor.getFullYear(),anchor.getMonth(),1);const start=new Date(first);start.setDate(first.getDate()-first.getDay());return Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d})},[anchor])
  const rangeStart=iso(grid[0]),rangeEnd=iso(grid[41])

  async function refresh(){
    setLoading(true);setError('')
    try{setData(await loadCalendarData(rangeStart,rangeEnd))}
    catch(e:any){setError(e?.message||'カレンダーを読み込めませんでした。')}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[rangeStart,rangeEnd])

  const events=useMemo<CalendarEvent[]>(()=>{
    const out:CalendarEvent[]=[]
    for(const t of data.tasks)out.push({key:`task-${t.id}`,kind:'TASK',date:t.dueDate,title:t.title,subtitle:t.assignees.map(a=>a.name).join('・')||'担当未設定',status:t.status,priority:t.priority,task:t})
    for(const p of data.sprayPlans)out.push({key:`spray-${p.id}`,kind:'SPRAY',date:p.date,title:p.title,subtitle:`${p.fieldName} / ${p.material||''}`,status:p.status,plan:p,linkType:'spray_plan'})
    for(const p of data.fertilizerPlans)out.push({key:`fert-${p.id}`,kind:'FERTILIZER',date:p.date,title:p.title,subtitle:`${p.fieldName} / ${p.material||''}`,status:p.status,plan:p,linkType:'fertilizer_plan'})
    for(const p of data.harvestPlans)out.push({key:`harvest-${p.id}`,kind:'HARVEST',date:p.date,title:p.title,subtitle:`${p.fieldName}${p.method?` / ${p.method}`:''}`,status:p.status,plan:p,linkType:'harvest_plan'})
    return out
  },[data])

  const visibleEvents=useMemo(()=>events.filter(e=>{
    if(kindFilter!=='ALL'&&e.kind!==kindFilter)return false
    if(assigneeFilter){
      if(e.kind!=='TASK'||!e.task?.assignees.some(a=>a.id===assigneeFilter))return false
    }
    return true
  }),[events,kindFilter,assigneeFilter])

  const eventsByDate=useMemo(()=>{const m=new Map<string,CalendarEvent[]>();for(const e of visibleEvents)m.set(e.date,[...(m.get(e.date)||[]),e]);return m},[visibleEvents])
  const selectedEvents=eventsByDate.get(selectedDate)||[]
  const openTasks=data.tasks.filter(t=>t.status==='TODO'||t.status==='IN_PROGRESS')
  const overdue=openTasks.filter(t=>t.dueDate<today()).length
  const todayCount=openTasks.filter(t=>t.dueDate===today()).length
  const weekEnd=addDays(today(),7)
  const nextWeek=openTasks.filter(t=>t.dueDate>=today()&&t.dueDate<=weekEnd).length
  const unassigned=openTasks.filter(t=>!t.assignees.length).length

  function moveMonth(n:number){const d=new Date(anchor);d.setMonth(d.getMonth()+n);setAnchor(monthAnchor(d));setSelectedDate(iso(new Date(d.getFullYear(),d.getMonth(),1)))}
  function goToday(){const d=new Date();setAnchor(monthAnchor(d));setSelectedDate(today())}

  function openNewTask(date=selectedDate){
    setTaskId('');setTaskForm(blankTask(date));setTaskOpen(true);setError('');setSuccess('')
  }
  function editTask(t:CalendarTask){
    setTaskId(t.id);setTaskForm({title:t.title,description:t.description,category:t.category,priority:t.priority,status:t.status,startDate:t.startDate||'',startTime:t.startTime||'',dueDate:t.dueDate,dueTime:t.dueTime||'',fieldId:t.fieldId||'',linkType:t.linkType||'',linkId:t.linkId||'',assigneeIds:t.assignees.map(a=>a.id),checklist:t.checklist.map(x=>({id:x.id,label:x.label,isDone:x.isDone}))});setTaskOpen(true)
  }
  function taskFromPlan(kind:'spray_plan'|'fertilizer_plan'|'harvest_plan',p:CalendarPlan){
    const category=kind==='spray_plan'?'SPRAY':kind==='fertilizer_plan'?'FERTILIZER':'HARVEST'
    const prefix=kind==='spray_plan'?'防除':kind==='fertilizer_plan'?'施肥':'収穫'
    setTaskId('');setTaskForm({...blankTask(p.date),title:`${prefix}：${p.title}`,description:p.note||'',category,fieldId:p.fieldId||'',linkType:kind,linkId:p.id,checklist:category==='SPRAY'?[{label:'薬剤・希釈倍率を確認',isDone:false},{label:'天候・風を確認',isDone:false},{label:'散布後に実績を記録',isDone:false}]:category==='FERTILIZER'?[{label:'肥料在庫を確認',isDone:false},{label:'施肥量を確認',isDone:false},{label:'施肥後に実績を記録',isDone:false}]:[{label:'圃場・摘採方法を確認',isDone:false},{label:'収穫後に実績を記録',isDone:false}]});setPlanDetail(null);setTaskOpen(true)
  }
  function toggleAssignee(id:string){setTaskForm(f=>({...f,assigneeIds:f.assigneeIds.includes(id)?f.assigneeIds.filter(x=>x!==id):[...f.assigneeIds,id]}))}
  function addChecklistItem(){if(taskForm.checklist.length>=30)return setError('チェックリストは30項目までです。');setTaskForm(f=>({...f,checklist:[...f.checklist,{label:'',isDone:false}]}))}
  function updateChecklistItem(index:number,patch:Partial<CalendarChecklistDraft>){setTaskForm(f=>({...f,checklist:f.checklist.map((x,i)=>i===index?{...x,...patch}:x)}))}
  function removeChecklistItem(index:number){setTaskForm(f=>({...f,checklist:f.checklist.filter((_,i)=>i!==index)}))}
  async function toggleChecklist(index:number){
    const item=taskForm.checklist[index];if(!item)return
    const next=!item.isDone
    updateChecklistItem(index,{isDone:next})
    if(!item.id)return
    setCheckBusy(item.id);setError('')
    try{
      await setCalendarChecklistItem(item.id,next)
      setData(d=>({...d,tasks:d.tasks.map(t=>t.id===taskId?{...t,checklist:t.checklist.map(x=>x.id===item.id?{...x,isDone:next}:x)}:t)}))
    }catch(e:any){updateChecklistItem(index,{isDone:!next});setError(e?.message||'チェック項目を更新できませんでした。')}
    finally{setCheckBusy('')}
  }
  function taskActionHref(t:CalendarTask){
    const q=new URLSearchParams()
    if(t.fieldId)q.set('field',t.fieldId)
    q.set('task',t.id)
    if(t.linkId)q.set('plan',t.linkId)
    const suffix=q.toString()?'?'+q.toString():''
    if(t.category==='SPRAY'||t.linkType==='spray_plan')return '/sprays'+suffix
    if(t.category==='FERTILIZER'||t.linkType==='fertilizer_plan')return '/fertilizer-applications'+suffix
    if(t.category==='HARVEST'||t.linkType==='harvest_plan')return '/harvests'+suffix
    if(t.category==='PROCESSING')return '/production'+suffix
    if(t.category==='SALES')return '/sales'+suffix
    return ''
  }

  async function submitTask(e:FormEvent){
    e.preventDefault();if(!canManage)return
    setBusy(true);setError('');setSuccess('')
    try{
      if(!taskForm.title.trim())throw new Error('やることを入力してください。')
      if(!taskForm.dueDate)throw new Error('期限を入力してください。')
      await saveCalendarTask(taskId||undefined,taskForm)
      setSuccess(taskId?'タスクを更新しました。':'タスクを追加しました。');setTaskOpen(false);await refresh()
    }catch(e:any){setError(e?.message||'タスクを保存できませんでした。')}
    finally{setBusy(false)}
  }
  async function quickStatus(t:CalendarTask,status:string){
    if(!canManage)return;setBusy(true);setError('')
    try{await setCalendarTaskStatus(t.id,status);setSuccess(status==='DONE'?'完了にしました。':'状態を更新しました。');if(status==='DONE'&&taskActionHref(t))setCompletionTask(t);await refresh()}
    catch(e:any){setError(e?.message||'状態を更新できませんでした。')}finally{setBusy(false)}
  }
  async function removeTask(t:CalendarTask){
    if(!canManage)return
    const reason=window.prompt('削除理由を入力してください。','入力誤り');if(reason===null)return
    setBusy(true)
    try{await deleteCalendarTask(t.id,reason);setTaskOpen(false);setSuccess('タスクを削除しました。');await refresh()}
    catch(e:any){setError(e?.message||'タスクを削除できませんでした。')}finally{setBusy(false)}
  }

  function openHarvestNew(date=selectedDate){setHarvestId('');setHarvestForm(blankHarvest(date));setHarvestOpen(true)}
  function editHarvest(p:CalendarPlan){
    const d=fromIso(p.date)
    setHarvestId(p.id);setHarvestForm({planYear:p.year||d.getFullYear(),month:p.month||d.getMonth()+1,period:p.period||'',fieldId:p.fieldId||'',allFields:p.fieldName==='全圃場',season:p.title,harvestMethod:p.method||'',plannedStartDate:p.date||'',plannedEndDate:p.endDate||'',status:p.status||'planned',note:p.note||''});setPlanDetail(null);setHarvestOpen(true)
  }
  async function submitHarvest(e:FormEvent){
    e.preventDefault();setBusy(true);setError('')
    try{await saveHarvestPlan(harvestId||undefined,harvestForm);setHarvestOpen(false);setSuccess(harvestId?'収穫計画を更新しました。':'年間収穫計画を追加しました。');await refresh()}
    catch(e:any){setError(e?.message||'収穫計画を保存できませんでした。')}finally{setBusy(false)}
  }
  async function removeHarvest(){
    if(!harvestId)return;if(!window.confirm('この年間収穫計画を削除しますか？'))return
    setBusy(true);try{await deleteHarvestPlan(harvestId);setHarvestOpen(false);setSuccess('収穫計画を削除しました。');await refresh()}catch(e:any){setError(e?.message||'削除できませんでした。')}finally{setBusy(false)}
  }

  const linkedTasks=planDetail?data.tasks.filter(t=>t.linkType===planDetail.kind&&t.linkId===planDetail.plan.id):[]

  return <div className="page calendar-page">
    <div className="page-head"><div><p className="eyebrow">WORK CALENDAR</p><h1>作業カレンダー</h1><p className="sub">日々のやること・担当者・期限と、年間防除／施肥／収穫計画をひとつのカレンダーで確認します。</p></div><div className="head-actions">{canManage&&<><button className="secondary-button" onClick={()=>openHarvestNew()}><Sprout size={17}/>収穫計画</button><button className="primary-button" onClick={()=>openNewTask()}><Plus size={17}/>やること追加</button></>}<button className="icon-button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={18} className={loading?'spin':''}/></button></div></div>
    {error&&<div className="notice error dashboard-notice">{error}</div>}{success&&<div className="notice success dashboard-notice">{success}</div>}

    <div className="calendar-metrics">
      <article className={overdue?'danger':''}><CircleAlert size={18}/><div><span>期限超過</span><strong>{overdue}</strong></div></article>
      <article><CalendarDays size={18}/><div><span>今日まで</span><strong>{todayCount}</strong></div></article>
      <article><ClipboardCheck size={18}/><div><span>7日以内</span><strong>{nextWeek}</strong></div></article>
      <article className={unassigned?'warn':''}><Users size={18}/><div><span>担当未設定</span><strong>{unassigned}</strong></div></article>
    </div>

    <section className="panel calendar-shell">
      <div className="calendar-toolbar">
        <div className="calendar-month-nav"><button onClick={()=>moveMonth(-1)} aria-label="前月"><ChevronLeft size={19}/></button><h2>{monthLabel(anchor)}</h2><button onClick={()=>moveMonth(1)} aria-label="翌月"><ChevronRight size={19}/></button><button className="today-button" onClick={goToday}>今日</button></div>
        <div className="calendar-filters">
          <button type="button" className={assigneeFilter&&assigneeFilter===data.currentUserId?'calendar-self-filter active':'calendar-self-filter'} disabled={!data.currentUserId} onClick={()=>setAssigneeFilter(v=>v===data.currentUserId?'':data.currentUserId)}><Users size={15}/>自分の担当だけ</button>
          <select value={kindFilter} onChange={e=>setKindFilter(e.target.value as any)}><option value="ALL">すべて</option><option value="TASK">やること</option><option value="SPRAY">防除計画</option><option value="FERTILIZER">施肥計画</option><option value="HARVEST">収穫計画</option></select>
          <select value={assigneeFilter} onChange={e=>setAssigneeFilter(e.target.value)}><option value="">全担当者</option>{data.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </div>
      </div>
      <div className="calendar-legend"><span className="task">やること</span><span className="spray">防除計画</span><span className="fertilizer">施肥計画</span><span className="harvest">収穫計画</span></div>
      <div className="month-calendar">
        {weekday.map(w=><div className="calendar-weekday" key={w}>{w}</div>)}
        {grid.map(d=>{const ds=iso(d),evs=eventsByDate.get(ds)||[],outside=d.getMonth()!==anchor.getMonth(),isToday=ds===today(),selected=ds===selectedDate;return <button type="button" key={ds} className={`calendar-day ${outside?'outside':''} ${isToday?'today':''} ${selected?'selected':''}`} onClick={()=>setSelectedDate(ds)}>
          <span className="calendar-day-number">{d.getDate()}</span>
          <div className="calendar-day-events">{evs.slice(0,4).map(e=><span key={e.key} className={`calendar-event-dot ${e.kind.toLowerCase()} ${e.status.toLowerCase()}`} title={e.title}>{e.kind==='TASK'&&e.status==='DONE'?'✓ ':''}{e.title}</span>)}{evs.length>4&&<small>+{evs.length-4}</small>}</div>
        </button>})}
      </div>
    </section>

    <section className="panel calendar-day-panel">
      <div className="panel-title"><div><h2>{selectedDate} の予定</h2><p>{selectedEvents.length}件</p></div>{canManage&&<button className="secondary-button" onClick={()=>openNewTask(selectedDate)}><Plus size={16}/>この日に追加</button>}</div>
      <div className="calendar-agenda">{selectedEvents.map(e=>e.kind==='TASK'&&e.task?
        <article className={`calendar-agenda-item task priority-${e.task.priority.toLowerCase()} ${e.task.status.toLowerCase()}`} key={e.key}>
          <button className="agenda-main" onClick={()=>editTask(e.task!)}><span>{categoryLabel[e.task.category]||e.task.category} / {priorityLabel[e.task.priority]||e.task.priority}</span><h3>{e.task.title}</h3><small>{e.task.dueTime?`期限 ${e.task.dueTime.slice(0,5)} / `:''}{e.task.fieldName||'圃場指定なし'}</small><div className="agenda-assignees">{e.task.assignees.length?e.task.assignees.map(a=><b key={a.id}>{a.name}</b>):<b className="unassigned">担当未設定</b>}</div>{e.task.checklist.length>0&&<div className="agenda-checklist-progress"><ListChecks size={13}/><span>{e.task.checklist.filter(x=>x.isDone).length}/{e.task.checklist.length}</span><i><b style={{width:`${e.task.checklist.filter(x=>x.isDone).length/e.task.checklist.length*100}%`}}/></i></div>}</button>
          <div className="agenda-actions">{taskActionHref(e.task)&&<Link to={taskActionHref(e.task)} className="agenda-record">実績入力<ArrowRight size={13}/></Link>}{canManage&&e.task.status!=='DONE'&&e.task.status!=='CANCELLED'&&<button className="agenda-done" disabled={busy} onClick={()=>void quickStatus(e.task!,'DONE')}><Check size={18}/>完了</button>}</div>
        </article>
        :<article className={`calendar-agenda-item plan ${e.kind.toLowerCase()}`} key={e.key}><button className="agenda-main" onClick={()=>setPlanDetail({kind:e.linkType as any,plan:e.plan!})}><span>{e.kind==='SPRAY'?'年間防除計画':e.kind==='FERTILIZER'?'年間施肥計画':'年間収穫計画'} / {e.plan?.legacyId}</span><h3>{e.title}</h3><small>{e.subtitle}</small></button></article>
      )}{!selectedEvents.length&&<p className="empty">この日の予定はありません。</p>}</div>
    </section>

    <section className="panel calendar-upcoming-panel">
      <div className="panel-title"><div><h2>未完了のやること</h2><p>期限が近い順</p></div><span>{openTasks.length}件</span></div>
      <div className="calendar-upcoming-list">{openTasks.slice().sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,20).map(t=><button key={t.id} onClick={()=>editTask(t)} className={t.dueDate<today()?'overdue':''}><time>{t.dueDate}</time><div><b>{t.title}</b><span>{t.assignees.map(a=>a.name).join('・')||'担当未設定'} / {categoryLabel[t.category]||t.category}</span></div><strong>{t.dueDate<today()?'期限超過':statusLabel[t.status]||t.status}</strong></button>)}{!openTasks.length&&<p className="empty">未完了タスクはありません。</p>}</div>
    </section>

    {completionTask&&<div className="calendar-completion-toast"><div><Check size={18}/><span><b>タスクを完了しました</b><small>実際の作業記録も続けて登録できます。</small></span></div><div><button onClick={()=>setCompletionTask(null)}>閉じる</button><Link to={taskActionHref(completionTask)} onClick={()=>setCompletionTask(null)}>実績を記録<ArrowRight size={14}/></Link></div></div>}

    {taskOpen&&canManage&&<div className="inventory-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setTaskOpen(false)}}><section className="panel inventory-modal calendar-task-modal">
      <div className="section-head"><div><p className="eyebrow">TASK</p><h2>{taskId?'やることを編集':'やることを追加'}</h2></div><button className="close-detail" onClick={()=>setTaskOpen(false)}><X size={18}/></button></div>
      <form className="calendar-task-form" onSubmit={submitTask}>
        <label>やること<input autoFocus value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})} placeholder="例：A〜D圃場に芽出し肥を施用" required/></label>
        <div className="calendar-category-picks">{Object.entries(categoryLabel).map(([k,v])=><button type="button" key={k} className={taskForm.category===k?'active':''} onClick={()=>setTaskForm({...taskForm,category:k})}>{v}</button>)}</div>
        <div className="form-grid three"><label>開始日<input type="date" value={taskForm.startDate} onChange={e=>setTaskForm({...taskForm,startDate:e.target.value})}/></label><label>期限<input type="date" required value={taskForm.dueDate} onChange={e=>setTaskForm({...taskForm,dueDate:e.target.value})}/></label><label>期限時刻<input type="time" value={taskForm.dueTime} onChange={e=>setTaskForm({...taskForm,dueTime:e.target.value})}/></label></div>
        <div className="form-grid three"><label>優先度<select value={taskForm.priority} onChange={e=>setTaskForm({...taskForm,priority:e.target.value})}><option value="LOW">低</option><option value="NORMAL">通常</option><option value="HIGH">高</option><option value="URGENT">緊急</option></select></label><label>状態<select value={taskForm.status} onChange={e=>setTaskForm({...taskForm,status:e.target.value})}><option value="TODO">未着手</option><option value="IN_PROGRESS">進行中</option><option value="DONE">完了</option><option value="CANCELLED">中止</option></select></label><label>圃場<select value={taskForm.fieldId} onChange={e=>setTaskForm({...taskForm,fieldId:e.target.value})}><option value="">指定なし</option>{data.fields.map(f=><option key={f.id} value={f.id}>{f.legacyId} {f.name}</option>)}</select></label></div>
        <fieldset className="calendar-assignees"><legend>担当者（複数選択可）</legend><div>{data.members.map(m=><button type="button" key={m.id} className={taskForm.assigneeIds.includes(m.id)?'selected':''} onClick={()=>toggleAssignee(m.id)}><Users size={15}/>{m.name}</button>)}</div></fieldset>
        <section className="calendar-checklist-editor"><div className="section-head"><div><b>チェックリスト</b><span>{taskForm.checklist.filter(x=>x.isDone).length}/{taskForm.checklist.length} 完了</span></div><button type="button" onClick={addChecklistItem}><Plus size={15}/>項目追加</button></div><div>{taskForm.checklist.map((item,index)=><div className={item.isDone?'done':''} key={item.id||index}><button type="button" className="calendar-check-toggle" disabled={!!item.id&&checkBusy===item.id} onClick={()=>void toggleChecklist(index)}>{item.isDone?<Check size={16}/>:<span/>}</button><input value={item.label} onChange={e=>updateChecklistItem(index,{label:e.target.value})} placeholder="例：資材を確認"/><button type="button" className="calendar-check-remove" onClick={()=>removeChecklistItem(index)}><X size={15}/></button></div>)}</div>{!taskForm.checklist.length&&<p>必要なら作業手順をチェック項目として追加できます。</p>}</section>
        <label>年間計画にリンク<select value={taskForm.linkType&&taskForm.linkId?`${taskForm.linkType}:${taskForm.linkId}`:''} onChange={e=>{const [type,id]=e.target.value.split(':');setTaskForm({...taskForm,linkType:type||'',linkId:id||''})}}><option value="">リンクなし</option>{data.sprayPlans.map(p=><option key={p.id} value={`spray_plan:${p.id}`}>防除｜{p.date}｜{p.title}</option>)}{data.fertilizerPlans.map(p=><option key={p.id} value={`fertilizer_plan:${p.id}`}>施肥｜{p.date}｜{p.title}</option>)}{data.harvestPlans.map(p=><option key={p.id} value={`harvest_plan:${p.id}`}>収穫｜{p.date}｜{p.title}</option>)}</select></label>
        <label>詳細<textarea rows={3} value={taskForm.description} onChange={e=>setTaskForm({...taskForm,description:e.target.value})} placeholder="作業内容、注意事項、必要な資材など"/></label>
        <div className="calendar-modal-actions">{taskId&&<button type="button" className="danger-text-button" onClick={()=>{const t=data.tasks.find(x=>x.id===taskId);if(t)void removeTask(t)}} disabled={busy}><Trash2 size={16}/>削除</button>}<button className="primary-button" disabled={busy}>{busy?'保存中…':taskId?'変更を保存':'やることを追加'}</button></div>
      </form>
    </section></div>}

    {planDetail&&<div className="inventory-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPlanDetail(null)}}><section className="panel inventory-modal calendar-plan-modal">
      <div className="section-head"><div><p className="eyebrow">ANNUAL PLAN</p><h2>{planDetail.kind==='spray_plan'?'年間防除計画':planDetail.kind==='fertilizer_plan'?'年間施肥計画':'年間収穫計画'}</h2></div><button className="close-detail" onClick={()=>setPlanDetail(null)}><X size={18}/></button></div>
      <div className="calendar-plan-detail"><span>{planDetail.plan.date}{planDetail.plan.endDate?` 〜 ${planDetail.plan.endDate}`:''}</span><h3>{planDetail.plan.title}</h3><p>{planDetail.plan.fieldName}</p>{planDetail.plan.material&&<p>資材：{planDetail.plan.material}</p>}{planDetail.plan.method&&<p>方法：{planDetail.plan.method}</p>}{planDetail.plan.note&&<p>{planDetail.plan.note}</p>}</div>
      <div className="calendar-linked-tasks"><b>紐付いたやること {linkedTasks.length}件</b>{linkedTasks.map(t=><button key={t.id} onClick={()=>{setPlanDetail(null);editTask(t)}}><span>{t.dueDate}</span><strong>{t.title}</strong><small>{t.assignees.map(a=>a.name).join('・')||'担当未設定'} / {statusLabel[t.status]||t.status}</small></button>)}</div>
      <div className="calendar-modal-actions">{planDetail.kind==='spray_plan'&&<Link className="secondary-button" to="/plans">年間防除計画を開く</Link>}{planDetail.kind==='fertilizer_plan'&&<Link className="secondary-button" to="/fertilizer-plans">年間施肥計画を開く</Link>}{planDetail.kind==='harvest_plan'&&canManage&&<button className="secondary-button" onClick={()=>editHarvest(planDetail.plan)}><Edit3 size={16}/>収穫計画を編集</button>}{canManage&&<button className="primary-button" onClick={()=>taskFromPlan(planDetail.kind,planDetail.plan)}><Plus size={16}/>この計画からやること作成</button>}</div>
    </section></div>}

    {harvestOpen&&canManage&&<div className="inventory-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setHarvestOpen(false)}}><section className="panel inventory-modal calendar-harvest-modal">
      <div className="section-head"><div><p className="eyebrow">HARVEST PLAN</p><h2>{harvestId?'年間収穫計画を編集':'年間収穫計画を追加'}</h2></div><button className="close-detail" onClick={()=>setHarvestOpen(false)}><X size={18}/></button></div>
      <form className="calendar-task-form" onSubmit={submitHarvest}>
        <div className="form-grid three"><label>年<input type="number" min="2020" max="2100" value={harvestForm.planYear} onChange={e=>setHarvestForm({...harvestForm,planYear:Number(e.target.value)})}/></label><label>月<select value={harvestForm.month} onChange={e=>setHarvestForm({...harvestForm,month:Number(e.target.value)})}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}月</option>)}</select></label><label>時期<select value={harvestForm.period} onChange={e=>setHarvestForm({...harvestForm,period:e.target.value})}><option>上旬</option><option>中旬</option><option>下旬</option><option value="">指定なし</option></select></label></div>
        <label className="check-line"><input type="checkbox" checked={harvestForm.allFields} onChange={e=>setHarvestForm({...harvestForm,allFields:e.target.checked,fieldId:e.target.checked?'':harvestForm.fieldId})}/>全圃場を対象</label>
        {!harvestForm.allFields&&<label>対象圃場<select required value={harvestForm.fieldId} onChange={e=>setHarvestForm({...harvestForm,fieldId:e.target.value})}><option value="">選択</option>{data.fields.map(f=><option key={f.id} value={f.id}>{f.legacyId} {f.name}</option>)}</select></label>}
        <div className="form-grid two"><label>茶期・収穫名<input required value={harvestForm.season} onChange={e=>setHarvestForm({...harvestForm,season:e.target.value})} placeholder="一番茶"/></label><label>摘採方法<input value={harvestForm.harvestMethod} onChange={e=>setHarvestForm({...harvestForm,harvestMethod:e.target.value})} placeholder="手摘み / ハサミ摘み"/></label></div>
        <div className="form-grid two"><label>開始予定日<input type="date" value={harvestForm.plannedStartDate} onChange={e=>setHarvestForm({...harvestForm,plannedStartDate:e.target.value})}/></label><label>終了予定日<input type="date" value={harvestForm.plannedEndDate} onChange={e=>setHarvestForm({...harvestForm,plannedEndDate:e.target.value})}/></label></div>
        <label>状態<select value={harvestForm.status} onChange={e=>setHarvestForm({...harvestForm,status:e.target.value})}><option value="planned">予定</option><option value="completed">実施済</option><option value="cancelled">中止</option></select></label>
        <label>備考<textarea rows={3} value={harvestForm.note} onChange={e=>setHarvestForm({...harvestForm,note:e.target.value})}/></label>
        <div className="calendar-modal-actions">{harvestId&&<button type="button" className="danger-text-button" onClick={()=>void removeHarvest()} disabled={busy}><Trash2 size={16}/>削除</button>}<button className="primary-button" disabled={busy}>{busy?'保存中…':'保存'}</button></div>
      </form>
    </section></div>}
  </div>
}
