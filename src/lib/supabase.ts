import { createClient } from '@supabase/supabase-js'

const defaultUrl = 'https://mdbtngousidfanmrjybt.supabase.co'
const defaultPublishableKey = 'sb_publishable_f9P6hsToK8BbDUFJjLvIHg_-vEUW2h_'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || defaultUrl
const publishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  defaultPublishableKey

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
