import { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { Link } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { isProfilesSupabaseConfigured } from '../lib/profilesSupabase'
import { syncUserProfile } from '../lib/profile'
import {
  EMPTY_SUBORDINATES,
  staffFullName,
  type StaffRow,
  type TeamRow,
} from '../lib/staffAccess'
import { useStaffDashboardState } from '../hooks/useStaffDashboardState'
import { useSupervisorScope } from '../hooks/useSupervisorScope'
import {
  fetchCreatorDirectoryByFirebaseUids,
  fetchTeamsAlphabetical,
} from '../lib/teamsAndStaff'
import {
  listJournalsForFirebaseUids,
  type DailyJournalRow,
} from '../lib/dailyJournals'
import { AppLogo } from './AppLogo'
import { SessionBackButton, SessionUserBeforeLogout } from './SessionNav'
import { SupervisorScopeControls } from './SupervisorScopeControls'

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

function pendingViewerStaff(user: User): StaffRow {
  return {
    id: '__pending__',
    name: null,
    email: user.email ?? null,
    team_id: null,
    app_id: null,
    display_name: null,
    director: null,
  }
}

export function JournalsListPage({ user }: Props) {
  const { state: staffState } = useStaffDashboardState(user)

  const viewerStaff = useMemo((): StaffRow => {
    if (staffState.status === 'ready') return staffState.data.staff
    return pendingViewerStaff(user)
  }, [staffState, user])

  const subordinates =
    staffState.status === 'ready'
      ? staffState.data.subordinates
      : EMPTY_SUBORDINATES

  const [teams, setTeams] = useState<TeamRow[]>([])

  useEffect(() => {
    if (staffState.status !== 'ready' || !isProfilesSupabaseConfigured()) {
      return
    }
    void syncUserProfile(user)
  }, [user, staffState.status])

  useEffect(() => {
    let cancelled = false
    void fetchTeamsAlphabetical().then((tr) => {
      if (cancelled) return
      if (tr.ok) setTeams(tr.teams)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const scope = useSupervisorScope(user, viewerStaff, subordinates, teams)

  const subordinateIdsKey = useMemo(
    () =>
      subordinates
        .map((s) => String(s.id))
        .sort()
        .join(','),
    [subordinates],
  )

  const [rows, setRows] = useState<DailyJournalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [nameByUid, setNameByUid] = useState<Map<string, string>>(
    () => new Map(),
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      const uids = await scope.resolveUids()
      if (cancelled) return
      const r = await listJournalsForFirebaseUids(uids, {
        includeDeleted: showDeleted,
      })
      if (cancelled) return
      if (!r.ok) {
        setError(r.message)
        setRows([])
      } else {
        setRows(r.rows)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [
    user.uid,
    scope.includeSubordinates,
    scope.selectedTeamIds,
    scope.selectedStaffIds,
    scope.fullPoolTeamIds,
    scope.resolveUids,
    showDeleted,
    subordinateIdsKey,
    viewerStaff.id,
  ])

  useEffect(() => {
    let cancelled = false
    const uids = [...new Set(rows.map((r) => r.firebase_uid))]
    if (uids.length === 0) {
      setNameByUid(new Map())
      return
    }
    void fetchCreatorDirectoryByFirebaseUids(uids).then((d) => {
      if (cancelled) return
      setNameByUid(d.fullNameByUid)
    })
    return () => {
      cancelled = true
    }
  }, [rows])

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
          <h1 className="dashboard-brand">Journals</h1>
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
          <h2 className="dashboard-section-title">Daily journals</h2>
          <p className="activity-muted journal-list-intro">
            Each journal is tied to one creator and one calendar day. Open a row
            to view or continue editing (your own journals only).
          </p>

          <SupervisorScopeControls
            viewerStaff={viewerStaff}
            idPrefix="journals-scope"
            hasSubordinates={scope.hasSubordinates}
            includeSubordinates={scope.includeSubordinates}
            onIncludeSubordinatesChange={scope.setIncludeSubordinates}
            poolTeamRows={scope.poolTeamRows}
            selectedTeamIds={scope.selectedTeamIds}
            toggleTeam={scope.toggleTeam}
            selectAllTeams={scope.selectAllTeams}
            staffAfterTeams={scope.staffAfterTeams}
            selectedStaffIds={scope.selectedStaffIds}
            toggleStaff={scope.toggleStaff}
            selectAllStaff={scope.selectAllStaff}
          />

          <label className="activity-show-deleted">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            <span>Show deleted entries</span>
          </label>

          {loading ? (
            <p className="loading">Loading…</p>
          ) : error ? (
            <p className="feedback error">{error}</p>
          ) : rows.length === 0 ? (
            <p className="activity-muted">
              No journals match your filters. Use Daily Journal on the home page
              to pick a day and start.
            </p>
          ) : (
            <ul className="activity-report-list">
              {rows.map((row) => {
                const deleted = Boolean(row.deleted_at)
                const ownerLabel =
                  row.firebase_uid === user.uid
                    ? 'You'
                    : nameByUid.get(row.firebase_uid) ?? 'Colleague'
                return (
                  <li key={row.id}>
                    <Link
                      to={`/journal/${row.id}`}
                      className={`activity-report-row${deleted ? ' is-deleted' : ''}`}
                    >
                      <span className="activity-report-title">
                        {row.title?.trim() || 'Untitled journal'}
                      </span>
                      <span className="activity-report-meta">
                        Day {row.journal_date} · Updated{' '}
                        {formatWhen(row.updated_at)}
                        {' · '}
                        <span title={row.firebase_uid}>{ownerLabel}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
