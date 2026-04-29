import { useEffect } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { isProfilesSupabaseConfigured } from '../lib/profilesSupabase'
import { syncUserProfile } from '../lib/profile'
import { staffFullName } from '../lib/staffAccess'
import { useStaffDashboardState } from '../hooks/useStaffDashboardState'
import { SessionUserBeforeLogout } from './SessionNav'

type Props = {
  user: User
}

const NEW_REPORT_LABEL = 'Meeting / Engagement / Activity Reports'

export function Dashboard({ user }: Props) {
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
        <h1 className="dashboard-brand">Activity Report: Home</h1>
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
          <section
            className="dashboard-panel dashboard-home-hub"
            aria-label="Home actions"
          >
            <div className="dashboard-home-section">
              <h2 className="dashboard-home-group-title">Create New</h2>
              <div className="dashboard-home-actions">
                <div className="dashboard-cta">
                  <Link to="/journal/today" className="dashboard-create-btn">
                    Daily Journal
                  </Link>
                </div>
                <div className="dashboard-cta">
                  <Link to="/proactive/new" className="dashboard-create-btn">
                    Proactive Initiative and Activity
                  </Link>
                </div>
                <div className="dashboard-cta">
                  <Link to="/activity/new" className="dashboard-create-btn">
                    {NEW_REPORT_LABEL}
                  </Link>
                </div>
              </div>
            </div>

            <div className="dashboard-home-section">
              <h2 className="dashboard-home-group-title">Dashboard</h2>
              <div className="dashboard-home-actions">
                <div className="dashboard-cta">
                  <Link to="/journals" className="dashboard-secondary-btn">
                    View Journal
                  </Link>
                </div>
                <div className="dashboard-cta">
                  <Link to="/proactive" className="dashboard-secondary-btn">
                    View Proactive Initiative and Activity
                  </Link>
                </div>
                <div className="dashboard-cta">
                  <Link
                    to="/activity/reports"
                    className="dashboard-secondary-btn"
                  >
                    View Meeting / Engagement / Activity Reports
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
