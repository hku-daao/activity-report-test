import type { User } from 'firebase/auth'
import { supabase } from './supabase'

/** Upserts a row keyed by Firebase UID. Requires the `profiles` table in Supabase. */
export async function syncUserProfile(
  user: User,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured' }
  }

  const { error } = await supabase.from('profiles').upsert(
    {
      firebase_uid: user.uid,
      email: user.email ?? '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'firebase_uid' },
  )

  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
