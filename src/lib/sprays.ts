import { supabase } from './supabase'

export type SprayLot = {
  lotId: string
  pesticideId: string
  pesticideName: string
  balance: number
  unit: string
  expiryDate: string
  legacyId: string
  editRestored?: number
}

export type SprayField = {
  id: string
  legacyId: string
  name: string
  location: string
  areaM2: number
  rate: number
  standardL: number
  harvestDate: string
}

export type SprayHistoryRow = {
  id: string
  legacyId: string
  date: string
  preparedL: number
  operator: string
  target: string
}

export type SprayOfficialGuidanceRow = {
  registration_no: string
  pesticide_name: string
  company_name: string
  target_pest: string
  use_purpose: string
  dilution_or_rate: string
  use_timing: string
  spray_volume: string
  product_use_count: string
  total_use_count: string
  application_method: string
  active_ingredient: string
}

export type SprayGuidelineRow = {
  target_pest_or_use: string
  dilution: string
  spray_volume_or_rate: string
  use_timing: string
  use_count: string
  frac_irac: string
  toxicity: string
  covering_exception: string
  note: string
  source_page: string
}

export type SprayPesticideGuidance = {
  pesticide_id: string
  pesticide_name: string
  registration_no: string
  master_frac_irac: string
  official_match_mode: 'registration' | 'name_candidate'
  official_source_date: string
  official: SprayOfficialGuidanceRow[]
  guidelines: SprayGuidelineRow[]
  recorded_year_use_count: number
  last_recorded_spray_date: string | null
}

export type SprayBatchDetail = {
  id: string
  legacyId: string
  sprayDate: string
  preparedL: number
  target: string
  weather: string
  temperatureC: string
  operator: string
  note: string
  preHarvestChecked: boolean
  applicationCountChecked: boolean
  tankMixChecked: boolean
  chemicals: Array<{
    pesticideId: string
    lotId: string
    pesticideName: string
    lotLegacyId: string
    dilution: number
    qty: number
    unit: string
    currentBalance: number
    virtualBalance: number
  }>
  fields: Array<{
    fieldId: string
    standardL: number
    actualL: number
  }>
}

export type SprayFormInput = {
  sprayDate: string
  preparedL: number
  target: string
  weather: string
  temperatureC: string
  operatorName: string
  note: string
  preHarvestChecked: boolean
  applicationCountChecked: boolean
  tankMixChecked: boolean
  chemicals: { pesticideId: string; lotId: string; dilution: number }[]
  fieldIds: string[]
}

function n(v: unknown) {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export async function loadSprayFormData(): Promise<{ lots: SprayLot[]; fields: SprayField[]; history: SprayHistoryRow[]; role: string }> {
  const [lotsRes, balancesRes, fieldsRes, historyRes, profileRes] = await Promise.all([
    supabase.from('inventory_lots').select('id,legacy_id,pesticide_id,content_unit,expiry_date,pesticides(name)'),
    supabase.from('inventory_balances').select('inventory_lot_id,balance'),
    supabase.from('fields').select('id,legacy_id,name,location,area_m2,standard_spray_l_per_10a,harvest_planned_date,status').eq('status','active').order('location').order('legacy_id'),
    supabase.from('spray_batches').select('id,legacy_id,spray_date,prepared_volume_l,operator_name_snapshot,target').is('deleted_at',null).order('spray_date',{ascending:false}).order('created_at',{ascending:false}).limit(20),
    supabase.from('profiles').select('role').single(),
  ])

  const err = lotsRes.error || balancesRes.error || fieldsRes.error || historyRes.error || profileRes.error
  if (err) throw err

  const bal = new Map((balancesRes.data || []).map((b: any) => [b.inventory_lot_id, n(b.balance)]))
  const lots = (lotsRes.data || [])
    .map((l: any) => {
      const p = Array.isArray(l.pesticides) ? l.pesticides[0] : l.pesticides
      return {
        lotId: l.id,
        pesticideId: l.pesticide_id,
        pesticideName: p?.name || '農薬',
        balance: bal.get(l.id) || 0,
        unit: l.content_unit || '',
        expiryDate: l.expiry_date || '',
        legacyId: l.legacy_id || '',
      }
    })
    .filter((l) => l.balance > 0)
    .sort((a, b) => a.pesticideName.localeCompare(b.pesticideName, 'ja'))

  const fields = (fieldsRes.data || []).map((f: any) => {
    const area = n(f.area_m2)
    const rate = n(f.standard_spray_l_per_10a)
    return {
      id: f.id,
      legacyId: f.legacy_id || '',
      name: f.name,
      location: f.location || '',
      areaM2: area,
      rate,
      standardL: Math.round((area / 1000 * rate) * 100) / 100,
      harvestDate: f.harvest_planned_date || '',
    }
  })

  const history = (historyRes.data || []).map((r: any) => ({
    id: r.id,
    legacyId: r.legacy_id || '',
    date: r.spray_date || '',
    preparedL: n(r.prepared_volume_l),
    operator: r.operator_name_snapshot || '',
    target: r.target || '',
  }))

  return { lots, fields, history, role: profileRes.data?.role || '' }
}

export async function loadSprayPesticideGuidance(
  pesticideIds: string[],
  sprayDate: string,
  excludeBatchId?: string,
): Promise<SprayPesticideGuidance[]> {
  if (!pesticideIds.length) return []
  const { data, error } = await supabase.rpc('get_spray_pesticide_guidance', {
    p_pesticide_ids: [...new Set(pesticideIds)],
    p_spray_date: sprayDate || null,
    p_exclude_batch_id: excludeBatchId || null,
  })
  if (error) throw error
  return (Array.isArray(data) ? data : []) as SprayPesticideGuidance[]
}

export async function loadSprayBatchDetail(batchId: string): Promise<SprayBatchDetail> {
  const [batchRes, chemRes, fieldRes, balancesRes] = await Promise.all([
    supabase.from('spray_batches')
      .select('id,legacy_id,spray_date,prepared_volume_l,target,weather,temperature_c,operator_name_snapshot,note,pre_harvest_checked,application_count_checked,tank_mix_checked')
      .eq('id',batchId).is('deleted_at',null).single(),
    supabase.from('spray_batch_chemicals')
      .select('pesticide_id,inventory_lot_id,dilution,chemical_qty,chemical_unit,inventory_lots(legacy_id,content_unit,pesticides(name))')
      .eq('spray_batch_id',batchId).order('created_at'),
    supabase.from('spray_batch_fields')
      .select('field_id,standard_volume_l,actual_spray_volume_l')
      .eq('spray_batch_id',batchId).order('created_at'),
    supabase.from('inventory_balances').select('inventory_lot_id,balance'),
  ])

  const err = batchRes.error || chemRes.error || fieldRes.error || balancesRes.error
  if (err) throw err
  const b: any = batchRes.data
  const balanceMap = new Map((balancesRes.data || []).map((x: any) => [x.inventory_lot_id, n(x.balance)]))

  const chemicals = (chemRes.data || []).map((c: any) => {
    const lot = Array.isArray(c.inventory_lots) ? c.inventory_lots[0] : c.inventory_lots
    const pesticide = Array.isArray(lot?.pesticides) ? lot.pesticides[0] : lot?.pesticides
    const currentBalance = balanceMap.get(c.inventory_lot_id) || 0
    const qty = n(c.chemical_qty)
    return {
      pesticideId: c.pesticide_id,
      lotId: c.inventory_lot_id,
      pesticideName: pesticide?.name || '農薬',
      lotLegacyId: lot?.legacy_id || '',
      dilution: n(c.dilution),
      qty,
      unit: c.chemical_unit || lot?.content_unit || '',
      currentBalance,
      virtualBalance: currentBalance + qty,
    }
  })

  return {
    id: b.id,
    legacyId: b.legacy_id || '',
    sprayDate: b.spray_date || '',
    preparedL: n(b.prepared_volume_l),
    target: b.target || '',
    weather: b.weather || '',
    temperatureC: b.temperature_c == null ? '' : String(b.temperature_c),
    operator: b.operator_name_snapshot || '',
    note: b.note || '',
    preHarvestChecked: !!b.pre_harvest_checked,
    applicationCountChecked: !!b.application_count_checked,
    tankMixChecked: !!b.tank_mix_checked,
    chemicals,
    fields: (fieldRes.data || []).map((f: any) => ({
      fieldId: f.field_id,
      standardL: n(f.standard_volume_l),
      actualL: n(f.actual_spray_volume_l),
    })),
  }
}

function payloadFrom(input: SprayFormInput) {
  return {
    spray_date: input.sprayDate,
    prepared_volume_l: input.preparedL,
    target: input.target,
    weather: input.weather,
    temperature_c: input.temperatureC || null,
    operator_name: input.operatorName,
    note: input.note,
    pre_harvest_checked: input.preHarvestChecked,
    application_count_checked: input.applicationCountChecked,
    tank_mix_checked: input.tankMixChecked,
    chemicals: input.chemicals.map((c) => ({ pesticide_id: c.pesticideId, inventory_lot_id: c.lotId, dilution: c.dilution })),
    fields: input.fieldIds,
  }
}

export async function registerSpray(input: SprayFormInput) {
  const { data, error } = await supabase.rpc('register_spray_batch', { payload: payloadFrom(input) })
  if (error) throw error
  return data as { id: string; legacy_id: string; prepared_volume_l: number }
}

export async function updateSpray(batchId: string, input: SprayFormInput) {
  const { data, error } = await supabase.rpc('update_spray_batch', { p_batch_id: batchId, payload: payloadFrom(input) })
  if (error) throw error
  return data as { id: string; legacy_id: string; prepared_volume_l: number }
}

export async function deleteSpray(batchId: string, reason: string) {
  const { data, error } = await supabase.rpc('delete_spray_batch', { p_batch_id: batchId, p_reason: reason || null })
  if (error) throw error
  return data as { id: string; legacy_id: string; deleted: boolean }
}
