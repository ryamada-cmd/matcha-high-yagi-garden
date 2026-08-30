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

export type PermissionDefinition = {
  permission_key: string
  feature_key: string
  feature_label: string
  item_label: string
  description: string
  sort_order: number
  locked: boolean
  admin_allowed: boolean
  worker_allowed: boolean
}

export type RolePermissionMatrix = { definitions: PermissionDefinition[] }

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

export async function loadRolePermissionMatrix(): Promise<RolePermissionMatrix> {
  const { data, error } = await supabase.rpc('get_role_permission_matrix')
  if (error) throw error
  const raw = (data || {}) as any
  return {
    definitions: (Array.isArray(raw.definitions) ? raw.definitions : []).map((r: any) => ({
      permission_key: String(r.permission_key || ''),
      feature_key: String(r.feature_key || ''),
      feature_label: String(r.feature_label || ''),
      item_label: String(r.item_label || ''),
      description: String(r.description || ''),
      sort_order: n(r.sort_order),
      locked: r.locked === true,
      admin_allowed: r.admin_allowed === true,
      worker_allowed: r.worker_allowed === true,
    })),
  }
}

export async function saveRolePermissions(role: 'admin' | 'worker', permissions: Record<string, boolean>) {
  const { data, error } = await supabase.rpc('update_role_permissions', {
    p_role: role,
    p_permissions: permissions,
  })
  if (error) throw error
  return (data || {}) as Record<string, boolean>
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
  const payload: Record<string, unknown> = {
    low_stock_threshold_percent: input.lowStockPercent,
    expiry_warning_days: input.expiryDays,
    upcoming_plan_warning_days: input.planDays,
    upcoming_harvest_warning_days: input.harvestDays,
  }
  if ('weatherLocationName' in input) payload.weather_location_name = input.weatherLocationName ?? ''
  if ('weatherLatitude' in input) payload.weather_latitude = input.weatherLatitude ?? ''
  if ('weatherLongitude' in input) payload.weather_longitude = input.weatherLongitude ?? ''

  const { data, error } = await supabase.rpc('update_app_settings', { p_payload: payload })
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
