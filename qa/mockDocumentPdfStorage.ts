// QA-only no-op: never generates PDF bytes or connects to OneDrive.
export async function loadSalesDocumentStorageMap(){return {}}
export async function saveDocumentPdfToOneDrive():Promise<never> {
 throw new Error('禁止：本番ストレージ操作はQAで無効です')
}
