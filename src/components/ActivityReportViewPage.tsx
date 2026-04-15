import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { auth } from '../lib/firebase'
import {
  activityRowToFormState,
  fetchActivityReportById,
  parseAttendingIds,
  parseOtherPeopleNamesFromRow,
  resolveViewerFirebaseUids,
  softDeleteActivityReport,
  type ActivityReportRow,
} from '../lib/activityReports'
import { loadStaffDashboard, staffFullName, type StaffRow } from '../lib/staffAccess'
import { fetchAllStaff } from '../lib/teamsAndStaff'

type Props = {
  user: User
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export function ActivityReportViewPage({ user }: Props) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const firebaseAuth = auth
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; row: ActivityReportRow }
    | { status: 'forbidden' }
  >({ status: 'loading' })
  const [deleting, setDeleting] = useState(false)
  const [staffList, setStaffList] = useState<StaffRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!id) {
        setState({ status: 'error', message: 'Missing report id.' })
        return
      }
      const email = user.email ?? ''
      if (!email) {
        setState({ status: 'error', message: 'No email on account.' })
        return
      }

      const dash = await loadStaffDashboard(email)
      if (cancelled) return
      if (!dash.ok) {
        setState({
          status: 'error',
          message: 'Could not verify access.',
        })
        return
      }

      const subEmails =
        dash.data.subordinates
          .map((s) => s.email?.trim())
          .filter((e): e is string => Boolean(e)) ?? []

      const allowedUids = await resolveViewerFirebaseUids(user, subEmails)
      if (cancelled) return

      const fr = await fetchActivityReportById(id)
      if (cancelled) return
      if (!fr.ok) {
        setState({ status: 'error', message: fr.message })
        return
      }

      if (!allowedUids.includes(fr.row.firebase_uid)) {
        setState({ status: 'forbidden' })
        return
      }

      setState({ status: 'ready', row: fr.row })
    })()
    return () => {
      cancelled = true
    }
  }, [id, user])

  const reportId = state.status === 'ready' ? state.row.id : null

  useEffect(() => {
    if (!reportId) {
      setStaffList(null)
      return
    }
    let cancelled = false
    void fetchAllStaff().then((res) => {
      if (cancelled) return
      setStaffList(res.ok ? res.staff : [])
    })
    return () => {
      cancelled = true
    }
  }, [reportId])

  const handleLogout = () => {
    if (firebaseAuth) void signOut(firebaseAuth)
  }

  const handleDelete = async () => {
    if (!id || state.status !== 'ready') return
    const row = state.row
    if (row.firebase_uid !== user.uid || row.deleted_at) return
    const ok = window.confirm(
      'Delete this activity report? It will be hidden from the dashboard unless you turn on “Show deleted entries”.',
    )
    if (!ok) return
    setDeleting(true)
    const result = await softDeleteActivityReport(id, user.uid)
    setDeleting(false)
    if (result.ok) {
      navigate('/', { replace: true })
    } else {
      window.alert(result.message)
    }
  }

  if (!firebaseAuth) {
    return null
  }

  if (state.status === 'loading') {
    return (
      <div className="dashboard-page activity-form-page">
        <p className="loading">Loading report…</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="dashboard-page activity-form-page">
        <p className="feedback error">{state.message}</p>
        <Link to="/" className="activity-back-link">
          ← Home
        </Link>
      </div>
    )
  }

  if (state.status === 'forbidden') {
    return (
      <div className="dashboard-page activity-form-page">
        <p className="feedback error">
          You do not have permission to view this report.
        </p>
        <Link to="/" className="activity-back-link">
          ← Home
        </Link>
      </div>
    )
  }

  const row = state.row
  const isOwner = row.firebase_uid === user.uid
  const isSoftDeleted = Boolean(row.deleted_at)

  if (
    row.status === 'draft' &&
    !isSoftDeleted &&
    isOwner
  ) {
    return <Navigate to={`/activity/${id}/edit`} replace />
  }

  const form = activityRowToFormState(row)
  const otherPeopleFromRow = parseOtherPeopleNamesFromRow(row)
  const statusLabel =
    row.status === 'submitted' ? 'Submitted' : 'Unsubmitted'
  const statusBadgeClass = isSoftDeleted
    ? 'activity-report-status is-record-deleted'
    : `activity-report-status is-${row.status === 'submitted' ? 'submitted' : 'draft'}`

  return (
    <div className="dashboard-page activity-form-page">
      <header className="dashboard-topbar">
        <div className="activity-topbar-left">
          <Link to="/" className="activity-back-link">
            ← Home
          </Link>
          <h1 className="dashboard-brand">Activity report</h1>
        </div>
        <button
          type="button"
          className="dashboard-logout"
          onClick={handleLogout}
        >
          Log out
        </button>
      </header>

      <div className="activity-view-panel">
        {isSoftDeleted ? (
          <p className="feedback activity-view-deleted-banner" role="status">
            This report was deleted. It only appears when “Show deleted entries”
            is enabled on the dashboard.
          </p>
        ) : null}

        <p className="activity-view-status">
          <span className={statusBadgeClass}>
            {isSoftDeleted ? 'Deleted' : statusLabel}
          </span>
          <span className="activity-muted">
            {' '}
            · Created {formatWhen(row.created_at)}
          </span>
        </p>

        {isOwner && !isSoftDeleted ? (
          <div className="activity-view-actions">
            <button
              type="button"
              className="auth-submit activity-delete-btn"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {deleting ? 'Deleting…' : 'Delete report'}
            </button>
          </div>
        ) : null}

        <dl className="activity-view-dl">
          <div className="activity-view-row">
            <dt>Activity Title</dt>
            <dd>{form.title.trim() || '—'}</dd>
          </div>
          <div className="activity-view-row">
            <dt>Who is attending</dt>
            <dd>
              <div className="activity-view-attending-stack">
                <p className="activity-view-attending-line">
                  {formatAttendingStaffLabels(row.attending_staff_ids, staffList)}
                </p>
                {row.other_people_enabled ||
                otherPeopleFromRow.length > 0 ? (
                  <div className="activity-view-other-people-under-attending">
                    <p className="activity-view-other-people-label">Other people</p>
                    <p className="activity-view-attending-line">
                      {otherPeopleFromRow.length > 0
                        ? otherPeopleFromRow.join(', ')
                        : '—'}
                    </p>
                  </div>
                ) : null}
              </div>
            </dd>
          </div>
          <div className="activity-view-row">
            <dt>Event Date/Time</dt>
            <dd>{formatWhen(row.event_at)}</dd>
          </div>
          <div className="activity-view-row">
            <dt>Duration</dt>
            <dd>
              {form.durationHours}h {form.durationMinutes}m
            </dd>
          </div>
          <div className="activity-view-row">
            <dt>The other party&apos;s name</dt>
            <dd>{form.otherPartyName || '—'}</dd>
          </div>
          <div className="activity-view-row">
            <dt>CRM Constituent No</dt>
            <dd>{form.crmConstituentNo || '—'}</dd>
          </div>
          <div className="activity-view-row">
            <dt>Detail</dt>
            <dd className="activity-view-detail">{form.detail || '—'}</dd>
          </div>
          <div className="activity-view-row">
            <dt>Attachment links</dt>
            <dd>
              {form.attachmentUrls.filter((u) => u.trim()).length === 0 ? (
                '—'
              ) : (
                <ul className="activity-view-links">
                  {form.attachmentUrls
                    .map((u) => u.trim())
                    .filter(Boolean)
                    .map((u) => (
                      <li key={u}>
                        <a href={u} target="_blank" rel="noreferrer">
                          {u}
                        </a>
                      </li>
                    ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function formatAttendingStaffLabels(
  raw: unknown,
  staffList: StaffRow[] | null,
): string {
  const ids = parseAttendingIds(raw)
  if (ids.length === 0) return '—'
  if (!staffList || staffList.length === 0) {
    return ids.map((x) => String(x)).join(', ')
  }
  return ids
    .map((id) => {
      const s = staffList.find((x) => String(x.id) === String(id))
      return s ? staffFullName(s) : String(id)
    })
    .join(', ')
}
