/**
 * Phase 11: Real photo gallery, weather location and home dashboard components.
 * Every service is an in-memory mock; off-origin HTTP is rejected and reported.
 */
import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {chromium} from 'playwright'

const origin='http://127.0.0.1:5178'
mkdirSync('qa/screenshots',{recursive:true})
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
let passes=0

async function fixture(screen,width,{viewOnly=false,minimal=false,photoMode=false}={}){
 const context=await browser.newContext({viewport:{width,height:844},locale:'ja-JP'})
 const page=await context.newPage(),external=[],errors=[]
 await page.route('**/*',async route=>{
  const url=route.request().url()
  if(!url.startsWith(origin+'/')&&!url.startsWith('data:')&&!url.startsWith('blob:')){
   external.push(url.split('?')[0]);await route.abort('blockedbyclient');return
  }
  await route.continue()
 })
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto(origin+'/qa/index.html?screen='+screen+(photoMode?'&view=photos':'')+
  (viewOnly?'&viewOnly=1':'')+(minimal?'&minimal=1':''),
  {waitUntil:'networkidle',timeout:30000})
 return {page,context,verify(){
  assert.deepEqual(external,[],'Unexpected external network attempt')
  assert.deepEqual(errors,[],'Uncaught JavaScript errors')
 }}
}
async function compact(page,label){
 const dims=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
 assert.ok(dims.scroll<=dims.w+2,label+' viewport overflow '+JSON.stringify(dims))
}
try{
 const gallery=await fixture('storage',390,{photoMode:true})
 const g=gallery.page
 await g.getByRole('heading',{name:'写真ギャラリー',exact:true}).first().waitFor()
 await g.locator('.photo-card').first().waitFor()
 assert.equal(await g.locator('.photo-card').count(),36,'Photo grid initially limits to 36')
 await g.getByRole('button',{name:/さらに表示/}).click()
 assert.equal(await g.locator('.photo-card').count(),39,'Load more shows all synthetic images')
 await g.locator('.photo-category-chips button').filter({hasText:'茶摘み'}).click()
 assert.equal(await g.locator('.photo-card').count(),1)
 await g.getByPlaceholder('写真・アルバム・メモを検索').fill('QA-茶摘み初日')
 assert.equal(await g.locator('.photo-card').count(),1)
 await g.locator('.photo-card').first().click()
 const lightbox=g.getByRole('dialog',{name:'写真詳細'})
 await lightbox.waitFor()
 await lightbox.getByText('一番茶').first().waitFor()
 await lightbox.getByRole('button',{name:'閉じる'}).click()
 await lightbox.waitFor({state:'hidden'})
 await compact(g,'Gallery 390')
 await g.screenshot({path:'qa/screenshots/astryx-gallery-mobile-390.png',fullPage:true})
 gallery.verify();await gallery.context.close();passes++
 console.log('PASS gallery browse: 39 fake photos, lazy paging, category/search, detail lightbox, mobile')

 const upload=await fixture('storage',390,{photoMode:true})
 const u=upload.page
 await u.getByRole('heading',{name:'写真ギャラリー',exact:true}).first().waitFor()
 const picker=u.getByRole('textbox',{name:'アルバム・案件名'})
 await picker.fill('架空 2026 一番茶')
 await u.locator('.photo-upload-fields select').first().selectOption('茶摘み')
 await u.locator('.photo-upload-fields select').nth(1).selectOption('field:qa-field-1')
 await u.getByPlaceholder('例：手摘み初日、イベント設営、修理前の状態').fill('架空QAメモ')
 const photoFile=u.getByLabel('写真ライブラリから写真を選ぶ')
 await photoFile.setInputFiles({name:'qa-not-an-image.txt',mimeType:'text/plain',buffer:Buffer.from('INVALID QA IMAGE')})
 await u.getByText(/画像として認識できないファイル/).waitFor()
 assert.equal(await u.locator('.photo-selected-list>div').count(),0,'Invalid file must be rejected')
 await photoFile.setInputFiles({name:'qa-test-photo.png',mimeType:'image/png',
  buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/jfXkAAAAASUVORK5CYII=','base64')})
 await u.locator('.photo-selected-list>div').first().waitFor()
 assert.equal(await u.locator('.photo-selected-list>div').count(),1,'Input/change events must not duplicate selected file')
 await u.getByRole('button',{name:'写真をOneDriveへ保存'}).click()
 await u.getByText('1枚の写真をOneDriveへ保存しました。').waitFor()
 const uploaded=await u.evaluate(()=>window.__qa_photo_uploads)
 assert.equal(uploaded.length,1,'One accepted image must cause one upload')
 assert.equal(uploaded[0].fileName,'qa-test-photo.png')
 assert.equal(uploaded[0].album,'架空 2026 一番茶')
 assert.equal(uploaded[0].entityId,'qa-field-1')
 assert.equal(uploaded[0].note,'架空QAメモ')
 await u.locator('.photo-category-chips button').filter({hasText:'茶摘み'}).click()
 assert.equal(await u.locator('.photo-card').count(),2)
 await compact(u,'Gallery fake upload 390')
 await u.screenshot({path:'qa/screenshots/astryx-gallery-upload-390.png',fullPage:true})
 upload.verify();await upload.context.close();passes++
 console.log('PASS gallery upload: invalid image rejected, duplicate event avoided, metadata & link saved only in memory')

 const read=await fixture('storage',320,{photoMode:true,viewOnly:true})
 await read.page.locator('.photo-card').first().waitFor()
 assert.equal(await read.page.locator('.photo-upload-card').count(),0,'Reader cannot upload photos')
 assert.equal(await read.page.locator('.photo-card').count(),36)
 await compact(read.page,'Gallery read-only 320')
 read.verify();await read.context.close();passes++
 console.log('PASS gallery read-only: photos visible, upload hidden at 320px')

 const weather=await fixture('settings',390)
 const w=weather.page
 await w.getByRole('heading',{name:'天気の表示地点'}).waitFor()
 await w.getByPlaceholder('例：井手町 京都府 / 宇治市 / 京都市').fill('a')
 await w.getByRole('button',{name:'地点を検索'}).click()
 await w.getByText('地名を2文字以上入力してください。').waitFor()
 await w.getByPlaceholder('例：井手町 京都府 / 宇治市 / 京都市').fill('架空宇治')
 await w.getByRole('button',{name:'地点を検索'}).click()
 await w.locator('.weather-location-results button').nth(1).click()
 await w.getByRole('button',{name:'天気地点を保存'}).click()
 await w.getByText('天気地点を保存しました。ダッシュボードへ反映されます。').waitFor()
 const saved=await w.evaluate(()=>window.__qa_weather_saved)
 assert.ok(saved.weatherLocationName.startsWith('架空宇治市'),'Location name preserves locality and country')
 assert.equal(saved.weatherLatitude,34.9)
 assert.equal(saved.weatherLongitude,135.7)
 await compact(w,'Weather picker 390')
 await w.screenshot({path:'qa/screenshots/astryx-weather-settings-390.png',fullPage:true})
 weather.verify();await weather.context.close();passes++
 console.log('PASS weather: real search UI, minimum query, chosen coordinates, in-memory save')

 const weatherRead=await fixture('settings',320,{viewOnly:true})
 const wr=weatherRead.page
 await wr.getByRole('heading',{name:'天気の表示地点'}).waitFor()
 assert.equal(await wr.getByRole('button',{name:'地点を検索'}).isDisabled(),true)
 assert.equal(await wr.getByRole('button',{name:'天気地点を保存'}).isDisabled(),true)
 await compact(wr,'Weather read-only 320')
 weatherRead.verify();await weatherRead.context.close();passes++
 console.log('PASS weather read-only: no search or save permitted, 320px')

 const dashboard=await fixture('dashboard',390)
 const d=dashboard.page
 await d.getByRole('heading',{name:'茶園管理ダッシュボード',exact:true}).waitFor()
 await d.getByText('架空の圃場点検').first().waitFor()
 const metrics=await d.locator('.home-overview-metrics').innerText()
 for(const key of ['120,000','75,000','77kg'])assert.ok(metrics.includes(key),'Missing synthetic KPI '+key)
 assert.equal(await d.locator('.home-work-column.overdue article').count(),1)
 await d.locator('.home-work-column.overdue article button').first().click()
 await d.getByText('期限超過はありません。').waitFor()
 const completion=await d.evaluate(()=>window.__qa_home_task_changed)
 assert.equal(completion.id,'qa-home-overdue')
 assert.equal(completion.status,'DONE')
 await d.getByRole('heading',{name:'天気',exact:true}).waitFor()
 await compact(d,'Dashboard 390')
 await d.screenshot({path:'qa/screenshots/astryx-dashboard-mobile-390.png',fullPage:true})
 dashboard.verify();await dashboard.context.close();passes++
 console.log('PASS dashboard: current KPI, three due-date groups, in-memory task completion, fake weather')

 const minimal=await fixture('dashboard',320,{minimal:true})
 const md=minimal.page
 await md.getByRole('heading',{name:'茶園管理ダッシュボード',exact:true}).waitFor()
 assert.equal(await md.locator('.home-overview-metrics').count(),0,'Restricted role cannot see unauthorized business KPIs')
 assert.equal(await md.locator('.home-quick-actions').count(),0,'No unauthorized write shortcuts')
 assert.equal(await md.locator('.home-workboard').count(),0,'Calendar gated by calendar.view')
 await md.getByRole('heading',{name:'天気',exact:true}).waitFor()
 await compact(md,'Minimal dashboard 320')
 minimal.verify();await minimal.context.close();passes++
 console.log('PASS dashboard minimal role: confidential KPI and quick actions absent at 320px')

 const dashboardRead=await fixture('dashboard',390,{viewOnly:true})
 const dr=dashboardRead.page
 await dr.getByText('架空の圃場点検').first().waitFor()
 assert.equal(await dr.locator('.home-work-column.overdue article button').count(),0,
  'Read-only task list cannot mark completion')
 await compact(dr,'Dashboard view-only 390')
 dashboardRead.verify();await dashboardRead.context.close();passes++
 console.log('PASS dashboard reader: task status controls hidden while overdue lists stay visible')

 console.log('PASS',passes,'new isolated photo/weather/dashboard scenarios; zero real API calls')
}catch(err){
 console.error('FAIL AstryX phase 11 browser regression',err)
 process.exitCode=1
}finally{await browser.close()}
