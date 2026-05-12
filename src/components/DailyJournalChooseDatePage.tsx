import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { isProfilesSupabaseConfigured } from '../lib/profilesSupabase'
import { syncUserProfile } from '../lib/profile'
import { staffFullName } from '../lib/staffAccess'
import { useStaffDashboardState } from '../hooks/useStaffDashboardState'
import {
  getOrCreateJournalForUserDate,
  localJournalDateKey,
} from '../lib/dailyJournals'
import { AppLogo } from './AppLogo'
import { SessionBackButton, SessionUserBeforeLogout } from './SessionNav'

type Props = {
  user: User
}

export function DailyJournalChooseDatePage({ user }: Props) {
  const navigate = useNavigate()
  const { state: staffState } = useStaffDashboardState(user)
  const [journalDate, setJournalDate] = useState(() => localJournalDateKey())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (staffState.status !== 'ready' || !isProfilesSupabaseConfigured()) {
      return
    }
    void syncUserProfile(user)
  }, [user, staffState.status])

  const firebaseAuth = auth
  if (!firebaseAuth) {
    return null
  }

  const handleLogout = () => {
    void signOut(firebaseAuth)
  }

  const sessionUserName =
    staffState.status === 'ready' ? staffFullName(staffState.data.staff) : null

  const handleContinue = async () => {
    setError(null)
    if (!isProfilesSupabaseConfigured()) {
      setError(
        'Profiles Supabase is not configured. Add VITE_PROFILES_SUPABASE_URL and VITE_PROFILES_SUPABASE_ANON_KEY, then create the daily_journals table (see supabase_daily_journals.sql).',
      )
      return
    }
    setSubmitting(true)
    try {
      const r = await getOrCreateJournalForUserDate(user, journalDate)
      if (!r.ok) {
        setError(r.message)
        return
      }
      navigate(`/journal/${r.row.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dashboard-page activity-form-page">
      <header className="dashboard-topbar">
        <div className="activity-topbar-left">
          <SessionBackButton />
          <div className="app-brand-lockup">
            <AppLogo />
            <h1 className="dashboard-brand">Daily journal</h1>
          </div>
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

      <section className="dashboard-panel" aria-labelledby="journal-pick-date-heading">
        <h2 id="journal-pick-date-heading" className="dashboard-section-title">
          Which day?
        </h2>
        <p className="activity-muted journal-list-intro">
          Choose the calendar day for your journal. If you already have an entry
          for that day, it opens for editing; otherwise a new journal is created
          when you continue.
        </p>
        <label className="activity-field">
          <span className="activity-label">Journal date</span>
          <input
            type="date"
            className="activity-input"
            value={journalDate}
            onChange={(e) => setJournalDate(e.target.value)}
          />
        </label>
        {error ? (
          <p className="feedback error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="activity-actions">
          <button
            type="button"
            className="auth-submit"
            disabled={submitting || !journalDate.trim()}
            onClick={() => void handleContinue()}
          >
            {submitting ? 'Opening…' : 'Continue'}
          </button>
        </div>
      </section>
    </div>
  )
}
