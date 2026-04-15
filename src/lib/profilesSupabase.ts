import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_PROFILES_SUPABASE_URL
const anonKey = import.meta.env.VITE_PROFILES_SUPABASE_ANON_KEY

/** Supabase project that holds the `profiles` table (Firebase user sync). */
export const profilesSupabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

export function isProfilesSupabaseConfigured(): boolean {
  return profilesSupabase !== null
}
