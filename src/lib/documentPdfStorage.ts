import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { loadExternalFiles, uploadExternalFile, type ExternalFileRow } from './externalStorage'
import type { DocumentType } from './documents'

export type DocumentStorageLink = {
  fileId: string
  fileName: string
  webUrl: string
  folderPath: string
  uploadedAt: string
}

export type DocumentStorageMap = Record<string, DocumentStorageLink>

function safeFilePart(value: string, fallback: string) {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || fallback).slice(0, 80)
}

function revisionStamp() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${map.year}${map.month}${map.day}${map.hour}${map.minute}`
}

async function waitForImages(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll('img'))
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const finish = () => resolve()
      image.addEventListener('load', finish, { once: true })
      image.addEventListener('error', finish, { once: true })
      window.setTimeout(finish, 3000)
    })
  }))
}

export async function createDocumentPdfBlob(element: HTMLElement) {
  if ('fonts' in document) {
    try { await document.fonts.ready } catch { /* font fallback is acceptable */ }
  }
  await waitForImages(element)

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: Math.min(2, Math.max(1.4, window.devicePixelRatio || 1)),
    useCORS: true,
    logging: false,
    scrollX: 0,
    scrollY: -window.scrollY,
  })

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
  const width = canvas.width * ratio
  const height = canvas.height * ratio
  const x = Math.max(0, (pageWidth - width) / 2)
  const y = Math.max(0, (pageHeight - height) / 2)
  const image = canvas.toDataURL('image/jpeg', 0.94)
  pdf.addImage(image, 'JPEG', x, y, width, height, undefined, 'FAST')
  return pdf.output('blob')
}

export async function loadSalesDocumentStorageMap(limit = 500): Promise<DocumentStorageMap> {
  const files = await loadExternalFiles(limit)
  const map: DocumentStorageMap = {}
  for (const file of files) {
    for (const link of file.external_file_links || []) {
      if (link.entity_type !== 'sales_document' || !link.entity_id || map[link.entity_id]) continue
      map[link.entity_id] = toStorageLink(file)
    }
  }
  return map
}

function toStorageLink(file: ExternalFileRow): DocumentStorageLink {
  return {
    fileId: file.id,
    fileName: file.file_name,
    webUrl: file.web_url || '',
    folderPath: file.folder_path || '',
    uploadedAt: file.uploaded_at,
  }
}

export async function saveDocumentPdfToOneDrive(input: {
  documentId: string
  documentType: DocumentType
  documentNo: string
  customerName: string
  previewElement: HTMLElement
  isRevision?: boolean
}) {
  const blob = await createDocumentPdfBlob(input.previewElement)
  const typeLabel = input.documentType === 'INVOICE' ? '請求書' : '納品書'
  const customer = safeFilePart(input.customerName, '取引先')
  const number = safeFilePart(input.documentNo, '番号未設定')
  const revision = input.isRevision ? `_更新_${revisionStamp()}` : ''
  const fileName = `${typeLabel}_${number}_${customer}${revision}.pdf`
  const file = new File([blob], fileName, { type: 'application/pdf' })
  const result = await uploadExternalFile({
    file,
    category: typeLabel,
    entityType: 'sales_document',
    entityId: input.documentId,
    note: input.isRevision ? '帳票再発行時PDF自動保存' : '帳票発行時PDF自動保存',
  })
  return toStorageLink(result.file)
}
