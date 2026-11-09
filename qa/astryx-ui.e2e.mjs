/**
 * Real Astryx InventoryPage / PriceListPage / ProductMaster / FertilizerMaster, isolated with in-memory mock
 * stores. All external requests are denied by Playwright's routing layer.
 */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const origin='http://127.0.0.1:5178'
mkdirSync('qa/screenshots',{recursive:true})
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
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
 await q.getByRole('searchbox',{name:'商品価格を検索'}).fill('QA-MATCHA')
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
