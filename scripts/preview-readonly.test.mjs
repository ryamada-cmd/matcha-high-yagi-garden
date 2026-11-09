import test from 'node:test'
import assert from 'node:assert/strict'
import { previewMutationBlockReason } from '../src/lib/previewSafety.ts'

const BASE = 'https://example-preview.supabase.co'
const reason = (path, method = 'GET') => previewMutationBlockReason(BASE + path, {method}, BASE)

test('allows read-only tables and read RPCs including auth / permission lookup', () => {
  assert.equal(reason('/rest/v1/fields?select=*'), null)
  assert.equal(reason('/rest/v1/rpc/get_calendar_data_v2', 'POST'), null)
  assert.equal(reason('/rest/v1/rpc/get_my_app_permissions', 'POST'), null)
  assert.equal(reason('/rest/v1/rpc/search_official_fertilizers', 'POST'), null)
})

test('allows password login / token refresh / signout but not signup', () => {
  assert.equal(reason('/auth/v1/token?grant_type=password', 'POST'), null)
  assert.equal(reason('/auth/v1/token?grant_type=refresh_token', 'POST'), null)
  assert.equal(reason('/auth/v1/logout', 'POST'), null)
  assert.match(reason('/auth/v1/signup', 'POST'), /閲覧専用/)
})

test('blocks table insert, update and deletes', () => {
  for (const method of ['POST','PUT','PATCH','DELETE']) {
    assert.match(reason('/rest/v1/inventory',method), /閲覧専用/)
  }
  assert.match(reason('/storage/v1/object/private/example.png','POST'), /閲覧専用/)
})

test('blocks every mutating RPC and arbitrary Edge Function requests, even GET', () => {
  assert.match(reason('/rest/v1/rpc/admin_register_sale','POST'), /閲覧専用/)
  assert.match(reason('/rest/v1/rpc/save_harvest_record','POST'), /閲覧専用/)
  assert.match(reason('/functions/v1/crm-gmail','POST'), /閲覧専用/)
  assert.match(reason('/functions/v1/external-storage','GET'), /閲覧専用/)
})

test('does not intercept unrelated origins', () => {
  assert.equal(previewMutationBlockReason('https://example.com/assets/app.js',{method:'GET'},BASE),null)
  assert.equal(previewMutationBlockReason('https://example.com/api', {method:'POST'},BASE),null)
})

test('extracts method from Request objects and allows GET metadata', () => {
  const req = new Request(BASE+'/rest/v1/inventory',{method:'PATCH'})
  assert.match(previewMutationBlockReason(req,undefined,BASE),/閲覧専用/)
  assert.equal(reason('/storage/v1/object/public/leaf.png'),null)
})

test('blocks same-origin Vercel API mutations and OCR requests', () => {
  const app = 'https://astryx-preview.vercel.app'
  for (const path of ['/api/sync-famic','/api/ocr-invoice']) {
    assert.match(previewMutationBlockReason(app+path,{method:'POST'},BASE,app),/閲覧専用/)
    assert.match(previewMutationBlockReason(path,{method:'POST'},BASE,app),/閲覧専用/)
    assert.match(previewMutationBlockReason(app+path,{method:'GET'},BASE,app),/閲覧専用/)
  }
  assert.equal(previewMutationBlockReason('/assets/logo.svg',{method:'GET'},BASE,app),null)
  assert.equal(previewMutationBlockReason('https://open-meteo.com/v1',{method:'GET'},BASE,app),null)
})

test('keeps Supabase read-only requests and auth working with explicit app origin', () => {
  const app = 'https://astryx-preview.vercel.app'
  assert.equal(previewMutationBlockReason(BASE+'/rest/v1/fields',{method:'GET'},BASE,app),null)
  assert.match(previewMutationBlockReason(BASE+'/rest/v1/inventory',{method:'PATCH'},BASE,app),/閲覧専用/)
  assert.equal(previewMutationBlockReason(BASE+'/auth/v1/token',{method:'POST'},BASE,app),null)
})
