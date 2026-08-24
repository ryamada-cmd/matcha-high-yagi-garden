import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import JSZip from 'npm:jszip@3.10.1'
import iconv from 'npm:iconv-lite@0.6.3'
import { Buffer } from 'node:buffer'
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
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}
function clean(v: unknown) { return String(v ?? '').replace(/^\uFEFF/, '').replace(/\u0000/g, '').trim() }
function norm(s: unknown) { return clean(s).normalize('NFKC').replace(/\s+/g, '').replace(/[（）()]/g, '').toLowerCase() }

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
  return out.filter(r => r.some(v => clean(v) !== ''))
}

function headerIndex(headers: string[]) {
  const map = new Map<string, number>()
  headers.forEach((h, i) => { const k = norm(h); if (k && !map.has(k)) map.set(k, i) })
  return map
}
function getByNames(row: string[], idx: Map<string, number>, names: string[]) {
  for (const name of names) {
    const i = idx.get(norm(name))
    if (i !== undefined) return clean(row[i])
  }
  return ''
}

async function fetchBytes(url: string, stage: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'YagiGardenManager/2.0' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`${stage} HTTP ${res.status}: ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

async function unzipCsv(zipName: string) {
  const bytes = await fetchBytes(FAMIC_BASE + zipName, `STEP3 ZIP取得失敗 ${zipName}`)
  let zip: JSZip
  try { zip = await JSZip.loadAsync(bytes) }
  catch (e) { throw new Error(`STEP3 ZIP解凍失敗 ${zipName}: ${e instanceof Error ? e.message : String(e)}`) }
  const entry = Object.values(zip.files).find(f => !f.dir && f.name.toLowerCase().endsWith('.csv'))
  if (!entry) throw new Error(`STEP3 ZIP内にCSVがありません: ${zipName}`)
  const csvBytes = await entry.async('uint8array')
  let text = ''
  try { text = iconv.decode(Buffer.from(csvBytes), 'shift_jis') }
  catch (e) { throw new Error(`STEP3 Shift_JIS変換失敗 ${entry.name}: ${e instanceof Error ? e.message : String(e)}`) }
  text = text.replace(/^\uFEFF/, '').replace(/\u0000/g, '')
  if (!text.trim()) throw new Error(`STEP3 CSVが空です: ${entry.name}`)
  const rows = parseCsv(text)
  if (!rows.length || !Array.isArray(rows[0])) throw new Error(`STEP3 CSV解析失敗: ${entry.name}`)
  return { zipName, fileName: entry.name, rows }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok:false, error:'Method Not Allowed', stage:'METHOD' }, 405)

  let stage = 'AUTH'
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const auth = req.headers.get('Authorization') || ''

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ ok:false, error:'ログインが必要です', stage }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: profile, error: profileErr } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (profileErr) throw new Error(`管理者情報取得失敗: ${profileErr.message}`)
    if (profile?.role !== 'admin') return json({ ok:false, error:'FAMIC同期は管理者のみ実行できます', stage }, 403)

    stage = 'STEP1_INDEX'
    const indexRes = await fetch(FAMIC_INDEX, { headers: { 'User-Agent': 'YagiGardenManager/2.0' }, redirect:'follow' })
    if (!indexRes.ok) throw new Error(`STEP1 FAMICページ取得失敗 HTTP ${indexRes.status}`)
    const htmlBytes = new Uint8Array(await indexRes.arrayBuffer())
    let html = new TextDecoder('utf-8').decode(htmlBytes)
    if (!html.includes('登録反映分')) {
      try { html = iconv.decode(Buffer.from(htmlBytes), 'shift_jis') } catch { /* keep UTF-8 */ }
    }
    if (!html.trim()) throw new Error('STEP1 FAMICページが空です')

    stage = 'STEP2_DATE'
    const dm = html.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日\s*登録反映分/)
    if (!dm) throw new Error('STEP2 FAMICページから登録反映日を取得できません')
    const year = Number(dm[1]), month = Number(dm[2]), day = Number(dm[3])
    const reiwa = year - 2018
    if (reiwa <= 0 || reiwa > 99) throw new Error(`STEP2 令和年変換に失敗: ${year}`)
    const yy = String(reiwa).padStart(2,'0'), mm = String(month).padStart(2,'0'), dd = String(day).padStart(2,'0')
    const prefix = `R${yy}${mm}${dd}`
    const targets = [`${prefix}0.zip`, `${prefix}1.zip`, `${prefix}2.zip`]
    const sourceDate = `${year}-${mm}-${dd}`

    stage = 'STEP3_ZIP'
    const tables = []
    for (const target of targets) tables.push(await unzipCsv(target))
    const basic = tables.find(t => /0\.zip$/i.test(t.zipName))?.rows
    const appTables = tables.filter(t => /[12]\.zip$/i.test(t.zipName)).map(t => ({zipName:t.zipName,rows:t.rows}))
    if (!basic || !basic[0]) throw new Error('STEP4 登録基本部CSVを取得できません')
    if (appTables.length !== 2) throw new Error(`STEP4 登録適用部CSVが2件揃いません: ${appTables.length}`)

    stage = 'STEP5_BASIC'
    const bIdx = headerIndex(basic[0])
    if (!bIdx.has(norm('登録番号'))) throw new Error(`STEP5 基本部に登録番号列がありません: ${JSON.stringify(basic[0])}`)
    const basicMap = new Map<string, string[]>()
    for (const row of basic.slice(1)) {
      const reg = getByNames(row,bIdx,['登録番号'])
      if (reg) basicMap.set(reg,row)
    }

    stage = 'STEP6_TEA'
    const results:any[] = []
    for (const table of appTables) {
      const rows = table.rows
      const aIdx = headerIndex(rows[0])
      if (!aIdx.has(norm('作物名'))) throw new Error(`STEP6 ${table.zipName}に作物名列がありません: ${JSON.stringify(rows[0])}`)
      for (let rowNo=1; rowNo<rows.length; rowNo++) {
        const row = rows[rowNo]
        const crop = getByNames(row,aIdx,['作物名'])
        if (!crop.includes('茶')) continue
        const reg = getByNames(row,aIdx,['登録番号'])
        const b = basicMap.get(reg) || []
        const rec:any = {
          source_key: `${table.zipName}:${rowNo}:${reg}`,
          registration_no: reg,
          pesticide_name: getByNames(b,bIdx,['農薬の名称','農薬名']),
          pesticide_type: getByNames(b,bIdx,['農薬の種類名','農薬の種類']),
          purpose_category: getByNames(b,bIdx,['用途']),
          company_name: getByNames(b,bIdx,['登録を有する者の名称','会社名']),
          crop_name: crop,
          target_pest: getByNames(row,aIdx,['適用病害虫雑草名','適用病害虫名']),
          use_purpose: getByNames(row,aIdx,['使用目的']),
          dilution_or_rate: getByNames(row,aIdx,['希釈倍数使用量','希釈倍数・使用量','希釈倍数/使用量','希釈倍数','使用量']),
          use_timing: getByNames(row,aIdx,['使用時期']),
          spray_volume: getByNames(row,aIdx,['使用液量']),
          product_use_count: getByNames(row,aIdx,['本剤の使用回数','本剤使用回数']),
          application_method: getByNames(row,aIdx,['使用方法']),
          application_place: getByNames(row,aIdx,['適用場所']),
          active_ingredient: getByNames(row,aIdx,['有効成分']),
          total_use_count: getByNames(row,aIdx,['総使用回数','有効成分を含む農薬の総使用回数']),
        }
        if (!rec.registration_no || !rec.pesticide_name) continue
        rec.search_text = Object.values(rec).join(' ')
        results.push(rec)
      }
    }
    if (!results.length) throw new Error('STEP6 茶の適用情報を抽出できませんでした')

    stage = 'STEP7_ATOMIC_REPLACE'
    const { data: inserted, error: rpcErr } = await admin.rpc('replace_famic_official_snapshot', {
      p_rows: results,
      p_source_date: sourceDate,
    })
    if (rpcErr) throw new Error(`STEP7 公式DB更新失敗: ${rpcErr.message}`)
    if (Number(inserted) !== results.length) throw new Error(`STEP7 件数不一致: 抽出 ${results.length} / 保存 ${inserted}`)

    return json({ ok:true, sourceDate, rows:results.length, files:targets })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[sync-famic ${stage}] ${message}`)
    return json({ ok:false, error:message, stage }, 500)
  }
})
