import { supabase } from './supabase'

export type SprayLot = {
  lotId: string
  pesticideId: string
  pesticideName: string
  balance: number
  unit: string
  expiryDate: string
  legacyId: string
}

export type SprayField = {
  id: string
  legacyId: string
  name: string
  location: string
  areaM2: number
  rate: number
  standardL: number
}

export type SprayHistoryRow = {
  id: string
  legacyId: string
  date: string
  preparedL: number
  operator: string
  target: string
}

function n(v: unknown) {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export async function loadSprayFormData(): Promise<{ lots: SprayLot[]; fields: SprayField[]; history: SprayHistoryRow[] }> {
  const [lotsRes, balancesRes, fieldsRes, historyRes] = await Promise.all([
    supabase.from('inventory_lots').select('id,legacy_id,pesticide_id,content_unit,expiry_date,pesticides(name)'),
    supabase.from('inventory_balances').select('inventory_lot_id,balance'),
    supabase.from('fields').select('id,legacy_id,name,location,area_m2,standard_spray_l_per_10a,status').eq('status','active').order('location').order('legacy_id'),
    supabase.from('spray_batches').select('id,legacy_id,spray_date,prepared_volume_l,operator_name_snapshot,target').is('deleted_at',null).order('spray_date',{ascending:false}).order('created_at',{ascending:false}).limit(20),
  ])

  const err = lotsRes.error || balancesRes.error || fieldsRes.error || historyRes.error
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

  return { lots, fields, history }
}

export async function registerSpray(input: {
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
}) {
  const payload = {
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

  const { data, error } = await supabase.rpc('register_spray_batch', { payload })
  if (error) throw error
  return data as { id: string; legacy_id: string; prepared_volume_l: number }
}
