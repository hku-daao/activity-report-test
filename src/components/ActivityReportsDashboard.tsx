import { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import { Link } from 'react-router-dom'
import {
  fetchActivityReportsForUids,
  reportMatchesSearch,
  reportMatchesTeamSelection,
  resolveViewerFirebaseUids,
  type ActivityReportRow,
} from '../lib/activityReports'
import { fetchTeamsAlphabetical } from '../lib/teamsAndStaff'
import type { StaffRow, TeamRow } from '../lib/staffAccess'

type Props = {
  user: User
  subordinates: StaffRow[]
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

function isDeleted(row: ActivityReportRow): boolean {
  return Boolean(row.deleted_at)
}

export function ActivityReportsDashboard({ user, subordinates }: Props) {
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [rows, setRows] = useState<ActivityReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [showDeleted, setShowDeleted] = useState(false)

  const subEmails = useMemo(
    () =>
      subordinates
        .map((s) => s.email?.trim())
        .filter((e): e is string => Boolean(e)),
    [subordinates],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const tr = await fetchTeamsAlphabetical()
      if (cancelled) return
      if (!tr.ok) {
        setError(tr.message)
        setLoading(false)
        return
      }
      setTeams(tr.teams)
      setSelectedTeamIds(tr.teams.map((t) => String(t.team_id)))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      const uids = await resolveViewerFirebaseUids(user, subEmails)
      if (cancelled) return
      const fr = await fetchActivityReportsForUids(uids)
      if (cancelled) return
      if (!fr.ok) {
        setError(fr.message)
        setLoading(false)
        return
      }
      setRows(fr.rows)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user, subEmails])

  const teamSelectionParam = useMemo((): 'all' | string[] => {
    if (teams.length === 0) return 'all'
    if (selectedTeamIds.length === teams.length) return 'all'
    return selectedTeamIds
  }, [teams.length, selectedTeamIds])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!showDeleted && isDeleted(row)) return false
      if (!reportMatchesTeamSelection(row, teamSelectionParam)) return false
      if (!reportMatchesSearch(row, search)) return false
      return true
    })
  }, [rows, teamSelectionParam, search, showDeleted])

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) => {
      const id = String(teamId)
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id)
      }
      return [...prev, id]
    })
  }

  const selectAllTeams = () => {
    setSelectedTeamIds(teams.map((t) => String(t.team_id)))
  }

  const reportHref = (row: ActivityReportRow): string => {
    if (isDeleted(row)) return `/activity/${row.id}`
    if (row.status === 'draft' && row.firebase_uid === user.uid) {
      return `/activity/${row.id}/edit`
    }
    return `/activity/${row.id}`
  }

  function statusLabel(row: ActivityReportRow, deleted: boolean): string {
    if (deleted) return 'Deleted'
    if (row.status === 'submitted') return 'Submitted'
    return 'Unsubmitted'
  }

  function statusClassName(row: ActivityReportRow, deleted: boolean): string {
    if (deleted) return 'activity-report-status is-record-deleted'
    if (row.status === 'submitted') {
      return 'activity-report-status is-submitted'
    }
    return 'activity-report-status is-draft'
  }

  return (
    <section className="dashboard-panel activity-dashboard">
      <h2 className="dashboard-section-title">Activity reports</h2>

      <div className="activity-dashboard-controls">
        <label className="activity-dashboard-field">
          <span className="activity-label">Teams</span>
          <div className="activity-team-multiselect">
            <button
              type="button"
              className="activity-team-all-btn"
              onClick={selectAllTeams}
            >
              Select all teams
            </button>
            <div className="activity-team-checkboxes" role="group">
              {teams.map((t) => {
                const id = String(t.team_id)
                const checked = selectedTeamIds.includes(id)
                return (
                  <label key={String(t.id)} className="activity-team-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTeam(id)}
                    />
                    <span>{t.team_name?.trim() || id}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </label>

        <label className="activity-dashboard-field activity-dashboard-search">
          <span className="activity-label">Search</span>
          <input
            type="search"
            className="activity-input"
            placeholder="Search title, detail, party, CRM…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>

      <label className="activity-show-deleted">
        <input
          type="checkbox"
          checked={showDeleted}
          onChange={(e) => setShowDeleted(e.target.checked)}
        />
        <span>Show deleted entries</span>
      </label>

      {loading ? (
        <p className="activity-muted">Loading reports…</p>
      ) : error ? (
        <p className="feedback error">{error}</p>
      ) : filteredRows.length === 0 ? (
        <p className="activity-muted">No activity reports match your filters.</p>
      ) : (
        <ul className="activity-report-list">
          {filteredRows.map((row) => {
            const deleted = isDeleted(row)
            return (
              <li key={row.id}>
                <Link
                  to={reportHref(row)}
                  className={`activity-report-row${deleted ? ' is-deleted' : ''}`}
                >
                  <span className="activity-report-title">
                    {row.title?.trim() || 'Untitled activity'}
                  </span>
                  <span className={statusClassName(row, deleted)}>
                    {statusLabel(row, deleted)}
                  </span>
                  <span className="activity-report-meta">
                    {formatWhen(row.created_at)}
                    {row.firebase_uid === user.uid ? (
                      <span className="activity-report-owner"> · Yours</span>
                    ) : (
                      <span className="activity-report-owner"> · Team member</span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
