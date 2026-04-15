import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_ACCESS_SUPABASE_URL
const anonKey = import.meta.env.VITE_ACCESS_SUPABASE_ANON_KEY

/** Supabase project that holds `staff`, `team`, and `subordinate` access tables. */
export const accessSupabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

export function isAccessSupabaseConfigured(): boolean {
  return accessSupabase !== null
}
