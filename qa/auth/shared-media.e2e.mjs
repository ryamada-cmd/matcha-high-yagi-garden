import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, devices, webkit } from 'playwright'

const origin=process.env.SHARED_MEDIA_QA_ORIGIN||'http://127.0.0.1:5179'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=','base64')
await mkdir('qa/screenshots',{recursive:true})

for (const [name,engine,settings] of [
  ['desktop',chromium,{viewport:{width:1280,height:900}}],
  ['android-width',chromium,{...devices['Pixel 7']}],
  ['iphone-width',webkit,{...devices['iPhone 13']}],
]) {
  if (process.env.SHARED_MEDIA_QA_ENGINE && name!==process.env.SHARED_MEDIA_QA_ENGINE) continue
  const browser=await engine.launch()
  try {
    const context=await browser.newContext({...settings,locale:'ja-JP'})
    let chunks=0
    let downloaded=false
    let holdNext=false
    let held=false
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url())
      if (url.origin===origin) return route.continue()
      if (url.origin!=='https://qa-onedrive.invalid') return route.abort()
      const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-range,content-type','Access-Control-Allow-Methods':'PUT,GET,OPTIONS','Access-Control-Expose-Headers':'Retry-After'}
      if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers})
      if(url.pathname==='/original'){
        downloaded=true
        return route.fulfill({status:200,body:'original bytes',headers:{...headers,'Content-Type':'text/plain'}})
      }
      assert.equal(route.request().method(),'PUT')
      assert.equal(route.request().headers().authorization,undefined)
      assert.equal(route.request().headers()['content-range'],`bytes 0-${png.length-1}/${png.length}`)
      const body=route.request().postDataBuffer()
      if (name!=='iphone-width' || body) assert.deepEqual(body,png)
      chunks+=1
      if (holdNext) {
        holdNext=false
        held=true
        await new Promise(resolve=>setTimeout(resolve,2000))
        return route.abort('aborted').catch(()=>{})
      }
      if (chunks===1) return route.fulfill({status:429,headers:{...headers,'Retry-After':'0'}})
      if (chunks===2) return route.fulfill({status:503,headers:{...headers,'Retry-After':'0'}})
      if (chunks===3) return route.abort('timedout')
      return route.fulfill({status:201,headers,body:'{}'})
    })
    const page=await context.newPage()
    page.on('pageerror',error=>console.error('Page error:',error.message))
    await page.goto(origin+'/qa/auth/index.html?role=viewer')
    await page.getByRole('heading',{name:'利用承認待ち'}).waitFor()
    assert.deepEqual(await page.evaluate(()=>window.__qa_media_calls),undefined)
    await page.goto(origin+'/qa/auth/index.html?role=viewer&mediaApproval=1')
    await page.getByRole('heading',{name:'写真・動画ギャラリー'}).waitFor()
    await page.getByRole('button',{name:'一番茶.jpegの詳細'}).waitFor()
    assert.equal(await page.getByRole('link',{name:'ファイル・OneDrive'}).count(),0)
    await page.screenshot({path:`qa/screenshots/shared-media-${name}.png`,fullPage:true})
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))
    await page.getByRole('checkbox',{name:'一番茶.jpegを選択'}).check()
    await page.getByText('1件を選択中').waitFor()
    await page.getByRole('button',{name:'動画',exact:true}).click()
    await page.getByText('該当する写真・動画はありません。').waitFor()
    await page.getByRole('button',{name:'写真',exact:true}).click()
    await page.getByRole('button',{name:'一番茶.jpegの詳細'}).click()
    const dialog=page.getByRole('dialog')
    await dialog.getByRole('button',{name:'投稿情報を編集'}).waitFor()
    assert.equal(await dialog.getByRole('button',{name:'原本を完全削除'}).count(),0)
    await dialog.getByRole('button',{name:'オリジナルをダウンロード'}).click()
    await context.waitForEvent('page',{timeout:3000}).catch(()=>{})
    for(let i=0;!downloaded&&i<30;i++) await new Promise(resolve=>setTimeout(resolve,100))
    assert.equal(downloaded,true)
    await dialog.getByRole('button',{name:'閉じる'}).click()
    await page.getByText('写真・動画を追加',{exact:true}).click()
    await page.locator('input[type=file][multiple]').setInputFiles({name:'qa.png',mimeType:'image/png',buffer:png})
    await page.getByText('登録済み',{exact:true}).waitFor({timeout:15000}).catch(async error=>{
      console.error('Upload state:',await page.locator('.shared-media-queue').innerText(),await page.evaluate(()=>window.__qa_media_calls))
      throw error
    })
    assert.equal(chunks,4)
    const actions=await page.evaluate(()=>window.__qa_media_calls)
    assert.ok(actions.indexOf('begin')<actions.indexOf('status') && actions.indexOf('status')<actions.indexOf('finalize'))
    assert.equal(await page.evaluate(()=>Object.values(localStorage).some(value=>value.includes('qa-onedrive.invalid'))),false)
    console.log('PASS shared gallery approval, UI, retry, original download',name)
    if (name==='desktop') {
      holdNext=true
      await page.locator('input[type=file][multiple]').setInputFiles({name:'resume.png',mimeType:'image/png',buffer:png})
      const pause=page.getByRole('button',{name:'一時停止',exact:true})
      await pause.waitFor()
      for(let i=0;!held&&i<50;i++) await new Promise(resolve=>setTimeout(resolve,100))
      assert.equal(held,true)
      await pause.click()
      const prior=await page.evaluate(()=>window.__qa_media_requests.filter(request=>request.action==='begin').at(-1).id)
      await page.reload()
      await page.getByText('写真・動画を追加',{exact:true}).click()
      const resume=page.getByRole('button',{name:'ファイルを選び直して再開'})
      const choose=async buffer=>{
        const chooser=page.waitForEvent('filechooser')
        await resume.click()
        await (await chooser).setFiles({name:'resume.png',mimeType:'image/png',buffer})
      }
      const wrong=Buffer.from(png)
      wrong[40]^=1
      await choose(wrong)
      await page.getByText('アップロード開始時と同じファイルを選んでください。').waitFor()
      await page.evaluate(()=>{window.__qa_expire_upload=true})
      await choose(png)
      await page.getByText('登録済み',{exact:true}).waitFor({timeout:15000})
      const recovery=await page.evaluate(()=>window.__qa_media_requests)
      assert.equal(recovery.find(request=>request.action==='status').id,prior)
      assert.notEqual(recovery.find(request=>request.action==='begin').id,prior)
      console.log('PASS paused queue survives reload, rejects a different file, and renews an expired Graph session')
    }
  } finally {await browser.close()}
}
