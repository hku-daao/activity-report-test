import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { useNavigate, useParams } from 'react-router-dom'
import { auth, isFirebaseStorageBucketConfigured } from '../lib/firebase'
import { isProfilesSupabaseConfigured } from '../lib/profilesSupabase'
import { syncUserProfile } from '../lib/profile'
import { staffFullName } from '../lib/staffAccess'
import { useStaffDashboardState } from '../hooks/useStaffDashboardState'
import { listStoragePathsFromItems, type StorageAttachmentItem } from '../lib/attachmentItems'
import {
  fetchJournalByIdForViewer,
  restoreDailyJournal,
  saveJournalBodyAndAttachments,
  softDeleteDailyJournal,
  type DailyJournalRow,
} from '../lib/dailyJournals'
import { deleteStorageAttachment } from '../lib/proactiveAttachmentStorage'
import { AppLogo } from './AppLogo'
import { SessionBackButton, SessionUserBeforeLogout } from './SessionNav'
import { StorageAttachmentField } from './StorageAttachmentField'

type Props = {
  user: User
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; row: DailyJournalRow }

export function DailyJournalPage({ user }: Props) {
  const { journalId } = useParams<{ journalId: string }>()
  const navigate = useNavigate()

  const { state: staffState } = useStaffDashboardState(user)

  useEffect(() => {
    if (staffState.status !== 'ready' || !isProfilesSupabaseConfigured()) {
      return
    }
    void syncUserProfile(user)
  }, [user, staffState.status])

  const subordinates =
    staffState.status === 'ready' ? staffState.data.subordinates : []
  const subordinateIdsKey = useMemo(
    () =>
      subordinates
        .map((s) => String(s.id))
        .sort()
        .join(','),
    [subordinates],
  )

  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<StorageAttachmentItem[]>([])
  const attachmentsRef = useRef<StorageAttachmentItem[]>([])
  const bodyRef = useRef(body)

  useEffect(() => {
    bodyRef.current = body
  }, [body])
  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingEntry, setDeletingEntry] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    setFeedback(null)

    async function run() {
      if (!isProfilesSupabaseConfigured()) {
        if (!cancelled) {
          setLoad({
            status: 'error',
            message:
              'Profiles Supabase is not configured. Add VITE_PROFILES_SUPABASE_URL and VITE_PROFILES_SUPABASE_ANON_KEY, then create the daily_journals table (see supabase_daily_journals.sql).',
          })
        }
        return
      }

      if (!journalId?.trim()) {
        if (!cancelled) {
          setLoad({ status: 'error', message: 'Missing journal id.' })
        }
        return
      }

      const r = await fetchJournalByIdForViewer(journalId, user, subordinates)
      if (cancelled) return
      if (!r.ok) {
        setLoad({ status: 'error', message: r.message })
        return
      }
      setLoad({ status: 'ready', row: r.row })
      setBody(r.row.body ?? '')
      const att = r.row.attachment_items ?? []
      setAttachments(att)
      attachmentsRef.current = att
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [user, journalId, staffState.status, subordinateIdsKey])

  const firebaseAuth = auth
  if (!firebaseAuth) {
    return null
  }

  const canUpload =
    isFirebaseStorageBucketConfigured() && Boolean(firebaseAuth)
  const uploadDisabledHint =
    'File upload requires a Firebase storage bucket in .env. Uploaded files are opened with “Download” only — the storage path is not shown in the app.'

  const handleLogout = () => {
    void signOut(firebaseAuth)
  }

  const sessionUserName =
    staffState.status === 'ready' ? staffFullName(staffState.data.staff) : null

  const handleSave = async () => {
    if (load.status !== 'ready') return
    if (load.row.firebase_uid !== user.uid) {
      setFeedback({
        type: 'error',
        text: 'You can only edit your own journal.',
      })
      return
    }
    if (load.row.deleted_at) {
      setFeedback({
        type: 'error',
        text: 'This journal is deleted. Restore it to make changes.',
      })
      return
    }
    setFeedback(null)
    setSaving(true)
    try {
      const prev = load.row
      const nextAtt = attachmentsRef.current
      const result = await saveJournalBodyAndAttachments(
        prev.id,
        user.uid,
        body,
        nextAtt,
      )
      if (!result.ok) {
        setFeedback({ type: 'error', text: result.message })
        return
      }
      const before = new Set(listStoragePathsFromItems(prev.attachment_items))
      const after = new Set(listStoragePathsFromItems(nextAtt))
      for (const p of before) {
        if (!after.has(p)) void deleteStorageAttachment(p)
      }
      setLoad({
        status: 'ready',
        row: {
          ...prev,
          body,
          attachment_items: nextAtt,
          updated_at: new Date().toISOString(),
        },
      })
      setFeedback({ type: 'success', text: 'Saved.' })
    } finally {
      setSaving(false)
    }
  }

  const handleSoftDelete = async () => {
    if (load.status !== 'ready') return
    if (load.row.firebase_uid !== user.uid) return
    const ok = window.confirm(
      'Delete this journal? It will stay in the database but disappear from your list unless you turn on “Show deleted entries” on the journals page.',
    )
    if (!ok) return
    setFeedback(null)
    setDeletingEntry(true)
    const result = await softDeleteDailyJournal(load.row.id, user.uid)
    setDeletingEntry(false)
    if (result.ok) {
      navigate('/journals', { replace: true })
    } else {
      setFeedback({ type: 'error', text: result.message })
    }
  }

  const handleRestore = async () => {
    if (load.status !== 'ready') return
    if (load.row.firebase_uid !== user.uid) return
    setFeedback(null)
    setRestoring(true)
    const result = await restoreDailyJournal(load.row.id, user.uid)
    setRestoring(false)
    if (result.ok) {
      const now = new Date().toISOString()
      setLoad({
        status: 'ready',
        row: {
          ...load.row,
          deleted_at: null,
          updated_at: now,
        },
      })
      setFeedback({ type: 'success', text: 'Restored.' })
    } else {
      setFeedback({ type: 'error', text: result.message })
    }
  }

  const isDeleted =
    load.status === 'ready' && Boolean(load.row.deleted_at)

  const isSupervisorView =
    load.status === 'ready' && load.row.firebase_uid !== user.uid

  const readOnlyJournal =
    isDeleted || isSupervisorView

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

      {load.status === 'loading' ? (
        <p className="loading">Loading journal…</p>
      ) : null}

      {load.status === 'error' ? (
        <section className="dashboard-panel" aria-live="polite">
          <p className="feedback error">{load.message}</p>
        </section>
      ) : null}

      {load.status === 'ready' ? (
        <div className="activity-form">
          <p className="activity-muted journal-meta">
            <strong>{load.row.title}</strong>
            {' · '}
            Creator:{' '}
            <span title={load.row.firebase_uid}>
              {isSupervisorView ? 'Colleague (read-only)' : 'You'}
            </span>
            {' · '}
            Last updated{' '}
            {new Date(load.row.updated_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>

          {isDeleted ? (
            <p className="feedback error" role="status">
              This journal is deleted. Restore it to edit, or browse attachments
              below.
            </p>
          ) : null}

          {isSupervisorView && !isDeleted ? (
            <p className="feedback error" role="status">
              You are viewing a team member&rsquo;s journal (read-only).
            </p>
          ) : null}

          <label className="activity-field">
            <span className="activity-label">Journal</span>
            <textarea
              className="activity-textarea"
              rows={16}
              readOnly={readOnlyJournal}
              value={body}
              onChange={(e) => {
                const v = e.target.value
                setBody(v)
                bodyRef.current = v
              }}
              placeholder="Write your journal entry…"
            />
          </label>

          <StorageAttachmentField
            user={user}
            canUpload={canUpload}
            uploadDisabledHint={uploadDisabledHint}
            attachments={attachments}
            setAttachments={setAttachments}
            attachmentsRef={attachmentsRef}
            uploadArea="journal"
            pathSegment={load.row.id}
            isNewEntityRoute={false}
            hasPersistedRow
            persistMode="immediate"
            readOnly={readOnlyJournal}
            setFeedback={setFeedback}
            persistAttachments={async (next) => {
              const r = await saveJournalBodyAndAttachments(
                load.row.id,
                user.uid,
                bodyRef.current,
                next,
              )
              return r.ok ? { ok: true } : { ok: false, message: r.message }
            }}
            onAttachmentsPersisted={(next) => {
              setLoad((l) =>
                l.status === 'ready'
                  ? {
                      status: 'ready',
                      row: {
                        ...l.row,
                        attachment_items: next,
                        body: bodyRef.current,
                        updated_at: new Date().toISOString(),
                      },
                    }
                  : l,
              )
            }}
          />

          {feedback ? (
            <p
              className={`feedback ${feedback.type === 'success' ? 'success' : 'error'}`}
              role="status"
            >
              {feedback.text}
            </p>
          ) : null}

          {!isDeleted && !isSupervisorView ? (
            <div className="activity-edit-delete">
              <button
                type="button"
                className="auth-submit activity-delete-btn"
                disabled={saving || deletingEntry}
                onClick={() => void handleSoftDelete()}
              >
                {deletingEntry ? 'Deleting…' : 'Delete journal'}
              </button>
            </div>
          ) : null}

          <div className="activity-actions">
            {isDeleted && !isSupervisorView ? (
              <button
                type="button"
                className="auth-submit"
                disabled={restoring}
                onClick={() => void handleRestore()}
              >
                {restoring ? 'Restoring…' : 'Restore journal'}
              </button>
            ) : null}
            {!isDeleted && !isSupervisorView ? (
              <button
                type="button"
                className="auth-submit"
                disabled={saving || deletingEntry}
                onClick={() => void handleSave()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
