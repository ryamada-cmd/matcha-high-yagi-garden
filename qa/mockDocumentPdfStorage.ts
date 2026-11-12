// QA-only archive metadata. No PDF upload or OneDrive connection.
const links: Record<string, {fileId:string;fileName:string;webUrl:string;folderPath:string;uploadedAt:string}> = {}
export async function loadSalesDocumentStorageMap(){return {...links}}
export async function saveDocumentPdfToOneDrive(input:{documentId:string;isRevision?:boolean;previewElement:HTMLElement}) {
 if (!new URLSearchParams(location.search).has('archiveTest')) {
  throw new Error('禁止：本番ストレージ操作はQAで無効です')
 }
 if (!input.previewElement.querySelector('.doc-seller img')) throw new Error('帳票プレビューにロゴがありません。')
 const version = input.isRevision ? 'updated' : 'original'
 const link = {
  fileId:version, fileName:version+'.pdf', webUrl:location.origin+'/qa/'+version+'.pdf',
  folderPath:'QA', uploadedAt:new Date().toISOString(),
 }
 links[input.documentId]=link
 return link
}
