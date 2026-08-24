import { supabase } from './supabase'

export type SprayHistoryChemical = {
  pesticideId: string
  pesticideName: string
  dilution: number
  quantity: number
  unit: string
}

export type SprayHistoryField = {
  fieldId: string
  legacyId: string
  name: string
  location: string
  actualL: number
}

export type FullSprayHistoryRow = {
  id: string
  legacyId: string
  sprayDate: string
  preparedL: number
  target: string
  weather: string
  temperatureC: string
  operator: string
  note: string
  createdAt: string
  chemicals: SprayHistoryChemical[]
  fields: SprayHistoryField[]
}

function n(v: unknown) {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export async function loadFullSprayHistory(limit = 1000): Promise<{ rows: FullSprayHistoryRow[]; role: string }> {
  const [batchRes, chemRes, fieldRes, profileRes] = await Promise.all([
    supabase.from('spray_batches')
      .select('id,legacy_id,spray_date,prepared_volume_l,target,weather,temperature_c,operator_name_snapshot,note,created_at')
      .is('deleted_at', null)
      .order('spray_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('spray_batch_chemicals')
      .select('spray_batch_id,pesticide_id,dilution,chemical_qty,chemical_unit,pesticides(name)')
      .order('created_at'),
    supabase.from('spray_batch_fields')
      .select('spray_batch_id,field_id,actual_spray_volume_l,fields(legacy_id,name,location)')
      .order('created_at'),
    supabase.from('profiles').select('role').single(),
  ])

  const err = batchRes.error || chemRes.error || fieldRes.error || profileRes.error
  if (err) throw err

  const chemMap = new Map<string, SprayHistoryChemical[]>()
  for (const c of chemRes.data || []) {
    const p: any = Array.isArray((c as any).pesticides) ? (c as any).pesticides[0] : (c as any).pesticides
    const row: SprayHistoryChemical = {
      pesticideId: (c as any).pesticide_id,
      pesticideName: p?.name || '農薬名未設定',
      dilution: n((c as any).dilution),
      quantity: n((c as any).chemical_qty),
      unit: (c as any).chemical_unit || '',
    }
    const key = (c as any).spray_batch_id
    if (!chemMap.has(key)) chemMap.set(key, [])
    chemMap.get(key)!.push(row)
  }

  const fieldMap = new Map<string, SprayHistoryField[]>()
  for (const f of fieldRes.data || []) {
    const field: any = Array.isArray((f as any).fields) ? (f as any).fields[0] : (f as any).fields
    const row: SprayHistoryField = {
      fieldId: (f as any).field_id,
      legacyId: field?.legacy_id || '',
      name: field?.name || '圃場名未設定',
      location: field?.location || '',
      actualL: n((f as any).actual_spray_volume_l),
    }
    const key = (f as any).spray_batch_id
    if (!fieldMap.has(key)) fieldMap.set(key, [])
    fieldMap.get(key)!.push(row)
  }

  const rows = (batchRes.data || []).map((b: any) => ({
    id: b.id,
    legacyId: b.legacy_id || '',
    sprayDate: b.spray_date || '',
    preparedL: n(b.prepared_volume_l),
    target: b.target || '',
    weather: b.weather || '',
    temperatureC: b.temperature_c == null ? '' : String(b.temperature_c),
    operator: b.operator_name_snapshot || '',
    note: b.note || '',
    createdAt: b.created_at || '',
    chemicals: chemMap.get(b.id) || [],
    fields: fieldMap.get(b.id) || [],
  }))

  return { rows, role: (profileRes.data as any)?.role || '' }
}

function csvCell(value: unknown) {
  const s = String(value ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

export function downloadSprayHistoryCsv(rows: FullSprayHistoryRow[]) {
  const headers = ['散布日','調製ID','担当者','目的・対象病害虫','天候','気温℃','調製量L','使用農薬','散布圃場','備考']
  const lines = [headers.map(csvCell).join(',')]
  for (const r of rows) {
    const chemicals = r.chemicals.map(c => `${c.pesticideName} ${c.dilution}倍 ${c.quantity}${c.unit}`).join(' / ')
    const fields = r.fields.map(f => `${f.legacyId} ${f.name} ${f.actualL}L`).join(' / ')
    lines.push([
      r.sprayDate, r.legacyId, r.operator, r.target, r.weather, r.temperatureC, r.preparedL,
      chemicals, fields, r.note,
    ].map(csvCell).join(','))
  }
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Intl.DateTimeFormat('sv-SE').format(new Date())
  a.href = url
  a.download = `散布履歴_${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
