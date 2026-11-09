// Local synthetic-only CRM: no production credentials, network, or Supabase imports.
export const PRIMARY_INQUIRY_RECIPIENTS=['info@matchahigh.jp','info@godaimeyagiichibei.com']
export const CATEGORIES={purchase:'商品購入',wholesale:'業務用卸売',oem:'OEM・PB',export:'海外輸出',sample:'商品サンプル',other:'その他'}
export const STAGES={new:'新規受付',qualifying:'要件確認',sampling:'サンプル対応',quoted:'見積提出',negotiating:'条件交渉',won:'受注',lost:'失注',on_hold:'保留'}
export const WAITING={our_team:'自社対応待ち',customer:'顧客返信待ち',none:'対応完了'}
export const PRIORITIES={high:'高',normal:'通常',low:'低'}
const inquiries:any[]=[]
const companies:any[]=[]
const contacts:any[]=[]
const created='2026-11-10T00:00:00.000Z'
export async function loadCrm(){return {
 inquiries:inquiries.map(x=>({...x})),
 companies:companies.map(x=>({...x})),contacts:contacts.map(x=>({...x})),
 assignees:[{id:'qa-user',display_name:'架空担当者'}]
}}
export async function loadCrmMailboxes(){return []}
export async function loadInquiryHistory(){return {messages:[],activities:[],attachments:[]}}
export async function saveInquiry(id:any,payload:any){
 const next=id||'qa-inquiry-'+(inquiries.length+1)
 const data={id:next,...payload,created_at:created,updated_at:created,
 excluded_at:null,excluded_reason:null,excluded_by:null,mailbox_id:null,
 last_message_at:null,first_received_at:null}
 const i=inquiries.findIndex(x=>x.id===next); if(i<0)inquiries.unshift(data);else inquiries[i]=data
 ;(window as any).__qa_crm_inquiry={...data}
 return next
}
export async function saveCompany(id:any,data:any){
 const next=id||'qa-company-'+(companies.length+1)
 const item={id:next,...data,region:null,address:null,phone:null}
 const i=companies.findIndex(x=>x.id===next)
 if(i<0)companies.push(item);else companies[i]=item
 ;(window as any).__qa_crm_company={...item}
 return next
}
export async function saveContact(id:any,data:any){
 const next=id||'qa-contact-'+(contacts.length+1)
 const item={id:next,...data}
 const i=contacts.findIndex(x=>x.id===next)
 if(i<0)contacts.push(item);else contacts[i]=item
 ;(window as any).__qa_crm_contact={...item}
 return next
}
export async function addActivity(){return 'qa-activity'}
export async function invokeCrmMail(action:string){
 if(action==='status')return {ready:false,missing:['SYNTHETIC TEST ONLY']}
 throw Error('QAではメール連携は利用できません')
}
export async function updateCrmMailbox(){throw Error('QAではメール連携を変更できません')}
