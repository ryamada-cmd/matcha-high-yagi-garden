// Real OneDrive and uploaded-file integration cannot be used by synthetic QA.
export async function loadVendorDocumentMap(){return {}}
export async function uploadVendorDocument():Promise<never>{
 throw Error('外部保存は合成テストで禁止されています')
}
