import { uploadExternalFile } from './externalStorage'
import { createDocumentPdfBlob } from './documentPdfStorage'
import type { DocumentLanguage, DocumentType } from './documents'

type PdfArchiveInput = {
  documentType: DocumentType
  documentLanguage: DocumentLanguage
  documentNo: string
  customerName: string
}

function safeFilePart(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|#%{}~&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || '取引先'
}

// Use the same A4 pagination as the OneDrive PDF archive.
export async function createSalesDocumentPdfFile(input: PdfArchiveInput) {
  const preview = document.querySelector<HTMLElement>('.document-preview-print')
  if (!preview) throw new Error('帳票プレビューを取得できませんでした。帳票画面を開いた状態で再実行してください。')
  const blob = await createDocumentPdfBlob(preview)

  const label = input.documentLanguage==='EN' ? (input.documentType==='ESTIMATE'?'Estimate':input.documentType==='INVOICE'?'Invoice':'Delivery_Note') : (input.documentType === 'ESTIMATE' ? '見積書' : input.documentType === 'INVOICE' ? '請求書' : '納品書')
  const fileName = `${label}_${safeFilePart(input.documentNo)}_${safeFilePart(input.customerName)}.pdf`
  return new File([blob], fileName, { type: 'application/pdf', lastModified: Date.now() })
}

export async function archiveSalesDocumentPdf(documentId: string, input: PdfArchiveInput) {
  const file = await createSalesDocumentPdfFile(input)
  return uploadExternalFile({
    file,
    category: input.documentLanguage==='EN' ? (input.documentType==='ESTIMATE'?'Estimate':input.documentType==='INVOICE'?'Invoice':'Delivery Note') : (input.documentType === 'ESTIMATE' ? '見積書' : input.documentType === 'INVOICE' ? '請求書' : '納品書'),
    entityType: 'sales_document',
    entityId: documentId,
    note: '帳票発行時に自動保存',
  })
}
