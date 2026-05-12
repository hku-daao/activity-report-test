import { useEffect, useMemo, useRef, useState } from 'react'
import type { StaffRow, TeamRow } from '../lib/staffAccess'
import { staffFullName } from '../lib/staffAccess'

type Props = {
  viewerStaff: StaffRow
  idPrefix: string
  hasSubordinates: boolean
  includeSubordinates: boolean
  onIncludeSubordinatesChange: (value: boolean) => void
  poolTeamRows: TeamRow[]
  selectedTeamIds: string[]
  toggleTeam: (teamId: string) => void
  selectAllTeams: () => void
  staffAfterTeams: StaffRow[]
  selectedStaffIds: string[]
  toggleStaff: (staffId: string) => void
  selectAllStaff: () => void
}

export function SupervisorScopeControls({
  viewerStaff,
  idPrefix,
  hasSubordinates,
  includeSubordinates,
  onIncludeSubordinatesChange,
  poolTeamRows,
  selectedTeamIds,
  toggleTeam,
  selectAllTeams,
  staffAfterTeams,
  selectedStaffIds,
  toggleStaff,
  selectAllStaff,
}: Props) {
  const [teamOpen, setTeamOpen] = useState(false)
  const [staffOpen, setStaffOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const teamListId = `${idPrefix}-team-list`
  const staffListId = `${idPrefix}-staff-list`

  useEffect(() => {
    if (!teamOpen && !staffOpen) return
    const onDoc = (e: MouseEvent) => {
      const el = wrapRef.current
      if (el && !el.contains(e.target as Node)) {
        setTeamOpen(false)
        setStaffOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTeamOpen(false)
        setStaffOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [teamOpen, staffOpen])

  const teamSummary = useMemo(() => {
    if (poolTeamRows.length === 0) return 'No teams in scope'
    if (
      selectedTeamIds.length === 0 ||
      selectedTeamIds.length === poolTeamRows.length
    ) {
      return 'All teams'
    }
    return `${selectedTeamIds.length} team${selectedTeamIds.length === 1 ? '' : 's'}`
  }, [poolTeamRows.length, selectedTeamIds.length])

  const staffSummary = useMemo(() => {
    if (staffAfterTeams.length === 0) return 'No people in scope'
    if (
      selectedStaffIds.length === 0 ||
      selectedStaffIds.length === staffAfterTeams.length
    ) {
      return 'All people in scope'
    }
    return `${selectedStaffIds.length} selected`
  }, [staffAfterTeams.length, selectedStaffIds.length])

  function staffLabel(s: StaffRow): string {
    const base = staffFullName(s)
    if (String(s.id) === String(viewerStaff.id)) {
      return `${base} (you)`
    }
    return base
  }

  if (!hasSubordinates) {
    return null
  }

  return (
    <div className="supervisor-scope-controls" ref={wrapRef}>
      <label className="supervisor-scope-include">
        <input
          type="checkbox"
          checked={includeSubordinates}
          onChange={(e) => onIncludeSubordinatesChange(e.target.checked)}
        />
        <span>Include all subordinates</span>
      </label>

      {includeSubordinates ? (
        <div className="supervisor-scope-filters activity-dashboard-controls">
          <label className="activity-dashboard-field">
            <span className="activity-label">Teams in scope</span>
            <div className="activity-team-multiselect">
              <button
                type="button"
                className="activity-team-dropdown-trigger"
                aria-expanded={teamOpen}
                aria-haspopup="true"
                aria-controls={teamListId}
                onClick={() => {
                  setStaffOpen(false)
                  setTeamOpen((o) => !o)
                }}
              >
                <span className="activity-team-dropdown-summary">
                  {teamSummary}
                </span>
                <span className="activity-team-dropdown-chevron" aria-hidden>
                  ▾
                </span>
              </button>
              {teamOpen ? (
                <div
                  id={teamListId}
                  className="activity-team-dropdown-panel"
                  role="group"
                  aria-label="Teams"
                >
                  <button
                    type="button"
                    className="activity-team-all-btn"
                    onClick={() => {
                      selectAllTeams()
                    }}
                  >
                    Select all teams
                  </button>
                  <div className="activity-team-checkboxes" role="group">
                    {poolTeamRows.map((t) => {
                      const id = String(t.team_id)
                      const checked = selectedTeamIds.includes(id)
                      return (
                        <label
                          key={String(t.id)}
                          className="activity-team-check"
                        >
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
              ) : null}
            </div>
          </label>

          <label className="activity-dashboard-field">
            <span className="activity-label">People in scope</span>
            <div className="activity-team-multiselect">
              <button
                type="button"
                className="activity-team-dropdown-trigger"
                aria-expanded={staffOpen}
                aria-haspopup="true"
                aria-controls={staffListId}
                onClick={() => {
                  setTeamOpen(false)
                  setStaffOpen((o) => !o)
                }}
              >
                <span className="activity-team-dropdown-summary">
                  {staffSummary}
                </span>
                <span className="activity-team-dropdown-chevron" aria-hidden>
                  ▾
                </span>
              </button>
              {staffOpen ? (
                <div
                  id={staffListId}
                  className="activity-team-dropdown-panel"
                  role="group"
                  aria-label="People"
                >
                  <button
                    type="button"
                    className="activity-team-all-btn"
                    onClick={() => {
                      selectAllStaff()
                    }}
                  >
                    Select all
                  </button>
                  <div className="activity-team-checkboxes" role="group">
                    {staffAfterTeams.map((s) => {
                      const id = String(s.id)
                      const checked = selectedStaffIds.includes(id)
                      return (
                        <label key={id} className="activity-team-check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStaff(id)}
                          />
                          <span>{staffLabel(s)}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </label>
        </div>
      ) : null}
    </div>
  )
}
