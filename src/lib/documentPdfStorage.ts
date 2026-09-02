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

/**
 * html2canvas internally clones the document and can re-evaluate responsive CSS
 * against a different viewport. That made an archived PDF look different from
 * the A4 preview that the user approved on screen (especially on mobile).
 *
 * Freeze every computed style from the visible preview onto an off-screen clone
 * so the PDF renderer receives the exact same typography, spacing, table layout,
 * borders and colors regardless of device width or later global CSS changes.
 */
function createFrozenPreviewClone(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement
  const sourceNodes: Element[] = [source, ...Array.from(source.querySelectorAll('*'))]
  const cloneNodes: Element[] = [clone, ...Array.from(clone.querySelectorAll('*'))]

  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index]
    if (!(cloneNode instanceof HTMLElement || cloneNode instanceof SVGElement)) return
    const computed = window.getComputedStyle(sourceNode)
    for (const property of Array.from(computed)) {
      cloneNode.style.setProperty(property, computed.getPropertyValue(property), 'important')
    }
  })

  // The preview's outer shadow is application chrome, not part of the invoice.
  clone.style.setProperty('box-shadow', 'none', 'important')
  clone.style.setProperty('margin', '0', 'important')
  clone.style.setProperty('transform', 'none', 'important')
  clone.style.setProperty('transform-origin', 'top left', 'important')

  const sandbox = document.createElement('div')
  sandbox.setAttribute('aria-hidden', 'true')
  sandbox.style.cssText = [
    'position:fixed',
    'left:-100000px',
    'top:0',
    'z-index:-2147483648',
    'pointer-events:none',
    'overflow:visible',
    'background:#fff',
    `width:${Math.max(source.scrollWidth, Math.ceil(source.getBoundingClientRect().width))}px`,
  ].join(';')
  sandbox.appendChild(clone)
  document.body.appendChild(sandbox)

  return { clone, sandbox }
}

export async function createDocumentPdfBlob(element: HTMLElement) {
  if ('fonts' in document) {
    try { await document.fonts.ready } catch { /* font fallback is acceptable */ }
  }
  await waitForImages(element)

  const { clone, sandbox } = createFrozenPreviewClone(element)
  try {
    await waitForImages(clone)
    // Give the browser one paint cycle after inserting the frozen clone.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    const captureWidth = Math.max(1, clone.scrollWidth, Math.ceil(clone.getBoundingClientRect().width))
    const captureHeight = Math.max(1, clone.scrollHeight, Math.ceil(clone.getBoundingClientRect().height))
    const canvas = await html2canvas(clone, {
      backgroundColor: '#ffffff',
      scale: Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)),
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
    })

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const renderedHeight = canvas.height * pageWidth / canvas.width
    const pageCount = Math.max(1, Math.ceil(renderedHeight / pageHeight - 0.0001))
    const image = canvas.toDataURL('image/png')

    // Preserve A4 preview scale. Do not shrink the whole document to fit one page.
    for (let page = 0; page < pageCount; page += 1) {
      if (page > 0) pdf.addPage('a4', 'portrait')
      pdf.addImage(image, 'PNG', 0, -(page * pageHeight), pageWidth, renderedHeight, undefined, 'FAST')
    }

    return pdf.output('blob')
  } finally {
    sandbox.remove()
  }
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
    note: input.isRevision ? '帳票再発行時PDF自動保存（プレビュー同一レイアウト）' : '帳票発行時PDF自動保存（プレビュー同一レイアウト）',
  })
  return toStorageLink(result.file)
}
