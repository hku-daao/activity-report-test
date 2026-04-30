import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { signOut } from 'firebase/auth'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { auth, isFirebaseStorageBucketConfigured } from '../lib/firebase'
import {
  activityRowToFormState,
  alignConstituentIdsToPartyNames,
  alignTitlesToPartyNames,
  clearDraftClientStorage,
  combinePartyFirstLast,
  splitStoredPartyLine,
  syncOtherPartyNamesFromFirstLast,
  defaultFormState,
  fetchActivityReportById,
  loadDraftRowIdFromStorage,
  mergeWithDefaults,
  saveDraftRowIdToStorage,
  saveDraftToStorage,
  saveOrUpdateDraftInSupabase,
  softDeleteActivityReport,
  type ActivityReportFormState,
} from '../lib/activityReports'
import { entriesForConstituentDetail } from '../lib/constituentDetailLabels'
import {
  searchVQueryConstituent,
  type ConstituentLookupRow,
} from '../lib/constituentLookup'
import { extractLeadingTitle } from '../lib/nameTitleParts'
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
import { AppLogo } from './AppLogo'
import { SessionBackButton, SessionUserBeforeLogout } from './SessionNav'
import { StorageAttachmentField } from './StorageAttachmentField'

type ConstituentLookupDialogState =
  | {
      type: 'pick'
      index: number
      name: string
      matches: ConstituentLookupRow[]
    }
  | { type: 'none'; index: number; name: string; manualId: string }

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
  /** Multi-line paste area for Donor / Prospect / Guest before "Split names". */
  const [donorBulkText, setDonorBulkText] = useState('')
  /** Multi-line paste area for Other colleagues before "Split names". */
  const [otherColleaguesBulkText, setOtherColleaguesBulkText] = useState('')

  const [lookupDialog, setLookupDialog] =
    useState<ConstituentLookupDialogState | null>(null)
  const [lookupLoadingIndex, setLookupLoadingIndex] = useState<number | null>(
    null,
  )
  const constituentLookupDialogRef = useRef<HTMLDialogElement | null>(null)

  const formRef = useRef(form)
  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => {
    const d = constituentLookupDialogRef.current
    if (!d) return
    if (lookupDialog) {
      if (!d.open) d.showModal()
    } else if (d.open) {
      d.close()
    }
  }, [lookupDialog])

  const attachmentsRef = useRef(form.attachmentItems)
  useEffect(() => {
    attachmentsRef.current = form.attachmentItems
  }, [form.attachmentItems])

  const pendingActivityPathRef = useRef(`pending/${crypto.randomUUID()}`)
  const activityAttachmentPathSegment = useMemo(() => {
    if (editReportId) return editReportId
    const draftId = loadDraftRowIdFromStorage(user.uid)
    if (draftId) return draftId
    return pendingActivityPathRef.current
  }, [editReportId, user.uid])

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
          rowRes.row.deleted_at
        ) {
          setGate('error')
          setGateMessage(
            'This report is not available for editing, or it was deleted.',
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
      if (!isEditMode) {
        navigate(`/activity/${result.id}/edit`, { replace: true })
      }
      setFeedback({
        type: 'success',
        text: 'Saved.',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDraft = async () => {
    if (!isEditMode || !editReportId) return
    const ok = window.confirm(
      'Delete this report? It will be removed from the list unless you turn on “Show deleted entries”.',
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

  const handleSplitDonorNames = () => {
    const lines = donorBulkText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Enter at least one name (one per line), then click Split names.',
      })
      return
    }
    setFeedback(null)
    setForm((f) => {
      const keptPairs: {
        first: string
        last: string
        title: string
        id: string
      }[] = []
      f.otherPartyNames.forEach((n, i) => {
        const t = String(n).trim()
        if (t) {
          keptPairs.push({
            first: f.otherPartyFirstNames[i] ?? '',
            last: f.otherPartyLastNames[i] ?? '',
            title: (f.otherPartyTitles[i] ?? '').trim(),
            id: (f.otherPartyConstituentIds[i] ?? '').trim(),
          })
        }
      })
      const parsed = lines.map((line) => {
        const parts = extractLeadingTitle(line)
        const sl = splitStoredPartyLine(parts.nameRest)
        return { title: parts.title, first: sl.first, last: sl.last }
      })
      const firstCol = [
        ...parsed.map((p) => p.first),
        ...keptPairs.map((p) => p.first),
      ]
      const lastCol = [
        ...parsed.map((p) => p.last),
        ...keptPairs.map((p) => p.last),
      ]
      return {
        ...f,
        otherPartyFirstNames: firstCol,
        otherPartyLastNames: lastCol,
        otherPartyNames: syncOtherPartyNamesFromFirstLast(firstCol, lastCol),
        otherPartyTitles: [
          ...parsed.map((p) => p.title),
          ...keptPairs.map((p) => p.title),
        ],
        otherPartyConstituentIds: [
          ...parsed.map(() => ''),
          ...keptPairs.map((p) => p.id),
        ],
      }
    })
    setDonorBulkText('')
  }

  const runConstituentLookup = useCallback(
    async (index: number) => {
      const first = String(formRef.current.otherPartyFirstNames[index] ?? '').trim()
      const last = String(formRef.current.otherPartyLastNames[index] ?? '').trim()
      const title = String(formRef.current.otherPartyTitles[index] ?? '').trim()
      if (!first && !last) {
        setFeedback({
          type: 'error',
          text: 'Enter a first or last name in this row before using Lookup.',
        })
        return
      }
      setLookupLoadingIndex(index)
      setFeedback(null)
      const res = await searchVQueryConstituent(first, last, { title })
      setLookupLoadingIndex(null)
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.message })
        return
      }
      if (res.rows.length >= 1) {
        const combined = combinePartyFirstLast(first, last)
        const queryLabel = title ? `${title} · ${combined}` : combined
        setLookupDialog({
          type: 'pick',
          index,
          name: queryLabel,
          matches: res.rows,
        })
        return
      }
      setLookupDialog({
        type: 'none',
        index,
        name: (() => {
          const c = combinePartyFirstLast(first, last)
          return title ? `${title} · ${c}` : c
        })(),
        manualId: String(
          formRef.current.otherPartyConstituentIds[index] ?? '',
        ).trim(),
      })
    },
    [],
  )

  const applyNoneDialogManual = () => {
    if (!lookupDialog || lookupDialog.type !== 'none') return
    const { index, manualId } = lookupDialog
    setForm((f) => {
      const next = alignConstituentIdsToPartyNames(
        f.otherPartyNames,
        f.otherPartyConstituentIds,
      )
      next[index] = manualId.trim()
      return { ...f, otherPartyConstituentIds: next }
    })
    setLookupDialog(null)
  }

  const handleSplitOtherColleaguesNames = () => {
    const lines = otherColleaguesBulkText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (lines.length === 0) {
      setFeedback({
        type: 'error',
        text: 'Enter at least one colleague name (one per line), then click Split names.',
      })
      return
    }
    setFeedback(null)
    setForm((f) => {
      const kept = f.otherPeopleNames
        .map((s) => String(s).trim())
        .filter(Boolean)
      return {
        ...f,
        otherPeopleNames: [...lines, ...kept],
      }
    })
    setOtherColleaguesBulkText('')
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

  const canUpload =
    isFirebaseStorageBucketConfigured() && Boolean(firebaseAuth)
  const uploadDisabledHint =
    'File upload requires a Firebase storage bucket in .env. Uploaded files are opened with “Download” only — the storage path is not shown in the app.'

  return (
    <div className="dashboard-page activity-form-page">
      <header className="dashboard-topbar">
        <div className="activity-topbar-left">
          <SessionBackButton />
          <div className="app-brand-lockup">
            <AppLogo />
            <h1 className="dashboard-brand">
              Meeting / Engagement / Activity Reports
            </h1>
          </div>
        </div>
        <div className="dashboard-topbar-end">
          <SessionUserBeforeLogout
            label={myStaff ? staffFullName(myStaff) : null}
          />
          <button
            type="button"
            className="dashboard-logout"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
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
            onChange={(e) => {
              const checked = e.target.checked
              if (!checked) {
                setOtherColleaguesBulkText('')
              }
              setForm((f) => ({
                ...f,
                otherPeopleEnabled: checked,
                otherPeopleNames: checked
                  ? f.otherPeopleNames.length > 0
                    ? f.otherPeopleNames
                    : ['']
                  : f.otherPeopleNames,
              }))
            }}
          />
          <span className="activity-label-inline">Other colleagues</span>
        </label>

        {form.otherPeopleEnabled ? (
          <>
            <div className="activity-field">
              <p className="activity-hint">
                Type or paste one name per line, then click{' '}
                <strong>Split names</strong> to add each line as its own box{' '}
                <strong>above</strong> any names you already have. You can add or
                remove boxes afterwards.
              </p>
              <textarea
                className="activity-textarea activity-textarea--compact"
                rows={4}
                value={otherColleaguesBulkText}
                onChange={(e) => setOtherColleaguesBulkText(e.target.value)}
                placeholder={'Example:\nAlex Kim\nPat Lee\n…'}
              />
              <div className="activity-split-row">
                <button
                  type="button"
                  className="auth-submit secondary"
                  onClick={handleSplitOtherColleaguesNames}
                >
                  Split names
                </button>
              </div>
            </div>

            <div className="activity-field activity-multi">
              <span className="activity-label">Names</span>
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
                    aria-label="Remove colleague name"
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
          </>
        ) : null}

        <div className="activity-field">
          <span className="activity-label">Donor / Prospect / Guest:</span>
          <p className="activity-hint">
            Type <strong>First name</strong>, then <strong>Last name</strong> on each
            line (or paste a full name—Split names treats the <strong>last word</strong>{' '}
            as Last name and all words before as First name). Click{' '}
            <strong>Split names</strong> to
            add each line as its own row <strong>above</strong> names you already have.
            Leading honorifics (e.g. Dr, Mr) move into <strong>Title</strong>. You can add
            or remove rows afterwards.
          </p>
          <textarea
            className="activity-textarea activity-textarea--compact"
            rows={4}
            value={donorBulkText}
            onChange={(e) => setDonorBulkText(e.target.value)}
            placeholder={'Example:\nJane Doe\nAcme Foundation\n…'}
          />
          <div className="activity-split-row">
            <button
              type="button"
              className="auth-submit secondary"
              onClick={handleSplitDonorNames}
            >
              Split names
            </button>
          </div>
        </div>

        <div className="activity-field activity-multi">
          <span className="activity-label">Names</span>
          <p className="activity-hint">
            Enter <strong>First name</strong> then <strong>Last name</strong> on the same
            row (Lookup matches last name to surname in CRM, first name to given or middle).
            Or match a <strong>nickname</strong> by typing the full name as you would in
            the nickname field. Use <strong>Lookup</strong> for{' '}
            <code className="activity-code-inline">V_QUERY_CONSTITUENT</code>, or type a{' '}
            <strong>Constituent ID</strong> by hand. Leave ID blank if not required.
          </p>
          {form.otherPartyFirstNames.map((_, i) => (
            <div key={i} className="activity-donor-block">
              <div className="activity-multi-row activity-multi-row--wrap">
                <input
                  type="text"
                  className="activity-input activity-input--party-title"
                  placeholder="Title"
                  aria-label="Title"
                  value={form.otherPartyTitles[i] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => {
                      const rowCount = f.otherPartyFirstNames.length
                      const next = [...f.otherPartyTitles]
                      if (next.length < rowCount) {
                        while (next.length < rowCount) next.push('')
                      }
                      next[i] = v
                      return { ...f, otherPartyTitles: next }
                    })
                  }}
                />
                <input
                  type="text"
                  className="activity-input activity-input--party-first"
                  placeholder="First name"
                  aria-label="First name"
                  value={form.otherPartyFirstNames[i] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => {
                      const first = [...f.otherPartyFirstNames]
                      const last = [...f.otherPartyLastNames]
                      const nextIds = [...f.otherPartyConstituentIds]
                      const nextTitles = [...f.otherPartyTitles]
                      first[i] = v
                      if (last.length < first.length) {
                        while (last.length < first.length) last.push('')
                      }
                      if (nextIds.length < first.length) {
                        while (nextIds.length < first.length) nextIds.push('')
                      }
                      if (nextTitles.length < first.length) {
                        while (nextTitles.length < first.length) nextTitles.push('')
                      }
                      const names = syncOtherPartyNamesFromFirstLast(first, last)
                      return {
                        ...f,
                        otherPartyFirstNames: first,
                        otherPartyLastNames: last,
                        otherPartyNames: names,
                        otherPartyConstituentIds: nextIds,
                        otherPartyTitles: nextTitles,
                      }
                    })
                  }}
                />
                <input
                  type="text"
                  className="activity-input activity-input--party-last"
                  placeholder="Last name"
                  aria-label="Last name"
                  value={form.otherPartyLastNames[i] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => {
                      const first = [...f.otherPartyFirstNames]
                      const last = [...f.otherPartyLastNames]
                      const nextIds = [...f.otherPartyConstituentIds]
                      const nextTitles = [...f.otherPartyTitles]
                      last[i] = v
                      if (first.length < last.length) {
                        while (first.length < last.length) first.push('')
                      }
                      if (nextIds.length < last.length) {
                        while (nextIds.length < last.length) nextIds.push('')
                      }
                      if (nextTitles.length < last.length) {
                        while (nextTitles.length < last.length) nextTitles.push('')
                      }
                      const names = syncOtherPartyNamesFromFirstLast(first, last)
                      return {
                        ...f,
                        otherPartyFirstNames: first,
                        otherPartyLastNames: last,
                        otherPartyNames: names,
                        otherPartyConstituentIds: nextIds,
                        otherPartyTitles: nextTitles,
                      }
                    })
                  }}
                />
                <button
                  type="button"
                  className="auth-submit secondary"
                  onClick={() => void runConstituentLookup(i)}
                  disabled={lookupLoadingIndex === i}
                >
                  {lookupLoadingIndex === i ? '…' : 'Lookup'}
                </button>
                <button
                  type="button"
                  className="activity-icon-btn"
                  onClick={() =>
                    setForm((f) => {
                      const first = f.otherPartyFirstNames.filter((_, j) => j !== i)
                      const last = f.otherPartyLastNames.filter((_, j) => j !== i)
                      return {
                        ...f,
                        otherPartyFirstNames: first,
                        otherPartyLastNames: last,
                        otherPartyNames: syncOtherPartyNamesFromFirstLast(first, last),
                        otherPartyTitles: f.otherPartyTitles.filter((_, j) => j !== i),
                        otherPartyConstituentIds: f.otherPartyConstituentIds.filter(
                          (_, j) => j !== i,
                        ),
                      }
                    })
                  }
                  disabled={form.otherPartyFirstNames.length <= 1}
                  aria-label="Remove name"
                >
                  Remove
                </button>
              </div>
              <label className="activity-constituent-id-row">
                <span className="activity-constituent-id-label">Constituent ID</span>
                <input
                  type="text"
                  className="activity-input activity-input--id"
                  placeholder="Optional (from Lookup or enter manually)"
                  value={form.otherPartyConstituentIds[i] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((f) => {
                      const rowCount = f.otherPartyFirstNames.length
                      const next = [...f.otherPartyConstituentIds]
                      if (next.length < rowCount) {
                        while (next.length < rowCount) {
                          next.push('')
                        }
                      }
                      next[i] = v
                      return { ...f, otherPartyConstituentIds: next }
                    })
                  }}
                />
              </label>
            </div>
          ))}
          <button
            type="button"
            className="activity-add-btn"
            onClick={() =>
              setForm((f) => {
                const otherPartyFirstNames = [...f.otherPartyFirstNames, '']
                const otherPartyLastNames = [...f.otherPartyLastNames, '']
                const otherPartyNames = syncOtherPartyNamesFromFirstLast(
                  otherPartyFirstNames,
                  otherPartyLastNames,
                )
                return {
                  ...f,
                  otherPartyFirstNames,
                  otherPartyLastNames,
                  otherPartyNames,
                  otherPartyTitles: alignTitlesToPartyNames(
                    otherPartyNames,
                    f.otherPartyTitles,
                  ),
                  otherPartyConstituentIds: alignConstituentIdsToPartyNames(
                    otherPartyNames,
                    f.otherPartyConstituentIds,
                  ),
                }
              })
            }
          >
            Add another name
          </button>
        </div>

        <label className="activity-field">
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

        <label className="activity-field activity-checkbox-row">
          <input
            type="checkbox"
            checked={form.multipleDaysEvent}
            onChange={(e) => {
              const checked = e.target.checked
              setForm((f) => ({
                ...f,
                multipleDaysEvent: checked,
                eventEndDateTime: checked ? f.eventEndDateTime : '',
              }))
            }}
          />
          <span className="activity-label-inline">Multiple days event</span>
        </label>

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
          {form.multipleDaysEvent ? (
            <label className="activity-field activity-field-grow">
              <span className="activity-label">End Date/Time</span>
              <input
                type="datetime-local"
                className="activity-input"
                value={form.eventEndDateTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, eventEndDateTime: e.target.value }))
                }
              />
            </label>
          ) : (
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
          )}
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

        <StorageAttachmentField
          user={user}
          canUpload={canUpload}
          uploadDisabledHint={uploadDisabledHint}
          attachments={form.attachmentItems}
          setAttachments={(updater) =>
            setForm((f) => ({
              ...f,
              attachmentItems:
                typeof updater === 'function'
                  ? updater(f.attachmentItems)
                  : updater,
            }))
          }
          attachmentsRef={attachmentsRef}
          uploadArea="activity"
          pathSegment={activityAttachmentPathSegment}
          isNewEntityRoute={!isEditMode}
          hasPersistedRow={isEditMode}
          persistMode={isEditMode ? 'immediate' : 'deferred'}
          setFeedback={setFeedback}
          persistAttachments={
            isEditMode
              ? async (next) => {
                  const result = await saveOrUpdateDraftInSupabase(
                    user,
                    { ...formRef.current, attachmentItems: next },
                    editReportId!,
                  )
                  return result.ok
                    ? { ok: true }
                    : { ok: false, message: result.message }
                }
              : undefined
          }
          onAttachmentsPersisted={(next) => {
            setForm((f) => {
              const merged = { ...f, attachmentItems: next }
              saveDraftToStorage(user.uid, merged)
              return merged
            })
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

        {isEditMode ? (
          <div className="activity-edit-delete">
            <button
              type="button"
              className="auth-submit activity-delete-btn"
              disabled={saving || deletingDraft}
              onClick={() => void handleDeleteDraft()}
            >
              {deletingDraft ? 'Deleting…' : 'Delete report'}
            </button>
          </div>
        ) : null}

        <div className="activity-actions">
          <button
            type="button"
            className="auth-submit"
            disabled={saving || deletingDraft}
            onClick={() => void handleSave()}
          >
            {saving ? 'Please wait…' : 'Save'}
          </button>
        </div>
      </form>

      <dialog
        ref={constituentLookupDialogRef}
        className="constituent-lookup-dialog"
        onClose={() => setLookupDialog(null)}
      >
        {lookupDialog?.type === 'pick' ? (
          <ConstituentPickList
            key={`${lookupDialog.index}-${lookupDialog.matches.map((m) => m.lookupid).join('|')}`}
            name={lookupDialog.name}
            matches={lookupDialog.matches}
            onCancel={() => setLookupDialog(null)}
            onSelect={(lookupid) => {
              if (!lookupDialog || lookupDialog.type !== 'pick') return
              setForm((f) => {
                const idx = lookupDialog.index
                const next = alignConstituentIdsToPartyNames(
                  f.otherPartyNames,
                  f.otherPartyConstituentIds,
                )
                next[idx] = lookupid
                return { ...f, otherPartyConstituentIds: next }
              })
              setLookupDialog(null)
              setFeedback({
                type: 'success',
                text: 'Constituent ID was set from lookup.',
              })
            }}
          />
        ) : lookupDialog?.type === 'none' ? (
          <div className="constituent-lookup-panel">
            <h2 className="constituent-lookup-title">No match found</h2>
            <p className="activity-muted constituent-lookup-lead">
              No row in the constituent list matched ‘{lookupDialog.name}’. You
              can enter a Constituent ID by hand or leave it blank.
            </p>
            <label className="activity-field">
              <span className="activity-label">Constituent ID</span>
              <input
                type="text"
                className="activity-input"
                value={lookupDialog.manualId}
                onChange={(e) =>
                  setLookupDialog((d) =>
                    d?.type === 'none'
                      ? { ...d, manualId: e.target.value }
                      : d,
                  )
                }
                autoFocus
              />
            </label>
            <div className="constituent-lookup-actions">
              <button
                type="button"
                className="auth-submit"
                onClick={() => applyNoneDialogManual()}
              >
                Save
              </button>
              <button
                type="button"
                className="auth-submit secondary"
                onClick={() => setLookupDialog(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  )
}

function ConstituentPickList({
  name,
  matches,
  onSelect,
  onCancel,
}: {
  name: string
  matches: ConstituentLookupRow[]
  onSelect: (lookupid: string) => void
  onCancel: () => void
}) {
  const [selectedId, setSelectedId] = useState(
    () => matches[0]?.lookupid ?? '',
  )
  const [openDetailId, setOpenDetailId] = useState<string | null>(() =>
    matches.length === 1 ? (matches[0]?.lookupid ?? null) : null,
  )
  const multi = matches.length > 1
  return (
    <div className="constituent-lookup-panel">
      <h2 className="constituent-lookup-title">Select a constituent</h2>
      <p className="activity-muted constituent-lookup-lead">
        {multi ? (
          <>
            Several records matched ‘{name}’. Results are sorted by match
            score (highest first); the top row is selected by default. Use{' '}
            <strong>View details</strong> on a row to see CRM fields before you
            confirm.
          </>
        ) : (
          <>
            One record matched ‘{name}’. Details are shown below so you can
            verify before confirming this constituent ID.
          </>
        )}
      </p>
      <ul className="constituent-lookup-matches" role="list">
        {matches.map((m) => {
          const id = m.lookupid
          const label = m.display_name?.trim() || id
          const detailsOpen = openDetailId === id
          const detailRows = entriesForConstituentDetail(m.detail)
          return (
            <li key={id} className="constituent-lookup-match-block">
              <div className="constituent-lookup-match-top">
                <label className="constituent-lookup-match-label">
                  <input
                    type="radio"
                    name="constituent-pick"
                    value={id}
                    checked={selectedId === id}
                    onChange={() => {
                      setSelectedId(id)
                      if (!multi) setOpenDetailId(id)
                    }}
                  />
                  <span className="constituent-lookup-match-text">
                    <span className="constituent-lookup-id">{id}</span>
                    {label !== id ? (
                      <span className="constituent-lookup-disp"> — {label}</span>
                    ) : null}
                    {m.match_score != null ? (
                      <span className="constituent-lookup-score" title="Match score">
                        {' '}
                        · {m.match_score}%
                      </span>
                    ) : null}
                  </span>
                </label>
                <button
                  type="button"
                  className="constituent-lookup-details-btn"
                  onClick={() =>
                    setOpenDetailId((cur) => (cur === id ? null : id))
                  }
                  aria-expanded={detailsOpen}
                  aria-controls={
                    detailsOpen ? `constituent-detail-${id}` : undefined
                  }
                >
                  {detailsOpen ? 'Hide details' : 'View details'}
                </button>
              </div>
              {detailsOpen ? (
                <div
                  className="constituent-lookup-details-panel"
                  id={`constituent-detail-${id}`}
                  role="region"
                  aria-label={`Details for ${label}`}
                >
                  {detailRows.length > 0 ? (
                    <dl className="constituent-detail-dl">
                      {detailRows.map(({ key, label: dl, value }) => (
                        <div key={key} className="constituent-detail-row">
                          <dt>{dl}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="constituent-detail-empty activity-muted">
                      No detail fields returned for this row. You can still use
                      Lookup ID and the label above, or re-deploy the latest{' '}
                      <code className="activity-code-inline">
                        search_v_query_constituent
                      </code>{' '}
                      function in Supabase to load CRM fields.
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      <div className="constituent-lookup-actions">
        <button
          type="button"
          className="auth-submit"
          onClick={() => onSelect(selectedId)}
          disabled={!selectedId}
        >
          Use this ID
        </button>
        <button
          type="button"
          className="auth-submit secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
