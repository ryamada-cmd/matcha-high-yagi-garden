import { previewMutationBlockReason } from './previewSafety'
import { createClient } from '@supabase/supabase-js'

const defaultUrl = 'https://mdbtngousidfanmrjybt.supabase.co'
const defaultPublishableKey = 'sb_publishable_f9P6hsToK8BbDUFJjLvIHg_-vEUW2h_'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || defaultUrl
// Release gate: the migration branch is intentionally read-only until explicit
// signoff and a real staging database exist. Do not change this to false
// for a preview build; the flag is opt-out only for an approved release.
export const previewReadOnly = import.meta.env.VITE_ASTRYX_PREVIEW_READONLY !== 'false'
export const supabaseBackendUrl = url

const publishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  defaultPublishableKey

export const supabase = createClient(url, publishableKey, {
  global: {
    fetch: (input, init) => {
      if (previewReadOnly) {
        const blocked = previewMutationBlockReason(input, init, url)
        if (blocked) return Promise.reject(new Error(blocked))
      }
      return globalThis.fetch(input, init)
    },
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
