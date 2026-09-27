export type DocumentOcrKind='EXPENSE_RECEIPT'|'VENDOR_INVOICE'|'PAYMENT_PROOF'
export type DocumentOcrItem={description:string;quantity:number;unitPriceYen:number;taxRate:number}
export type DocumentOcrResult={
  kind:DocumentOcrKind
  rawText:string
  confidence:number
  vendor:string
  documentNo:string
  date:string
  dueDate:string
  totalYen:number
  referenceNo:string
  paymentMethod:string
  suggestedCategory:string
  items:DocumentOcrItem[]
  warnings:string[]
}

const TESSERACT_URL='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js'
const PDFJS_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs'
const PDF_WORKER_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs'
const MAX_PDF_PAGES=5
const MAX_IMAGE_DIMENSION=2400

type ProgressCallback=(progress:number,message:string)=>void

const normalizeLine=(value:string)=>value.normalize('NFKC').replace(/[\t ]+/g,' ').trim()
const normalizeText=(value:string)=>value.normalize('NFKC').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()

function toIsoDate(year:number,month:number,day:number){
  if(year<100)year+=year>=70?1900:2000
  if(year<2000||year>2100||month<1||month>12||day<1||day>31)return''
  const d=new Date(Date.UTC(year,month-1,day))
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return''
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function findDate(text:string,labels:string[]=[]){
  const lines=text.split('\n').map(normalizeLine).filter(Boolean)
  const ordered=[...lines.filter(line=>labels.some(label=>line.toLowerCase().includes(label.toLowerCase()))),...lines]
  for(const line of ordered){
    let m=line.match(/(20\d{2}|19\d{2})\s*[年./\-]\s*(\d{1,2})\s*[月./\-]\s*(\d{1,2})\s*日?/)
    if(m){const iso=toIsoDate(Number(m[1]),Number(m[2]),Number(m[3]));if(iso)return iso}
    m=line.match(/\b(\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})\b/)
    if(m){const iso=toIsoDate(Number(m[1]),Number(m[2]),Number(m[3]));if(iso)return iso}
  }
  return''
}

function amountsFromLine(line:string){
  const found:number[]=[]
  const regex=/(?:JPY|￥|¥)?\s*([0-9０-９][0-9０-９,，.．]*)\s*(?:円)?/gi
  for(const match of line.matchAll(regex)){
    const raw=match[1].normalize('NFKC').replace(/[,，]/g,'')
    const value=Number(raw)
    if(Number.isFinite(value)&&value>=1&&value<=1_000_000_000)found.push(Math.round(value))
  }
  return found
}

function findTotal(text:string){
  const lines=text.split('\n').map(normalizeLine).filter(Boolean)
  const priority=['ご請求金額','請求金額','請求額','領収金額','お支払金額','お買上金額','合計金額','税込合計','総合計','合計','total','amount due','grand total']
  for(const label of priority){
    for(const line of lines){
      if(!line.toLowerCase().includes(label.toLowerCase()))continue
      const values=amountsFromLine(line)
      if(values.length)return Math.max(...values)
    }
  }
  const currencyLines=lines.filter(line=>/[￥¥円]|\bJPY\b/i.test(line))
  const currencyValues=currencyLines.flatMap(amountsFromLine).filter(v=>v>=10)
  if(currencyValues.length)return Math.max(...currencyValues)
  const all=lines.flatMap(amountsFromLine).filter(v=>v>=100)
  return all.length?Math.max(...all):0
}

function findVendor(text:string){
  const lines=text.split('\n').map(normalizeLine).filter(Boolean).slice(0,18)
  const company=/株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|農業協同組合|\bJA\b|商店|ストア|スーパー|薬局|ホームセンター|センター|company|corporation|corp\.?|co\.,?\s*ltd\.?|llc|inc\.?/i
  const excluded=/領収書|請求書|invoice|receipt|納品書|明細|合計|〒|tel|fax|登録番号|no\.?\s*[:：]?\s*\d/i
  const hit=lines.find(line=>company.test(line)&&!excluded.test(line))
  if(hit)return hit.replace(/^(?:発行元|請求元|vendor|from)\s*[:：]?\s*/i,'').slice(0,120)
  const fallback=lines.find(line=>line.length>=3&&line.length<=80&&!excluded.test(line)&&!/^\d[\d\s/.-]+$/.test(line)&&!/^[￥¥\d,.円 ]+$/.test(line))
  return fallback||''
}

function findDocumentNo(text:string){
  const lines=text.split('\n').map(normalizeLine).filter(Boolean)
  const patterns=[
    /(?:請求書番号|請求番号|伝票番号|invoice\s*(?:no|number)|document\s*no|no\.)\s*[:：#]?\s*([A-Z0-9][A-Z0-9_./\-]{2,})/i,
    /(?:受付番号|取引番号|照会番号|reference\s*(?:no|number))\s*[:：#]?\s*([A-Z0-9][A-Z0-9_./\-]{2,})/i,
  ]
  for(const line of lines)for(const pattern of patterns){const m=line.match(pattern);if(m)return m[1].trim()}
  return''
}

function findReferenceNo(text:string){
  const lines=text.split('\n').map(normalizeLine).filter(Boolean)
  for(const line of lines){
    const m=line.match(/(?:受付番号|取引番号|照会番号|振込番号|reference\s*(?:no|number)|transaction\s*(?:id|no))\s*[:：#]?\s*([A-Z0-9][A-Z0-9_./\-]{2,})/i)
    if(m)return m[1].trim()
  }
  return''
}

function inferPaymentMethod(text:string){
  if(/クレジット|credit\s*card|visa|mastercard|amex/i.test(text))return'クレジットカード'
  if(/口座振替|direct\s*debit/i.test(text))return'口座振替'
  if(/現金|cash/i.test(text))return'現金'
  if(/振込|振替|bank\s*transfer|remittance/i.test(text))return'銀行振込'
  return''
}

function inferCategory(text:string){
  if(/肥料|窒素|リン酸|加里|化成|堆肥/i.test(text))return'FERTILIZER'
  if(/農薬|殺虫|殺菌|除草|ダニ|乳剤|水和剤|フロアブル/i.test(text))return'PESTICIDE'
  if(/生葉|茶葉/i.test(text))return'FRESH_LEAF'
  if(/碾茶|てん茶/i.test(text)&&/加工/i.test(text))return'TENCHA_PROCESSING'
  if(/抹茶/i.test(text)&&/(加工|粉砕|石臼)/i.test(text))return'MATCHA_PROCESSING'
  if(/送料|運賃|配送|shipping|freight/i.test(text))return'SHIPPING'
  if(/修理|整備|repair|maintenance/i.test(text))return'REPAIR'
  if(/外注|委託/i.test(text))return'OUTSOURCING'
  if(/包材|包装|缶|袋|ラベル|資材/i.test(text))return'PACKAGING'
  return'OTHER'
}

function extractItems(text:string,totalYen:number):DocumentOcrItem[]{
  const lines=text.split('\n').map(normalizeLine).filter(Boolean)
  const candidates:DocumentOcrItem[]=[]
  const excluded=/合計|小計|税|消費税|釣銭|お預り|請求金額|領収金額|total|subtotal|tax|〒|tel|fax/i
  for(const line of lines){
    if(excluded.test(line)||line.length<4)continue
    const values=amountsFromLine(line)
    if(!values.length)continue
    const amount=values[values.length-1]
    if(amount<=0||amount===totalYen)continue
    const desc=line.replace(/(?:JPY|￥|¥)?\s*[0-9０-９][0-9０-９,，.．]*\s*(?:円)?\s*$/i,'').replace(/\s+/g,' ').trim()
    if(desc.length<2||/^\d/.test(desc))continue
    candidates.push({description:desc.slice(0,120),quantity:1,unitPriceYen:amount,taxRate:/8\s*%|軽減/.test(line)?8:10})
    if(candidates.length>=8)break
  }
  return candidates
}

function parseResult(text:string,kind:DocumentOcrKind,confidence:number):DocumentOcrResult{
  const normalized=normalizeText(text)
  const totalYen=findTotal(normalized)
  const dateLabels=kind==='PAYMENT_PROOF'?['支払日','振込日','受付日','payment date','date']:kind==='VENDOR_INVOICE'?['請求日','発行日','invoice date','date']:['購入日','領収日','発行日','日付','date']
  const dueLabels=['支払期限','お支払期限','payment due','due date']
  const items=extractItems(normalized,totalYen)
  return{
    kind,
    rawText:normalized,
    confidence:Math.round(Math.max(0,Math.min(100,confidence||0))),
    vendor:kind==='PAYMENT_PROOF'?'':findVendor(normalized),
    documentNo:kind==='VENDOR_INVOICE'?findDocumentNo(normalized):'',
    date:findDate(normalized,dateLabels),
    dueDate:kind==='VENDOR_INVOICE'?findDate(normalized,dueLabels):'',
    totalYen,
    referenceNo:kind==='PAYMENT_PROOF'?findReferenceNo(normalized):'',
    paymentMethod:kind==='PAYMENT_PROOF'?inferPaymentMethod(normalized):'',
    suggestedCategory:kind==='VENDOR_INVOICE'?inferCategory(normalized):'OTHER',
    items,
    warnings:[],
  }
}

async function imageFileToCanvas(file:File){
  const url=URL.createObjectURL(file)
  try{
    const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
      const img=new Image()
      img.onload=()=>resolve(img)
      img.onerror=()=>reject(new Error('画像を読み込めませんでした。JPEG/PNG/WebPまたはPDFをお試しください。'))
      img.src=url
    })
    const scale=Math.min(1,MAX_IMAGE_DIMENSION/Math.max(image.naturalWidth,image.naturalHeight))
    const canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale))
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale))
    const ctx=canvas.getContext('2d',{willReadFrequently:true})
    if(!ctx)throw new Error('画像解析を開始できませんでした。')
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height)
    ctx.drawImage(image,0,0,canvas.width,canvas.height)
    return canvas
  }finally{URL.revokeObjectURL(url)}
}

async function createOcrWorker(onProgress?:ProgressCallback){
  const mod:any=await import(/* @vite-ignore */ TESSERACT_URL)
  return mod.createWorker('jpn+eng',undefined,{logger:(m:any)=>{
    if(m?.status==='recognizing text'&&Number.isFinite(m.progress))onProgress?.(Math.round(Number(m.progress)*100),'文字を読み取っています…')
  }})
}

async function recognizeCanvas(canvas:HTMLCanvasElement,onProgress?:ProgressCallback){
  const worker=await createOcrWorker(onProgress)
  try{
    const result=await worker.recognize(canvas)
    return{text:String(result?.data?.text||''),confidence:Number(result?.data?.confidence||0)}
  }finally{await worker.terminate()}
}

async function recognizeImage(file:File,onProgress?:ProgressCallback){
  onProgress?.(5,'画像を準備しています…')
  const canvas=await imageFileToCanvas(file)
  onProgress?.(12,'OCRエンジンを準備しています…')
  return recognizeCanvas(canvas,onProgress)
}

async function recognizePdf(file:File,onProgress?:ProgressCallback){
  onProgress?.(3,'PDFを読み込んでいます…')
  const pdfjs:any=await import(/* @vite-ignore */ PDFJS_URL)
  pdfjs.GlobalWorkerOptions.workerSrc=PDF_WORKER_URL
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise
  const pageCount=Math.min(Number(pdf.numPages||0),MAX_PDF_PAGES)
  if(pageCount<1)throw new Error('PDFに読み取り可能なページがありません。')

  const digitalParts:string[]=[]
  for(let i=1;i<=pageCount;i++){
    const page=await pdf.getPage(i)
    const textContent=await page.getTextContent()
    const text=(textContent.items||[]).map((x:any)=>String(x.str||'')).join(' ')
    digitalParts.push(text)
  }
  const digital=normalizeText(digitalParts.join('\n'))
  if(digital.replace(/\s/g,'').length>=80){
    onProgress?.(100,'PDFの文字データを読み取りました。')
    return{text:digital,confidence:99}
  }

  const worker=await createOcrWorker((p,message)=>onProgress?.(Math.min(95,10+Math.round(p*.8)),message))
  const parts:string[]=[]
  const confidences:number[]=[]
  try{
    for(let i=1;i<=pageCount;i++){
      onProgress?.(10+Math.round((i-1)/pageCount*75),`PDF ${i}/${pageCount}ページを解析しています…`)
      const page=await pdf.getPage(i)
      const viewport=page.getViewport({scale:1.8})
      const scale=Math.min(1,MAX_IMAGE_DIMENSION/Math.max(viewport.width,viewport.height))
      const finalViewport=page.getViewport({scale:1.8*scale})
      const canvas=document.createElement('canvas')
      canvas.width=Math.max(1,Math.round(finalViewport.width))
      canvas.height=Math.max(1,Math.round(finalViewport.height))
      const ctx=canvas.getContext('2d',{willReadFrequently:true})
      if(!ctx)throw new Error('PDFページを画像化できませんでした。')
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height)
      await page.render({canvasContext:ctx,viewport:finalViewport}).promise
      const result=await worker.recognize(canvas)
      parts.push(String(result?.data?.text||''))
      confidences.push(Number(result?.data?.confidence||0))
    }
  }finally{await worker.terminate()}
  if(Number(pdf.numPages)>MAX_PDF_PAGES)onProgress?.(97,`先頭${MAX_PDF_PAGES}ページをOCRしました。`)
  return{text:normalizeText(parts.join('\n')),confidence:confidences.length?confidences.reduce((a,b)=>a+b,0)/confidences.length:0}
}

export function canOcrDocument(file:File){
  return file.type==='application/pdf'||file.type.startsWith('image/')||/\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(file.name)
}

export async function recognizeDocument(file:File,kind:DocumentOcrKind,onProgress?:ProgressCallback):Promise<DocumentOcrResult>{
  if(!canOcrDocument(file))throw new Error('OCRは画像またはPDFに対応しています。')
  if(file.size<=0)throw new Error('空のファイルは読み取れません。')
  if(file.size>25*1024*1024)throw new Error('OCR対象は1ファイル25MBまでです。')
  const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name)
  const recognized=isPdf?await recognizePdf(file,onProgress):await recognizeImage(file,onProgress)
  if(!recognized.text.trim())throw new Error('文字を読み取れませんでした。画像の向き・明るさ・解像度をご確認ください。')
  onProgress?.(100,'OCR完了')
  const result=parseResult(recognized.text,kind,recognized.confidence)
  if(isPdf&&result.rawText.length<80)result.warnings.push('PDFの文字量が少ないため、読取結果をご確認ください。')
  if(!result.totalYen)result.warnings.push('合計金額を特定できませんでした。')
  return result
}
