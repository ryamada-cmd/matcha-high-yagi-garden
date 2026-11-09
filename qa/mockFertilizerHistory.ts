// Synthetic read-only fertilizer history + yearly nutrient summaries.
const fertilizer={id:'qa-fert-1',name:'架空肥料A',legacyId:'QA-FERT-A'}
const field={id:'qa-field-1',legacyId:'QA-A',name:'架空茶園A',location:'架空地域'}
const apps:any[]=[
 {id:'qa-app-1',legacyId:'QA-FAPP-001',date:'2026-11-03',
  operator:'架空担当者',method:'手散布',weather:'晴',note:'架空施肥のみ',
  totalKg:20,nKg:2,pKg:1,kKg:1,
  lines:[{id:'qa-line-1',fertilizerId:'qa-fert-1',fieldId:'qa-field-1',
    fieldLegacyId:'QA-A',fieldName:'架空茶園A',fertilizerName:'架空肥料A',
    amountKg:20,rateKgPer10a:5,nKg:2,pKg:1,kKg:1}]}
]
const copy=(v:any)=>JSON.parse(JSON.stringify(v))
export async function loadFertilizerApplications(){return copy(apps)}
export async function loadFertilizers(){return [{...fertilizer}]}
export async function loadFertilizerFields(){return [{...field}]}
export async function loadFertilizerNpkByField(){return [{
 fieldId:field.id,legacyId:field.legacyId,fieldName:field.name,location:field.location,
 fertilizerKg:20,nKg:2,pKg:1,kKg:1
}]}
export async function deleteFertilizerApplication():Promise<never>{throw Error('Deletion disabled for synthetic QA')}
