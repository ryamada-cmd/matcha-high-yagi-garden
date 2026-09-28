export type DocumentOcrKind='EXPENSE_RECEIPT'|'VENDOR_INVOICE'|'PAYMENT_PROOF'
export type DocumentOcrItem={description:string;quantity:number;unit:string;unitPriceYen:number;lineTotalYen:number;taxRate:number;suggestedCategory:string}
export type DocumentOcrResult={
  kind:DocumentOcrKind
  rawText:string
  confidence:number
  vendor:string
  documentNo:string
  date:string
  dueDate:string
  subtotalYen:number
  taxYen:number
  totalYen:number
  referenceNo:string
  paymentMethod:string
  suggestedCategory:string
  items:DocumentOcrItem[]
  warnings:string[]
  engine?:'PDF_TEXT'|'OCR'
  model?:string
}

const TESSERACT_URL='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js'
const PDFJS_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs'
const PDF_WORKER_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs'
const MAX_PDF_PAGES=5
const MAX_IMAGE_DIMENSION=3400
const SUMMARY_PREFIX='[[SUMMARY]]'
const ITEM_PREFIX='[[ITEM]]'

type LayoutNode={str:string;x:number;y:number;w:number;h:number}
type LayoutLine={y:number;h:number;parts:LayoutNode[]}

type ProgressCallback=(progress:number,message:string)=>void

const circledMarks=['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳']
function normalizeNfkcPreservingMarks(value:string){
  let text=value
  circledMarks.forEach((mark,index)=>{text=text.replaceAll(mark,String.fromCharCode(0xE000+index))})
  text=text.normalize('NFKC')
  circledMarks.forEach((mark,index)=>{text=text.replaceAll(String.fromCharCode(0xE000+index),mark)})
  return text
}
const normalizeLine=(value:string)=>normalizeNfkcPreservingMarks(value).replace(/[\t ]+/g,' ').trim()
const normalizeText=(value:string)=>normalizeNfkcPreservingMarks(value).replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim()

function toIsoDate(year:number,month:number,day:number){
  if(year<100)year+=year>=70?1900:2000
  if(year<2000||year>2100||month<1||month>12||day<1||day>31)return''
  const d=new Date(Date.UTC(year,month-1,day))
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return''
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function datesFromLine(line:string){
  const dates:string[]=[]
  const normalized=normalizeLine(line)
  const full=/(20\d{2}|19\d{2})\s*[年./\-]\s*(\d{1,2})\s*[月./\-]\s*(\d{1,2})\s*日?/g
  for(const m of normalized.matchAll(full)){const iso=toIsoDate(Number(m[1]),Number(m[2]),Number(m[3]));if(iso&&!dates.includes(iso))dates.push(iso)}
  const short=/\b(\d{2})[/.-](\d{1,2})[/.-](\d{1,2})\b/g
  for(const m of normalized.matchAll(short)){const iso=toIsoDate(Number(m[1]),Number(m[2]),Number(m[3]));if(iso&&!dates.includes(iso))dates.push(iso)}
  return dates
}

function findDate(text:string,labels:string[]=[],fallback=true){
  const lines=text.split('\n').map(normalizeLine).filter(Boolean)
  if(labels.length){
    for(const line of lines){
      if(!labels.some(label=>line.toLowerCase().includes(label.toLowerCase())))continue
      const dates=datesFromLine(line);if(dates.length)return dates[0]
    }
    for(let i=0;i<lines.length;i++){
      if(!labels.some(label=>lines[i].toLowerCase().includes(label.toLowerCase())))continue
      for(let j=i+1;j<Math.min(lines.length,i+3);j++){const dates=datesFromLine(lines[j]);if(dates.length)return dates[0]}
    }
  }
  if(!fallback)return''
  for(const line of lines){const dates=datesFromLine(line);if(dates.length)return dates[0]}
  return''
}

function findInvoiceDate(text:string){
  const explicit=findDate(text,['請求日','発行日','作成日','invoice date'],false)
  if(explicit)return explicit
  const lines=text.split('\n').map(normalizeLine).filter(Boolean)
  for(let i=0;i<lines.length;i++){
    if(!/請求期間|請求対象期間|billing\s*period/i.test(lines[i]))continue
    const dates=[...datesFromLine(lines[i])]
    for(let j=i+1;j<Math.min(lines.length,i+3);j++)dates.push(...datesFromLine(lines[j]))
    if(dates.length)return dates[dates.length-1]
  }
  const candidates=lines.filter(line=>!/支払期限|お支払期限|due\s*date/i.test(line)).flatMap(datesFromLine)
  return candidates.length?[...candidates].sort().at(-1)||'':''
}

function parseMoney(value:string,allowZero=false){
  const raw=normalizeNfkcPreservingMarks(value).replace(/[￥¥円,，\s]/g,'').trim()
  if(!/^\d+(?:\.\d+)?$/.test(raw))return null
  const number=Number(raw)
  if(!Number.isFinite(number)||number<0||(!allowZero&&number<1)||number>1_000_000_000)return null
  return Math.round(number)
}

function amountsFromLine(line:string,allowZero=false){
  const found:number[]=[]
  const regex=/(?:JPY|￥|¥)?\s*([0-9０-９][0-9０-９,，.．]*)\s*(?:円)?/gi
  for(const match of line.matchAll(regex)){
    const value=parseMoney(match[1],allowZero)
    if(value!==null)found.push(value)
  }
  return found
}

const summaryAliases:{key:string;aliases:string[]}[]=[
  {key:'previous',aliases:['前回繰越','前月繰越']},
  {key:'payment',aliases:['入金額','ご入金額']},
  {key:'carryover',aliases:['繰越残高','差引残高']},
  {key:'subtotal',aliases:['お買上げ額','お買い上げ額','税抜合計','小計','subtotal']},
  {key:'tax',aliases:['消費税額','消費税','税額','tax']},
  {key:'total',aliases:['今回請求金額','今回御請求額','今回ご請求額','ご請求金額','請求金額','請求額','税込合計','総合計','grand total','amount due']},
]

function parseSummaryHints(text:string){
  const map=new Map<string,number>()
  for(const line of text.split('\n')){
    if(!line.startsWith(SUMMARY_PREFIX))continue
    const body=line.slice(SUMMARY_PREFIX.length).trim()
    const eq=body.indexOf('=')
    if(eq<1)continue
    const key=body.slice(0,eq).trim()
    const value=parseMoney(body.slice(eq+1),true)
    if(value!==null)map.set(key,value)
  }
  return map
}

function inferPlainSummary(text:string){
  const map=new Map<string,number>()
  const lines=text.split('\n').map(normalizeLine).filter(Boolean).filter(line=>!line.startsWith('[['))
  for(let i=0;i<lines.length;i++){
    const header=lines[i]
    const matched:string[]=[]
    for(const def of summaryAliases){
      if(def.aliases.some(alias=>header.replace(/\s/g,'').toLowerCase().includes(alias.replace(/\s/g,'').toLowerCase())))matched.push(def.key)
    }
    if(matched.length<3)continue
    for(let j=i+1;j<Math.min(lines.length,i+4);j++){
      const values=amountsFromLine(lines[j],true)
      if(values.length<Math.min(3,matched.length))continue
      const count=Math.min(matched.length,values.length)
      for(let k=0;k<count;k++)if(!map.has(matched[k]))map.set(matched[k],values[k])
      return map
    }
  }
  return map
}

function summaryValue(text:string,key:string){
  const hints=parseSummaryHints(text)
  if(hints.has(key))return hints.get(key)
  const inferred=inferPlainSummary(text)
  if(inferred.has(key))return inferred.get(key)
  return undefined
}

function findLabeledAmount(text:string,labels:string[]){
  const lines=text.split('\n').map(normalizeLine).filter(Boolean).filter(line=>!line.startsWith('[['))
  for(const label of labels){
    for(const line of lines){
      if(!line.toLowerCase().includes(label.toLowerCase()))continue
      const values=amountsFromLine(line)
      if(values.length)return values[values.length-1]
    }
  }
  for(const label of labels){
    for(let i=0;i<lines.length;i++){
      if(!lines[i].toLowerCase().includes(label.toLowerCase()))continue
      for(let j=i+1;j<Math.min(lines.length,i+3);j++){
        const values=amountsFromLine(lines[j])
        if(values.length===1)return values[0]
      }
    }
  }
  return 0
}

function findSubtotal(text:string){
  const summary=summaryValue(text,'subtotal')
  if(summary!==undefined)return summary
  return findLabeledAmount(text,['税抜合計','お買上げ額','お買い上げ額','小計','subtotal'])
}

function findTax(text:string){
  const summary=summaryValue(text,'tax')
  if(summary!==undefined)return summary
  return findLabeledAmount(text,['消費税額','消費税','税額','tax'])
}

function findTotal(text:string,subtotalYen=0,taxYen=0){
  const summaryTotal=summaryValue(text,'total')
  if(summaryTotal!==undefined&&summaryTotal>0)return summaryTotal
  const carryover=summaryValue(text,'carryover')
  if(subtotalYen>0&&carryover!==undefined)return carryover+subtotalYen+Math.max(0,taxYen)
  if(subtotalYen>0&&taxYen>0)return subtotalYen+taxYen
  const total=findLabeledAmount(text,['今回請求金額','今回御請求額','今回ご請求額','ご請求金額','請求金額','請求額','領収金額','お支払金額','合計金額','税込合計','総合計','grand total','amount due'])
  if(total)return total
  const lines=text.split('\n').map(normalizeLine).filter(Boolean).filter(line=>!line.startsWith('[['))
  const likely=lines.filter(line=>(/[￥¥円]|\bJPY\b|\d[,，]\d{3}/i.test(line))&&!/前回繰越|前月繰越|入金額|ご入金|繰越残高|差引残高|振込み|振込|相殺/i.test(line))
  const values=likely.flatMap(line=>amountsFromLine(line)).filter(v=>v>=100)
  return values.length?Math.max(...values):0
}

function cleanVendorLine(line:string){
  return line.replace(/^(?:発行元|請求元|販売元|vendor|from)\s*[:：]?\s*/i,'').replace(/\s{2,}/g,' ').trim().slice(0,120)
}

function findVendor(text:string){
  const lines=text.split('\n').map(normalizeLine).filter(Boolean).slice(0,32)
  for(const line of lines){
    const m=line.match(/^(?:発行元|請求元|販売元|vendor|from)\s*[:：]?\s*(.+)$/i)
    if(m&&m[1].trim())return cleanVendorLine(m[1])
  }
  const company=/株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|農業協同組合|\bJA\b|商店|商会|農園|茶園|製茶|ストア|スーパー|薬局|ホームセンター|センター|company|corporation|corp\.?|co\.,?\s*ltd\.?|llc|inc\.?/i
  const excluded=/領収書|請求書|invoice|receipt|納品書|明細|合計|〒|tel|fax|登録番号|銀行口座|普通預金|当座預金|名義人|請求期間|no\.?\s*[:：]?\s*\d/i
  const variants=lines.flatMap((line,index)=>{
    const parts=line.split(' ').filter(Boolean)
    const local=[line,...parts]
    for(let i=0;i<parts.length-1;i++)local.push(parts[i]+' '+parts[i+1])
    return [...new Set(local)].map(value=>({line:value,index}))
  })
  const candidates=variants.map(({line,index})=>{
    let score=0
    if(company.test(line))score+=5
    if(/御中|様\s*$/.test(line))score-=8
    if(excluded.test(line))score-=6
    if(/^\d[\d\s/.-]+$/.test(line)||/^[￥¥\d,.円 ]+$/.test(line))score-=5
    if(index<18)score+=1
    if(line.length>=3&&line.length<=80)score+=1
    if(line.split(' ').length===1&&company.test(line))score+=2
    return{line,score}
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)
  if(candidates.length)return cleanVendorLine(candidates[0].line)
  const fallback=lines.find(line=>line.length>=3&&line.length<=80&&!excluded.test(line)&&!/御中|様\s*$/.test(line)&&!/^\d[\d\s/.-]+$/.test(line)&&!/^[￥¥\d,.円 ]+$/.test(line))
  return fallback?cleanVendorLine(fallback):''
}

function findDocumentNo(text:string){
  const lines=text.split('\n').map(normalizeLine).filter(Boolean)
  const patterns=[
    /(?:請求書番号|請求番号|請求書\s*no\.?|invoice\s*(?:no|number)|document\s*no)\s*[:：#]?\s*([A-Z0-9][A-Z0-9_./\-]{2,})/i,
    /(?:invoice\s*#)\s*([A-Z0-9][A-Z0-9_./\-]{2,})/i,
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
  if(/農薬|殺虫|殺菌|除草|ダニ|ダ二|乳剤|水和剤|フロアブル|顆粒水和|ＳＥ|SE\b/i.test(text))return'PESTICIDE'
  if(/生葉|茶葉/i.test(text))return'FRESH_LEAF'
  if(/碾茶|てん茶/i.test(text)&&/加工/i.test(text))return'TENCHA_PROCESSING'
  if(/抹茶/i.test(text)&&/(加工|粉砕|石臼)/i.test(text))return'MATCHA_PROCESSING'
  if(/送料|運賃|配送|shipping|freight/i.test(text))return'SHIPPING'
  if(/修理|整備|repair|maintenance/i.test(text))return'REPAIR'
  if(/外注|委託/i.test(text))return'OUTSOURCING'
  if(/包材|包装|缶|袋|ラベル|資材/i.test(text))return'PACKAGING'
  return'OTHER'
}

function parseNumericToken(token:string){
  const raw=normalizeNfkcPreservingMarks(token).replace(/[￥¥円,，]/g,'').trim()
  if(!/^\d+(?:\.\d+)?$/.test(raw))return null
  const value=Number(raw)
  return Number.isFinite(value)?value:null
}

function cleanItemDescription(value:string){
  let text=value.replace(/^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}\s+/,'').replace(/^\d{5,}\s+/,'').trim()
  if(/ダ二/.test(text))text=text.replace(/ダ二/g,'ダニ')
  return text.replace(/\s+/g,' ').slice(0,180)
}

function extractHintItems(text:string):DocumentOcrItem[]{
  const out:DocumentOcrItem[]=[]
  for(const line of text.split('\n')){
    if(!line.startsWith(ITEM_PREFIX))continue
    const fields=line.slice(ITEM_PREFIX.length).replace(/^\t/,'').split('\t')
    if(fields.length<8)continue
    const rawDescription=fields[2],rawCapacity=fields[3],rawQty=fields[4],rawUnit=fields[5],rawUnitPrice=fields[6],rawAmount=fields[7]
    const description=cleanItemDescription([rawDescription,rawCapacity].map(normalizeLine).filter(Boolean).join(' / '))
    if(!description||/振込|振込み|入金|相殺|支払|繰越/i.test(description))continue
    const quantity=parseNumericToken(rawQty)
    const unitPrice=parseMoney(rawUnitPrice)
    const amount=parseMoney(rawAmount)
    if(quantity===null||quantity<=0||unitPrice===null||amount===null)continue
    if(Math.abs(quantity*unitPrice-amount)>Math.max(2,amount*.012))continue
    out.push({description,quantity,unit:normalizeLine(rawUnit),unitPriceYen:unitPrice,lineTotalYen:amount,taxRate:10,suggestedCategory:inferCategory(description)})
  }
  return out
}

function extractItems(text:string):DocumentOcrItem[]{
  const hinted=extractHintItems(text)
  if(hinted.length)return hinted
  const lines=text.split('\n').map(normalizeLine).filter(Boolean).filter(line=>!line.startsWith('[['))
  const candidates:DocumentOcrItem[]=[]
  const excluded=/合計|小計|税|消費税|釣銭|お預り|請求金額|領収金額|total|subtotal|tax|〒|tel|fax|前回繰越|入金額|繰越残高|銀行口座|登録番号|振込|振込み|相殺/i
  for(const line of lines){
    if(excluded.test(line)||line.length<4)continue
    const tokens=line.split(' ').filter(Boolean)
    if(tokens.length<4)continue
    const amount=parseNumericToken(tokens[tokens.length-1])
    const unitPrice=parseNumericToken(tokens[tokens.length-2])
    if(amount===null||unitPrice===null||amount<=0||unitPrice<=0)continue
    const unitPriceIndex=tokens.length-2
    let quantityIndex=-1,quantity=0
    for(let i=unitPriceIndex-1;i>=Math.max(0,unitPriceIndex-5);i--){
      const value=parseNumericToken(tokens[i])
      if(value!==null&&value>0&&value<=100000){quantityIndex=i;quantity=value;break}
    }
    if(quantityIndex<0)continue
    if(Math.abs(quantity*unitPrice-amount)>Math.max(2,amount*.012))continue
    const description=cleanItemDescription(tokens.slice(0,quantityIndex).join(' '))
    if(description.length<2||/^\d+$/.test(description))continue
    const unit=tokens.slice(quantityIndex+1,unitPriceIndex).join(' ').slice(0,30)
    const taxRate=/8\s*%|軽減/.test(line)?8:10
    candidates.push({description,quantity,unit,unitPriceYen:Math.round(unitPrice),lineTotalYen:Math.round(amount),taxRate,suggestedCategory:inferCategory(description)})
    if(candidates.length>=40)break
  }
  return candidates
}

function approxEqual(a:number,b:number,tolerance=2){return Math.abs(a-b)<=Math.max(tolerance,Math.max(a,b)*.002)}

function makeInvoiceItemsTaxInclusive(items:DocumentOcrItem[],subtotalYen:number,taxYen:number,totalYen:number){
  if(!items.length||!subtotalYen||!taxYen||!totalYen)return{items,warnings:[] as string[]}
  const itemSubtotal=items.reduce((sum,item)=>sum+item.lineTotalYen,0)
  if(!approxEqual(itemSubtotal,subtotalYen)||!approxEqual(subtotalYen+taxYen,totalYen))return{items,warnings:[] as string[]}
  const inferredRate=taxYen/subtotalYen*100
  const taxRate=Math.abs(inferredRate-10)<.5?10:Math.abs(inferredRate-8)<.5?8:Math.round(inferredRate*10)/10
  const converted=items.map(item=>{
    const unitPriceYen=Math.round(item.unitPriceYen*(1+taxYen/subtotalYen))
    return{...item,unitPriceYen,lineTotalYen:Math.round(item.quantity*unitPriceYen),taxRate}
  })
  const convertedTotal=converted.reduce((sum,item)=>sum+item.lineTotalYen,0)
  if(approxEqual(convertedTotal,totalYen,1)){
    return{items:converted,warnings:['税抜単価＋消費税の請求書だったため、登録用の税込単価へ換算しました。']}
  }
  return{items:[...items,{description:'消費税',quantity:1,unit:'式',unitPriceYen:taxYen,lineTotalYen:taxYen,taxRate:0,suggestedCategory:'OTHER'}],warnings:['消費税を独立明細として追加しました。税込単価への自動換算は端数差のため行っていません。']}
}

function parseResult(text:string,kind:DocumentOcrKind,confidence:number,engine:'PDF_TEXT'|'OCR'='OCR'):DocumentOcrResult{
  const normalized=normalizeText(text)
  const subtotalYen=kind==='VENDOR_INVOICE'?findSubtotal(normalized):0
  const taxYen=kind==='VENDOR_INVOICE'?findTax(normalized):0
  const totalYen=findTotal(normalized,subtotalYen,taxYen)
  const dateLabels=kind==='PAYMENT_PROOF'?['支払日','振込日','受付日','payment date','date']:['購入日','領収日','発行日','日付','date']
  const dueLabels=['支払期限','お支払期限','payment due','due date']
  let items=extractItems(normalized)
  const warnings:string[]=[]
  if(kind==='VENDOR_INVOICE'){
    const normalizedItems=makeInvoiceItemsTaxInclusive(items,subtotalYen,taxYen,totalYen)
    items=normalizedItems.items
    warnings.push(...normalizedItems.warnings)
  }
  const vendor=kind==='PAYMENT_PROOF'?'':findVendor(normalized)
  const explicitInvoiceDate=kind==='VENDOR_INVOICE'?findDate(normalized,['請求日','発行日','作成日','invoice date'],false):''
  const date=kind==='VENDOR_INVOICE'?(explicitInvoiceDate||findInvoiceDate(normalized)):findDate(normalized,dateLabels)
  if(kind==='VENDOR_INVOICE'&&date&&!explicitInvoiceDate)warnings.push('請求日の明記がないため、請求期間末日または帳票内の最新日付を請求日候補にしています。')
  if(kind==='VENDOR_INVOICE'&&items.length&&totalYen){
    const itemTotal=items.reduce((sum,item)=>sum+item.lineTotalYen,0)
    if(!approxEqual(itemTotal,totalYen,1))warnings.push('読取明細の合計と請求合計が一致しません。原本の明細・消費税をご確認ください。')
  }
  if(kind==='VENDOR_INVOICE'&&!vendor)warnings.push('請求元を特定できませんでした。')
  const suggestedCategory=items.length&&items.every(item=>item.suggestedCategory===items[0].suggestedCategory)?items[0].suggestedCategory:kind==='VENDOR_INVOICE'?inferCategory(normalized):'OTHER'
  const confidencePenalty=warnings.some(w=>w.includes('一致しません'))?15:0
  return{
    kind,
    rawText:normalized,
    confidence:Math.round(Math.max(0,Math.min(100,(confidence||0)-confidencePenalty))),
    vendor,
    documentNo:kind==='VENDOR_INVOICE'?findDocumentNo(normalized):'',
    date,
    dueDate:kind==='VENDOR_INVOICE'?findDate(normalized,dueLabels,false):'',
    subtotalYen,
    taxYen,
    totalYen,
    referenceNo:kind==='PAYMENT_PROOF'?findReferenceNo(normalized):'',
    paymentMethod:kind==='PAYMENT_PROOF'?inferPaymentMethod(normalized):'',
    suggestedCategory,
    items,
    warnings,
    engine,
  }
}

function buildLayoutLines(items:any[]){
  const nodes:LayoutNode[]=(items||[]).map((item:any)=>{
    const str=normalizeLine(String(item?.str||''))
    const transform=Array.isArray(item?.transform)?item.transform:[]
    return{str,x:Number(transform[4]||0),y:Number(transform[5]||0),w:Math.abs(Number(item?.width||0)),h:Math.abs(Number(transform[3]||item?.height||10))}
  }).filter((item:LayoutNode)=>item.str)
  nodes.sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x)
  const lines:LayoutLine[]=[]
  for(const node of nodes){
    const last=lines[lines.length-1]
    const tolerance=Math.max(2.2,Math.min(6,node.h*.48))
    if(last&&Math.abs(last.y-node.y)<=tolerance){
      last.parts.push(node);last.y=(last.y+node.y)/2;last.h=Math.max(last.h,node.h)
    }else lines.push({y:node.y,h:node.h,parts:[node]})
  }
  for(const line of lines)line.parts.sort((a,b)=>a.x-b.x)
  return lines
}

function layoutLineText(line:LayoutLine){return line.parts.map(part=>part.str).join(' ')}
function nodeCenter(node:LayoutNode){return node.x+(node.w||Math.max(8,node.str.length*5))/2}

function summaryHintsFromLayout(lines:LayoutLine[]){
  const hints:string[]=[]
  for(let i=0;i<lines.length;i++){
    const headers:{key:string;x:number}[]=[]
    for(const part of lines[i].parts){
      const compact=part.str.replace(/\s/g,'').toLowerCase()
      for(const def of summaryAliases){
        if(def.aliases.some(alias=>compact.includes(alias.replace(/\s/g,'').toLowerCase()))){headers.push({key:def.key,x:nodeCenter(part)});break}
      }
    }
    const dedup=headers.filter((h,index)=>headers.findIndex(x=>x.key===h.key)===index)
    if(dedup.length<3)continue
    for(let j=i+1;j<Math.min(lines.length,i+5);j++){
      const values=lines[j].parts.map(part=>({value:parseMoney(part.str,true),x:nodeCenter(part)})).filter((x):x is {value:number;x:number}=>x.value!==null)
      if(values.length<Math.min(3,dedup.length))continue
      const used=new Set<number>()
      for(const header of dedup){
        let best=-1,bestDist=Infinity
        for(let k=0;k<values.length;k++){
          if(used.has(k))continue
          const dist=Math.abs(values[k].x-header.x)
          if(dist<bestDist){bestDist=dist;best=k}
        }
        if(best>=0&&bestDist<85){used.add(best);hints.push(SUMMARY_PREFIX+' '+header.key+'='+values[best].value)}
      }
      if(hints.length>=3)return hints
    }
  }
  return hints
}

function itemHintsFromLayout(lines:LayoutLine[]){
  const canonical=[
    {key:'date',aliases:['伝票日付','日付','date']},
    {key:'slip',aliases:['伝票No.','伝票No','伝票番号']},
    {key:'description',aliases:['商品名','品名','内容','description']},
    {key:'capacity',aliases:['容量','規格','size']},
    {key:'quantity',aliases:['数量','qty']},
    {key:'unit',aliases:['単位','unit']},
    {key:'unitPrice',aliases:['単価','price']},
    {key:'amount',aliases:['金額','amount']},
  ]
  for(let i=0;i<lines.length;i++){
    const found:{key:string;x:number}[]=[]
    for(const part of lines[i].parts){
      const compact=part.str.replace(/\s/g,'').toLowerCase()
      for(const def of canonical){
        if(def.aliases.some(alias=>compact===alias.replace(/\s/g,'').toLowerCase()||compact.includes(alias.replace(/\s/g,'').toLowerCase()))){found.push({key:def.key,x:nodeCenter(part)});break}
      }
    }
    const dedup=found.filter((h,index)=>found.findIndex(x=>x.key===h.key)===index).sort((a,b)=>a.x-b.x)
    if(dedup.length<5||!dedup.some(x=>x.key==='description')||!dedup.some(x=>x.key==='amount'))continue
    const boundaries:number[]=[-Infinity]
    for(let k=0;k<dedup.length-1;k++)boundaries.push((dedup[k].x+dedup[k+1].x)/2)
    boundaries.push(Infinity)
    const hints:string[]=[]
    for(let j=i+1;j<Math.min(lines.length,i+55);j++){
      const cells=new Map<string,string[]>()
      for(const part of lines[j].parts){
        const x=nodeCenter(part);let idx=0
        while(idx<dedup.length-1&&x>=boundaries[idx+1])idx++
        const key=dedup[idx]?.key;if(!key)continue
        const values=cells.get(key)||[];values.push(part.str);cells.set(key,values)
      }
      const get=(key:string)=>normalizeLine((cells.get(key)||[]).join(' '))
      const date=get('date'),slip=get('slip'),description=get('description'),capacity=get('capacity'),quantity=get('quantity'),unit=get('unit'),unitPrice=get('unitPrice'),amount=get('amount')
      if(!description&&slip&&/振込|振込み|入金|相殺/i.test(slip))continue
      if(!description||!quantity||!unitPrice||!amount)continue
      const q=parseNumericToken(quantity),u=parseMoney(unitPrice),a=parseMoney(amount)
      if(q===null||u===null||a===null||q<=0||u<=0||a<=0)continue
      if(Math.abs(q*u-a)>Math.max(2,a*.012))continue
      if(/合計|小計|税|請求|振込|振込み|入金|相殺/i.test(description))continue
      hints.push([ITEM_PREFIX,date,slip,description,capacity,quantity,unit,unitPrice,amount].join('\t'))
    }
    if(hints.length)return hints
  }
  return[]
}

function textContentToStructuredText(items:any[]){
  const lines=buildLayoutLines(items)
  const plain=lines.map(layoutLineText).filter(Boolean)
  return [...summaryHintsFromLayout(lines),...itemHintsFromLayout(lines),...plain].join('\n')
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
    const longest=Math.max(image.naturalWidth,image.naturalHeight)
    const scale=longest<1800?Math.min(2,1800/Math.max(1,longest)):Math.min(1,MAX_IMAGE_DIMENSION/longest)
    const canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale))
    canvas.height=Math.max(1,Math.round(image.naturalHeight*scale))
    const ctx=canvas.getContext('2d',{willReadFrequently:true})
    if(!ctx)throw new Error('画像解析を開始できませんでした。')
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height)
    ctx.imageSmoothingEnabled=true
    ctx.drawImage(image,0,0,canvas.width,canvas.height)
    enhanceCanvasForOcr(canvas)
    return canvas
  }finally{URL.revokeObjectURL(url)}
}

function enhanceCanvasForOcr(canvas:HTMLCanvasElement){
  const ctx=canvas.getContext('2d',{willReadFrequently:true})
  if(!ctx)return
  const image=ctx.getImageData(0,0,canvas.width,canvas.height)
  const data=image.data
  for(let i=0;i<data.length;i+=4){
    const gray=.299*data[i]+.587*data[i+1]+.114*data[i+2]
    const boosted=Math.max(0,Math.min(255,(gray-128)*1.22+128))
    data[i]=boosted;data[i+1]=boosted;data[i+2]=boosted
  }
  ctx.putImageData(image,0,0)
}

async function createOcrWorker(onProgress?:ProgressCallback){
  const mod:any=await import(/* @vite-ignore */ TESSERACT_URL)
  const worker=await mod.createWorker('jpn+eng',undefined,{logger:(m:any)=>{
    if(m?.status==='recognizing text'&&Number.isFinite(m.progress))onProgress?.(Math.round(Number(m.progress)*100),'文字を読み取っています…')
  }})
  await worker.setParameters({preserve_interword_spaces:'1',user_defined_dpi:'300'})
  return worker
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
    digitalParts.push(textContentToStructuredText(textContent.items||[]))
  }
  const digital=normalizeText(digitalParts.join('\n'))
  if(digital.replace(/\s/g,'').length>=80){
    onProgress?.(100,'PDFの文字データを読み取りました。')
    return{text:digital,confidence:99,engine:'PDF_TEXT' as const}
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
      enhanceCanvasForOcr(canvas)
      const result=await worker.recognize(canvas)
      parts.push(String(result?.data?.text||''))
      confidences.push(Number(result?.data?.confidence||0))
    }
  }finally{await worker.terminate()}
  if(Number(pdf.numPages)>MAX_PDF_PAGES)onProgress?.(97,`先頭${MAX_PDF_PAGES}ページをOCRしました。`)
  return{text:normalizeText(parts.join('\n')),confidence:confidences.length?confidences.reduce((a,b)=>a+b,0)/confidences.length:0,engine:'OCR' as const}
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
  const engine='engine'in recognized&&recognized.engine==='PDF_TEXT'?'PDF_TEXT':'OCR'
  const result=parseResult(recognized.text,kind,recognized.confidence,engine)
  if(engine==='PDF_TEXT')result.warnings.unshift('PDF内の文字座標と表構造を直接解析しました。画像OCRより高精度な方式です。')
  if(isPdf&&result.rawText.length<80)result.warnings.push('PDFの文字量が少ないため、読取結果をご確認ください。')
  if(!result.totalYen)result.warnings.push('合計金額を特定できませんでした。')
  if(kind==='VENDOR_INVOICE'&&!result.items.length)result.warnings.push('商品明細を特定できませんでした。原本の明細をご確認ください。')
  return result
}
