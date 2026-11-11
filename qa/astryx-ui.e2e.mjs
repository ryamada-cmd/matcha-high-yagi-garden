/**
 * Real Astryx InventoryPage / PriceListPage / ProductMaster / FertilizerMaster, isolated with in-memory mock
 * stores. All external requests are denied by Playwright's routing layer.
 */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const origin=process.env.QA_ORIGIN||'http://127.0.0.1:5178'
mkdirSync('qa/screenshots',{recursive:true})
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH,headless:true,args:['--no-sandbox']})
let passes=0
async function fixture(screen,viewport) {
 const context=await browser.newContext({viewport,locale:'ja-JP'})
 const page=await context.newPage()
 const external=[], errors=[]
 await page.route('**/*', async route=>{
  const url=route.request().url()
  if(!url.startsWith(origin+'/')&&!url.startsWith('data:')&&!url.startsWith('blob:')){
   external.push(url.split('?')[0])
   await route.abort('blockedbyclient')
   return
  }
  await route.continue()
 })
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/qa/index.html?screen='+screen,{waitUntil:'networkidle',timeout:30000})
 const verify=()=>{assert.deepEqual(external,[],'No real API requests allowed');assert.deepEqual(errors,[],'Browser page errors')}
 return {page,context,verify}
}
try {
 const inv=await fixture('inventory',{width:390,height:844})
 const p=inv.page
 await p.getByText('架空農薬A').first().waitFor()
 assert.equal(await p.locator('table.inventory-table tbody tr').count(),2)
 assert.ok(await p.locator('table.inventory-table.astryx-table').count()===1,'Actual Astryx Table is rendered')
 await p.getByRole('searchbox',{name:'農薬在庫の検索'}).fill('QA-INV-B')
 assert.equal(await p.locator('table.inventory-table tbody tr').count(),1)
 await p.getByRole('searchbox',{name:'農薬在庫の検索'}).fill('')
 await p.getByRole('button',{name:'入出庫履歴'}).click()
 assert.equal(await p.locator('table.transaction-table tbody tr').count(),1)
 await p.getByRole('button',{name:'在庫一覧'}).click()
 await p.getByRole('button',{name:'農薬を入庫'}).click()
 await p.getByRole('dialog').waitFor()
 assert.ok(await p.getByRole('dialog').getByRole('heading',{name:'農薬を入庫'}).count()===1)
 await p.keyboard.press('Escape')
 await p.getByRole('dialog').waitFor({state:'hidden'})
 await p.screenshot({path:'qa/screenshots/astryx-inventory-mobile-390.png',fullPage:true})
 const dims=await p.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(dims.scroll<=dims.w+2,JSON.stringify(dims))
 inv.verify();await inv.context.close();passes++
 console.log('PASS [390px inventory] real Table + TextInput, tab switch, Dialog Escape, no overflow or network')

 const prices=await fixture('prices',{width:1280,height:900})
 const q=prices.page
 // Use the visible table row, not any offscreen measurement clone.
 await q.locator('table.price-list-table tbody tr').first().waitFor({state:'visible',timeout:12000})
 const layout=await q.locator('main').evaluate(el=>({width:el.getBoundingClientRect().width}))
 assert.ok(layout.width>650,'Desktop main content must fill the right grid column')
 const match=await q.locator('table.price-list-table tbody tr').first().getByText('架空抹茶 30g').isVisible()
 if(!match){
  const info=await q.locator('table.price-list-table tbody tr').first().getByText('架空抹茶 30g').evaluate(el=>{
   const chain=[];let node=el
   while(node&&chain.length<12){
    const s=getComputedStyle(node),r=node.getBoundingClientRect()
    chain.push({tag:node.tagName,cls:node.className,display:s.display,visibility:s.visibility,opacity:s.opacity,width:r.width,height:r.height,hidden:node.hidden})
    node=node.parentElement
   }
   return chain
  })
  console.log('QA PRICE VISIBILITY DIAGNOSTICS',JSON.stringify(info))
  await q.screenshot({path:'qa/screenshots/astryx-price-hidden-diagnostic-1280.png',fullPage:true})
 }
 assert.equal(match,true,'Price-list row must be visible at desktop width')
 assert.equal(await q.locator('table.price-list-table tbody tr').count(),2)
 // Diagnostic kept for failed-visibility regressions caused by CSS overrides.
 const priceSearch=q.getByRole('searchbox',{name:'商品価格を検索'})
 if(!await priceSearch.isVisible()){
  const inspect=await priceSearch.evaluate(el=>{
   const chain=[];let node=el
   while(node&&chain.length<10){
    const css=getComputedStyle(node),r=node.getBoundingClientRect()
    chain.push({tag:node.tagName,cls:typeof node.className==='string'?node.className.slice(0,140):'',
     w:r.width,h:r.height,x:r.x,y:r.y,display:css.display,visibility:css.visibility,
     overflow:css.overflow,flex:css.flex,width:css.width,minWidth:css.minWidth,
     height:css.height,minHeight:css.minHeight})
    node=node.parentElement
   }
   return chain
  })
  console.log('QA PRICE SEARCH VISIBILITY DIAGNOSTICS',JSON.stringify(inspect))
 }
 await priceSearch.fill('QA-MATCHA')
 assert.equal(await q.locator('table.price-list-table tbody tr').count(),1)
 await q.locator('table.price-list-table tbody tr').first().getByRole('button',{name:'編集'}).click()
 await q.getByRole('dialog').waitFor()
 assert.equal(await q.getByRole('dialog').getByRole('heading',{name:'架空抹茶 30g'}).count(),1)
 await q.screenshot({path:'qa/screenshots/astryx-price-dialog-desktop-1280.png',fullPage:true})
 await q.keyboard.press('Escape')
 await q.getByRole('dialog').waitFor({state:'hidden'})
 const dims2=await q.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(dims2.scroll<=dims2.w+2,JSON.stringify(dims2))
 prices.verify();await prices.context.close();passes++
 console.log('PASS [1280px prices] real Table + TextInput, filter, Dialog focus and Escape, no network')


 const products=await fixture('products',{width:390,height:844})
 const a=products.page
 await a.getByText('架空抹茶 30g').first().waitFor()
 assert.equal(await a.locator('.product-master-grid .product-master-card').count(),3)
 assert.ok(await a.locator('.product-master-grid .product-master-card').first().evaluate(el=>el.className.includes('astryx-card')),'Product master must use actual Astryx Card')
 await a.getByRole('searchbox',{name:'商品マスタを検索'}).fill('QA-MATCHA')
 assert.equal(await a.locator('.product-master-grid .product-master-card').count(),1)
 await a.getByRole('searchbox',{name:'商品マスタを検索'}).fill('')
 await a.getByRole('button',{name:'商品を追加'}).click()
 const addDialog=a.getByRole('dialog')
 await addDialog.waitFor()
 assert.equal(await addDialog.getByLabel('SKU').getAttribute('required'),'','SKU must keep browser-required constraint')
 await addDialog.getByLabel('SKU').fill('QA-NEW-30')
 await addDialog.getByLabel('商品名').fill('架空新商品 30g')
 const modalDims=await a.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(modalDims.scroll<=modalDims.w+2,'Product add dialog viewport overflow '+JSON.stringify(modalDims))
 await addDialog.getByRole('button',{name:'保存'}).click()
 await a.getByText('架空新商品 30g').first().waitFor({state:'visible'})
 const created=await a.evaluate(()=>window.__qa_product_create)
 assert.equal(created.sku,'QA-NEW-30')
 await a.screenshot({path:'qa/screenshots/astryx-product-master-mobile-390.png',fullPage:true})
 products.verify();await products.context.close();passes++
 console.log('PASS [390px products] Astryx Card, search, modal required fields, synthetic create, no viewport overflow or external network')

 const fertilizer=await fixture('fertilizers',{width:320,height:720})
 const f=fertilizer.page
 await f.getByText('架空肥料A').first().waitFor()
 assert.equal(await f.locator('.fertilizer-master-grid .fertilizer-master-card').count(),2)
 await f.getByRole('searchbox',{name:'肥料マスタを検索'}).fill('QA-FERT-B')
 assert.equal(await f.locator('.fertilizer-master-grid .fertilizer-master-card').count(),1)
 await f.getByRole('searchbox',{name:'肥料マスタを検索'}).fill('')
 await f.getByRole('button',{name:'肥料を追加'}).click()
 const fertDialog=f.getByRole('dialog')
 await fertDialog.waitFor()
 assert.equal(await fertDialog.getByLabel('肥料名').getAttribute('required'),'','Fertilizer name must remain required')
 await fertDialog.getByLabel('肥料名').fill('架空追加肥料D')
 const fertDims=await f.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(fertDims.scroll<=fertDims.w+2,'Fertilizer dialog viewport overflow '+JSON.stringify(fertDims))
 await f.keyboard.press('Escape')
 await fertDialog.waitFor({state:'hidden'})
 await f.getByRole('button',{name:/農水省 公式肥料DB/}).click()
 await f.getByText('架空公式肥料C').first().waitFor()
 assert.ok(await f.locator('.official-fertilizer-list .official-fertilizer-card').count()===1)
 await f.screenshot({path:'qa/screenshots/astryx-fertilizer-master-mobile-320.png',fullPage:true})
 fertilizer.verify();await fertilizer.context.close();passes++
 console.log('PASS [320px fertilizers] Astryx Card, local official search, modal Escape, no viewport overflow or external network')


 const cal=await fixture('calendar',{width:390,height:844})
 const c=cal.page
 await c.getByRole('button',{name:'やること追加'}).waitFor()
 await c.getByRole('button',{name:'やること追加'}).click()
 const taskDialog=c.getByRole('dialog')
 await taskDialog.waitFor()
 assert.equal(await taskDialog.getByLabel('やること').getAttribute('required'),'','Task title must stay required')
 await taskDialog.getByLabel('やること').fill('架空茶園の水やり確認')
 const days=taskDialog.locator('input[type="date"]')
 assert.ok(await days.count()>0,'Original native date inputs must remain')
 await taskDialog.getByRole('button',{name:'やることを追加'}).click()
 await taskDialog.waitFor({state:'hidden'})
 const stored=await c.evaluate(()=>window.__qa_calendar_task)
 assert.equal(stored.title,'架空茶園の水やり確認')
 await c.getByRole('button',{name:'収穫計画'}).click()
 const harvestDialog=c.getByRole('dialog')
 await harvestDialog.waitFor()
 assert.equal(await harvestDialog.getByLabel('茶期・収穫名').getAttribute('required'),'','Season must stay required')
 await harvestDialog.getByLabel('全圃場を対象').check()
 await harvestDialog.getByLabel('茶期・収穫名').fill('架空一番茶')
 await harvestDialog.getByRole('button',{name:'保存',exact:true}).click()
 await harvestDialog.waitFor({state:'hidden'})
 const savedHarvest=await c.evaluate(()=>window.__qa_calendar_harvest)
 assert.equal(savedHarvest.season,'架空一番茶')
 assert.equal(savedHarvest.allFields,true)
 await c.getByRole('button',{name:'やること追加'}).click()
 await c.getByRole('dialog').waitFor()
 await c.keyboard.press('Escape')
 await c.getByRole('dialog').waitFor({state:'hidden'})
 const calendarDims=await c.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(calendarDims.scroll<=calendarDims.w+2,'calendar viewport overflow: '+JSON.stringify(calendarDims))
 await c.screenshot({path:'qa/screenshots/astryx-calendar-mobile-390.png',fullPage:true})
 cal.verify();await cal.context.close();passes++
 console.log('PASS [390px calendar] Astryx Task/Harvest Dialog, native required/date, synthetic save, Escape, no external network')


 const documents=await fixture('documents',{width:390,height:844})
 const doc=documents.page
 await doc.getByRole('button',{name:'取引先・発行元'}).click()
 await doc.locator('.customer-master-list').getByText('架空卸売店').waitFor()
 await doc.getByRole('button',{name:'追加',exact:true}).click()
 const customerDialog=doc.getByRole('dialog')
 await customerDialog.waitFor()
 assert.equal(await customerDialog.getByLabel('取引先名').getAttribute('required'),'','Customer name must retain required validation')
 await customerDialog.getByRole('button',{name:'保存',exact:true}).click()
 assert.equal(await customerDialog.isVisible(),true,'Empty name must block submit')
 assert.equal(await customerDialog.getByLabel('取引先名').evaluate(el=>el.validity.valueMissing),true,'Native validation should reject empty customer name')
 await customerDialog.getByLabel('取引先名').fill('架空抹茶問屋')
 await customerDialog.getByLabel('メール').fill('example@qa.invalid')
 await customerDialog.getByRole('button',{name:'保存',exact:true}).click()
 await customerDialog.waitFor({state:'hidden'})
 assert.equal((await doc.evaluate(()=>window.__qa_doc_customer)).name,'架空抹茶問屋')
 await doc.getByRole('button',{name:'見積書を作成'}).click()
 await doc.getByLabel('取引先名').fill('架空抹茶問屋')
 await doc.locator('.item-name-input').first().fill('架空抹茶サンプル')
 await doc.getByRole('button',{name:'下書き保存'}).click()
 const savedDoc=await doc.evaluate(()=>window.__qa_document_saved)
 assert.equal(savedDoc.documentType,'ESTIMATE')
 assert.equal(savedDoc.status,'DRAFT')
 assert.equal(savedDoc.customerName,'架空抹茶問屋')
 await doc.getByRole('button',{name:'帳票一覧'}).click()
 await doc.getByText('架空抹茶問屋').first().waitFor()
 const docDims=await doc.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(docDims.scroll<=docDims.w+2,'Document master viewport overflow '+JSON.stringify(docDims))
 await doc.screenshot({path:'qa/screenshots/astryx-documents-mobile-390.png',fullPage:true})
 documents.verify();await documents.context.close();passes++
 console.log('PASS [390px documents] actual Astryx customer Dialog, native required validation, in-memory customer + estimate draft, no network')


 const crm=await fixture('crm',{width:390,height:844})
 const cp=crm.page
 await cp.getByRole('heading',{name:'営業・問い合わせ管理'}).waitFor()
 await cp.getByRole('button',{name:'新規案件'}).click()
 await cp.getByLabel('件名').fill('架空海外卸売案件')
 await cp.getByRole('button',{name:'案件を保存'}).click()
 await cp.getByText('架空海外卸売案件').first().waitFor({state:'visible'})
 const caseSaved=await cp.evaluate(()=>window.__qa_crm_inquiry)
 assert.equal(caseSaved.subject,'架空海外卸売案件')
 await cp.getByRole('button',{name:'取引先・担当者'}).click()
 const crmCompany=cp.locator('.crm-contacts-grid section.panel').first()
 await crmCompany.getByLabel('会社・店舗名').fill('架空海外問屋')
 await crmCompany.getByRole('button',{name:'保存',exact:true}).click()
 await crmCompany.getByText('架空海外問屋').first().waitFor()
 const companySaved=await cp.evaluate(()=>window.__qa_crm_company)
 assert.equal(companySaved.name,'架空海外問屋')
 const crmContact=cp.locator('.crm-contacts-grid section.panel').nth(1)
 await crmContact.getByLabel('担当者名').fill('架空商談担当')
 await crmContact.getByLabel('メールアドレス').fill('example@qa.invalid')
 await crmContact.getByRole('button',{name:'保存',exact:true}).click()
 await crmContact.getByText('架空商談担当').first().waitFor()
 const contactSaved=await cp.evaluate(()=>window.__qa_crm_contact)
 assert.equal(contactSaved.email,'example@qa.invalid')
 const crmDims=await cp.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(crmDims.scroll<=crmDims.w+2,'CRM page viewport overflow '+JSON.stringify(crmDims))
 await cp.screenshot({path:'qa/screenshots/astryx-crm-mobile-390.png',fullPage:true})
 crm.verify();await crm.context.close();passes++
 console.log('PASS [390px CRM] actual Astryx subject/contacts forms, synthetic inquiry/company/contact saves, no external calls')


 const equipment=await fixture('equipment',{width:390,height:844})
 const eq=equipment.page
 await eq.getByText('架空動力噴霧器').first().waitFor()
 await eq.getByRole('searchbox',{name:'設備・整備履歴を検索'}).fill('QA-SP-01')
 assert.equal(await eq.locator('.equipment-card-grid .equipment-card').count(),1)
 await eq.getByRole('searchbox',{name:'設備・整備履歴を検索'}).fill('')
 await eq.getByRole('button',{name:'設備を登録'}).click()
 const assetDialog=eq.getByRole('dialog')
 await assetDialog.waitFor()
 assert.equal(await assetDialog.getByLabel('名前').getAttribute('required'),'','Equipment name must remain required')
 await assetDialog.getByRole('button',{name:'保存',exact:true}).click()
 assert.equal(await assetDialog.isVisible(),true,'Empty equipment name must block submit')
 await assetDialog.getByLabel('名前').fill('架空二番茶用刈払機')
 await assetDialog.getByRole('button',{name:'保存',exact:true}).click()
 await assetDialog.waitFor({state:'hidden'})
 const savedAsset=await eq.evaluate(()=>window.__qa_equipment_asset)
 assert.equal(savedAsset.name,'架空二番茶用刈払機')
 assert.equal(savedAsset.category,'AGRICULTURAL_MACHINE')
 await eq.locator('.equipment-tabs button').nth(1).click()
 await eq.getByRole('button',{name:'履歴を登録'}).click()
 const serviceDialog=eq.getByRole('dialog')
 await serviceDialog.waitFor()
 assert.equal(await serviceDialog.getByLabel('修理・整備内容').getAttribute('required'),'','Service description must remain required')
 await serviceDialog.getByLabel('対象設備').selectOption(savedAsset.id)
 await serviceDialog.getByLabel('修理・整備内容').fill('架空の刃交換・整備')
 await serviceDialog.getByRole('button',{name:'保存',exact:true}).click()
 await serviceDialog.waitFor({state:'hidden'})
 const savedService=await eq.evaluate(()=>window.__qa_equipment_service)
 assert.equal(savedService.description,'架空の刃交換・整備')
 assert.equal(savedService.equipmentId,savedAsset.id)
 await eq.getByRole('button',{name:'履歴を登録'}).click()
 await eq.getByRole('dialog').waitFor()
 await eq.keyboard.press('Escape')
 await eq.getByRole('dialog').waitFor({state:'hidden'})
 const eqDims=await eq.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(eqDims.scroll<=eqDims.w+2,'Equipment viewport horizontal overflow '+JSON.stringify(eqDims))
 await eq.screenshot({path:'qa/screenshots/astryx-equipment-mobile-390.png',fullPage:true})
 equipment.verify();await equipment.context.close();passes++
 console.log('PASS [390px equipment] Astryx dialogs, native validation, in-memory asset + service save, Escape, no network')


 const payable=await fixture('vendor-invoices',{width:390,height:844})
 const bill=payable.page
 await bill.getByText('架空資材商事').first().waitFor()
 assert.equal(await bill.locator('.vendor-invoice-list .vendor-invoice-card').count(),1)
 const newVendor=bill.getByLabel('請求元')
 assert.equal(await newVendor.getAttribute('required'),'','Invoice vendor must remain required')
 await bill.getByRole('searchbox',{name:'仕入請求書を検索'}).fill('QA-INV-001')
 assert.equal(await bill.locator('.vendor-invoice-list .vendor-invoice-card').count(),1)
 await bill.getByRole('searchbox',{name:'仕入請求書を検索'}).fill('')
 await bill.locator('.vendor-invoice-list .record-payment').first().click()
 const paymentDialog=bill.getByRole('dialog')
 await paymentDialog.waitFor()
 const amount=paymentDialog.getByLabel('支払金額')
 assert.equal(await amount.getAttribute('required'),'','Payment amount must remain required')
 assert.equal(await amount.getAttribute('min'),'1','Payment amount minimum must remain 1 yen')
 await amount.fill('0')
 await paymentDialog.getByRole('button',{name:'支払いを登録'}).click()
 assert.equal(await paymentDialog.isVisible(),true,'A zero-yen payment must be rejected by native constraints')
 await amount.fill('5000')
 await paymentDialog.getByRole('button',{name:'支払いを登録'}).click()
 await paymentDialog.waitFor({state:'hidden'})
 const payment=await bill.evaluate(()=>window.__qa_vendor_payment)
 assert.equal(payment.amountYen,5000)
 assert.equal(payment.invoiceId,'qa-vendor-invoice-01')
 await bill.locator('.vendor-invoice-card .invoice-status.partial').waitFor()
 assert.equal((await bill.locator('.vendor-invoice-card .invoice-status').first().textContent())?.trim(),'一部支払')
 await bill.locator('.vendor-invoice-card .invoice-payment-actions button[aria-label="支払記録を編集"]').first().click()
 await bill.getByRole('dialog').waitFor()
 await bill.keyboard.press('Escape')
 await bill.getByRole('dialog').waitFor({state:'hidden'})
 const payableDims=await bill.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(payableDims.scroll<=payableDims.w+2,'Vendor invoices horizontal overflow '+JSON.stringify(payableDims))
 await bill.screenshot({path:'qa/screenshots/astryx-vendor-payments-mobile-390.png',fullPage:true})
 payable.verify();await payable.context.close();passes++
 console.log('PASS [390px vendor payments] Astryx Dialog, native required/min validation, in-memory partial payment, Escape, no network')


 const daily=await fixture('daily-reports',{width:390,height:844})
 const dailyPage=daily.page
 await dailyPage.locator('.daily-report-form').waitFor()
 const work=dailyPage.getByLabel('今日の作業内容')
 assert.equal(await work.getAttribute('required'),'','Daily work summary must remain required')
 await dailyPage.getByLabel('天気・現場状況').fill('架空の晴れ')
 await work.fill('架空茶園Aの整備と点検')
 await dailyPage.locator('.daily-report-field-chips button').first().click()
 await dailyPage.getByRole('button',{name:'日報を登録'}).click()
 await dailyPage.getByText('架空茶園Aの整備と点検').first().waitFor({state:'visible'})
 const dailySaved=await dailyPage.evaluate(()=>window.__qa_daily_saved)
 assert.equal(dailySaved.workSummary,'架空茶園Aの整備と点検')
 assert.equal(dailySaved.fields[0].legacyId,'QA-A')
 await dailyPage.locator('.daily-report-card-actions').getByRole('button',{name:'編集'}).first().click()
 await dailyPage.getByLabel('今日の作業内容').fill('架空茶園Aの整備と点検を更新')
 await dailyPage.locator('.daily-report-form').getByRole('button',{name:'日報を更新'}).click()
 await dailyPage.getByText('架空茶園Aの整備と点検を更新').first().waitFor({state:'visible'})
 const dailyDims=await dailyPage.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(dailyDims.scroll<=dailyDims.w+2,'Daily report horizontal overflow '+JSON.stringify(dailyDims))
 await dailyPage.screenshot({path:'qa/screenshots/astryx-daily-reports-mobile-390.png',fullPage:true})
 daily.verify();await daily.context.close();passes++
 console.log('PASS [390px daily reports] Astryx required Field, in-memory create/edit with fields, no overflow or network')

 const expense=await fixture('expenses',{width:390,height:844})
 const expensePage=expense.page
 await expensePage.locator('.expense-claim-form').waitFor()
 const vendor=expensePage.getByLabel('購入先')
 assert.equal(await vendor.getAttribute('required'),'','Expense vendor must remain required')
 await vendor.fill('架空資材商事')
 await expensePage.locator('.expense-item-row .expense-desc input').first().fill('架空資材')
 await expensePage.locator('.expense-item-row input[type="number"]').nth(0).fill('3')
 await expensePage.locator('.expense-item-row input[type="number"]').nth(1).fill('700')
 await expensePage.getByRole('button',{name:'明細を追加'}).click()
 const second=expensePage.locator('.expense-item-row').nth(1)
 await second.locator('.expense-desc input').fill('架空燃料')
 await second.locator('input[type="number"]').nth(0).fill('2')
 await second.locator('input[type="number"]').nth(1).fill('2500')
 await expensePage.getByRole('button',{name:'領収書と一緒に申請'}).click()
 await expensePage.getByText('領収書の写真またはPDFを1件以上添付してから申請してください。').waitFor()
 await expensePage.locator('.expense-receipt-action input[type="file"]').last().setInputFiles({name:'qa-fictional-receipt.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nQA TEST ONLY\n')})
 await expensePage.getByRole('button',{name:'領収書と一緒に申請'}).click()
 await expensePage.getByText('架空資材商事').first().waitFor()
 const expSaved=await expensePage.evaluate(()=>window.__qa_expense_saved)
 assert.equal(expSaved.totalAmountYen,7100,'Subtotal calculation 3*700+2*2500')
 assert.equal(expSaved.items.length,2)
 assert.equal((await expensePage.evaluate(()=>window.__qa_expense_receipt)).fileName,'qa-fictional-receipt.pdf')
 const expDims=await expensePage.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(expDims.scroll<=expDims.w+2,'Expense horizontal overflow '+JSON.stringify(expDims))
 await expensePage.screenshot({path:'qa/screenshots/astryx-expenses-mobile-390.png',fullPage:true})
 expense.verify();await expense.context.close();passes++
 console.log('PASS [390px expenses] Astryx Field, two-line arithmetic, required receipt, in-memory submit and storage, no external network')


 const sprayHistory=await fixture('spray-history',{width:390,height:844})
 const sh=sprayHistory.page
 await sh.getByText('QA-SPRAY-001').waitFor({state:'visible'})
 assert.equal(await sh.locator('table.full-history-table tbody tr').count(),2)
 assert.equal(await sh.locator('table.full-history-table.astryx-table').count(),1,'spray history uses actual Astryx Table')
 await sh.getByRole('searchbox',{name:'キーワード'}).fill('QA-SPRAY-001')
 assert.equal(await sh.locator('table.full-history-table tbody tr').count(),1)
 await sh.getByRole('button',{name:'CSV出力'}).click()
 assert.deepEqual(await sh.evaluate(()=>window.__qa_spray_export),['QA-SPRAY-001'])
 // The sticky action column must work without manually swiping the table.
 await sh.getByTitle('明細を展開').first().click({timeout:5000})
 await sh.locator('.history-expanded').getByText('架空茶園A').first().waitFor({state:'visible'})
 const shSize=await sh.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}))
 assert.ok(shSize.scrollWidth<=shSize.width+2,'Spray history viewport overflow '+JSON.stringify(shSize))
 await sh.screenshot({path:'qa/screenshots/astryx-spray-history-mobile-390.png',fullPage:true})
 sprayHistory.verify();await sprayHistory.context.close();passes++
 console.log('PASS [390px spray history] Astryx Table, filters, CSV selection, expanded detail, no network')

 const fertHistory=await fixture('fertilizer-history',{width:390,height:844})
 const fh=fertHistory.page
 await fh.getByText('QA-FAPP-001').first().waitFor()
 await fh.getByText('20kg').first().waitFor()
 await fh.getByRole('searchbox',{name:'施肥履歴を検索'}).fill('missing-test-value')
 await fh.getByText('該当する施肥履歴はありません。').waitFor()
 await fh.getByRole('searchbox',{name:'施肥履歴を検索'}).fill('QA-FAPP-001')
 await fh.getByRole('button',{name:/QA-FAPP-001/}).click()
 await fh.getByText('架空施肥のみ').first().waitFor()
 const fertSize=await fh.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}))
 assert.ok(fertSize.scrollWidth<=fertSize.width+2,'Fertilizer history viewport overflow '+JSON.stringify(fertSize))
 await fh.screenshot({path:'qa/screenshots/astryx-fertilizer-history-mobile-390.png',fullPage:true})
 fertHistory.verify();await fertHistory.context.close();passes++
 console.log('PASS [390px fertilizer history] Card/search/NPK summary, expanded detail, no network')

 const compact=await fixture('inventory',{width:320,height:720})
 const k=compact.page
 await k.getByText('架空農薬A').first().waitFor()
 const compactDims=await k.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(compactDims.scroll<=compactDims.w+2,JSON.stringify(compactDims))
 compact.verify();await compact.context.close();passes++
 console.log('PASS [320px compact inventory] no viewport horizontal overflow; zero external API requests')
 console.log('PASS',passes,'AstryX isolated browser checks')
} catch(err) {
 console.error('FAIL Astryx browser fixture',err)
 process.exitCode=1
} finally {await browser.close()}
