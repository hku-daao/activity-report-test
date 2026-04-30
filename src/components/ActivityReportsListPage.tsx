import { useEffect } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { isProfilesSupabaseConfigured } from '../lib/profilesSupabase'
import { syncUserProfile } from '../lib/profile'
import { staffFullName } from '../lib/staffAccess'
import { useStaffDashboardState } from '../hooks/useStaffDashboardState'
import { ActivityReportsDashboard } from './ActivityReportsDashboard'
import { AppLogo } from './AppLogo'
import { SessionBackButton, SessionUserBeforeLogout } from './SessionNav'

type Props = {
  user: User
}

export function ActivityReportsListPage({ user }: Props) {
  const { state } = useStaffDashboardState(user)

  useEffect(() => {
    if (state.status !== 'ready' || !isProfilesSupabaseConfigured()) {
      return
    }
    void syncUserProfile(user)
  }, [user, state.status])

  const firebaseAuth = auth
  if (!firebaseAuth) {
    return null
  }

  const handleLogout = () => {
    void signOut(firebaseAuth)
  }

  const sessionUserName =
    state.status === 'ready' ? staffFullName(state.data.staff) : null

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <div className="dashboard-topbar-start">
          <AppLogo />
          <SessionBackButton />
          <h1 className="dashboard-brand">
            Meeting / Engagement / Activity Reports
          </h1>
        </div>
        <div className="dashboard-topbar-end">
          <SessionUserBeforeLogout label={sessionUserName} />
          <button
            type="button"
            className="dashboard-logout"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {state.status === 'loading' ? (
          <p className="loading">Loading your profile…</p>
        ) : null}

        {state.status === 'denied' && state.reason === 'not_configured' ? (
          <section className="dashboard-panel" aria-live="polite">
            <p className="feedback error">
              Access list database is not configured. Add{' '}
              <code>VITE_ACCESS_SUPABASE_URL</code> and{' '}
              <code>VITE_ACCESS_SUPABASE_ANON_KEY</code> to your{' '}
              <code>.env</code> file (see <code>.env.example</code>), then
              restart the dev server.
            </p>
            <button
              type="button"
              className="auth-submit secondary"
              onClick={handleLogout}
            >
              Log out
            </button>
          </section>
        ) : null}

        {state.status === 'denied' && state.reason === 'not_found' ? (
          <section className="dashboard-panel" aria-live="polite">
            <p className="feedback error">
              Your account is not on the access list for this application. If
              you believe this is a mistake, contact your administrator.
            </p>
            <button
              type="button"
              className="auth-submit secondary"
              onClick={handleLogout}
            >
              Log out
            </button>
          </section>
        ) : null}

        {state.status === 'error' ? (
          <section className="dashboard-panel" aria-live="polite">
            <p className="feedback error">{state.message}</p>
            <button
              type="button"
              className="auth-submit secondary"
              onClick={handleLogout}
            >
              Log out
            </button>
          </section>
        ) : null}

        {state.status === 'ready' ? (
          <ActivityReportsDashboard
            user={user}
            subordinates={state.data.subordinates}
          />
        ) : null}
      </main>
    </div>
  )
}
