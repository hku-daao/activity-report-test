import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { isSupabaseConfigured } from '../lib/supabase'
import { syncUserProfile } from '../lib/profile'

type Props = {
  user: User
}

export function Dashboard({ user }: Props) {
  const supabaseOk = isSupabaseConfigured()
  const [dbStatus, setDbStatus] = useState<'syncing' | 'ok' | 'error'>(() =>
    supabaseOk ? 'syncing' : 'ok',
  )
  const [dbMessage, setDbMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseOk) {
      return
    }
    let cancelled = false
    void syncUserProfile(user).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setDbStatus('ok')
        setDbMessage('Profile synced to Supabase.')
      } else {
        setDbStatus('error')
        setDbMessage(result.error ?? 'Could not sync profile.')
      }
    })
    return () => {
      cancelled = true
    }
  }, [user, supabaseOk])

  const firebaseAuth = auth
  if (!firebaseAuth) {
    return null
  }

  const supabaseHint = !supabaseOk
    ? 'Add Supabase URL and anon key to sync profiles.'
    : null

  return (
    <div className="auth-shell dashboard">
      <header className="auth-header">
        <h1 className="auth-title">Signed in</h1>
        <p className="auth-subtitle">{user.email}</p>
      </header>

      <section className="dashboard-panel" aria-live="polite">
        <p className="dashboard-row">
          <span className="muted">Firebase UID</span>
          <code className="uid">{user.uid}</code>
        </p>
        {supabaseOk ? (
          <p className="dashboard-row">
            <span className="muted">Database</span>
            <span>
              {dbStatus === 'syncing' && 'Syncing…'}
              {dbStatus === 'ok' && 'Connected'}
              {dbStatus === 'error' && 'Check table / RLS'}
            </span>
          </p>
        ) : null}
        {supabaseHint ? (
          <p className="feedback">{supabaseHint}</p>
        ) : null}
        {dbMessage && supabaseOk ? (
          <p
            className={`feedback ${dbStatus === 'ok' ? 'success' : dbStatus === 'error' ? 'error' : ''}`}
          >
            {dbMessage}
          </p>
        ) : null}
      </section>

      <button
        type="button"
        className="auth-submit secondary"
        onClick={() => signOut(firebaseAuth)}
      >
        Sign out
      </button>
    </div>
  )
}
