import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import JSZip from 'npm:jszip@3.10.1'
import { createClient } from 'npm:@supabase/supabase-js@2'

const FAMIC_INDEX = 'https://www.acis.famic.go.jp/ddata/index2.htm'
const FAMIC_BASE = 'https://www.acis.famic.go.jp/ddata/datacsv/'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function norm(s: unknown) {
  return String(s ?? '').normalize('NFKC').replace(/\s+/g, '').replace(/[（）()]/g, '').toLowerCase()
}

function parseCsv(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else {
      if (ch === '"') quoted = true
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n') { row.push(field.replace(/\r$/, '')); out.push(row); row = []; field = '' }
      else field += ch
    }
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); out.push(row) }
  return out.filter(r => r.some(v => v !== ''))
}

function findIndex(headers: string[], candidates: string[]) {
  const nh = headers.map(norm)
  for (const c of candidates) {
    const nc = norm(c)
    const exact = nh.findIndex(h => h === nc)
    if (exact >= 0) return exact
  }
  for (const c of candidates) {
    const nc = norm(c)
    const partial = nh.findIndex(h => h.includes(nc) || nc.includes(h))
    if (partial >= 0) return partial
  }
  return -1
}

function val(row: string[], idx: number) { return idx >= 0 ? (row[idx] ?? '').trim() : '' }

async function unzipCsv(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'YagiGardenManager/1.0' } })
  if (!res.ok) throw new Error(`FAMIC ZIP取得失敗: ${res.status} ${url}`)
  const zip = await JSZip.loadAsync(await res.arrayBuffer())
  const entry = Object.values(zip.files).find(f => !f.dir && f.name.toLowerCase().endsWith('.csv'))
  if (!entry) throw new Error(`CSVがZIP内に見つかりません: ${url}`)
  const bytes = await entry.async('uint8array')
  let text: string
  try { text = new TextDecoder('shift_jis').decode(bytes) }
  catch { text = new TextDecoder('utf-8').decode(bytes) }
  return parseCsv(text)
}

async function hashKey(parts: string[]) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('|')))
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const auth = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'ログインが必要です' }, 401)
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return json({ error: 'FAMIC同期は管理者のみ実行できます' }, 403)

    const indexRes = await fetch(FAMIC_INDEX, { headers: { 'User-Agent': 'YagiGardenManager/1.0' } })
    if (!indexRes.ok) throw new Error(`FAMIC一覧取得失敗: ${indexRes.status}`)
    const html = await indexRes.text()
    const dm = html.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日登録反映分/)
    const sourceDate = dm ? `${dm[1]}-${String(dm[2]).padStart(2,'0')}-${String(dm[3]).padStart(2,'0')}` : new Date().toISOString().slice(0,10)
    const files = [...html.matchAll(/datacsv\/(R\d{7}[012]\.zip)/g)].map(m => m[1])
    const uniqueFiles = [...new Set(files)]
    const basicFile = uniqueFiles.find(x => x.endsWith('0.zip'))
    const applyFiles = uniqueFiles.filter(x => /[12]\.zip$/.test(x))
    if (!basicFile || applyFiles.length < 2) throw new Error(`FAMIC ZIPリンクを特定できません: ${uniqueFiles.join(', ')}`)

    const basicRows = await unzipCsv(FAMIC_BASE + basicFile)
    const bh = basicRows[0] || []
    const biReg = findIndex(bh, ['登録番号'])
    const biType = findIndex(bh, ['農薬の種類','農薬の種類名','農薬種類'])
    const biName = findIndex(bh, ['農薬の名称','農薬名'])
    const biCompany = findIndex(bh, ['登録を有する者の名称','会社名略称','会社名'])
    const biPurpose = findIndex(bh, ['用途'])
    const basic = new Map<string, {type:string,name:string,company:string,purpose:string}>()
    for (const r of basicRows.slice(1)) {
      const reg = val(r, biReg)
      if (reg) basic.set(reg, { type:val(r,biType), name:val(r,biName), company:val(r,biCompany), purpose:val(r,biPurpose) })
    }

    const results: any[] = []
    for (const file of applyFiles) {
      const rows = await unzipCsv(FAMIC_BASE + file)
      const h = rows[0] || []
      const iReg = findIndex(h,['登録番号'])
      const iType = findIndex(h,['農薬の種類','農薬の種類名','農薬種類'])
      const iName = findIndex(h,['農薬の名称','農薬名'])
      const iPurpose = findIndex(h,['用途'])
      const iCompany = findIndex(h,['登録を有する者の名称','会社名略称','会社名'])
      const iCrop = findIndex(h,['作物名'])
      const iTarget = findIndex(h,['適用病害虫雑草名','病害虫雑草名','適用病害虫名'])
      const iUsePurpose = findIndex(h,['使用目的'])
      const iDilution = findIndex(h,['希釈倍数使用量','希釈倍数/使用量','希釈倍数'])
      const iTiming = findIndex(h,['使用時期'])
      const iVolume = findIndex(h,['使用液量','散布液量'])
      const iCount = findIndex(h,['本剤の使用回数','本剤使用回数'])
      const iMethod = findIndex(h,['使用方法'])
      const iPlace = findIndex(h,['適用場所'])
      const activeIdx = h.map((x,i)=>({x:norm(x),i})).filter(o=>o.x.includes('有効成分') && !o.x.includes('総使用回数')).map(o=>o.i)
      const totalIdx = h.map((x,i)=>({x:norm(x),i})).filter(o=>o.x.includes('総使用回数')).map(o=>o.i)
      for (const r of rows.slice(1)) {
        const crop = val(r,iCrop)
        if (crop !== '茶') continue
        const reg = val(r,iReg)
        const b = basic.get(reg)
        const name = val(r,iName) || b?.name || ''
        if (!reg || !name) continue
        const active = activeIdx.map(i=>val(r,i)).filter(Boolean).join(' / ')
        const total = totalIdx.map(i=>val(r,i)).filter(Boolean).join(' / ')
        const rec:any = {
          registration_no:reg,pesticide_name:name,pesticide_type:val(r,iType)||b?.type||'',purpose_category:val(r,iPurpose)||b?.purpose||'',company_name:val(r,iCompany)||b?.company||'',crop_name:crop,target_pest:val(r,iTarget),use_purpose:val(r,iUsePurpose),dilution_or_rate:val(r,iDilution),use_timing:val(r,iTiming),spray_volume:val(r,iVolume),product_use_count:val(r,iCount),application_method:val(r,iMethod),application_place:val(r,iPlace),active_ingredient:active,total_use_count:total,acquired_on:sourceDate,
        }
        const parts = Object.values(rec).map(v=>String(v??''))
        rec.source_key = await hashKey(parts)
        rec.search_text = parts.slice(0,-1).join(' ')
        results.push(rec)
      }
    }
    if (!results.length) throw new Error('茶の登録適用データを抽出できませんでした。FAMIC CSV形式を確認してください。')
    const { error: delErr } = await admin.from('pesticide_official_registrations').delete().gt('id',0)
    if (delErr) throw delErr
    for (let i=0;i<results.length;i+=400) {
      const { error } = await admin.from('pesticide_official_registrations').insert(results.slice(i,i+400))
      if (error) throw error
    }
    await admin.from('pesticide_data_sources').upsert({ dataset:'official',source_title:'FAMIC 農薬登録情報ダウンロード（CSV）',source_note:'FAMIC公開データから茶の適用情報を抽出・整理。実際の使用は現物ラベルと最新の登録内容を確認してください。',source_date:sourceDate,row_count:results.length,imported_at:new Date().toISOString() })
    return json({ ok:true, sourceDate, rows:results.length, files:[basicFile,...applyFiles] })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
