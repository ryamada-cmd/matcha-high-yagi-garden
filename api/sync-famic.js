import JSZip from 'jszip'
import iconv from 'iconv-lite'
import { createHash } from 'node:crypto'

const FAMIC_INDEX = 'https://www.acis.famic.go.jp/ddata/index2.htm'
const FAMIC_BASE = 'https://www.acis.famic.go.jp/ddata/datacsv/'
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://mdbtngousidfanmrjybt.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kYnRuZ291c2lkZmFubXJqeWJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NzI2MTcsImV4cCI6MjEwMzE0ODYxN30.a_z8RP1LDfic5ZPjkoHU3otidG3g58-M6h8P0Z-DxpY'

function norm(s) {
  return String(s ?? '').normalize('NFKC').replace(/\s+/g, '').replace(/[（）()]/g, '').toLowerCase()
}

function parseCsv(text) {
  const out = []
  let row = [], field = '', quoted = false
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

function findIndex(headers, candidates) {
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

const val = (row, idx) => idx >= 0 ? String(row[idx] ?? '').trim() : ''

function sourceKey(parts) {
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

function reiwaZipNames(sourceDate) {
  const [y, m, d] = sourceDate.split('-').map(Number)
  const reiwa = y - 2018
  const prefix = `R${String(reiwa).padStart(2, '0')}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`
  return [`${prefix}0.zip`, `${prefix}1.zip`, `${prefix}2.zip`]
}

async function unzipCsv(fileName) {
  const url = FAMIC_BASE + fileName
  const response = await fetch(url, { headers: { 'User-Agent': 'YagiGardenManager/1.0' } })
  if (!response.ok) throw new Error(`FAMIC ZIP取得失敗 (${response.status}): ${fileName}`)
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()))
  const entry = Object.values(zip.files).find(f => !f.dir && f.name.toLowerCase().endsWith('.csv'))
  if (!entry) throw new Error(`CSVがZIP内に見つかりません: ${fileName}`)
  const buffer = await entry.async('nodebuffer')
  return parseCsv(iconv.decode(buffer, 'shift_jis'))
}

function isTeaCrop(crop) {
  const n = String(crop || '').normalize('NFKC').trim()
  return n === '茶' || n.startsWith('茶(') || n.startsWith('茶（')
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const auth = String(req.headers.authorization || '')
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'ログインが必要です' })

  try {
    const indexRes = await fetch(FAMIC_INDEX, { headers: { 'User-Agent': 'YagiGardenManager/1.0' } })
    if (!indexRes.ok) throw new Error(`FAMIC一覧取得失敗 (${indexRes.status})`)
    const html = await indexRes.text()
    const dm = html.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日登録反映分/)
    if (!dm) throw new Error('FAMICの登録反映日を取得できませんでした')
    const sourceDate = `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}`
    const [basicFile, apply1File, apply2File] = reiwaZipNames(sourceDate)

    const basicRows = await unzipCsv(basicFile)
    const bh = basicRows[0] || []
    const biReg = findIndex(bh, ['登録番号'])
    const biType = findIndex(bh, ['農薬の種類', '農薬の種類名', '農薬種類'])
    const biName = findIndex(bh, ['農薬の名称', '農薬名'])
    const biCompany = findIndex(bh, ['登録を有する者の名称', '会社名略称', '会社名'])
    const biPurpose = findIndex(bh, ['用途'])
    if (biReg < 0 || biName < 0) throw new Error(`登録基本部の列構成を認識できません: ${bh.slice(0, 12).join(' / ')}`)

    const basic = new Map()
    for (const r of basicRows.slice(1)) {
      const reg = val(r, biReg)
      if (reg) basic.set(reg, { type: val(r, biType), name: val(r, biName), company: val(r, biCompany), purpose: val(r, biPurpose) })
    }

    const results = []
    for (const fileName of [apply1File, apply2File]) {
      const rows = await unzipCsv(fileName)
      const h = rows[0] || []
      const iReg = findIndex(h, ['登録番号'])
      const iType = findIndex(h, ['農薬の種類', '農薬の種類名', '農薬種類'])
      const iName = findIndex(h, ['農薬の名称', '農薬名'])
      const iPurpose = findIndex(h, ['用途'])
      const iCompany = findIndex(h, ['登録を有する者の名称', '会社名略称', '会社名'])
      const iCrop = findIndex(h, ['作物名'])
      const iTarget = findIndex(h, ['適用病害虫雑草名', '病害虫雑草名', '適用病害虫名'])
      const iUsePurpose = findIndex(h, ['使用目的'])
      const iDilution = findIndex(h, ['希釈倍数使用量', '希釈倍数/使用量', '希釈倍数'])
      const iTiming = findIndex(h, ['使用時期'])
      const iVolume = findIndex(h, ['使用液量', '散布液量'])
      const iCount = findIndex(h, ['本剤の使用回数', '本剤使用回数'])
      const iMethod = findIndex(h, ['使用方法'])
      const iPlace = findIndex(h, ['適用場所'])
      if (iReg < 0 || iCrop < 0) throw new Error(`${fileName} の列構成を認識できません: ${h.slice(0, 16).join(' / ')}`)

      const activeIdx = h.map((x, i) => ({ x: norm(x), i })).filter(o => o.x.includes('有効成分') && !o.x.includes('総使用回数')).map(o => o.i)
      const totalIdx = h.map((x, i) => ({ x: norm(x), i })).filter(o => o.x.includes('総使用回数')).map(o => o.i)

      for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        const r = rows[rowIndex]
        const crop = val(r, iCrop)
        if (!isTeaCrop(crop)) continue
        const reg = val(r, iReg)
        const b = basic.get(reg)
        const name = val(r, iName) || b?.name || ''
        if (!reg || !name) continue
        const active = activeIdx.map(i => val(r, i)).filter(Boolean).join(' / ')
        const total = totalIdx.map(i => val(r, i)).filter(Boolean).join(' / ')
        const record = {
          registration_no: reg,
          pesticide_name: name,
          pesticide_type: val(r, iType) || b?.type || '',
          purpose_category: val(r, iPurpose) || b?.purpose || '',
          company_name: val(r, iCompany) || b?.company || '',
          crop_name: crop,
          target_pest: val(r, iTarget),
          use_purpose: val(r, iUsePurpose),
          dilution_or_rate: val(r, iDilution),
          use_timing: val(r, iTiming),
          spray_volume: val(r, iVolume),
          product_use_count: val(r, iCount),
          application_method: val(r, iMethod),
          application_place: val(r, iPlace),
          active_ingredient: active,
          total_use_count: total,
        }
        const searchParts = Object.values(record).map(v => String(v ?? ''))
        record.source_key = sourceKey([sourceDate, fileName, String(rowIndex), ...searchParts])
        record.search_text = searchParts.join(' ')
        results.push(record)
      }
    }

    if (!results.length) throw new Error('茶の登録適用データを抽出できませんでした')

    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/replace_famic_official_snapshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: auth,
      },
      body: JSON.stringify({ p_rows: results, p_source_date: sourceDate }),
    })
    const rpcText = await rpcRes.text()
    if (!rpcRes.ok) {
      let message = rpcText
      try { message = JSON.parse(rpcText)?.message || JSON.parse(rpcText)?.error || rpcText } catch {}
      throw new Error(`Supabase更新失敗 (${rpcRes.status}): ${message}`)
    }
    const inserted = Number(JSON.parse(rpcText)) || results.length

    return res.status(200).json({ ok: true, sourceDate, rows: inserted, files: [basicFile, apply1File, apply2File] })
  } catch (error) {
    console.error('FAMIC sync failed', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
}
