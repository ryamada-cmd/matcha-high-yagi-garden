/**
 * Sales + annual-costing browser regression using actual AstryX React pages,
 * but ONLY in-memory mock ledgers. Strictly blocks off-origin network traffic.
 */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const origin=process.env.QA_ORIGIN||'http://127.0.0.1:5178'
mkdirSync('qa/screenshots',{recursive:true})
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH,headless:true,args:['--no-sandbox']})
let passes=0

async function fixture(screen,viewport,{viewOnly=false}={}){
 const context=await browser.newContext({viewport,locale:'ja-JP'})
 const page=await context.newPage(),external=[],errors=[]
 await page.route('**/*',async route=>{
  const url=route.request().url()
  if(!url.startsWith(origin+'/')&&!url.startsWith('data:')&&!url.startsWith('blob:')){
   external.push(url.split('?')[0])
   await route.abort('blockedbyclient')
   return
  }
  await route.continue()
 })
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/qa/index.html?screen='+screen+(viewOnly?'&viewOnly=1':''),
  {waitUntil:'networkidle',timeout:30000})
 function verify(){
  assert.deepEqual(external,[],'External API connections are forbidden even if aborted')
  assert.deepEqual(errors,[],'Browser must have zero uncaught JS errors')
 }
 return {page,context,verify}
}
async function noHorizontalOverflow(page,label){
 const d=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(d.scroll<=d.w+2,label+' viewport overflow '+JSON.stringify(d))
}
try{
 // Sales: real form, derived gross margin, stock decrement, reversal, and overselling guard.
 const sales=await fixture('sales',{width:390,height:844})
 const p=sales.page
 await p.getByRole('heading',{name:'販売・出庫',exact:true}).waitFor()
 await p.locator('.sale-lot-select').first().click()
 await p.getByLabel('販売先').fill('架空取引先甲')
 const qty=p.locator('.sale-line-inputs input[type="number"]')
 await qty.nth(0).fill('5')
 await qty.nth(1).fill('3500')
 const preview=await p.locator('.sales-preview').innerText()
 for(const expected of ['17,500','3,000','14,500'])assert.ok(preview.includes(expected),'Expected finance preview '+expected+' got '+preview)
 await p.getByRole('button',{name:'販売・出庫を登録'}).click()
 await p.getByText('販売を登録し、製品在庫から出庫しました。').waitFor()
 const created=await p.evaluate(()=>window.__qa_sale_created)
 assert.equal(created.summary.customerName,'架空取引先甲')
 assert.equal(created.summary.salesAmountYen,17500)
 assert.equal(created.summary.costAmountYen,3000)
 assert.equal(created.summary.grossProfitYen,14500)
 assert.equal(created.items[0].quantity,5)
 assert.equal(await p.evaluate(()=>window.__qa_sale_stock_after),15)
 const search=p.getByRole('searchbox',{name:'販売履歴を検索'})
 await search.fill('架空取引先甲')
 assert.equal(await p.locator('.sale-card').count(),1)
 await p.locator('.sale-card-head').first().click()
 await p.getByText('販売を取消・在庫へ戻す').waitFor()
 p.once('dialog',dialog=>dialog.accept('QA架空の取消理由'))
 await p.getByRole('button',{name:'販売を取消・在庫へ戻す'}).click()
 await p.getByText('販売を取り消し、在庫へ戻入しました。').waitFor()
 assert.equal((await p.evaluate(()=>window.__qa_sale_cancelled)).summary.status,'CANCELLED')
 assert.equal(await p.evaluate(()=>window.__qa_sale_stock_restored),20)
 await search.fill('')
 await p.locator('.sale-lot-select').first().click()
 await p.getByLabel('販売先').fill('架空在庫超過取引')
 await p.locator('.sale-line-inputs input[type="number"]').nth(0).fill('21')
 await p.locator('.sale-line-inputs input[type="number"]').nth(1).fill('3500')
 await p.getByRole('button',{name:'販売・出庫を登録'}).click()
 await p.getByText('QA-PROD-001 の在庫を超えています。').waitFor()
 assert.equal(await p.locator('.sale-card').count(),1,'Overselling cannot create additional sale')
 await noHorizontalOverflow(p,'Sales 390px')
 await p.screenshot({path:'qa/screenshots/astryx-sales-mobile-390.png',fullPage:true})
 sales.verify();await sales.context.close();passes++
 console.log('PASS sales: arithmetic, in-memory registration, cancel/restock, oversell guard, mobile width, zero real calls')

 // The page-level permission state is mocked here; database RLS is tested separately.
 const view=await fixture('sales',{width:390,height:844},{viewOnly:true})
 await view.page.getByRole('heading',{name:'販売・出庫',exact:true}).waitFor()
 assert.equal(await view.page.locator('form.sales-entry').count(),0,'Read-only role cannot see sales entry')
 assert.equal(await view.page.getByRole('button',{name:'CSV出力'}).count(),1,'Read-only role can export visible history')
 await noHorizontalOverflow(view.page,'Sales read-only 390px')
 view.verify();await view.context.close();passes++
 console.log('PASS sales read-only: no registration surface and no blocked network')

 const costing=await fixture('costing',{width:390,height:844})
 const c=costing.page
 await c.getByRole('heading',{name:'原価計算・年度配賦',exact:true}).waitFor()
 await c.getByText('架空肥料商店').first().waitFor()
 await c.getByRole('button',{name:'原価へ追加'}).first().click()
 assert.equal(await c.getByRole('button',{name:'追加済み'}).count(),1,'Source must not be imported twice')
 await c.getByLabel('予定出来高 kg').fill('20')
 const before=await c.locator('.costing-live-summary').innerText()
 assert.ok(before.includes('600'), '12,000 yen / 20 kg must be 600 yen/kg: '+before)
 assert.ok(before.includes('18'), '30g material cost must be 18 yen: '+before)
 await c.locator('.costing-lot-grid article button').first().click()
 const allocated=c.getByLabel('配賦対象kg')
 await allocated.fill('25')
 assert.equal(await allocated.evaluate(e=>e.validity.rangeOverflow),true,'Allocation cannot exceed 20 kg')
 await allocated.fill('20')
 await c.getByLabel('状態').selectOption('FINAL')
 await c.getByRole('button',{name:'確定原価として保存'}).click()
 const saved=await c.evaluate(()=>window.__qa_costing_saved)
 assert.equal(saved.status,'FINAL')
 assert.equal(saved.actualTotalYen,12000)
 assert.equal(saved.actualOutputKg,20)
 assert.equal(saved.rateYenPerKg,600)
 assert.equal(saved.lots[0].allocatedQtyKg,20)
 assert.equal(saved.costItems.filter(x=>x.sourceItemId==='qa-expense-line-1').length,1,'No duplicated source allocation')
 await c.getByText('年度原価を確定し、対象ロットへ実績原価を配賦しました。').waitFor()
 await noHorizontalOverflow(c,'Costing 390px')
 await c.screenshot({path:'qa/screenshots/astryx-costing-mobile-390.png',fullPage:true})
 costing.verify();await costing.context.close();passes++
 console.log('PASS costing: 12k / 20kg, 30g estimate, source deduplication, valid allocation, FINAL in-memory save')

 const costingView=await fixture('costing',{width:320,height:720},{viewOnly:true})
 const cv=costingView.page
 await cv.getByRole('heading',{name:'原価計算・年度配賦',exact:true}).waitFor()
 assert.equal(await cv.getByRole('button',{name:'新規原価期間'}).count(),0)
 assert.equal(await cv.getByRole('button',{name:'原価へ追加'}).count(),0)
 assert.equal(await cv.getByRole('button',{name:'確定原価として保存'}).count(),0)
 assert.equal(await cv.getByRole('button',{name:'暫定原価を保存'}).count(),0)
 assert.equal(await cv.locator('.costing-cost-row input').first().isDisabled(),true)
 await noHorizontalOverflow(cv,'Costing read-only 320px')
 await cv.screenshot({path:'qa/screenshots/astryx-costing-readonly-320.png',fullPage:true})
 costingView.verify();await costingView.context.close();passes++
 console.log('PASS costing read-only: mutating controls absent, cost inputs disabled, 320px mobile width')

 console.log('PASS',passes,'finance browser regression scenarios; ZERO business API calls')
}catch(err){
 console.error('FAIL finance browser regression',err)
 process.exitCode=1
}finally{await browser.close()}
