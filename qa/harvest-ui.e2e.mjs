/**
 * Interactive UI test using the real HarvestProcessingPage component and
 * synthetic in-memory facades. There is NO Supabase client and no real API.
 * Run only with qa/vite.config.ts. Browser network is denylisted outside local.
 */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const origin='http://127.0.0.1:5178';
mkdirSync('qa/screenshots',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let passed=0;
const fail=e=>{throw e};
async function openFixture(viewport){
 const context=await browser.newContext({viewport,locale:'ja-JP'});
 const page=await context.newPage();
 const external=[];
 const errors=[];
 await page.route('**/*',async route=>{
  const req=route.request().url();
  if(!req.startsWith(origin+'/')&&!req.startsWith('data:')&&!req.startsWith('blob:')){
   external.push(req.split('?')[0]);
   await route.abort('blockedbyclient');
   return;
  }
  await route.continue();
 });
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/qa/index.html',{waitUntil:'networkidle',timeout:25000});
 await page.getByText('未確定：17件').waitFor({timeout:15000});
 const verify=()=>{
  assert.deepEqual(external,[],'UI QA fixture must never issue external requests');
  assert.deepEqual(errors,[],'browser JavaScript errors');
 };
 return {page,context,verify};
}
try{
 const mobile=await openFixture({width:390,height:844});
 const page=mobile.page;
 assert.equal(await page.locator('.harvest-history-list article').count(),17);
 assert.match(await page.locator('.harvest-provenance-summary').innerText(),/出所未特定 17件/);
 assert.equal(await page.getByText('摘採日未特定').count(),17);
 assert.equal(await page.locator('.harvest-provenance-tag.needs-evidence').count(),17);
 await page.getByRole('button',{name:'照合リストを開く'}).click();
 const panel=page.getByRole('region',{name:'摘採ロットの根拠資料照合'});
 await panel.getByText('要確認：').waitFor({timeout:4000}).catch(()=>{});
 assert.equal(await panel.locator('.harvest-review-row').count(),17);
 assert.match(await panel.locator('.harvest-review-stats').innerText(),/摘採日未登録：17件/);
 assert.equal(await panel.getByRole('link',{name:'資料ライブラリを見る'}).getAttribute('href'),'/library');
 await panel.getByRole('searchbox',{name:'ロット番号で検索'}).fill('QA-LOT-17');
 assert.equal(await panel.locator('.harvest-review-row').count(),1);
 await panel.getByRole('searchbox',{name:'ロット番号で検索'}).fill('');
 const requestedDownload=page.waitForEvent('download');
 await panel.getByRole('button',{name:'資料照合用CSVを出力'}).click();
 const download=await requestedDownload;
 assert.equal(download.suggestedFilename(),'yagi-harvest-evidence-checklist.csv');
 const exported=readFileSync(await download.path(),'utf8');
 assert.match(exported,/摘採日（登録値・未照合）/);
 assert.match(exported,/証拠資料名・保管場所（手入力）/);
 assert.match(exported,/QA-LOT-17/);
 assert.ok(exported.split('\\r\\n').length===19);
 await panel.getByRole('button',{name:'照合リストを閉じる'}).click();
 assert.equal(await page.locator('input[type=date]').first().getAttribute('required'),'');
 assert.equal(await page.locator('.harvest-core-grid input[type=date]').inputValue(),'','new harvest date must be intentionally entered');
 const checkboxes=page.locator('.harvest-multi-field-row input[type=checkbox]');
 assert.equal(await checkboxes.count(),2);
 await checkboxes.nth(0).check();await checkboxes.nth(1).check();
 const selected=page.locator('.harvest-multi-field-row.selected');
 assert.equal(await selected.count(),2);
 await selected.nth(0).locator('input[type=number]').first().fill('30');
 await selected.nth(1).locator('input[type=number]').first().fill('70');
 await selected.nth(0).locator('input[type=number]').nth(1).fill('600');
 await selected.nth(1).locator('input[type=number]').nth(1).fill('1400');
 await page.getByRole('button',{name:'秋番茶'}).click();
 await page.getByRole('button',{name:'手摘み'}).click();
 await page.locator('.harvest-core-grid input[type=date]').fill('');
 const missing=await page.locator('.harvest-core-grid input[type=date]').evaluate(el=>el.validity.valueMissing);
 assert.equal(missing,true,'empty date must fail native form required');
 await page.locator('.harvest-core-grid input[type=date]').fill('2026-10-15');
 assert.match(await page.locator('.harvest-yield-preview').innerText(),/実測/);
 await page.getByRole('button',{name:'摘採を登録'}).click();
 await page.getByText('期間別集計に必要な記録が揃った摘採：1件').waitFor({timeout:6000});
 const posted=await page.evaluate(()=>(window).__qa_last_save);
 assert.equal(posted.freshLeafKg,100);
 assert.equal(posted.fields.length,2);
 assert.equal(posted.fields[0].harvestedAreaM2,600);
 assert.equal(posted.fields[1].harvestedAreaM2,1400);
 assert.equal(posted.date,'2026-10-15');
 assert.equal(await page.locator('.harvest-provenance-tag.verified').count(),1);
 assert.equal(await page.locator('.harvest-provenance-tag.needs-evidence').count(),17);
 await page.screenshot({path:'qa/screenshots/harvest-mobile-390.png',fullPage:true});
 const dimensions=await page.evaluate(()=>({
  viewport:window.innerWidth,scrollWidth:document.documentElement.scrollWidth
 }));
 assert.ok(dimensions.scrollWidth<=dimensions.viewport+2,JSON.stringify(dimensions));
 mobile.verify();
 await mobile.context.close();
 passed++;
 console.log('PASS [mobile 390] date-required, two-field save, history badges, no overflow, no external calls');

 const totals=await openFixture({width:390,height:844});
 const totalPage=totals.page;
 const boxes=totalPage.locator('.harvest-multi-field-row input[type=checkbox]');
 await boxes.nth(0).check();await boxes.nth(1).check();
 await totalPage.getByRole('button',{name:'合計のみ入力'}).click();
 await totalPage.locator('.harvest-qty-input input').fill('100');
 await totalPage.getByRole('button',{name:'秋番茶'}).click();
 await totalPage.getByRole('button',{name:'手摘み'}).click();
 await totalPage.locator('.harvest-core-grid input[type=date]').fill('2026-10-16');
 assert.match(await totalPage.locator('.harvest-yield-preview').innerText(),/参考/);
 await totalPage.getByRole('button',{name:'摘採を登録'}).click();
 await totalPage.getByText(/面積未確認 1件/).waitFor({timeout:6000});
 const totalSave=await totalPage.evaluate(()=>(window).__qa_last_save);
 assert.equal(totalSave.yieldEntryMode,'TOTAL_AREA_ESTIMATE');
 assert.equal(totalSave.fields.length,2);
 assert.equal(Math.round(totalSave.fields.reduce((s,x)=>s+x.freshLeafKg,0)*1000),100000);
 assert.ok(totalSave.fields.every(f=>f.harvestedAreaM2===null));
 assert.equal(await totalPage.locator('.harvest-provenance-tag.verified').count(),0);
 totals.verify();await totals.context.close();
 passed++;
 console.log('PASS [mobile 390] total-only apportions kg but does not invent measured area');

 const desktop=await openFixture({width:1280,height:900});
 const d=desktop.page;
 assert.equal(await d.locator('.harvest-history-list article').count(),17);
 assert.equal(await d.locator('.harvest-provenance-tag.needs-evidence').count(),17);
 const widths=await d.evaluate(()=>({viewport:window.innerWidth,scrollWidth:document.documentElement.scrollWidth}));
 assert.ok(widths.scrollWidth<=widths.viewport+2,JSON.stringify(widths));
 desktop.verify();await desktop.context.close();
 passed++;
 console.log('PASS [desktop 1280] history and no horizontal overflow / no external calls');

 const compact=await openFixture({width:320,height:720});
 const c=compact.page;
 assert.equal(await c.locator('.harvest-history-list article').count(),17);
 const compactBoxes=c.locator('.harvest-multi-field-row input[type=checkbox]');
 await compactBoxes.nth(0).check();await compactBoxes.nth(1).check();
 const compactWidths=await c.evaluate(()=>({viewport:window.innerWidth,scrollWidth:document.documentElement.scrollWidth}));
 assert.ok(compactWidths.scrollWidth<=compactWidths.viewport+2,JSON.stringify(compactWidths));
 compact.verify();await compact.context.close();
 passed++;
 console.log('PASS [compact mobile 320] field selection and no horizontal overflow / no external calls');
 console.log('PASS',passed,'fixture UI scenarios. ZERO business API requests; ZERO real data persisted.');
} catch(e){
 console.error('FAIL fixture UI smoke:',e);
 process.exitCode=1;
}finally{
 await browser.close();
}
