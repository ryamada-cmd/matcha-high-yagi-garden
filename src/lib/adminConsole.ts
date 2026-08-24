import { supabase } from './supabase'

export type AppSettings = {
  id: number
  low_stock_threshold_percent: number
  expiry_warning_days: number
  upcoming_plan_warning_days: number
  upcoming_harvest_warning_days: number
  weather_location_name: string | null
  weather_latitude: number | null
  weather_longitude: number | null
  updated_by: string | null
  updated_at: string
}

export type AdminUser = {
  id: string
  email: string | null
  display_name: string | null
  role: 'admin' | 'worker'
  created_at: string
}

export type AuditLogRow = {
  id: number
  user_id: string | null
  user_name: string | null
  user_email: string | null
  action: string
  entity_type: string
  entity_id: string | null
  before_data: unknown
  after_data: unknown
  created_at: string
}

export type AdminConsoleData = {
  settings: AppSettings
  users: AdminUser[]
  audit_logs: AuditLogRow[]
}

const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

const nullableNumber = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function normalizeSettings(raw: any): AppSettings {
  return {
    id: n(raw?.id) || 1,
    low_stock_threshold_percent: n(raw?.low_stock_threshold_percent),
    expiry_warning_days: n(raw?.expiry_warning_days),
    upcoming_plan_warning_days: n(raw?.upcoming_plan_warning_days),
    upcoming_harvest_warning_days: n(raw?.upcoming_harvest_warning_days),
    weather_location_name: raw?.weather_location_name || null,
    weather_latitude: nullableNumber(raw?.weather_latitude),
    weather_longitude: nullableNumber(raw?.weather_longitude),
    updated_by: raw?.updated_by || null,
    updated_at: raw?.updated_at || '',
  }
}

export async function loadAdminConsole(limit = 100): Promise<AdminConsoleData> {
  const { data, error } = await supabase.rpc('get_admin_console_data', { p_limit: limit })
  if (error) throw error
  const raw = data as any
  return {
    settings: normalizeSettings(raw?.settings),
    users: (Array.isArray(raw?.users) ? raw.users : []) as AdminUser[],
    audit_logs: (Array.isArray(raw?.audit_logs) ? raw.audit_logs : []) as AuditLogRow[],
  }
}

export async function saveAppSettings(input: {
  lowStockPercent: number
  expiryDays: number
  planDays: number
  harvestDays: number
  weatherLocationName?: string | null
  weatherLatitude?: number | null
  weatherLongitude?: number | null
}) {
  const { data, error } = await supabase.rpc('update_app_settings', {
    p_payload: {
      low_stock_threshold_percent: input.lowStockPercent,
      expiry_warning_days: input.expiryDays,
      upcoming_plan_warning_days: input.planDays,
      upcoming_harvest_warning_days: input.harvestDays,
      weather_location_name: input.weatherLocationName ?? '',
      weather_latitude: input.weatherLatitude ?? '',
      weather_longitude: input.weatherLongitude ?? '',
    },
  })
  if (error) throw error
  return normalizeSettings(data)
}

export async function changeUserRole(userId: string, role: 'admin' | 'worker') {
  const { data, error } = await supabase.rpc('update_profile_role', {
    p_user_id: userId,
    p_role: role,
  })
  if (error) throw error
  return data
}
