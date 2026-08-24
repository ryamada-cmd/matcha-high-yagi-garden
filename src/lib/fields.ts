import { supabase } from './supabase'

export type FieldRecord = {
  id: string
  legacyId: string
  name: string
  location: string
  areaM2: number
  variety: string
  cultivationType: string
  standardRate: number
  standardL: number
  harvestDate: string
  status: 'active' | 'inactive'
  note: string
}

export type FieldInput = {
  legacyId: string
  name: string
  location: string
  areaM2: number
  variety: string
  cultivationType: string
  standardRate: number
  harvestDate: string
  status: 'active' | 'inactive'
  note: string
}

const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0

export async function loadFields(): Promise<{ fields: FieldRecord[]; role: string }> {
  const [fieldsRes, profileRes] = await Promise.all([
    supabase.from('fields').select('id,legacy_id,name,location,area_m2,variety,cultivation_type,standard_spray_l_per_10a,harvest_planned_date,status,note').order('location').order('legacy_id'),
    supabase.from('profiles').select('role').single(),
  ])
  const err = fieldsRes.error || profileRes.error
  if (err) throw err
  const fields = (fieldsRes.data || []).map((f: any) => {
    const area = n(f.area_m2)
    const rate = n(f.standard_spray_l_per_10a)
    return {
      id: f.id,
      legacyId: f.legacy_id || '',
      name: f.name || '',
      location: f.location || '',
      areaM2: area,
      variety: f.variety || '',
      cultivationType: f.cultivation_type || '茶園',
      standardRate: rate,
      standardL: Math.round(area / 1000 * rate * 100) / 100,
      harvestDate: f.harvest_planned_date || '',
      status: (f.status || 'active') as 'active' | 'inactive',
      note: f.note || '',
    }
  })
  return { fields, role: (profileRes.data as any)?.role || '' }
}

export async function saveField(fieldId: string | null, input: FieldInput) {
  const payload = {
    legacy_id: input.legacyId,
    name: input.name,
    location: input.location,
    area_m2: input.areaM2,
    variety: input.variety,
    cultivation_type: input.cultivationType,
    standard_spray_l_per_10a: input.standardRate,
    harvest_planned_date: input.harvestDate || null,
    status: input.status,
    note: input.note,
  }
  const { data, error } = await supabase.rpc('save_field', { p_field_id: fieldId || null, payload })
  if (error) throw error
  return data as { id: string; legacy_id: string; name: string }
}

export async function deleteField(fieldId: string, reason = '') {
  const { data, error } = await supabase.rpc('delete_field', { p_field_id: fieldId, p_reason: reason })
  if (error) throw error
  return data as { id: string; legacy_id: string; deleted: boolean }
}
