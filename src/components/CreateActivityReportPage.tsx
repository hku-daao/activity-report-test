import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { auth } from '../lib/firebase'
import {
  activityRowToFormState,
  clearDraftClientStorage,
  defaultFormState,
  fetchActivityReportById,
  loadDraftRowIdFromStorage,
  mergeWithDefaults,
  saveDraftRowIdToStorage,
  saveDraftToStorage,
  saveOrUpdateDraftInSupabase,
  softDeleteActivityReport,
  submitActivityReportToSupabase,
  type ActivityReportFormState,
} from '../lib/activityReports'
import {
  loadStaffDashboard,
  staffFullName,
  type StaffRow,
  type TeamRow,
} from '../lib/staffAccess'
import {
  defaultTeamFilterValue,
  fetchAllStaff,
  fetchTeamsAlphabetical,
  filterStaffByTeam,
  parseStaffTeamIds,
} from '../lib/teamsAndStaff'

type Props = {
  user: User
}

export function CreateActivityReportPage({ user }: Props) {
  const { pathname } = useLocation()
  /** Same component is mounted for `/activity/new` and `/activity/:id/edit` — derive id from the URL. `/activity/new` always starts a blank form; `/activity/:id/edit` loads that draft. */
  const editPathMatch = pathname.match(/^\/activity\/([^/]+)\/edit\/?$/)
  const editReportId = editPathMatch?.[1]
  const isEditMode = Boolean(editReportId)
  const navigate = useNavigate()
  const email = user.email ?? ''
  const firebaseAuth = auth

  const [gate, setGate] = useState<
    'loading' | 'denied' | 'error' | 'ready'
  >('loading')
  const [gateMessage, setGateMessage] = useState<string | null>(null)
  const [myStaff, setMyStaff] = useState<StaffRow | null>(null)
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [allStaff, setAllStaff] = useState<StaffRow[]>([])

  const [form, setForm] = useState<ActivityReportFormState>(defaultFormState)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingDraft, setDeletingDraft] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!email) {
        setGate('denied')
        return
      }
      const dash = await loadStaffDashboard(email)
      if (cancelled) return
      if (!dash.ok) {
        if (dash.reason === 'not_found') {
          setGate('denied')
          return
        }
        if (dash.reason === 'not_configured') {
          setGate('error')
          setGateMessage(
            'Access list Supabase is not configured. Check your environment variables.',
          )
          return
        }
        setGate('error')
        setGateMessage(dash.message ?? 'Could not verify access.')
        return
      }
      const [tr, sr] = await Promise.all([
        fetchTeamsAlphabetical(),
        fetchAllStaff(),
      ])
      if (cancelled) return
      if (!tr.ok) {
        setGate('error')
        setGateMessage(tr.message)
        return
      }
      if (!sr.ok) {
        setGate('error')
        setGateMessage(sr.message)
        return
      }
      setMyStaff(dash.data.staff)
      setTeams(tr.teams)
      setAllStaff(sr.staff)

      if (editReportId) {
        const rowRes = await fetchActivityReportById(editReportId)
        if (cancelled) return
        if (
          !rowRes.ok ||
          rowRes.row.firebase_uid !== user.uid ||
          rowRes.row.status !== 'draft' ||
          rowRes.row.deleted_at
        ) {
          setGate('error')
          setGateMessage(
            'This draft is not available for editing, or it was already submitted.',
          )
          return
        }
        const next = activityRowToFormState(rowRes.row)
        setForm(next)
        saveDraftRowIdToStorage(user.uid, editReportId)
        saveDraftToStorage(user.uid, next)
        setGate('ready')
        return
      }

      clearDraftClientStorage(user.uid)
      let next = mergeWithDefaults(null)
      const userTeams = parseStaffTeamIds(dash.data.staff)
      next = {
        ...next,
        teamFilter: defaultTeamFilterValue(userTeams, tr.teams),
      }
      if (dash.data.staff) {
        next = {
          ...next,
          attendingStaffIds: [dash.data.staff.id],
        }
      }
      setForm(next)
      setGate('ready')
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [email, user.uid, editReportId])

  /**
   * Staff matching the team dropdown, with “you” first. Also includes anyone
   * already checked as attending who is not in the current team filter, so
   * switching teams does not drop those selections from the list.
   */
  const visibleStaff = useMemo(() => {
    if (!myStaff) return []
    const inTeam = filterStaffByTeam(allStaff, form.teamFilter, null)
    const idsInTeam = new Set(inTeam.map((s) => String(s.id)))
    const selectedOutsideFilter = form.attendingStaffIds
      .map((id) => allStaff.find((s) => String(s.id) === String(id)))
      .filter(
        (s): s is StaffRow => s != null && !idsInTeam.has(String(s.id)),
      )
    selectedOutsideFilter.sort((a, b) =>
      staffFullName(a).localeCompare(staffFullName(b), undefined, {
        sensitivity: 'base',
      }),
    )
    const me = inTeam.find((s) => String(s.id) === String(myStaff.id))
    const others = inTeam.filter((s) => String(s.id) !== String(myStaff.id))
    const primary = me ? [me, ...others] : inTeam
    return [...primary, ...selectedOutsideFilter]
  }, [allStaff, form.teamFilter, form.attendingStaffIds, myStaff])

  const toggleAttending = useCallback((staffId: string | number) => {
    setForm((f) => {
      const sid = String(staffId)
      const has = f.attendingStaffIds.some((id) => String(id) === sid)
      return {
        ...f,
        attendingStaffIds: has
          ? f.attendingStaffIds.filter((id) => String(id) !== sid)
          : [...f.attendingStaffIds, staffId],
      }
    })
  }, [])

  const handleSave = async () => {
    setFeedback(null)
    setSaving(true)
    try {
      saveDraftToStorage(user.uid, form)
      const existingId = isEditMode
        ? editReportId!
        : loadDraftRowIdFromStorage(user.uid)
      const result = await saveOrUpdateDraftInSupabase(user, form, existingId)
      if (!result.ok) {
        setFeedback({ type: 'error', text: result.message })
        return
      }
      saveDraftRowIdToStorage(user.uid, result.id)
      setFeedback({
        type: 'success',
        text: 'Draft saved. You can continue editing or submit when ready.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDraft = async () => {
    if (!isEditMode || !editReportId) return
    const ok = window.confirm(
      'Delete this unsubmitted draft? It will be removed from the list unless you turn on “Show deleted entries”.',
    )
    if (!ok) return
    setFeedback(null)
    setDeletingDraft(true)
    const result = await softDeleteActivityReport(editReportId, user.uid)
    setDeletingDraft(false)
    if (result.ok) {
      if (loadDraftRowIdFromStorage(user.uid) === editReportId) {
        saveDraftRowIdToStorage(user.uid, null)
        localStorage.removeItem(`activityReportDraft:${user.uid}`)
      }
      navigate('/', { replace: true })
    } else {
      setFeedback({ type: 'error', text: result.message })
    }
  }

  const handleSubmit = async () => {
    setFeedback(null)
    if (!form.eventDateTime.trim()) {
      setFeedback({
        type: 'error',
        text: 'Please set Event Date/Time before submitting.',
      })
      return
    }
    if (!form.detail.trim()) {
      setFeedback({
        type: 'error',
        text: 'Please enter Detail of the activity before submitting.',
      })
      return
    }
    const totalMin =
      (Number(form.durationHours) || 0) * 60 + (Number(form.durationMinutes) || 0)
    if (totalMin <= 0) {
      setFeedback({
        type: 'error',
        text: 'Duration must be greater than zero.',
      })
      return
    }

    setSaving(true)
    const draftRowId = isEditMode
      ? editReportId!
      : loadDraftRowIdFromStorage(user.uid)
    const result = await submitActivityReportToSupabase(user, form, {
      draftRowId,
    })
    setSaving(false)
    if (result.ok) {
      localStorage.removeItem(`activityReportDraft:${user.uid}`)
      saveDraftRowIdToStorage(user.uid, null)
      navigate('/', { replace: true })
    } else {
      setFeedback({ type: 'error', text: result.message })
    }
  }

  const handleLogout = () => {
    if (firebaseAuth) void signOut(firebaseAuth)
  }

  const teamOptions = useMemo(() => {
    const sorted = [...teams].sort((a, b) =>
      (a.team_name ?? '').localeCompare(b.team_name ?? '', undefined, {
        sensitivity: 'base',
      }),
    )
    return sorted
  }, [teams])

  if (!firebaseAuth) {
    return null
  }

  if (gate === 'loading') {
    return (
      <div className="dashboard-page activity-form-page">
        <p className="loading">Loading…</p>
      </div>
    )
  }

  if (gate === 'denied') {
    return (
      <div className="dashboard-page activity-form-page">
        <p className="feedback error">
          You do not have access to create an activity report.
        </p>
        <Link to="/" className="activity-back-link">
          Back to home
        </Link>
      </div>
    )
  }

  if (gate === 'error') {
    return (
      <div className="dashboard-page activity-form-page">
        <p className="feedback error">{gateMessage ?? 'Something went wrong.'}</p>
        <Link to="/" className="activity-back-link">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="dashboard-page activity-form-page">
      <header className="dashboard-topbar">
        <div className="activity-topbar-left">
          <Link to="/" className="activity-back-link">
            ← Home
          </Link>
          <h1 className="dashboard-brand">
            {isEditMode ? 'Edit activity report' : 'Create Activity Report'}
          </h1>
        </div>
        <button
          type="button"
          className="dashboard-logout"
          onClick={handleLogout}
        >
          Log out
        </button>
      </header>

      <form
        className="activity-form"
        onSubmit={(e) => {
          e.preventDefault()
        }}
      >
        <label className="activity-field">
          <span className="activity-label">Activity Title</span>
          <input
            type="text"
            className="activity-input"
            value={form.title}
            onChange={(e) =>
              setForm((f) => ({ ...f, title: e.target.value }))
            }
            placeholder="Short title for this activity"
          />
        </label>

        <label className="activity-field">
          <span className="activity-label">Teams</span>
          <select
            className="activity-input"
            value={form.teamFilter}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                teamFilter: e.target.value as ActivityReportFormState['teamFilter'],
              }))
            }
          >
            <option value="__all__">All teams</option>
            {teamOptions.map((t) => (
              <option key={String(t.id)} value={String(t.team_id)}>
                {t.team_name?.trim() || String(t.team_id)}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="activity-fieldset">
          <legend className="activity-label">Who is attending</legend>
          <div className="activity-checkbox-list" role="group">
            {visibleStaff.length === 0 ? (
              <p className="activity-muted">
                No staff match this team selection.
              </p>
            ) : (
              visibleStaff.map((s) => {
                const checked = form.attendingStaffIds.some(
                  (id) => String(id) === String(s.id),
                )
                return (
                  <label key={String(s.id)} className="activity-check-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAttending(s.id)}
                    />
                    <span>
                      {staffFullName(s)}
                      {s.email ? (
                        <span className="activity-muted"> ({s.email})</span>
                      ) : null}
                    </span>
                  </label>
                )
              })
            )}
          </div>
        </fieldset>

        <label className="activity-check-row activity-other-toggle">
          <input
            type="checkbox"
            checked={form.otherPeopleEnabled}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                otherPeopleEnabled: e.target.checked,
                otherPeopleNames: e.target.checked
                  ? f.otherPeopleNames.length > 0
                    ? f.otherPeopleNames
                    : ['']
                  : f.otherPeopleNames,
              }))
            }
          />
          <span className="activity-label-inline">Other people:</span>
        </label>

        {form.otherPeopleEnabled ? (
          <div className="activity-field activity-multi">
            {form.otherPeopleNames.map((name, i) => (
              <div key={i} className="activity-multi-row">
                <input
                  type="text"
                  className="activity-input"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => {
                      const next = [...f.otherPeopleNames]
                      next[i] = v
                      return { ...f, otherPeopleNames: next }
                    })
                  }}
                />
                <button
                  type="button"
                  className="activity-icon-btn"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      otherPeopleNames: f.otherPeopleNames.filter(
                        (_, j) => j !== i,
                      ),
                    }))
                  }
                  disabled={form.otherPeopleNames.length <= 1}
                  aria-label="Remove name"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="activity-add-btn"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  otherPeopleNames: [...f.otherPeopleNames, ''],
                }))
              }
            >
              Add another name
            </button>
          </div>
        ) : null}

        <div className="activity-row-2">
          <label className="activity-field activity-field-grow">
            <span className="activity-label">The other party&apos;s name:</span>
            <input
              type="text"
              className="activity-input"
              value={form.otherPartyName}
              onChange={(e) =>
                setForm((f) => ({ ...f, otherPartyName: e.target.value }))
              }
            />
          </label>
          <label className="activity-field activity-field-grow">
            <span className="activity-label">CRM Constituent No (if any)</span>
            <input
              type="text"
              className="activity-input"
              value={form.crmConstituentNo}
              onChange={(e) =>
                setForm((f) => ({ ...f, crmConstituentNo: e.target.value }))
              }
            />
          </label>
        </div>

        <div className="activity-row-2">
          <label className="activity-field activity-field-grow">
            <span className="activity-label">Event Date/Time</span>
            <input
              type="datetime-local"
              className="activity-input"
              value={form.eventDateTime}
              onChange={(e) =>
                setForm((f) => ({ ...f, eventDateTime: e.target.value }))
              }
            />
          </label>
          <div className="activity-field activity-duration">
            <span className="activity-label">Duration:</span>
            <div className="activity-duration-inputs">
              <label>
                <span className="sr-only">Hours</span>
                <input
                  type="number"
                  min={0}
                  className="activity-input activity-input-narrow"
                  value={form.durationHours}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      durationHours: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
                <span className="activity-suffix">h</span>
              </label>
              <label>
                <span className="sr-only">Minutes</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  className="activity-input activity-input-narrow"
                  value={form.durationMinutes}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      durationMinutes: Math.min(
                        59,
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    }))
                  }
                />
                <span className="activity-suffix">m</span>
              </label>
            </div>
          </div>
        </div>

        <label className="activity-field">
          <span className="activity-label">Detail of the activity:</span>
          <textarea
            className="activity-textarea"
            rows={8}
            value={form.detail}
            onChange={(e) =>
              setForm((f) => ({ ...f, detail: e.target.value }))
            }
          />
        </label>

        <div className="activity-field">
          <span className="activity-label">Attachment links (optional)</span>
          {form.attachmentItems.map((item, i) => (
            <div key={i} className="activity-attachment-block">
              <label className="activity-field activity-field--stacked">
                <span className="activity-label">Description</span>
                <input
                  type="text"
                  className="activity-input"
                  placeholder="What this link is (e.g. meeting notes)"
                  value={item.description}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => {
                      const next = [...f.attachmentItems]
                      next[i] = { ...next[i], description: v }
                      return { ...f, attachmentItems: next }
                    })
                  }}
                />
              </label>
              <div className="activity-multi-row">
                <input
                  type="url"
                  className="activity-input"
                  placeholder="https://…"
                  value={item.url}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => {
                      const next = [...f.attachmentItems]
                      next[i] = { ...next[i], url: v }
                      return { ...f, attachmentItems: next }
                    })
                  }}
                />
                <button
                  type="button"
                  className="activity-icon-btn"
                  disabled={!item.url.trim()}
                  onClick={() => {
                    const href = item.url.trim()
                    if (!href) return
                    window.open(href, '_blank', 'noopener,noreferrer')
                  }}
                >
                  Go to link
                </button>
                <button
                  type="button"
                  className="activity-icon-btn"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      attachmentItems: f.attachmentItems.filter((_, j) => j !== i),
                    }))
                  }
                  disabled={form.attachmentItems.length <= 1}
                  aria-label="Remove attachment"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="activity-add-btn"
            onClick={() =>
              setForm((f) => ({
                ...f,
                attachmentItems: [
                  ...f.attachmentItems,
                  { url: '', description: '' },
                ],
              }))
            }
          >
            Add attachment link
          </button>
        </div>

        {feedback ? (
          <p
            className={`feedback ${feedback.type === 'success' ? 'success' : 'error'}`}
            role="status"
          >
            {feedback.text}
          </p>
        ) : null}

        {isEditMode ? (
          <div className="activity-edit-delete">
            <button
              type="button"
              className="auth-submit activity-delete-btn"
              disabled={saving || deletingDraft}
              onClick={() => void handleDeleteDraft()}
            >
              {deletingDraft ? 'Deleting…' : 'Delete draft'}
            </button>
          </div>
        ) : null}

        <div className="activity-actions">
          <button
            type="button"
            className="auth-submit secondary"
            disabled={saving || deletingDraft}
            onClick={handleSave}
          >
            Save
          </button>
          <button
            type="button"
            className="auth-submit"
            disabled={saving || deletingDraft}
            onClick={() => void handleSubmit()}
          >
            {saving ? 'Please wait…' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  )
}
