import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { Link, Navigate, useParams } from 'react-router-dom'
import { auth } from '../lib/firebase'
import {
  activityRowToFormState,
  attachmentItemsFromRow,
  fetchActivityReportById,
  parseAttendingIds,
  parseOtherPeopleNamesFromRow,
  resolveViewerFirebaseUids,
  type ActivityReportRow,
} from '../lib/activityReports'
import { downloadStorageAttachmentToDevice } from '../lib/proactiveAttachmentStorage'
import {
  loadStaffDashboard,
  staffFullName,
  type StaffRow,
} from '../lib/staffAccess'
import { AppLogo } from './AppLogo'
import { SessionBackButton, SessionUserBeforeLogout } from './SessionNav'
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
  const firebaseAuth = auth
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; row: ActivityReportRow }
    | { status: 'forbidden' }
  >({ status: 'loading' })
  const [staffList, setStaffList] = useState<StaffRow[] | null>(null)
  const [sessionUserName, setSessionUserName] = useState<string | null>(null)
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSessionUserName(null)
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
      setSessionUserName(staffFullName(dash.data.staff))

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

  if (isOwner && !isSoftDeleted) {
    return <Navigate to={`/activity/${id}/edit`} replace />
  }

  const form = activityRowToFormState(row)
  const attachmentList = attachmentItemsFromRow(row)
  const otherPeopleFromRow = parseOtherPeopleNamesFromRow(row)
  const rowMultipleDays = Boolean(row.multiple_days_event)

  return (
    <div className="dashboard-page activity-form-page">
      <header className="dashboard-topbar">
        <div className="activity-topbar-left">
          <SessionBackButton />
          <div className="app-brand-lockup">
            <AppLogo />
            <h1 className="dashboard-brand">Activity report</h1>
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

      <div className="activity-view-panel">
        {isSoftDeleted ? (
          <p className="feedback activity-view-deleted-banner" role="status">
            This report was deleted. It only appears when “Show deleted entries”
            is enabled on the dashboard.
          </p>
        ) : null}

        <p className="activity-muted activity-view-meta">
          Created {formatWhen(row.created_at)}
          {' · '}
          Updated {formatWhen(row.updated_at)}
        </p>

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
                    <p className="activity-view-other-people-label">
                      Other colleagues
                    </p>
                    {otherPeopleFromRow.length > 0 ? (
                      <ul className="activity-view-donor-list">
                        {otherPeopleFromRow.map((n, i) => (
                          <li key={`${i}-${n}`}>{n}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="activity-view-attending-line">—</p>
                    )}
                  </div>
                ) : null}
              </div>
            </dd>
          </div>
          <div className="activity-view-row">
            <dt>Event Date/Time</dt>
            <dd>{formatWhen(row.event_at)}</dd>
          </div>
          {rowMultipleDays && row.event_end_at ? (
            <div className="activity-view-row">
              <dt>End Date/Time</dt>
              <dd>{formatWhen(row.event_end_at)}</dd>
            </div>
          ) : null}
          {!rowMultipleDays ? (
            <div className="activity-view-row">
              <dt>Duration</dt>
              <dd>
                {form.durationHours}h {form.durationMinutes}m
              </dd>
            </div>
          ) : null}
          <div className="activity-view-row">
            <dt>Donor / Prospect / Guest</dt>
            <dd>
              {form.otherPartyNames.some((n) => n.trim()) ? (
                <ul className="activity-view-donor-list">
                  {form.otherPartyNames.flatMap((n, i) => {
                    const label = n.trim()
                    if (!label) return []
                    const tit = (form.otherPartyTitles[i] ?? '').trim()
                    const cid = (form.otherPartyConstituentIds[i] ?? '').trim()
                    return [
                      <li key={`${i}-${label}`}>
                        {tit ? (
                          <>
                            {tit}
                            {' · '}
                          </>
                        ) : null}
                        {label}
                        {cid ? (
                          <span className="activity-view-constituent-line">
                            {' '}
                            · Constituent ID: {cid}
                          </span>
                        ) : null}
                      </li>,
                    ]
                  })}
                </ul>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div className="activity-view-row">
            <dt>Detail</dt>
            <dd className="activity-view-detail">{form.detail || '—'}</dd>
          </div>
          <div className="activity-view-row">
            <dt>Attachments</dt>
            <dd>
              {attachmentList.length === 0 ? (
                '—'
              ) : (
                <ul className="activity-view-links">
                  {attachmentList.map((it, idx) =>
                    it.kind === 'link' && it.url.trim() ? (
                      <li
                        key={`${idx}-link`}
                        className="activity-view-attachment-item"
                      >
                        {it.description.trim() ? (
                          <p className="activity-view-attachment-desc">
                            {it.description.trim()}
                          </p>
                        ) : null}
                        <div className="activity-view-link-row">
                          <a href={it.url.trim()} target="_blank" rel="noreferrer">
                            {it.url.trim()}
                          </a>
                          <button
                            type="button"
                            className="activity-go-link-btn"
                            onClick={() => {
                              window.open(
                                it.url.trim(),
                                '_blank',
                                'noopener,noreferrer',
                              )
                            }}
                          >
                            Go to link
                          </button>
                        </div>
                      </li>
                    ) : it.kind === 'file' && it.storagePath.trim() ? (
                      <li
                        key={`${idx}-file`}
                        className="activity-view-attachment-item"
                      >
                        {it.description.trim() ? (
                          <p className="activity-view-attachment-desc">
                            {it.description.trim()}
                          </p>
                        ) : null}
                        <div className="activity-view-link-row">
                          <span className="activity-view-file-label">
                            {it.fileName || 'Attached file'}
                          </span>
                          <button
                            type="button"
                            className="activity-go-link-btn"
                            disabled={downloadingPath === it.storagePath}
                            onClick={() => {
                              setDownloadingPath(it.storagePath)
                              void (async () => {
                                try {
                                  await downloadStorageAttachmentToDevice(
                                    it.storagePath,
                                    it.fileName || 'download',
                                  )
                                } finally {
                                  setDownloadingPath(null)
                                }
                              })()
                            }}
                          >
                            {downloadingPath === it.storagePath
                              ? '…'
                              : 'Download'}
                          </button>
                        </div>
                      </li>
                    ) : null,
                  )}
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
