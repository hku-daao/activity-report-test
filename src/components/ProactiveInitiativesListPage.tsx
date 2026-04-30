import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { isProfilesSupabaseConfigured } from '../lib/profilesSupabase'
import { syncUserProfile } from '../lib/profile'
import { staffFullName } from '../lib/staffAccess'
import { useStaffDashboardState } from '../hooks/useStaffDashboardState'
import {
  listProactiveInitiativesForUser,
  type ProactiveInitiativeRow,
} from '../lib/proactiveInitiatives'
import { AppLogo } from './AppLogo'
import { SessionBackButton, SessionUserBeforeLogout } from './SessionNav'

type Props = {
  user: User
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export function ProactiveInitiativesListPage({ user }: Props) {
  const { state: staffState } = useStaffDashboardState(user)

  useEffect(() => {
    if (staffState.status !== 'ready' || !isProfilesSupabaseConfigured()) {
      return
    }
    void syncUserProfile(user)
  }, [user, staffState.status])

  const [rows, setRows] = useState<ProactiveInitiativeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void listProactiveInitiativesForUser(user.uid).then((r) => {
      if (cancelled) return
      if (!r.ok) {
        setError(r.message)
        setRows([])
      } else {
        setRows(r.rows)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [user.uid])

  const firebaseAuth = auth
  if (!firebaseAuth) {
    return null
  }

  const handleLogout = () => {
    void signOut(firebaseAuth)
  }

  const sessionUserName =
    staffState.status === 'ready' ? staffFullName(staffState.data.staff) : null

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <div className="dashboard-topbar-start">
          <AppLogo />
          <SessionBackButton />
          <h1 className="dashboard-brand">
            Proactive Initiative and Activity
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
        <section className="dashboard-panel activity-dashboard">
          <h2 className="dashboard-section-title">Your entries</h2>
          <p className="activity-muted journal-list-intro">
            Open a row to edit the title and details. Each entry records you as
            the creator.
          </p>

          {loading ? (
            <p className="loading">Loading…</p>
          ) : error ? (
            <p className="feedback error">{error}</p>
          ) : rows.length === 0 ? (
            <p className="activity-muted">
              No entries yet. Use <strong>Proactive Initiative and Activity</strong>{' '}
              on the home page to create one.
            </p>
          ) : (
            <ul className="activity-report-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    to={`/proactive/${row.id}`}
                    className="activity-report-row"
                  >
                    <span className="activity-report-title">
                      {row.title?.trim() || 'Untitled'}
                    </span>
                    <span className="activity-report-meta">
                      Updated {formatWhen(row.updated_at)}
                      {' · '}
                      <span title={row.firebase_uid}>You</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
