import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { isAccessSupabaseConfigured } from '../lib/accessSupabase'
import { isProfilesSupabaseConfigured } from '../lib/profilesSupabase'
import { syncUserProfile } from '../lib/profile'
import {
  loadStaffDashboard,
  staffDisplayName,
  type StaffDashboard,
  type StaffRow,
} from '../lib/staffAccess'
import { ActivityReportsDashboard } from './ActivityReportsDashboard'

type Props = {
  user: User
}

type LoadState =
  | { status: 'loading' }
  | { status: 'denied'; reason: 'not_found' | 'not_configured' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: StaffDashboard }

export function Dashboard({ user }: Props) {
  const email = user.email ?? ''
  const accessOk = isAccessSupabaseConfigured()
  const [state, setState] = useState<LoadState>(() =>
    accessOk && email
      ? { status: 'loading' }
      : {
          status: 'denied',
          reason: 'not_configured',
        },
  )

  useEffect(() => {
    if (!accessOk || !email) {
      return
    }
    let cancelled = false
    void loadStaffDashboard(email).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setState({ status: 'ready', data: result.data })
        return
      }
      if (result.reason === 'not_found') {
        setState({ status: 'denied', reason: 'not_found' })
        return
      }
      if (result.reason === 'not_configured') {
        setState({ status: 'denied', reason: 'not_configured' })
        return
      }
      setState({
        status: 'error',
        message: result.message ?? 'Could not load your profile.',
      })
    })
    return () => {
      cancelled = true
    }
  }, [user, accessOk, email])

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

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <h1 className="dashboard-brand">Activity Report</h1>
        <button
          type="button"
          className="dashboard-logout"
          onClick={handleLogout}
        >
          Log out
        </button>
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
          <>
            <ProfileContent data={state.data} email={email} />
            <ActivityReportsDashboard
              user={user}
              subordinates={state.data.subordinates}
            />
          </>
        ) : null}
      </main>
    </div>
  )
}

function ProfileContent({
  data,
  email,
}: {
  data: StaffDashboard
  email: string
}) {
  const { staff, team } = data
  const name = staffDisplayName(staff)
  const directorLabel = formatDirector(staff.director)

  return (
    <div className="dashboard-profile">
      <section className="dashboard-panel profile-summary">
        <h2 className="dashboard-section-title">Your information</h2>
        <dl className="profile-dl">
          <div className="profile-dl-row">
            <dt>Name</dt>
            <dd>{name}</dd>
          </div>
          <div className="profile-dl-row">
            <dt>Email</dt>
            <dd>{staff.email ?? email}</dd>
          </div>
          <div className="profile-dl-row">
            <dt>Team</dt>
            <dd>
              {team?.team_name?.trim()
                ? team.team_name
                : staff.team_id != null && staff.team_id !== ''
                  ? String(staff.team_id)
                  : '—'}
            </dd>
          </div>
          {directorLabel ? (
            <div className="profile-dl-row">
              <dt>Role</dt>
              <dd>{directorLabel}</dd>
            </div>
          ) : null}
        </dl>

        <div className="dashboard-cta dashboard-cta--inline">
          <Link to="/activity/new" className="dashboard-create-btn">
            Create Activity Report
          </Link>
        </div>
      </section>
    </div>
  )
}

function formatDirector(director: StaffRow['director']): string | null {
  if (
    director === true ||
    director === 'true' ||
    director === '1' ||
    director === 1
  ) {
    return 'Director'
  }
  if (
    director === false ||
    director === 'false' ||
    director === '0' ||
    director === 0
  ) {
    return null
  }
  if (typeof director === 'string' && director.trim()) {
    return director.trim()
  }
  return null
}
