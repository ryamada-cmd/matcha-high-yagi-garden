import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root=process.cwd()
const appPath=path.join(root,'src','App.tsx')
const manualPath=path.join(root,'src','pages','ManualPage.tsx')

const app=fs.readFileSync(appPath,'utf8')
const manual=fs.readFileSync(manualPath,'utf8')

const normalizeRoute=(value)=>{
  if(value==='/')return '/'
  const withoutDynamic=value.replace(/\/:([^/]+)/g,'')
  return withoutDynamic.replace(/\/$/,'')||'/'
}

const appRoutes=[...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(m=>normalizeRoute(m[1]))
const guideRoutes=[...manual.matchAll(/path:'([^']+)'/g)].map(m=>normalizeRoute(m[1]))
const routeSet=new Set(guideRoutes)
const missingRoutes=[...new Set(appRoutes)].filter(route=>!routeSet.has(route))

const permissionKeys=new Set()
for(const match of app.matchAll(/allowed\(\s*['"]([^'"]+)['"]\s*\)/g))permissionKeys.add(match[1])
for(const match of app.matchAll(/permission="([^"]+)"/g))permissionKeys.add(match[1])
const missingPermissions=[...permissionKeys].filter(key=>!manual.includes(`'${key}'`)&&!manual.includes(`"${key}"`))

const requiredCurrentFeatures=[
  {route:'/price-list',label:'商品価格表'},
  {route:'/documents',label:'請求書・納品書'},
  {route:'/storage',label:'ファイル・OneDrive'}
]
const missingFeatureLabels=requiredCurrentFeatures.filter(x=>!manual.includes(x.route)||!manual.includes(x.label))

if(missingRoutes.length||missingPermissions.length||missingFeatureLabels.length){
  console.error('操作ガイドの整合チェックに失敗しました。')
  if(missingRoutes.length)console.error(`- ガイドに説明がないルート: ${missingRoutes.join(', ')}`)
  if(missingPermissions.length)console.error(`- ガイド照合対象にない画面権限: ${missingPermissions.join(', ')}`)
  if(missingFeatureLabels.length)console.error(`- 現行必須機能の説明不足: ${missingFeatureLabels.map(x=>x.label).join(', ')}`)
  console.error('ManualPage.tsx を機能変更と同じリリースで更新してください。')
  process.exit(1)
}

console.log(`操作ガイド整合OK: ${new Set(appRoutes).size}ルート / ${permissionKeys.size}画面権限`)
