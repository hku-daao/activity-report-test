import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { useMatch, useNavigate, useParams } from 'react-router-dom'
import { auth, isFirebaseStorageBucketConfigured } from '../lib/firebase'
import { isProfilesSupabaseConfigured } from '../lib/profilesSupabase'
import { syncUserProfile } from '../lib/profile'
import { staffFullName } from '../lib/staffAccess'
import { useStaffDashboardState } from '../hooks/useStaffDashboardState'
import {
  fetchInitiativeByIdForUser,
  insertProactiveInitiative,
  listStoragePathsFromItems,
  updateProactiveInitiative,
  type ProactiveAttachmentItem,
  type ProactiveInitiativeRow,
} from '../lib/proactiveInitiatives'
import { deleteProactiveAttachment } from '../lib/proactiveAttachmentStorage'
import { AppLogo } from './AppLogo'
import { SessionBackButton, SessionUserBeforeLogout } from './SessionNav'
import { StorageAttachmentField } from './StorageAttachmentField'

type Props = {
  user: User
}

/** Used when the row is first created by file upload and the title is still empty. */
const UNTITLED_PROACTIVE = 'Untitled initiative'

function getPathSegment(
  isNew: boolean,
  pendingId: string,
  initiativeId: string | undefined,
): string {
  if (isNew) return `pending/${pendingId}`
  return (initiativeId && initiativeId.trim()) || 'pending/unknown'
}

export function ProactiveInitiativeEditorPage({ user }: Props) {
  const newMatch = useMatch('/proactive/new')
  const { initiativeId } = useParams<{ initiativeId: string }>()
  const isNewRoute = Boolean(newMatch)
  const navigate = useNavigate()
  const pendingIdRef = useRef(crypto.randomUUID())

  const { state: staffState } = useStaffDashboardState(user)

  useEffect(() => {
    if (staffState.status !== 'ready' || !isProfilesSupabaseConfigured()) {
      return
    }
    void syncUserProfile(user)
  }, [user, staffState.status])

  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!isNewRoute)
  const [row, setRow] = useState<ProactiveInitiativeRow | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<ProactiveAttachmentItem[]>(
    [],
  )
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const attachmentsRef = useRef(attachments)
  const rowRef = useRef(row)
  const titleRef = useRef(title)
  const bodyRef = useRef(body)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])
  useEffect(() => {
    rowRef.current = row
  }, [row])
  useEffect(() => {
    titleRef.current = title
  }, [title])
  useEffect(() => {
    bodyRef.current = body
  }, [body])

  useEffect(() => {
    let cancelled = false
    setFeedback(null)
    setLoadError(null)

    if (isNewRoute) {
      setLoading(false)
      setRow(null)
      setTitle('')
      setBody('')
      setAttachments([])
      attachmentsRef.current = []
      return
    }

    if (!initiativeId?.trim()) {
      setLoading(false)
      setLoadError('Missing entry id.')
      return
    }

    setLoading(true)
    void fetchInitiativeByIdForUser(initiativeId, user.uid).then((r) => {
      if (cancelled) return
      if (!r.ok) {
        setLoadError(r.message)
        setRow(null)
      } else {
        setRow(r.row)
        setTitle(r.row.title ?? '')
        setBody(r.row.body ?? '')
        const loaded = (
          r.row.attachment_items && r.row.attachment_items.length > 0
            ? r.row.attachment_items
            : []
        ) as ProactiveAttachmentItem[]
        setAttachments(loaded)
        attachmentsRef.current = loaded
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [isNewRoute, initiativeId, user.uid])

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

  const runAfterSuccessfulSave = (
    nextRow: ProactiveInitiativeRow | null,
    prev: ProactiveInitiativeRow | null,
    nextAttachments: ProactiveAttachmentItem[],
  ) => {
    if (!prev) return
    const before = new Set(listStoragePathsFromItems(prev.attachment_items ?? []))
    const after = new Set(listStoragePathsFromItems(nextAttachments))
    for (const p of before) {
      if (!after.has(p)) {
        void deleteProactiveAttachment(p)
      }
    }
    if (nextRow) setRow(nextRow)
  }

  const handleSave = async () => {
    if (!isProfilesSupabaseConfigured()) {
      setFeedback({
        type: 'error',
        text: 'Profiles Supabase is not configured.',
      })
      return
    }
    if (!title.trim()) {
      setFeedback({
        type: 'error',
        text: 'Please enter a title for this Proactive Initiative and Activity entry.',
      })
      return
    }

    setFeedback(null)
    setSaving(true)
    const prevRow = row
    const attachmentSnapshot = attachmentsRef.current
    try {
      if (isNewRoute || !row) {
        const r = await insertProactiveInitiative(
          user,
          title.trim(),
          body,
          attachmentSnapshot,
        )
        if (!r.ok) {
          setFeedback({ type: 'error', text: r.message })
          return
        }
        navigate(`/proactive/${r.id}`, { replace: true })
      } else {
        const r = await updateProactiveInitiative(
          row.id,
          user.uid,
          title.trim(),
          body,
          attachmentSnapshot,
        )
        if (!r.ok) {
          setFeedback({ type: 'error', text: r.message })
          return
        }
        const nextRow: ProactiveInitiativeRow = {
          ...row,
          title: title.trim(),
          body,
          attachment_items: attachmentSnapshot,
          updated_at: new Date().toISOString(),
        }
        runAfterSuccessfulSave(
          nextRow,
          prevRow,
          attachmentSnapshot,
        )
        setFeedback({ type: 'success', text: 'Saved.' })
      }
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
            <h1 className="dashboard-brand">
              Proactive Initiative and Activity
            </h1>
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

      {loading ? <p className="loading">Loading…</p> : null}

      {loadError ? (
        <section className="dashboard-panel" aria-live="polite">
          <p className="feedback error">{loadError}</p>
        </section>
      ) : null}

      {!loading && !loadError ? (
        <div className="activity-form">
          {!isNewRoute && row ? (
            <p className="activity-muted journal-meta">
              Creator:{' '}
              <span title={row.firebase_uid}>You</span>
              {' · '}
              Last updated{' '}
              {new Date(row.updated_at).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          ) : (
            <p className="activity-muted journal-meta">
              Enter a title and your notes, then save. You are recorded as the
              creator.
            </p>
          )}

          <label className="activity-field">
            <span className="activity-label">Title</span>
            <input
              type="text"
              className="activity-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Outreach to partner orgs — Q2 follow-up"
            />
          </label>

          <label className="activity-field">
            <span className="activity-label">Details</span>
            <textarea
              className="activity-textarea"
              rows={16}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the initiative or activity…"
            />
          </label>

          <StorageAttachmentField
            user={user}
            canUpload={canUpload}
            uploadDisabledHint={uploadDisabledHint}
            attachments={attachments}
            setAttachments={setAttachments}
            attachmentsRef={attachmentsRef}
            uploadArea="proactive"
            pathSegment={getPathSegment(
              isNewRoute,
              pendingIdRef.current,
              initiativeId,
            )}
            isNewEntityRoute={isNewRoute}
            hasPersistedRow={Boolean(!isNewRoute && row)}
            persistMode="immediate"
            setFeedback={setFeedback}
            persistAttachments={async (next) => {
              const cur = rowRef.current
              if (!cur) {
                return { ok: false, message: 'Missing row.' }
              }
              const r = await updateProactiveInitiative(
                cur.id,
                user.uid,
                titleRef.current.trim(),
                bodyRef.current,
                next,
              )
              return r.ok ? { ok: true } : { ok: false, message: r.message }
            }}
            insertEntityWithAttachments={async (next) => {
              const ins = await insertProactiveInitiative(
                user,
                titleRef.current.trim() || UNTITLED_PROACTIVE,
                bodyRef.current,
                next,
              )
              return ins.ok
                ? { ok: true, id: ins.id }
                : { ok: false, message: ins.message }
            }}
            onCreatedNavigate={(id) =>
              navigate(`/proactive/${id}`, { replace: true })
            }
            onAttachmentsPersisted={(next) => {
              setRow((r) =>
                r
                  ? {
                      ...r,
                      title: titleRef.current.trim(),
                      body: bodyRef.current,
                      attachment_items: next,
                      updated_at: new Date().toISOString(),
                    }
                  : r,
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
