// Synthetic CRM fixture: unsafe external operations are unavailable.
export function crmSenderAddress(value:string){return value.trim().toLowerCase()}
export async function blockCrmSender(){throw Error('QA sender blocking disabled')}
export async function setCrmInquiryExcluded(){throw Error('QA mail exclusion disabled')}
