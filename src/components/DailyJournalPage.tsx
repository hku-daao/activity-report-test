import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { useMatch, useParams } from 'react-router-dom'
import { auth, isFirebaseStorageBucketConfigured } from '../lib/firebase'
import { isProfilesSupabaseConfigured } from '../lib/profilesSupabase'
import { syncUserProfile } from '../lib/profile'
import { staffFullName } from '../lib/staffAccess'
import { useStaffDashboardState } from '../hooks/useStaffDashboardState'
import { listStoragePathsFromItems, type StorageAttachmentItem } from '../lib/attachmentItems'
import {
  fetchJournalByIdForUser,
  getOrCreateTodayJournal,
  saveJournalBodyAndAttachments,
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
  const todayMatch = useMatch('/journal/today')
  const { journalId } = useParams<{ journalId: string }>()
  const isTodayRoute = Boolean(todayMatch)

  const { state: staffState } = useStaffDashboardState(user)

  useEffect(() => {
    if (staffState.status !== 'ready' || !isProfilesSupabaseConfigured()) {
      return
    }
    void syncUserProfile(user)
  }, [user, staffState.status])

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

      if (isTodayRoute) {
        const r = await getOrCreateTodayJournal(user)
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
        return
      }

      if (!journalId?.trim()) {
        if (!cancelled) {
          setLoad({ status: 'error', message: 'Missing journal id.' })
        }
        return
      }

      const r = await fetchJournalByIdForUser(journalId, user.uid)
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
  }, [user, isTodayRoute, journalId])

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
            <span title={load.row.firebase_uid}>You</span>
            {' · '}
            Last updated{' '}
            {new Date(load.row.updated_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>

          <label className="activity-field">
            <span className="activity-label">Journal</span>
            <textarea
              className="activity-textarea"
              rows={16}
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

          <div className="activity-actions">
            <button
              type="button"
              className="auth-submit"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
