import { uploadExternalFile } from './externalStorage'
import type { DocumentType } from './documents'

type PdfArchiveInput = {
  documentType: DocumentType
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

async function waitForPreviewAssets(element: HTMLElement) {
  if ('fonts' in document) {
    try { await document.fonts.ready } catch { /* no-op */ }
  }
  const images = Array.from(element.querySelectorAll('img'))
  await Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const finish = () => resolve()
      img.addEventListener('load', finish, { once: true })
      img.addEventListener('error', finish, { once: true })
      window.setTimeout(finish, 2500)
    })
  }))
}

export async function createSalesDocumentPdfFile(input: PdfArchiveInput) {
  const preview = document.querySelector<HTMLElement>('.document-preview-print')
  if (!preview) throw new Error('帳票プレビューを取得できませんでした。帳票画面を開いた状態で再実行してください。')

  await waitForPreviewAssets(preview)
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const canvas = await html2canvas(preview, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = 210
  const pageHeight = 297
  const imageHeight = canvas.height * pageWidth / canvas.width
  const image = canvas.toDataURL('image/jpeg', 0.92)
  const pageCount = Math.max(1, Math.ceil(imageHeight / pageHeight))

  for (let page = 0; page < pageCount; page += 1) {
    if (page > 0) pdf.addPage('a4', 'portrait')
    pdf.addImage(image, 'JPEG', 0, -(page * pageHeight), pageWidth, imageHeight, undefined, 'FAST')
  }

  const label = input.documentType === 'INVOICE' ? '請求書' : '納品書'
  const fileName = `${label}_${safeFilePart(input.documentNo)}_${safeFilePart(input.customerName)}.pdf`
  const blob = pdf.output('blob')
  return new File([blob], fileName, { type: 'application/pdf', lastModified: Date.now() })
}

export async function archiveSalesDocumentPdf(documentId: string, input: PdfArchiveInput) {
  const file = await createSalesDocumentPdfFile(input)
  return uploadExternalFile({
    file,
    category: input.documentType === 'INVOICE' ? '請求書' : '納品書',
    entityType: 'sales_document',
    entityId: documentId,
    note: '帳票発行時に自動保存',
  })
}
