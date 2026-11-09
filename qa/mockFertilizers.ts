// Synthetic-only fertilizer master for Astryx browser QA: no Supabase imports.
type Fertilizer = {
 id:string;legacyId:string;name:string;manufacturer:string;category:string;
 n:number;p:number;k:number;mg:number;ca:number;note:string;active:boolean;
 officialRegistrationId:string;officialRegistrationNo:string;officialSourceDate:string
};
const rows:Fertilizer[]=[
 {id:'qa-fert-a',legacyId:'QA-FERT-A',name:'架空肥料A',manufacturer:'架空メーカー',category:'有機肥料',n:9,p:5,k:5,mg:1,ca:0,note:'',active:true,officialRegistrationId:'',officialRegistrationNo:'',officialSourceDate:''},
 {id:'qa-fert-b',legacyId:'QA-FERT-B',name:'架空肥料B',manufacturer:'架空メーカー',category:'化成肥料',n:12,p:8,k:7,mg:0,ca:0,note:'テスト用',active:false,officialRegistrationId:'',officialRegistrationNo:'',officialSourceDate:''}
];
const official=[{
 id:'qa-official-a',registrationNo:'QA-2026',registrationCategory:'登録',
 name:'架空公式肥料C',company:'架空メーカーC',type:'配合肥料',
 registrationDate:'2026-01-01',expirationDate:'2030-01-01',validPeriod:'4年',
 address:'サンプル住所',lapseStatus:'',components:{窒素:7,リン酸:5,加里:5},
 sourceDate:'2026-11-01',sourceUrl:'',n:7,p:5,k:5,mg:1,ca:0
}];
export async function loadFertilizers(){return rows.map(x=>({...x}))}
export async function loadOfficialFertilizerMeta(){return {count:1,sourceDate:'2026-11-01',rowCount:1,completedAt:'2026-11-01T00:00:00Z'}}
export async function searchOfficialFertilizers(query='',_limit=100,_offset=0){
 const q=query.toLowerCase();
 return official.filter(x=>(x.name+' '+x.company+' '+x.registrationNo).toLowerCase().includes(q)).map(x=>({...x}))
}
export async function saveFertilizer(input:any){
 const index=rows.findIndex(x=>x.id===input.id);
 if(index<0){
  const id='qa-fert-'+(rows.length+1);
  rows.push({...input,id,legacyId:'QA-FERT-NEW',officialRegistrationId:input.officialRegistrationId||'',officialRegistrationNo:'',officialSourceDate:''});
  (window as any).__qa_fertilizer_create={...input,id};
  return id;
 }
 rows[index]={...rows[index],...input};
 (window as any).__qa_fertilizer_update={...input};
 return input.id;
}
export async function syncOfficialFertilizers():Promise<never>{throw new Error('Synthetic QA must not call official sync')}
