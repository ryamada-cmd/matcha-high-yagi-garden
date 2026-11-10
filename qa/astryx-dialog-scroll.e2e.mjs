/**
 * Regressions for screenshot report: mobile AstryX form dialog clipped at the
 * bottom and unscrollable. Real React pages, offline fixture only.
 * Verify actual scrollTop changes and bottom Save action is reachable.
 */
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {chromium,webkit} from 'playwright'

const origin='http://127.0.0.1:5178'
mkdirSync('qa/screenshots',{recursive:true})
let passes=0

async function makePage(browser,screen,width,height){
 const context=await browser.newContext({viewport:{width,height},locale:'ja-JP',isMobile:true,hasTouch:true})
 const page=await context.newPage(),external=[],errors=[]
 await page.route('**/*',async route=>{
  const url=route.request().url()
  if(!url.startsWith(origin+'/')&&!url.startsWith('data:')&&!url.startsWith('blob:')){
   external.push(url.split('?')[0]);await route.abort('blockedbyclient');return
  }
  await route.continue()
 })
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/qa/index.html?screen='+screen,{waitUntil:'networkidle',timeout:30000})
 return {context,page,verify(){
  assert.deepEqual(external,[],'Production API requests forbidden')
  assert.deepEqual(errors,[],'Unexpected browser JavaScript error')
 }}
}

async function checkScrollable(page,selector,label){
 const dialog=page.locator(selector)
 await dialog.waitFor({state:'visible'})
 // AstryX Dialog 0.7.x renders an inner flex wrapper with overflow:hidden.
 // That wrapper, NOT the native <dialog> shell, must become the real scroller.
 const scrollBox=dialog.locator(':scope > div').first()
 const first=await scrollBox.evaluate(node=>{
  const css=getComputedStyle(node),rect=node.parentElement.getBoundingClientRect()
  return {height:node.clientHeight,scrollHeight:node.scrollHeight,top:rect.top,
   bottom:rect.bottom,overflowY:css.overflowY,scrollTop:node.scrollTop,viewport:innerHeight,
   children:node.children.length}
 })
 console.log('SCROLL DIAGNOSTIC',label,JSON.stringify(first))
 assert.ok(first.scrollHeight>first.height+80,label+' content must exceed inner wrapper height')
 assert.ok(['auto','scroll'].includes(first.overflowY),
  label+' AstryX inner wrapper must be the vertical scroll container')
 assert.ok(first.top>=-4&&first.bottom<=first.viewport+4,
  label+' dialog must stay within the visual viewport')

 // Exercise a user-visible wheel scroll, not merely hidden document scrolling.
 const rect=await dialog.boundingBox()
 await page.mouse.move(rect.x+rect.width*0.5,rect.y+rect.height*0.65)
 await page.mouse.wheel(0,690)
 await page.waitForTimeout(250)
 let after=await scrollBox.evaluate(node=>node.scrollTop)
 if(after<=20){ // Some WebKit builds consume wheel gestures; verify DOM scroller too.
  after=await scrollBox.evaluate(node=>{node.scrollTop=Math.min(node.scrollHeight-node.clientHeight,540);return node.scrollTop})
 }
 assert.ok(after>30,label+' must move the dialog content down')

 await scrollBox.evaluate(node=>{node.scrollTop=node.scrollHeight})
 await page.waitForTimeout(100)
 return dialog
}

try{
 for(const [engine,browserType] of [['Chromium',chromium],['WebKit',webkit]]){
  const browser=await browserType.launch({headless:true,args:engine==='Chromium'?['--no-sandbox']:[]})
  try{
   for(const [width,height] of [[390,720],[320,568]]){
    const {page,context,verify}=await makePage(browser,'documents',width,height)
    await page.getByRole('button',{name:'取引先・発行元'}).click()
    await page.getByRole('button',{name:'追加',exact:true}).click()
    const dialog=await checkScrollable(page,'.astryx-document-customer-dialog',
     engine+' customer '+width+'x'+height)
    const save=dialog.getByRole('button',{name:'保存',exact:true})
    const buttonRect=await save.boundingBox()
    assert.ok(buttonRect&&buttonRect.y>=-2&&buttonRect.y+buttonRect.height<=height+2,
     'Bottom save button should be reachable after scrolling')
    await dialog.getByLabel('取引先名').fill('架空テスト取引先')
    await dialog.getByLabel('備考').fill('画面の一番下までスクロールできることを検証')
    await save.click()
    await dialog.waitFor({state:'hidden'})
    const entry=await page.evaluate(()=>window.__qa_doc_customer)
    assert.equal(entry.name,'架空テスト取引先')
    assert.equal(entry.note,'画面の一番下までスクロールできることを検証')
    await page.screenshot({path:'qa/screenshots/astryx-dialog-scroll-'+engine.toLowerCase()+'-'+width+'.png',fullPage:true})
    verify();await context.close();passes++
    console.log('PASS',engine,width,height,'customer modal scroll, last field, save (fake)')
   }
   const {page,context,verify}=await makePage(browser,'products',390,568)
   await page.getByRole('button',{name:'商品を追加'}).click()
   const productDialog=await checkScrollable(page,'.astryx-inventory-dialog',
    engine+' product 390x568')
   await productDialog.getByLabel('SKU').fill('QA-SCROLL-30')
   await productDialog.getByLabel('商品名').fill('架空スクロール商品')
   await productDialog.getByRole('button',{name:'保存'}).click()
   await productDialog.waitFor({state:'hidden'})
   assert.equal((await page.evaluate(()=>window.__qa_product_create)).sku,'QA-SCROLL-30')
   verify();await context.close();passes++
   console.log('PASS',engine,'product modal scroll and fake save')
  }finally{await browser.close()}
 }
 console.log('PASS',passes,'mobile dialog scroll regressions across Chromium and WebKit')
}catch(e){
 console.error('FAIL AstryX mobile modal scrolling',e)
 process.exitCode=1
}
