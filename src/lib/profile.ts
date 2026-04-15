import type { User } from 'firebase/auth'
import { profilesSupabase } from './profilesSupabase'

/** Returns distinct Firebase UIDs for the given emails (profiles table). */
export async function fetchFirebaseUidsForEmails(
  emails: string[],
): Promise<string[]> {
  if (!profilesSupabase || emails.length === 0) return []
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (unique.length === 0) return []

  const { data, error } = await profilesSupabase
    .from('profiles')
    .select('firebase_uid')
    .in('email', unique)

  if (error || !data) {
    return []
  }
  const uids = data
    .map((r: { firebase_uid: string }) => r.firebase_uid)
    .filter(Boolean)
  return [...new Set(uids)]
}

/** Upserts a row keyed by Firebase UID. Requires the `profiles` table in the profiles Supabase project. */
export async function syncUserProfile(
  user: User,
): Promise<{ ok: boolean; error?: string }> {
  if (!profilesSupabase) {
    return { ok: false, error: 'Profiles Supabase is not configured' }
  }

  const { error } = await profilesSupabase.from('profiles').upsert(
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
