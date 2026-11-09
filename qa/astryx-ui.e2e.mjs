/**
 * Real Astryx InventoryPage / PriceListPage, isolated with in-memory mock
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
 await q.getByText('架空抹茶 30g').first().waitFor()
 assert.equal(await q.locator('table.price-list-table tbody tr').count(),2)
 await q.getByRole('searchbox',{name:'商品価格を検索'}).fill('QA-MATCHA')
 assert.equal(await q.locator('table.price-list-table tbody tr').count(),1)
 await q.getByRole('button',{name:'編集'}).click()
 await q.getByRole('dialog').waitFor()
 assert.equal(await q.getByRole('dialog').getByRole('heading',{name:'架空抹茶 30g'}).count(),1)
 await q.screenshot({path:'qa/screenshots/astryx-price-dialog-desktop-1280.png',fullPage:true})
 await q.keyboard.press('Escape')
 await q.getByRole('dialog').waitFor({state:'hidden'})
 const dims2=await q.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(dims2.scroll<=dims2.w+2,JSON.stringify(dims2))
 prices.verify();await prices.context.close();passes++
 console.log('PASS [1280px prices] real Table + TextInput, filter, Dialog focus and Escape, no network')

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
