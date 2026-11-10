// Static route/permission regression guard for the 33-screen production app.
// This does not replace authenticated role/RLS integration testing.
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
const expected={
 '/':'dashboard.view',
 '/sprays':'sprays.view',
 '/spray-history':'sprays.view',
 '/inventory':'pesticide_inventory.view',
 '/pesticides':'pesticides.view',
 '/plans':'spray_plans.view',
 '/fertilizer-applications':'fertilizer_applications.view',
 '/fertilizer-history':'fertilizer_applications.view',
 '/fertilizer-inventory':'fertilizer_inventory.view',
 '/fertilizers':'fertilizers.view',
 '/fertilizer-plans':'fertilizer_plans.view',
 '/harvests':'harvest_processing.view',
 '/tea-inventory':'production.view',
 '/tea-procurement':'production.view',
 '/costing':'costing.view',
 '/production':'production.view',
 '/products':'products.view',
 '/price-list':'products.view',
 '/product-packaging':'packaging.view',
 '/sales':'sales.view',
 '/documents':'documents.view',
 '/crm':'crm.view',
 '/equipment':'equipment.view',
 '/calendar':'calendar.view',
 '/daily-reports':'daily_reports.view',
 '/expenses':'expenses.view',
 '/vendor-invoices':'vendor_invoices.view',
 '/fields':'fields.view',
 '/fields/:fieldId':'fields.view',
 '/library':'storage.view',
 '/storage':'storage.view',
 '/manual':'manual.view',
 '/settings':'settings.view'
}
const matches=[...app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<PermissionRoute\s+permission="([^"]+)"><([A-Za-z_]\w*)\/><\/PermissionRoute>\}\/>/g)]
const actualRoutes=[...app.matchAll(/<Route\s+path="/g)].length
assert.equal(matches.length,33,'Exactly 33 routes must have an explicit PermissionRoute guard')
assert.equal(actualRoutes,matches.length+1,'Only the not-found screen may be unguarded')
assert.ok(app.includes('<Route path="*" element={<div className="page"><section className="panel"><h1>ページが見つかりません</h1>'), 'The fallback must not expose a business screen')
assert.equal(Object.keys(expected).length,33)
const encountered=new Set()
for(const [,url,permission,component] of matches){
 assert.ok(Object.hasOwn(expected,url),'Unexpected route '+url)
 assert.equal(permission,expected[url],'Route permission regression at '+url)
 assert.equal(encountered.has(url),false,'Duplicate route '+url)
 encountered.add(url)
 const page=new URL('../src/pages/'+component+'.tsx',import.meta.url)
 assert.equal(existsSync(page),true,url+' must point to an existing TSX screen')
 if(component!=='HomeDashboardPage'){
  const declaration='const '+component+' = lazy(() => import(\'./pages/'+component+'\'))'
  assert.ok(app.includes(declaration),'Missing lazy loading for '+component)
 }
}
assert.equal(encountered.size,33)
assert.ok(app.includes("if (role === 'viewer') return <PendingApprovalScreen session={session}/>"),
 'Unapproved viewer should remain restricted to the pending approval UI')
console.log('PASS 33 guarded routes, expected permissions, valid page imports, pending-account gate')
