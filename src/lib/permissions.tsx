import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

export type AppRole = 'admin' | 'worker' | ''
export type PermissionMap = Record<string, boolean>

type PermissionState = {
  role: AppRole
  permissions: PermissionMap
  loading: boolean
  error: string
  allowed: (key: string) => boolean
  refresh: () => Promise<void>
}

const PermissionContext = createContext<PermissionState | null>(null)

export async function loadMyAppPermissions(): Promise<{ role: AppRole; permissions: PermissionMap }> {
  const { data, error } = await supabase.rpc('get_my_app_permissions')
  if (error) throw error
  const raw = (data || {}) as any
  return {
    role: raw.role === 'admin' ? 'admin' : raw.role === 'worker' ? 'worker' : '',
    permissions: raw.permissions && typeof raw.permissions === 'object' ? raw.permissions as PermissionMap : {},
  }
}

export async function hasPermission(key: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_app_permission', { p_permission_key: key })
  if (error) throw error
  return data === true
}

export function AppPermissionProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [role, setRole] = useState<AppRole>('')
  const [permissions, setPermissions] = useState<PermissionMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await loadMyAppPermissions()
      setRole(next.role)
      setPermissions(next.permissions)
    } catch (e: any) {
      setError(e?.message || '権限情報を読み込めませんでした。')
      setRole('')
      setPermissions({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [userId, refresh])
  useEffect(() => {
    const onChanged = () => void refresh()
    const onFocus = () => void refresh()
    window.addEventListener('app-permissions-changed', onChanged)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('app-permissions-changed', onChanged)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const value = useMemo<PermissionState>(() => ({
    role,
    permissions,
    loading,
    error,
    allowed: (key: string) => permissions[key] === true,
    refresh,
  }), [role, permissions, loading, error, refresh])

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>
}

export function useAppPermissions() {
  const value = useContext(PermissionContext)
  if (!value) throw new Error('useAppPermissions must be used inside AppPermissionProvider')
  return value
}
