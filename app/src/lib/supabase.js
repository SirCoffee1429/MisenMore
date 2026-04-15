import { createClient } from '@supabase/supabase-js'

// Fail fast if env vars are missing — we never want to fall back to any
// other Supabase project. Cross-project contamination is the #1 risk in a
// multi-tenant fork.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in app/.env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
