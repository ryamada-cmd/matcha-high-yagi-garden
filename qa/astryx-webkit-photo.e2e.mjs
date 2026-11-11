/**
 * WebKit/iPhone-simulated synthetic photo-selection regression.
 * This is WebKit on Linux with iPhone layout/user agent, NOT a physical iPhone.
 * No live OneDrive, Supabase, Microsoft or camera requests.
 */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { webkit, devices } from 'playwright'

const origin=process.env.QA_ORIGIN||'http://127.0.0.1:5178'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/jfXkAAAAASUVORK5CYII=','base64')
mkdirSync('qa/screenshots',{recursive:true})
const browser=await webkit.launch({headless:true})
let passes=0

async function openGallery({reader=false,width=390}={}){
 const context=await browser.newContext({...devices['iPhone 13'],viewport:{width,height:844},locale:'ja-JP'})
 const page=await context.newPage(),offOrigin=[],uncaught=[]
 await page.route('**/*',async route=>{
  const url=route.request().url()
  if(!url.startsWith(origin+'/')&&!url.startsWith('blob:')&&!url.startsWith('data:')){
   offOrigin.push(url.split('?')[0])
   await route.abort('blockedbyclient')
   return
  }
  await route.continue()
 })
 page.on('pageerror',error=>uncaught.push(error.message))
 await page.goto(origin+'/qa/index.html?screen=storage&view=photos'+(reader?'&viewOnly=1':''),
  {waitUntil:'networkidle',timeout:30000})
 await page.getByRole('heading',{name:'写真ギャラリー',exact:true}).first().waitFor()
 const verify=async()=>{
  assert.deepEqual(offOrigin,[],'External network requests forbidden')
  assert.deepEqual(uncaught,[],'No uncaught JavaScript errors')
  const size=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(size.scroll<=size.w+2,'Mobile overflow '+JSON.stringify(size))
 }
 return {page,context,verify}
}

try{
 const a=await openGallery()
 const p=a.page,library=p.getByLabel('写真ライブラリから写真を選ぶ')
 await p.locator('.photo-card').first().waitFor()
 assert.equal(await p.locator('.photo-card').count(),36)
 await library.setInputFiles({name:'qa-unsupported.txt',mimeType:'text/plain',buffer:Buffer.from('not a photo')})
 await p.getByText(/画像として認識できないファイル/).waitFor()
 assert.equal(await p.locator('.photo-selected-list>div').count(),0)
 await library.setInputFiles({name:'qa-over-25mb.png',mimeType:'image/png',buffer:Buffer.alloc(25*1024*1024+1)})
 await p.getByText(/25MBを超える写真/).waitFor()
 assert.equal(await p.locator('.photo-selected-list>div').count(),0)
 await a.verify()
 await a.context.close();passes++
 console.log('PASS WebKit photo input: unsupported files and oversized image rejected')

 const b=await openGallery()
 const q=b.page,input=q.getByLabel('写真ライブラリから写真を選ぶ')
 await q.getByPlaceholder('例：2026 一番茶 手摘み / 西宮イベント').fill('Safari架空アルバム')
 await q.locator('.photo-upload-fields select').first().selectOption('茶摘み')
 await input.setInputFiles([
  {name:'qa-webkit-photo.png',mimeType:'image/png',buffer:png},
  {name:'qa-webkit-photo.HEIC',mimeType:'application/octet-stream',buffer:Buffer.from('FAKE-HEIC-TEST-ONLY')},
 ])
 await q.locator('.photo-selected-list>div').first().waitFor()
 assert.equal(await q.locator('.photo-selected-list>div').count(),2,
  'Native input/change plus React handlers must not duplicate accepted files')
 assert.equal(await q.getByRole('button',{name:'写真をOneDriveへ保存'}).isDisabled(),false)
 await q.getByRole('button',{name:'写真をOneDriveへ保存'}).click()
 await q.getByText('2枚の写真をOneDriveへ保存しました。').waitFor()
 const saved=await q.evaluate(()=>window.__qa_photo_uploads)
 assert.equal(saved.length,2)
 assert.deepEqual(saved.map(x=>x.fileName),['qa-webkit-photo.png','qa-webkit-photo.HEIC'])
 assert.ok(saved.every(x=>x.album==='Safari架空アルバム'))
 assert.equal(await q.locator('.photo-selected-list>div').count(),0,'Selection resets after fake upload')
 await b.verify()
 await q.screenshot({path:'qa/screenshots/astryx-webkit-ios-upload-390.png',fullPage:true})
 await b.context.close();passes++
 console.log('PASS WebKit image selection: PNG + HEIC extension, no input/change duplicates, fake upload')

 const c=await openGallery({width:320})
 const x=c.page
 await x.locator('.photo-category-chips button').filter({hasText:'茶摘み'}).click()
 assert.equal(await x.locator('.photo-card').count(),1)
 await x.locator('.photo-card').first().click()
 const detail=x.getByRole('dialog',{name:'写真詳細'})
 await detail.waitFor()
 await detail.getByRole('button',{name:'閉じる'}).click()
 await detail.waitFor({state:'hidden'})
 await x.getByLabel('写真ライブラリから写真を選ぶ').setInputFiles({name:'qa-mobile-image.png',mimeType:'image/png',buffer:png})
 await x.locator('.photo-selected-list>div').first().waitFor()
 await x.getByRole('button',{name:'qa-mobile-image.pngを外す'}).click()
 assert.equal(await x.locator('.photo-selected-list>div').count(),0)
 assert.equal(await x.getByRole('button',{name:'写真をOneDriveへ保存'}).isDisabled(),true)
 await c.verify()
 await x.screenshot({path:'qa/screenshots/astryx-webkit-ios-gallery-320.png',fullPage:true})
 await c.context.close();passes++
 console.log('PASS WebKit 320px: filter, lightbox, remove photo and disabled upload')

 const d=await openGallery({reader:true,width:390})
 assert.equal(await d.page.locator('.photo-upload-card').count(),0)
 assert.equal(await d.page.locator('.photo-card').count(),36)
 await d.verify()
 await d.context.close();passes++
 console.log('PASS WebKit read-only role: gallery visible without file chooser')

 console.log('PASS',passes,'WebKit/iPhone-simulated synthetic photo scenarios; zero external API calls')
}catch(error){
 console.error('FAIL WebKit/iPhone photo regression',error)
 process.exitCode=1
}finally{
 await browser.close()
}
