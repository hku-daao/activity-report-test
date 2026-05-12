import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { Link } from 'react-router-dom'
import {
  fetchActivityReportsForUids,
  reportMatchesSearch,
  type ActivityReportRow,
} from '../lib/activityReports'
import {
  fetchCreatorDirectoryByFirebaseUids,
  fetchTeamsAlphabetical,
  reportMatchesCreatorTeamFilter,
} from '../lib/teamsAndStaff'
import type { StaffRow, TeamRow } from '../lib/staffAccess'
import { useSupervisorScope } from '../hooks/useSupervisorScope'
import { SupervisorScopeControls } from './SupervisorScopeControls'

type Props = {
  user: User
  viewerStaff: StaffRow
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

export function ActivityReportsDashboard({
  user,
  viewerStaff,
  subordinates,
}: Props) {
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [rows, setRows] = useState<ActivityReportRow[]>([])
  const [creatorTeamByUid, setCreatorTeamByUid] = useState<
    Map<string, string[]>
  >(() => new Map())
  const [creatorFullNameByUid, setCreatorFullNameByUid] = useState<
    Map<string, string>
  >(() => new Map())
  const [creatorInfoLoaded, setCreatorInfoLoaded] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [creatorTeamFilterIds, setCreatorTeamFilterIds] = useState<string[]>(
    [],
  )
  const [creatorTeamFilterOpen, setCreatorTeamFilterOpen] = useState(false)
  const creatorTeamFilterRef = useRef<HTMLDivElement>(null)
  const creatorTeamFilterListId = 'activity-reports-creator-team-filter-list'
  const [showDeleted, setShowDeleted] = useState(false)

  const scope = useSupervisorScope(user, viewerStaff, subordinates, teams)
  const hasSubordinates = scope.hasSubordinates
  const showCreatorTeamFilter =
    !hasSubordinates || !scope.includeSubordinates

  const subordinateIdsKey = useMemo(
    () =>
      subordinates
        .map((s) => String(s.id))
        .sort()
        .join(','),
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
      setCreatorTeamFilterIds(tr.teams.map((t) => String(t.team_id)))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!creatorTeamFilterOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      const el = creatorTeamFilterRef.current
      if (el && !el.contains(e.target as Node)) {
        setCreatorTeamFilterOpen(false)
      }
    }
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCreatorTeamFilterOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onDocKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onDocKeyDown)
    }
  }, [creatorTeamFilterOpen])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      const uids = await scope.resolveUids()
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
  }, [
    user,
    scope.resolveUids,
    scope.includeSubordinates,
    scope.selectedTeamIds,
    scope.selectedStaffIds,
    hasSubordinates,
    viewerStaff.id,
    subordinateIdsKey,
  ])

  useEffect(() => {
    let cancelled = false
    const uids = [...new Set(rows.map((r) => r.firebase_uid))]
    if (uids.length === 0) {
      setCreatorTeamByUid(new Map())
      setCreatorFullNameByUid(new Map())
      setCreatorInfoLoaded(true)
      return
    }
    setCreatorInfoLoaded(false)
    void fetchCreatorDirectoryByFirebaseUids(uids).then((d) => {
      if (cancelled) return
      setCreatorTeamByUid(d.teamIdsByUid)
      setCreatorFullNameByUid(d.fullNameByUid)
      setCreatorInfoLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [rows])

  const creatorTeamSelectionParam = useMemo((): 'all' | string[] => {
    if (teams.length === 0) return 'all'
    if (creatorTeamFilterIds.length === teams.length) return 'all'
    return creatorTeamFilterIds
  }, [teams.length, creatorTeamFilterIds])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (!showDeleted && isDeleted(row)) return false
      if (showCreatorTeamFilter) {
        if (
          !reportMatchesCreatorTeamFilter(
            creatorTeamByUid.get(row.firebase_uid),
            creatorTeamSelectionParam,
          )
        ) {
          return false
        }
      }
      if (
        !reportMatchesSearch(
          row,
          search,
          creatorFullNameByUid.get(row.firebase_uid) ?? null,
        )
      ) {
        return false
      }
      return true
    })
  }, [
    rows,
    creatorTeamByUid,
    creatorFullNameByUid,
    creatorTeamSelectionParam,
    search,
    showDeleted,
    showCreatorTeamFilter,
  ])

  const toggleCreatorTeam = (teamId: string) => {
    const id = String(teamId)
    setCreatorTeamFilterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const selectAllCreatorTeams = () => {
    setCreatorTeamFilterIds(teams.map((t) => String(t.team_id)))
  }

  const creatorTeamFilterSummary = useMemo(() => {
    if (teams.length === 0) return 'No teams available'
    if (creatorTeamFilterIds.length === 0) return 'No teams selected'
    if (creatorTeamFilterIds.length === teams.length) return 'All teams'
    return `${creatorTeamFilterIds.length} team${creatorTeamFilterIds.length === 1 ? '' : 's'}`
  }, [teams.length, creatorTeamFilterIds])

  const reportHref = (row: ActivityReportRow): string => {
    if (isDeleted(row)) return `/activity/${row.id}`
    if (row.firebase_uid === user.uid) {
      return `/activity/${row.id}/edit`
    }
    return `/activity/${row.id}`
  }

  return (
    <section className="dashboard-panel activity-dashboard">
      <h2 className="dashboard-section-title">
        Meeting / Engagement / Activity reports
      </h2>

      <SupervisorScopeControls
        viewerStaff={viewerStaff}
        idPrefix="activity-reports-scope"
        hasSubordinates={hasSubordinates}
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

      <div className="activity-dashboard-controls">
        {showCreatorTeamFilter ? (
          <label className="activity-dashboard-field">
            <span
              className="activity-label"
              title="Filter by the team of the person who created the report (from staff directory), not the team chosen on the form."
            >
              Creator’s team
            </span>
            <div
              className="activity-team-multiselect"
              ref={creatorTeamFilterRef}
            >
              <button
                type="button"
                className="activity-team-dropdown-trigger"
                aria-expanded={creatorTeamFilterOpen}
                aria-haspopup="true"
                aria-controls={creatorTeamFilterListId}
                onClick={() => setCreatorTeamFilterOpen((o) => !o)}
              >
                <span className="activity-team-dropdown-summary">
                  {creatorTeamFilterSummary}
                </span>
                <span className="activity-team-dropdown-chevron" aria-hidden>
                  ▾
                </span>
              </button>
              {creatorTeamFilterOpen ? (
                <div
                  id={creatorTeamFilterListId}
                  className="activity-team-dropdown-panel"
                  role="group"
                  aria-label="Teams (creator)"
                >
                  <button
                    type="button"
                    className="activity-team-all-btn"
                    onClick={() => {
                      selectAllCreatorTeams()
                    }}
                  >
                    Select all teams
                  </button>
                  <div className="activity-team-checkboxes" role="group">
                    {teams.map((t) => {
                      const id = String(t.team_id)
                      const checked = creatorTeamFilterIds.includes(id)
                      return (
                        <label key={String(t.id)} className="activity-team-check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCreatorTeam(id)}
                          />
                          <span>{t.team_name?.trim() || id}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </label>
        ) : (
          <div className="activity-dashboard-field activity-dashboard-field--hint-only">
            <span className="activity-muted activity-scope-hint">
              Creator teams are narrowed by <strong>Teams in scope</strong>{' '}
              above.
            </span>
          </div>
        )}

        <label className="activity-dashboard-field activity-dashboard-search">
          <span className="activity-label">Search</span>
          <input
            type="search"
            className="activity-input"
            placeholder="Search title, detail, creator name, party, CRM…"
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

      <h3 className="dashboard-section-title">Activities</h3>

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
                  <span className="activity-report-meta">
                    Updated {formatWhen(row.updated_at)}
                    <span className="activity-report-owner">
                      {' '}
                      ·{' '}
                      {creatorInfoLoaded
                        ? creatorFullNameByUid.get(row.firebase_uid) ??
                          'Unknown creator'
                        : '…'}
                    </span>
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
