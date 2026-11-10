/**
 * AstryX phase 10: four actual admin/library React pages with 100% fake backends.
 * Playwright forbids all requests away from the local QA origin.
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
 return {page,context,verify:()=>{
  assert.deepEqual(external,[],'External request attempted')
  assert.deepEqual(errors,[],'Uncaught page error')
 }}
}
async function noOverflow(page,label){
 const x=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}))
 assert.ok(x.s<=x.w+2,label+' horizontal overflow '+JSON.stringify(x))
}
try{
 const manual=await fixture('manual',{width:390,height:844})
 const m=manual.page
 await m.getByRole('heading',{name:'操作ガイド',exact:true}).waitFor()
 await m.locator('.manual-card').first().waitFor()
 assert.ok(await m.locator('.manual-card').count()>30,'Manual must have real coverage')
 const search=m.getByPlaceholder('操作・機能・キーワードで説明書を検索')
 await search.fill('OneDrive')
 assert.ok(await m.locator('.manual-card').count()>0,'OneDrive help should remain searchable')
 await search.fill('QA-EXACT-NOT-A-REAL-KEYWORD')
 await m.getByText('に一致する説明はありません。',{exact:false}).waitFor()
 assert.equal(await m.locator('.manual-card').count(),0)
 await search.fill('')
 await noOverflow(m,'manual 390px')
 await m.screenshot({path:'qa/screenshots/astryx-manual-mobile-390.png',fullPage:true})
 manual.verify();await manual.context.close();passes++
 console.log('PASS manual: real guide data, search results/empty state, 390px width, no external requests')

 const storage=await fixture('storage',{width:390,height:844})
 const s=storage.page
 await s.getByRole('heading',{name:'ファイル・OneDrive',exact:true}).waitFor()
 await s.getByText('OneDrive 接続済み').waitFor()
 assert.equal(await s.locator('.storage-file-row').count(),2)
 await s.getByPlaceholder('ファイル名・関連記録・フォルダ・分類・メモで検索').fill('QA-圃場記録')
 assert.equal(await s.locator('.storage-file-row').count(),1)
 await s.getByPlaceholder('ファイル名・関連記録・フォルダ・分類・メモで検索').fill('')
 const uploadFile=s.locator('.storage-file-input input[type="file"]')
 await uploadFile.setInputFiles({name:'qa-field-report.pdf',mimeType:'application/pdf',
  buffer:Buffer.from('%PDF-1.4\nQA ONLY\n')})
 await s.getByRole('button',{name:'OneDriveへ保存'}).click()
 await s.getByText('qa-field-report.pdf をOneDriveへ保存しました。').waitFor()
 assert.equal((await s.evaluate(()=>window.__qa_storage_upload)).name,'qa-field-report.pdf')
 assert.equal(await s.locator('.storage-file-row').count(),3)
 await noOverflow(s,'storage 390px')
 await s.screenshot({path:'qa/screenshots/astryx-storage-mobile-390.png',fullPage:true})
 storage.verify();await storage.context.close();passes++
 console.log('PASS storage: mock OneDrive file list, search, in-memory upload, no off-origin requests')

 const storageReader=await fixture('storage',{width:320,height:720},{viewOnly:true})
 const sr=storageReader.page
 await sr.getByRole('heading',{name:'ファイル・OneDrive',exact:true}).waitFor()
 assert.equal(await sr.locator('.storage-config-panel').count(),0,'Microsoft credentials screen hidden from nonmanager')
 assert.equal(await sr.locator('.storage-upload-panel').count(),0,'Upload hidden without storage.upload')
 assert.equal(await sr.locator('.storage-file-row').count(),2)
 await noOverflow(sr,'read-only storage 320px')
 storageReader.verify();await storageReader.context.close();passes++
 console.log('PASS storage reader: no Microsoft secret editor or upload actions, mobile 320px')

 const library=await fixture('library',{width:390,height:844})
 const l=library.page
 await l.getByRole('heading',{name:'資料ライブラリ',exact:true}).waitFor()
 await l.getByText('架空仕入請求書').first().waitFor()
 assert.equal(await l.locator('.library-file-card').count(),2)
 await l.getByPlaceholder('資料名・取引先・タグ・内容・ファイル名で検索').fill('架空問屋甲')
 assert.equal(await l.locator('.library-file-card').count(),1)
 await l.getByPlaceholder('資料名・取引先・タグ・内容・ファイル名で検索').fill('')
 await l.locator('.library-toolbar select').nth(1).selectOption('圃場')
 assert.equal(await l.locator('.library-file-card').count(),1,'Category filter')
 await l.locator('.library-toolbar select').nth(1).selectOption('')
 await l.locator('.library-file-main').first().click()
 const detail=l.getByRole('dialog',{name:'資料詳細'})
 await detail.waitFor()
 await detail.getByText('架空問屋甲').waitFor()
 await detail.getByRole('button',{name:'閉じる'}).click()
 await detail.waitFor({state:'hidden'})
 await l.getByRole('button',{name:'資料を追加'}).click()
 await l.locator('.library-file-picker input[type="file"]').setInputFiles({
  name:'qa-contract.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nFAKE DOCUMENT\n')
 })
 await l.locator('.library-upload-grid label').filter({hasText:'資料名'}).locator('input').fill('架空の契約書')
 await l.locator('.library-upload-grid label').filter({hasText:'資料種別'}).locator('select').selectOption('契約書')
 await l.locator('.library-upload-grid label').filter({hasText:'タグ'}).locator('input').fill('架空,契約')
 await l.getByRole('button',{name:'資料ライブラリへ保存'}).click()
 await l.getByText('qa-contract.pdf を資料ライブラリへ保存しました。').waitFor()
 const uploaded=await l.evaluate(()=>window.__qa_library_meta_saved)
 assert.equal(uploaded.title,'架空の契約書')
 assert.equal(uploaded.documentType,'契約書')
 assert.deepEqual(uploaded.tags,['架空','契約'])
 assert.equal(await l.locator('.library-file-card').count(),3)
 await noOverflow(l,'library 390px')
 await l.screenshot({path:'qa/screenshots/astryx-library-mobile-390.png',fullPage:true})
 library.verify();await library.context.close();passes++
 console.log('PASS library: real cards, search, category, detail dialog, fake file+metadata upload, no API')

 const libraryReader=await fixture('library',{width:320,height:720},{viewOnly:true})
 const lr=libraryReader.page
 await lr.getByRole('heading',{name:'資料ライブラリ',exact:true}).waitFor()
 assert.equal(await lr.getByRole('button',{name:'資料を追加'}).count(),0)
 assert.equal(await lr.locator('.library-upload-panel').count(),0)
 assert.equal(await lr.locator('.library-file-card').count(),2)
 await noOverflow(lr,'read-only library 320px')
 libraryReader.verify();await libraryReader.context.close();passes++
 console.log('PASS library reader: no upload controls; read-only search and list intact')

 const settings=await fixture('settings',{width:390,height:844})
 const p=settings.page
 await p.getByRole('heading',{name:'設定・監査',exact:true}).waitFor()
 await p.getByText('架空管理者').first().waitFor()
 assert.equal(await p.locator('.audit-row').count(),2)
 await p.getByPlaceholder('操作・対象・ユーザー・IDで検索').fill('QA-INVOICE')
 assert.equal(await p.locator('.audit-row').count(),1)
 await p.locator('.audit-summary').first().click()
 await p.getByRole('heading',{name:'変更後'}).waitFor()
 await p.getByPlaceholder('操作・対象・ユーザー・IDで検索').fill('')
 const firstThreshold=p.locator('.settings-grid input[type="number"]').first()
 await firstThreshold.fill('27')
 await p.getByRole('button',{name:'設定を保存',exact:true}).click()
 await p.getByText('警告基準を更新しました。ダッシュボードへ即時反映されます。').waitFor()
 assert.equal((await p.evaluate(()=>window.__qa_settings_saved)).lowStockPercent,27)
 const groups=p.locator('.permission-row')
 assert.equal(await groups.count(),3)
 assert.equal(await groups.nth(2).locator('input[type="checkbox"]').first().isDisabled(),true,
  'Locked permission cannot be edited')
 await groups.nth(1).locator('input[type="checkbox"]').nth(1).check()
 await p.getByRole('button',{name:'権限設定を保存'}).click()
 await p.getByText('機能別権限を保存しました。対象ユーザーには再読み込み時に反映されます。').waitFor()
 const permissionSave=await p.evaluate(()=>window.__qa_role_permission_saved)
 assert.equal(permissionSave.role,'worker')
 assert.equal(permissionSave.permissions['storage.upload'],true)
 await noOverflow(p,'settings 390px')
 await p.screenshot({path:'qa/screenshots/astryx-settings-mobile-390.png',fullPage:true})
 settings.verify();await settings.context.close();passes++
 console.log('PASS settings: audit search/expand, warning threshold save, role-permission fixture, locked grants')

 const settingsReader=await fixture('settings',{width:320,height:720},{viewOnly:true})
 const ro=settingsReader.page
 await ro.getByRole('heading',{name:'設定・監査',exact:true}).waitFor()
 assert.equal(await ro.locator('.admin-users-list').count(),0)
 assert.equal(await ro.locator('.permission-settings-section').count(),0)
 assert.equal(await ro.locator('.audit-row').count(),2,'Audit remains visible with audit.view')
 assert.equal(await ro.locator('.settings-grid input').first().isDisabled(),true)
 assert.equal(await ro.getByRole('button',{name:'設定を保存',exact:true}).isDisabled(),true)
 await noOverflow(ro,'settings reader 320px')
 settingsReader.verify();await settingsReader.context.close();passes++
 console.log('PASS settings read-only: no user/permission editors, warning thresholds disabled')

 console.log('PASS',passes,'AstryX isolated admin/library browser checks; no external API requests')
}catch(err){
 console.error('FAIL AstryX admin/library browser regression',err)
 process.exitCode=1
}finally{await browser.close()}
