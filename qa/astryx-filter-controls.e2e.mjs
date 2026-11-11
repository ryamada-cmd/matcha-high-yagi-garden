/**
 * Screenshot regression: AstryX TextInput search rows had a double border and
 * over-wide nested <input> while native month/select filters were narrower.
 * Validate real component styles at iPhone widths, plus other module searches.
 */
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {chromium,webkit} from 'playwright'
const origin=process.env.QA_ORIGIN||'http://127.0.0.1:5178'
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
    const field=bar.querySelector('.astryx-search-field')
    const wrapper=field.querySelector('.astryx-text-input')
    const input=wrapper?.querySelector('input')
    const fieldStyle=getComputedStyle(field),controlStyle=getComputedStyle(wrapper),innerStyle=getComputedStyle(input)
    const outer=field.getBoundingClientRect(),control=wrapper.getBoundingClientRect(),inner=input.getBoundingClientRect()
    return {rects,fieldBorder:fieldStyle.borderLeftWidth,
      controlBorder:controlStyle.borderLeftWidth,controlShadow:controlStyle.boxShadow,
      controlBg:controlStyle.backgroundColor,inputBorder:innerStyle.borderLeftWidth,
      inputShadow:innerStyle.boxShadow,inputBg:innerStyle.backgroundColor,
      inputWidth:inner.width,controlWidth:control.width,fieldWidth:outer.width,
      fieldHeight:outer.height,toolbarWidth:bar.getBoundingClientRect().width,
      viewport:innerWidth,pageScrollWidth:document.documentElement.scrollWidth}
   })
   console.log('FILTER DIAGNOSTIC',engine,width,JSON.stringify(controls))
   assert.equal(controls.rects.length,4,'Search, month, status, applicant must remain visible')
   assert.ok(parseFloat(controls.fieldBorder)>=1,'Search Field owns the only visible border')
   assert.equal(parseFloat(controls.controlBorder),0,'AstryX TextInput control must NOT draw an inset second border')
   assert.equal(controls.controlShadow,'none','Inner AstryX control must not draw a second outline')
   assert.equal(controls.controlBg,'rgba(0, 0, 0, 0)','Inner AstryX control must be transparent')
   assert.equal(parseFloat(controls.inputBorder),0,'Native input must be borderless')
   assert.equal(controls.inputShadow,'none','Native input must have no extra shadow')
   assert.equal(controls.inputBg,'rgba(0, 0, 0, 0)','Native input background must be transparent')
   assert.ok(controls.inputWidth<controls.controlWidth-10,
    'Input must leave room for AstryX search icon and clear button')
   assert.ok(controls.controlWidth<=controls.fieldWidth,'Inner control must fit inside Field')
   assert.ok(controls.fieldHeight>=44,'Touch-friendly search control height')
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
  for(const [screen,searchLabel,viewportWidth] of [
   ['inventory','農薬在庫の検索',390],
   ['products','商品マスタを検索',390],
   ['vendor-invoices','仕入請求書を検索',390],
   ['documents','帳票を検索',390],
   ['prices','商品価格を検索',1280]
  ]){
   const context=await browser.newContext({viewport:{width:viewportWidth,height:844}})
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
    const control=input.closest('.astryx-text-input')
    const field=input.closest('.astryx-search-field')
    const a=getComputedStyle(input),b=getComputedStyle(control),c=getComputedStyle(field)
    const ir=input.getBoundingClientRect(),cr=control.getBoundingClientRect(),fr=field.getBoundingClientRect()
    return {inputBorder:a.borderLeftWidth,controlBorder:b.borderLeftWidth,
      fieldBorder:c.borderLeftWidth,controlShadow:b.boxShadow,
      inputWidth:ir.width,controlWidth:cr.width,fieldWidth:fr.width,
      pageOverflow:document.documentElement.scrollWidth-innerWidth}
   })
   assert.ok(parseFloat(styles.fieldBorder)>=1,screen+' search Field border missing')
   assert.equal(parseFloat(styles.controlBorder),0,screen+' inset AstryX control border')
   assert.equal(parseFloat(styles.inputBorder),0,screen+' duplicate native input border')
   assert.equal(styles.controlShadow,'none',screen+' inset control shadow')
   assert.ok(styles.inputWidth<styles.controlWidth,screen+' inner control too wide')
   assert.ok(styles.controlWidth<=styles.fieldWidth,screen+' inset control exceeds Field width')
   assert.ok(styles.pageOverflow<=2,screen+' viewport overflow')
   await search.fill('QA-FILTER')
   assert.equal(await search.inputValue(),'QA-FILTER')
   assert.deepEqual(offOrigin,[])
   await context.close();pass++
   console.log('PASS',engine,screen,'single outer Field border (zero inset borders) and working search')
  }
 }finally{await browser.close()}
}
console.log('PASS',pass,'AstryX unified field-control browser scenarios, no external data access')
