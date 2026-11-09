/**
 * A release gate for this Astryx migration branch.
 * The Preview can point at production Supabase; only explicitly read-only
 * requests may reach that backend until a separate staging project exists.
 *
 * IMPORTANT: Do not turn off this gate for Preview. It is not a replacement
 * for database RLS, and production release must be reviewed separately.
 */
export const PREVIEW_READ_RPCS = [
  'get_admin_console_data',
  'get_role_permission_matrix',
  'get_calendar_data_v2',
  'get_costing_dashboard',
  'crm_list_assignees',
  'get_app_settings',
  'get_spray_pesticide_guidance',
  'search_official_fertilizers',
  'search_pesticide_catalog',
  'get_my_app_permissions',
  'has_app_permission',
] as const

const safeRpcNames = new Set<string>(PREVIEW_READ_RPCS)
const notice = 'AstryX開発プレビューは閲覧専用です。実データの登録・編集・削除・同期・送信はできません。'

export function previewMutationBlockReason(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  backendUrl: string,
  appOrigin?: string,
): string | null {
  const requestTarget = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  let requested: URL
  let backend: URL
  try {
    requested = new URL(requestTarget, appOrigin || backendUrl)
    backend = new URL(backendUrl)
  } catch {
    // An invalid URL will fail naturally in the underlying fetch.
    return null
  }
  const method = String(init?.method || (typeof input === 'string' || input instanceof URL ? 'GET' : input.method) || 'GET').toUpperCase()
  const path = requested.pathname

  // Same-origin Vercel API routes may mutate data server-side.
  // Deny them on read-only previews regardless of the HTTP verb.
  if (appOrigin && requested.origin === new URL(appOrigin).origin && path.startsWith('/api/')) return notice

  if (requested.origin !== backend.origin) return null

  // Functions may write business data even when called with GET.
  if (path.startsWith('/functions/v1/')) return notice

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null

  // Password sign-in, token refresh, and sign-out do not change business records.
  if (method === 'POST' && (path === '/auth/v1/token' || path === '/auth/v1/logout')) return null

  if (method === 'POST' && path.startsWith('/rest/v1/rpc/')) {
    const rpc = decodeURIComponent(path.slice('/rest/v1/rpc/'.length)).split('/')[0]
    if (safeRpcNames.has(rpc)) return null
  }

  // All other writes (incl. storage, table DML, other RPC, auth sign-up)
  // are denied by default instead of guessing which ones are harmless.
  return notice
}

/** Applies the same restriction to fetch calls outside supabase-js. */
export function installPreviewFetchGuard(backendUrl: string): void {
  if (typeof window === 'undefined') return
  const originalFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const blocked = previewMutationBlockReason(input, init, backendUrl, window.location.origin)
    if (blocked) return Promise.reject(new Error(blocked))
    return originalFetch(input, init)
  }) as typeof fetch
}
