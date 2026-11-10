/**
 * Screenshot regression: AstryX TextInput search rows had a double border and
 * over-wide nested <input> while native month/select filters were narrower.
 * Validate real component styles at iPhone widths, plus other module searches.
 */
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {chromium,webkit} from 'playwright'
const origin='http://127.0.0.1:5178'
mkdirSync('qa/screenshots',{recursive:true})
let pass=0
const engines=process.env.QA_BROWSER==='chromium'?[['chromium',chromium]]:[['chromium',chromium],['webkit',webkit]];
for(const [engine,launcher] of engines){
 const browser=await launcher.launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]})
 try{
  for(const width of [320,390]){
   const context=await browser.newContext({viewport:{width,height:844},locale:'ja-JP',hasTouch:true})
   const page=await context.newPage(),network=[],errors=[]
   await page.route('**/*',async route=>{
    const url=route.request().url()
    if(!url.startsWith(origin+'/')&&!url.startsWith('data:')&&!url.startsWith('blob:')){
     network.push(url);await route.abort('blockedbyclient');return
    }
    await route.continue()
   })
   page.on('pageerror',e=>errors.push(e.message))
   await page.goto(origin+'/qa/index.html?screen=expenses',{waitUntil:'networkidle'})
   await page.getByRole('heading',{name:'申請一覧・承認'}).waitFor()
   const controls=await page.locator('.expense-toolbar').evaluate(bar=>{
    const nodes=[...bar.children],rects=nodes.map(node=>{
     const r=node.getBoundingClientRect(),style=getComputedStyle(node)
     return {tag:node.tagName,x:r.x,y:r.y,w:r.width,h:r.height,
      gridColumn:style.gridColumn,boxSizing:style.boxSizing}
    })
    const wrapper=bar.querySelector('.astryx-text-input')
    const input=wrapper?.querySelector('input')
    const outerStyle=getComputedStyle(wrapper),innerStyle=getComputedStyle(input)
    const outer=wrapper.getBoundingClientRect(),inner=input.getBoundingClientRect()
    return {rects,wrapperBorder:outerStyle.borderLeftWidth,
      inputBorder:innerStyle.borderLeftWidth,inputShadow:innerStyle.boxShadow,
      inputBg:innerStyle.backgroundColor,inputWidth:inner.width,wrapperWidth:outer.width,
      wrapperHeight:outer.height,toolbarWidth:bar.getBoundingClientRect().width,
      viewport:innerWidth,pageScrollWidth:document.documentElement.scrollWidth}
   })
   console.log('FILTER DIAGNOSTIC',engine,width,JSON.stringify(controls))
   assert.equal(controls.rects.length,4,'Search, month, status, applicant must remain visible')
   assert.ok(parseFloat(controls.wrapperBorder)>=1,'AstryX component owns one visible border')
   assert.equal(parseFloat(controls.inputBorder),0,'Nested input must NOT draw a second border')
   assert.equal(controls.inputShadow,'none','Nested input must not add its own focus shadow')
   assert.equal(controls.inputBg,'rgba(0, 0, 0, 0)','Native input background must be transparent')
   assert.ok(controls.inputWidth<controls.wrapperWidth-10,
    'Input must leave room for AstryX search icon and clear button')
   assert.ok(controls.wrapperHeight>=44,'Touch-friendly search control height')
   assert.ok(controls.pageScrollWidth<=width+2,'No horizontal page overflow')
   const target=controls.rects[0]
   for(const field of controls.rects){
    assert.ok(Math.abs(field.x-target.x)<=2,'All four filters share the same left boundary')
    assert.ok(Math.abs(field.w-target.w)<=2,'All four filters have the same width')
    assert.ok(field.h>=44,'Every filter is at least 44px tall')
   }
   for(let i=1;i<controls.rects.length;i++){
    assert.ok(controls.rects[i].y>controls.rects[i-1].y+8,
     'Each filter occupies a separate mobile row without overlap')
   }
   const search=page.getByRole('searchbox',{name:'経費精算を検索'})
   await search.fill('架空-検索確認')
   assert.equal(await search.inputValue(),'架空-検索確認')
   await page.screenshot({path:'qa/screenshots/astryx-filter-expenses-'+engine+'-'+width+'.png',fullPage:true})
   assert.deepEqual(network,[],'No production API requests')
   assert.deepEqual(errors,[],'No browser page errors')
   await context.close();pass++
   console.log('PASS',engine,width,'expense search border, icon sizing, four aligned filters')
  }
  for(const [screen,searchLabel] of [
   ['inventory','農薬在庫の検索'],
   ['products','商品マスタを検索'],
   ['vendor-invoices','仕入請求書を検索'],
   ['documents','帳票を検索']
  ]){
   const context=await browser.newContext({viewport:{width:390,height:844}})
   const page=await context.newPage(),offOrigin=[]
   await page.route('**/*',route=>{
    if(!route.request().url().startsWith(origin+'/')&&!route.request().url().startsWith('data:'))
      {offOrigin.push(route.request().url());return route.abort('blockedbyclient')}
    return route.continue()
   })
   await page.goto(origin+'/qa/index.html?screen='+screen,{waitUntil:'networkidle'})
   const search=page.getByRole('searchbox',{name:searchLabel})
   await search.waitFor()
   const styles=await search.evaluate(input=>{
    const outer=input.closest('.astryx-text-input')
    const a=getComputedStyle(input),b=getComputedStyle(outer),ir=input.getBoundingClientRect(),or=outer.getBoundingClientRect()
    return {insideBorder:a.borderLeftWidth,outsideBorder:b.borderLeftWidth,
      shadow:a.boxShadow,innerWidth:ir.width,outerWidth:or.width,
      pageOverflow:document.documentElement.scrollWidth-innerWidth}
   })
   assert.equal(parseFloat(styles.insideBorder),0,screen+' duplicate input border')
   assert.ok(parseFloat(styles.outsideBorder)>=1,screen+' wrapper border missing')
   assert.equal(styles.shadow,'none')
   assert.ok(styles.innerWidth<styles.outerWidth,screen+' inner control too wide')
   assert.ok(styles.pageOverflow<=2,screen+' viewport overflow')
   await search.fill('QA-FILTER')
   assert.equal(await search.inputValue(),'QA-FILTER')
   assert.deepEqual(offOrigin,[])
   await context.close();pass++
   console.log('PASS',engine,screen,'single AstryX TextInput border and working search')
  }
 }finally{await browser.close()}
}
console.log('PASS',pass,'AstryX unified field-control browser scenarios, no external data access')
