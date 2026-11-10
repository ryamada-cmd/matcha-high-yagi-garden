/**
 * Actual App.tsx + AppPermissionProvider under synthetic, offline Supabase Auth/RPC.
 * Browser interactions verify route denial, viewer approval gate, login and refresh.
 * Never touches production users, auth sessions, passwords or Supabase network.
 */
import assert from 'node:assert/strict'
import {chromium,webkit} from 'playwright'

const origin='http://127.0.0.1:5179'
const cases=[
 {name:'anonymous-login',anonymous:true,role:'worker',route:'/'},
 {name:'viewer-approval',role:'viewer',route:'/sales'},
 {name:'worker-sales',role:'worker',route:'/sales'},
 {name:'worker-denied',role:'worker',route:'/settings'},
 {name:'admin-settings',role:'admin',route:'/settings'},
 {name:'permissions-rpc-failure',role:'admin',route:'/sales',rpcError:true},
 {name:'admin-demoted',role:'admin',route:'/sales'},
 {name:'admin-logout',role:'admin',route:'/'}
]
let passed=0
const runners=[['chromium',chromium],['webkit',webkit]]
for(const [engine,browserType] of runners){
 const browser=await browserType.launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]})
 try{
  for(const entry of cases){
   const context=await browser.newContext({viewport:{width:390,height:844},locale:'ja-JP'})
   const page=await context.newPage(),offOrigin=[],errors=[]
   await page.route('**/*',async route=>{
    const url=route.request().url()
    if(!url.startsWith(origin+'/')&&!url.startsWith('blob:')&&!url.startsWith('data:')){
     offOrigin.push(url.split('?')[0])
     await route.abort('blockedbyclient')
     return
    }
    await route.continue()
   })
   page.on('pageerror',e=>errors.push(e.message))
   const params=new URLSearchParams({
    route:entry.route,role:entry.role,...(entry.anonymous?{anonymous:'1'}:{}),
    ...(entry.rpcError?{rpcError:'1'}:{})
   })
   await page.goto(origin+'/qa/auth/index.html?'+params,{waitUntil:'networkidle',timeout:30000})
   try{
    if(entry.name==='anonymous-login'){
     await page.getByRole('heading',{name:'茶園管理',exact:true}).waitFor()
     assert.equal(await page.locator('[data-qa="protected-page"]').count(),0)
     await page.getByLabel('メールアドレス').fill('qa-login@example.invalid')
     await page.getByLabel('パスワード').fill('incorrect')
     await page.locator('.auth-form button').click()
     await page.getByText('架空認証：パスワードが違います').waitFor()
     await page.getByLabel('パスワード').fill('qa-password-123')
     await page.locator('.auth-form button').click()
     await page.locator('[data-qa="protected-page"]').waitFor()
     const email=await page.evaluate(()=>window.__qa_auth.getSession()?.user.email)
     assert.equal(email,'qa-login@example.invalid')
    }else if(entry.name==='viewer-approval'){
     await page.getByRole('heading',{name:'利用承認待ち'}).waitFor()
     assert.equal(await page.locator('[data-qa="protected-page"]').count(),0)
     assert.equal(await page.locator('.app-shell').count(),0)
    }else if(entry.name==='worker-sales'){
     await page.locator('[data-qa="protected-page"]').waitFor()
     assert.equal(await page.locator('[data-qa="protected-path"]').innerText(),'/sales')
     assert.equal(await page.getByRole('link',{name:'設定・監査'}).count(),0)
     const called=await page.evaluate(()=>window.__qa_auth.rpcCalls())
     assert.ok(called.includes('get_my_app_permissions'))
    }else if(entry.name==='worker-denied'){
     await page.getByRole('heading',{name:'この機能を利用する権限がありません'}).waitFor()
     assert.equal(await page.locator('[data-qa="protected-page"]').count(),0)
    }else if(entry.name==='admin-settings'){
     await page.locator('[data-qa="protected-page"]').waitFor()
     assert.equal(await page.locator('[data-qa="protected-path"]').innerText(),'/settings')
     await page.getByRole('button',{name:'メニュー',exact:true}).click()
     await page.getByRole('dialog',{name:'その他のメニュー'}).waitFor()
     await page.getByRole('button',{name:'閉じる'}).click()
     assert.equal(await page.getByRole('dialog',{name:'その他のメニュー'}).count(),0)
    }else if(entry.name==='permissions-rpc-failure'){
     await page.getByRole('heading',{name:'この機能を利用する権限がありません'}).waitFor()
     await page.locator('.sidebar-user small').waitFor({state:'attached'})
     assert.equal(await page.locator('.sidebar-user small').textContent(),'架空権限DB読込エラー')
     assert.equal(await page.locator('[data-qa="protected-page"]').count(),0)
    }else if(entry.name==='admin-demoted'){
     await page.locator('[data-qa="protected-page"]').waitFor()
     await page.evaluate(()=>{
      window.__qa_auth.setRole('viewer')
      window.dispatchEvent(new Event('app-permissions-changed'))
     })
     await page.getByRole('heading',{name:'利用承認待ち'}).waitFor()
     assert.equal(await page.locator('[data-qa="protected-page"]').count(),0)
    }else if(entry.name==='admin-logout'){
     await page.locator('[data-qa="protected-page"]').waitFor()
     await page.getByRole('button',{name:'メニュー',exact:true}).click()
     await page.locator('.mobile-logout').click()
     await page.getByRole('heading',{name:'茶園管理',exact:true}).waitFor()
     assert.equal(await page.locator('[data-qa="protected-page"]').count(),0)
     assert.equal(await page.evaluate(()=>window.__qa_auth.getSession()),null)
    }
    const dimension=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
    assert.ok(dimension.scroll<=dimension.w+2,entry.name+' horizontal overflow '+JSON.stringify(dimension))
    assert.deepEqual(errors,[],'Browser exceptions in '+entry.name)
    assert.deepEqual(offOrigin,[],'External HTTP attempt in '+entry.name)
    passed++
    console.log('PASS',engine,entry.name)
   }finally{await context.close()}
  }
 }finally{await browser.close()}
}
console.log('PASS',passed,'actual auth/permission/route-browser scenarios under offline synthetic Supabase')
