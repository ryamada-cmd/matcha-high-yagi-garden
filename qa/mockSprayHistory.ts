// Synthetic read-only spray history data. Never imports the real Supabase layer.
const rows:any[]=[
 {id:'qa-spray-1',legacyId:'QA-SPRAY-001',sprayDate:'2026-11-05',
  preparedL:120,target:'架空のハダニ防除',weather:'晴',temperatureC:'21',
  operator:'架空担当者',note:'架空圃場のみ',createdAt:'2026-11-05',
  chemicals:[{pesticideId:'qa-chem-1',pesticideName:'架空農薬A',dilution:2000,quantity:60,unit:'mL'}],
  fields:[{fieldId:'qa-field-1',legacyId:'QA-A',name:'架空茶園A',location:'架空地域',actualL:120}]},
 {id:'qa-spray-2',legacyId:'QA-SPRAY-002',sprayDate:'2026-11-07',
  preparedL:90,target:'架空の害虫対策',weather:'曇',temperatureC:'18',
  operator:'架空担当者B',note:'',createdAt:'2026-11-07',
  chemicals:[{pesticideId:'qa-chem-2',pesticideName:'架空農薬B',dilution:1000,quantity:90,unit:'mL'}],
  fields:[{fieldId:'qa-field-2',legacyId:'QA-B',name:'架空茶園B',location:'架空地域',actualL:90}]}
]
const copy=(x:any)=>JSON.parse(JSON.stringify(x))
export async function loadFullSprayHistory(){return {rows:copy(rows),role:'admin'}}
export function downloadSprayHistoryCsv(data:any[]){(window as any).__qa_spray_export=data.map(x=>x.legacyId)}
export async function deleteSpray():Promise<never>{throw Error('Synthetic QA must never delete live spray records')}
