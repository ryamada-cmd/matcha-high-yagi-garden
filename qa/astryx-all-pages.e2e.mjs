import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {chromium,webkit} from 'playwright'
const origin=process.env.QA_ORIGIN||'http://127.0.0.1:5178'
const screens=['dashboard','sprays','spray-history','inventory','pesticides','plans','fertilizer-applications','fertilizer-history','fertilizer-inventory','fertilizers','fertilizer-plans','harvest','tea-inventory','tea-procurement','costing','production','products','prices','packaging','sales','documents','crm','equipment','calendar','daily-reports','expenses','vendor-invoices','fields','dossier','library','storage','manual','settings']
const results=[]
mkdirSync('qa/screenshots',{recursive:true})
mkdirSync('qa/results',{recursive:true})
async function pageFor(browser,screen,width,height=740){
 const context=await browser.newContext({viewport:{width,height},locale:'ja-JP',hasTouch:width<801})
 const page=await context.newPage(),errors=[],external=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',route=>{
  const url=route.request().url()
  if(url.startsWith(origin+'/')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue()
  external.push(url.split('?')[0]);return route.abort()
 })
 await page.goto(`${origin}/qa/index.html?screen=${screen}`,{waitUntil:'networkidle'})
 await page.locator('main .page').waitFor()
 return {page,context,verify(){assert.deepEqual(errors,[]);assert.deepEqual(external,[])}}
}
for(const [engine,launcher,widths] of [['chromium',chromium,[320,390,1280]],['webkit',webkit,[390]]]){
 const browser=await launcher.launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]})
 try{
  for(const width of widths)for(const screen of screens){
   const {page,context,verify}=await pageFor(browser,screen,width)
   try{
    assert.equal(await page.locator('.notice.error:visible').count(),0,`${screen} must load successfully`)
    const geometry=await page.evaluate(()=>{
     const heading=document.querySelector('main h1'),font=getComputedStyle(heading).fontFamily
     return {width:innerWidth,scroll:document.documentElement.scrollWidth,font,
      heading:heading.textContent,
      inputs:[...document.querySelectorAll('main input:not([type=file]):not([type=hidden]):not([type=checkbox]):not([type=radio]),main select,main textarea')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({font:parseFloat(getComputedStyle(e).fontSize),w:e.getBoundingClientRect().width}))}
    })
    assert.ok(geometry.scroll<=width+2,`${screen} ${width}px overflow: ${JSON.stringify(geometry)}`)
    assert.ok(!geometry.font.includes('Georgia')&&!geometry.font.includes('Playwrite'),`${screen} heading must use Japanese sans-serif`)
    assert.ok(geometry.inputs.every(x=>x.font>=16&&x.w>24),`${screen} legible input controls: ${JSON.stringify(geometry.inputs)}`)
    const tabs=page.locator('main [class*="-tabs"] button')
    const names=await tabs.allTextContents()
    for(let i=0;i<names.length;i++){
     await tabs.nth(i).click()
     assert.equal(await page.locator('main h1').count(),1)
     assert.ok(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+2),`${screen} tab ${names[i]} overflow`)
    }
    verify()
    if(width===390&&engine==='chromium')await page.screenshot({path:`qa/screenshots/audit-${screen}-390.png`,fullPage:true})
    results.push({engine,screen,width,status:'PASS',tabs:names.length})
    console.log('PASS',engine,screen,width,'render, typography, controls, tabs, overflow')
   }catch(error){
    await page.screenshot({path:`qa/screenshots/FAIL-${engine}-${screen}-${width}.png`,fullPage:true})
    console.error('FAIL',engine,screen,width,error.message)
    results.push({engine,screen,width,status:'FAIL',error:error.message})
   }finally{await context.close()}
  }
  // Long dialogs must work above the former 800px cutoff and in landscape.
  for(const [screen,buttons] of [
   ['documents',['取引先・発行元','追加']],['products',['商品を追加']],
   ['fertilizers',['肥料を追加']],['inventory',['農薬を入庫']],
   ['production',['原料・製品を入庫']],['fertilizer-plans',['計画を追加']],
  ])for(const [width,height] of [[390,568],[1280,480]]){
   const {page,context,verify}=await pageFor(browser,screen,width,height)
   try{
    for(const name of buttons)await page.getByRole('button',{name,exact:true}).click()
    const dialog=page.locator('dialog.app-dialog[open]');await dialog.waitFor()
    const scroller=dialog.locator(':scope > div').first()
    const metrics=await scroller.evaluate(el=>{const r=el.parentElement.getBoundingClientRect();return {h:el.clientHeight,scroll:el.scrollHeight,overflow:getComputedStyle(el).overflowY,top:r.top,bottom:r.bottom}})
    assert.ok(metrics.top>=-2&&metrics.bottom<=height+2,JSON.stringify(metrics))
    assert.equal(metrics.overflow,'auto')
    if(metrics.scroll>metrics.h+10){
     await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight})
     assert.ok(await scroller.evaluate(el=>el.scrollTop)>0,'Long form must scroll')
    }
    const save=dialog.locator('button[type=submit]').last()
    if(await save.count()){
     await save.scrollIntoViewIfNeeded()
     const box=await save.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=height+2,'Save reachable')
    }
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'})
    verify();results.push({engine,screen,width,height,status:'PASS',dialog:true})
    console.log('PASS',engine,screen,width,height,'dialog scroll, save reachability, Escape')
   }catch(error){
    await page.screenshot({path:`qa/screenshots/FAIL-dialog-${engine}-${screen}-${width}.png`,fullPage:true})
    console.error('FAIL dialog',engine,screen,width,error.message)
    results.push({engine,screen,width,height,status:'FAIL',error:error.message})
   }finally{await context.close()}
  }
 }finally{await browser.close()}
}
writeFileSync('qa/results/all-pages.json',JSON.stringify(results,null,2))
assert.equal(results.filter(r=>r.status==='FAIL').length,0,'All-screen UI regressions; inspect FAIL logs/screenshots')
console.log('PASS',results.length,'all-screen and low-height dialog checks')
