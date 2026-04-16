import type { User } from 'firebase/auth'
import { profilesSupabase } from './profilesSupabase'
import { fetchFirebaseUidsForEmails } from './profile'

export type TeamFilterValue = '__all__' | string

export type ActivityReportFormState = {
  title: string
  teamFilter: TeamFilterValue
  attendingStaffIds: (string | number)[]
  otherPeopleEnabled: boolean
  otherPeopleNames: string[]
  otherPartyName: string
  crmConstituentNo: string
  eventDateTime: string
  durationHours: number
  durationMinutes: number
  detail: string
  attachmentUrls: string[]
}

export type ActivityReportRow = {
  id: string
  firebase_uid: string
  title: string | null
  team_filter: string
  attending_staff_ids: unknown
  other_people_enabled: boolean
  /** Postgres `text[]`; may deserialize oddly — use `parseOtherPeopleNamesFromRow`. */
  other_people_names: unknown
  other_party_name: string | null
  crm_constituent_no: string | null
  event_at: string | null
  duration_minutes: number
  detail: string
  attachment_urls: string[] | null
  status: 'draft' | 'submitted'
  created_at: string
  updated_at: string
  /** Soft delete — when set, hidden from dashboard unless “show deleted” is on. */
  deleted_at?: string | null
}

export function defaultFormState(): ActivityReportFormState {
  return {
    title: '',
    teamFilter: '__all__',
    attendingStaffIds: [],
    otherPeopleEnabled: false,
    otherPeopleNames: [''],
    otherPartyName: '',
    crmConstituentNo: '',
    eventDateTime: '',
    durationHours: 1,
    durationMinutes: 0,
    detail: '',
    attachmentUrls: [''],
  }
}

function draftKey(uid: string): string {
  return `activityReportDraft:${uid}`
}

export function draftRowIdKey(uid: string): string {
  return `activityReportDraftRowId:${uid}`
}

export function loadDraftFromStorage(uid: string): Partial<ActivityReportFormState> | null {
  try {
    const raw = localStorage.getItem(draftKey(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Partial<ActivityReportFormState>
  } catch {
    return null
  }
}

export function loadDraftRowIdFromStorage(uid: string): string | null {
  return localStorage.getItem(draftRowIdKey(uid))
}

export function saveDraftToStorage(uid: string, state: ActivityReportFormState): void {
  localStorage.setItem(draftKey(uid), JSON.stringify(state))
}

export function saveDraftRowIdToStorage(uid: string, id: string | null): void {
  const k = draftRowIdKey(uid)
  if (id) localStorage.setItem(k, id)
  else localStorage.removeItem(k)
}

/** Clears the cached draft form and linked draft row id (used when opening “new” report). */
export function clearDraftClientStorage(uid: string): void {
  localStorage.removeItem(draftKey(uid))
  saveDraftRowIdToStorage(uid, null)
}

export function mergeWithDefaults(
  partial: Partial<ActivityReportFormState> | null,
): ActivityReportFormState {
  const base = defaultFormState()
  if (!partial) return base
  return {
    ...base,
    ...partial,
    title: typeof partial.title === 'string' ? partial.title : base.title,
    attendingStaffIds: Array.isArray(partial.attendingStaffIds)
      ? partial.attendingStaffIds
      : base.attendingStaffIds,
    otherPeopleNames:
      Array.isArray(partial.otherPeopleNames) &&
      partial.otherPeopleNames.length > 0
        ? partial.otherPeopleNames
        : base.otherPeopleNames,
    attachmentUrls:
      Array.isArray(partial.attachmentUrls) && partial.attachmentUrls.length > 0
        ? partial.attachmentUrls
        : base.attachmentUrls,
  }
}

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function parseAttendingIds(raw: unknown): (string | number)[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => (typeof x === 'number' ? x : String(x)))
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      return Array.isArray(p) ? p.map((x) => String(x)) : []
    } catch {
      return []
    }
  }
  return []
}

/** Normalizes other_people_names from DB (array, or occasional string/JSON). */
export function parseOtherPeopleNamesFromRow(
  row: ActivityReportRow,
): string[] {
  const raw = row.other_people_names
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      if (Array.isArray(p)) {
        return p.map((x) => String(x).trim()).filter(Boolean)
      }
    } catch {
      const t = raw.trim()
      return t ? [t] : []
    }
    const plain = raw.trim()
    return plain ? [plain] : []
  }
  return []
}

export function activityRowToFormState(row: ActivityReportRow): ActivityReportFormState {
  const dm = Math.max(0, Number(row.duration_minutes) || 0)
  const hours = Math.floor(dm / 60)
  const minutes = dm % 60
  const teamFilter =
    row.team_filter === 'all' ? '__all__' : String(row.team_filter)
  const otherNames = parseOtherPeopleNamesFromRow(row)

  return {
    title: row.title?.trim() ?? '',
    teamFilter,
    attendingStaffIds: parseAttendingIds(row.attending_staff_ids),
    otherPeopleEnabled:
      Boolean(row.other_people_enabled) || otherNames.length > 0,
    otherPeopleNames: otherNames.length > 0 ? otherNames : [''],
    otherPartyName: row.other_party_name ?? '',
    crmConstituentNo: row.crm_constituent_no ?? '',
    eventDateTime: isoToDatetimeLocal(row.event_at),
    durationHours: hours,
    durationMinutes: minutes,
    detail: row.detail ?? '',
    attachmentUrls:
      row.attachment_urls && row.attachment_urls.length > 0
        ? [...row.attachment_urls]
        : [''],
  }
}

function buildRowPayload(
  user: User,
  state: ActivityReportFormState,
  status: 'draft' | 'submitted',
) {
  const durationMinutes = Math.max(
    0,
    (Number(state.durationHours) || 0) * 60 + (Number(state.durationMinutes) || 0),
  )

  const attachmentUrls = state.attachmentUrls
    .map((u) => u.trim())
    .filter(Boolean)

  const otherPeopleNames = state.otherPeopleEnabled
    ? state.otherPeopleNames.map((n) => n.trim()).filter(Boolean)
    : []

  return {
    firebase_uid: user.uid,
    title: state.title.trim() || null,
    team_filter:
      state.teamFilter === '__all__' ? 'all' : String(state.teamFilter),
    attending_staff_ids: state.attendingStaffIds.map((id) => String(id)),
    other_people_enabled: state.otherPeopleEnabled,
    other_people_names: otherPeopleNames,
    other_party_name: state.otherPartyName.trim() || null,
    crm_constituent_no: state.crmConstituentNo.trim() || null,
    event_at: state.eventDateTime
      ? new Date(state.eventDateTime).toISOString()
      : null,
    duration_minutes: durationMinutes,
    detail: state.detail.trim(),
    attachment_urls: attachmentUrls,
    status,
    updated_at: new Date().toISOString(),
  }
}

/** Resolves Firebase UIDs for the current user and subordinate emails (profiles table). */
export async function resolveViewerFirebaseUids(
  user: User,
  subordinateEmails: string[],
): Promise<string[]> {
  const emails = [
    user.email?.trim().toLowerCase() ?? '',
    ...subordinateEmails.map((e) => e.trim().toLowerCase()).filter(Boolean),
  ].filter(Boolean)

  const uids = await fetchFirebaseUidsForEmails(emails)
  const set = new Set(uids)
  set.add(user.uid)
  return [...set]
}

/** Loads all reports for the given creators (including soft-deleted). Dashboard filters deleted rows in the UI. */
export async function fetchActivityReportsForUids(
  uids: string[],
): Promise<
  { ok: true; rows: ActivityReportRow[] } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured' }
  }
  if (uids.length === 0) {
    return { ok: true, rows: [] }
  }

  const { data, error } = await profilesSupabase
    .from('activity_reports')
    .select('*')
    .in('firebase_uid', uids)
    .order('created_at', { ascending: false })

  if (error) {
    return { ok: false, message: error.message }
  }
  return { ok: true, rows: (data ?? []) as ActivityReportRow[] }
}

export async function fetchActivityReportById(
  id: string,
): Promise<
  { ok: true; row: ActivityReportRow } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured' }
  }

  const rid = id.trim()

  const { data, error } = await profilesSupabase
    .from('activity_reports')
    .select('*')
    .eq('id', rid)
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data) {
    return { ok: false, message: 'Report not found.' }
  }
  return { ok: true, row: data as ActivityReportRow }
}

/** Soft delete — dashboard hides unless “show deleted” is enabled. */
export async function softDeleteActivityReport(
  id: string,
  firebaseUid: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured' }
  }

  const rid = id.trim()
  const uid = firebaseUid.trim()

  const existing = await fetchActivityReportById(rid)
  if (!existing.ok) {
    return { ok: false, message: existing.message }
  }

  const rowUid = String(existing.row.firebase_uid ?? '').trim()
  if (rowUid !== uid) {
    return { ok: false, message: 'You can only delete your own reports.' }
  }
  if (existing.row.deleted_at) {
    return { ok: true }
  }

  const now = new Date().toISOString()

  /**
   * Prefer RPC when deployed: `UPDATE ... RETURNING` can be empty if RLS allows
   * UPDATE but SELECT policies hide the row after `deleted_at` is set (e.g. USING (deleted_at IS NULL)).
   * The SECURITY DEFINER function updates by id + uid without relying on RETURNING.
   */
  const rpc = await profilesSupabase.rpc('soft_delete_activity_report', {
    p_id: rid,
    p_firebase_uid: rowUid,
  })

  const rpcMissing =
    rpc.error &&
    (/does not exist|Could not find the function/i.test(rpc.error.message ?? '') ||
      rpc.error.code === '42883' ||
      rpc.error.code === 'PGRST202')

  if (!rpc.error && rpc.data === true) {
    return { ok: true }
  }
  if (!rpc.error && rpc.data === false) {
    return {
      ok: false,
      message:
        'Could not delete this report (no matching row). Try refreshing the page.',
    }
  }
  if (rpc.error && !rpcMissing) {
    return { ok: false, message: rpc.error.message }
  }

  const { error: updErr } = await profilesSupabase
    .from('activity_reports')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', rid)
    .eq('firebase_uid', rowUid)

  if (updErr) {
    return { ok: false, message: updErr.message }
  }

  const verify = await fetchActivityReportById(rid)
  if (verify.ok && verify.row.deleted_at) {
    return { ok: true }
  }
  // SELECT RLS sometimes hides the row once deleted_at is set (e.g. USING (deleted_at is null)).
  // The update already returned no error — treat “not found” on refetch as success.
  if (!verify.ok) {
    return { ok: true }
  }

  return {
    ok: false,
    message:
      'Delete did not apply (the report is still not marked deleted). Run the `soft_delete_activity_report` section in supabase_activity_reports.sql on your Profiles Supabase project, or ask an admin to allow anon UPDATE on activity_reports.',
  }
}

export async function saveOrUpdateDraftInSupabase(
  user: User,
  state: ActivityReportFormState,
  existingDraftId: string | null,
): Promise<
  { ok: true; id: string } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return {
      ok: false,
      message: 'Profiles Supabase is not configured.',
    }
  }

  const payload = buildRowPayload(user, state, 'draft')

  if (existingDraftId) {
    const { data, error } = await profilesSupabase
      .from('activity_reports')
      .update(payload)
      .eq('id', existingDraftId)
      .eq('firebase_uid', user.uid)
      .select('id')
      .maybeSingle()

    if (error) {
      return { ok: false, message: error.message }
    }
    if (!data?.id) {
      return {
        ok: false,
        message:
          'Could not save draft (no rows updated). Check your connection and table permissions.',
      }
    }
    return { ok: true, id: existingDraftId }
  }

  const { data, error } = await profilesSupabase
    .from('activity_reports')
    .insert(payload)
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data?.id) {
    return { ok: false, message: 'Could not save draft.' }
  }
  return { ok: true, id: data.id as string }
}

export async function submitActivityReportToSupabase(
  user: User,
  state: ActivityReportFormState,
  options?: { draftRowId: string | null },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!profilesSupabase) {
    return {
      ok: false,
      message:
        'Profiles Supabase is not configured; cannot submit to the server.',
    }
  }

  const payload = buildRowPayload(user, state, 'submitted')
  const draftId = options?.draftRowId?.trim() || null

  /**
   * Promote the existing draft row in place. The old flow inserted a new “submitted”
   * row and hard-deleted the draft; if DELETE failed (e.g. RLS), two rows remained.
   */
  if (draftId) {
    const rid = draftId.trim()

    const existing = await fetchActivityReportById(rid)
    if (!existing.ok) {
      return { ok: false, message: existing.message }
    }

    const rowUid = String(existing.row.firebase_uid ?? '').trim()
    if (rowUid !== user.uid.trim()) {
      return { ok: false, message: 'You can only submit your own drafts.' }
    }
    if (existing.row.deleted_at) {
      return { ok: false, message: 'This draft was deleted.' }
    }
    if (existing.row.status === 'submitted') {
      return { ok: true }
    }
    if (existing.row.status !== 'draft') {
      return {
        ok: false,
        message: 'This report is not an unsubmitted draft.',
      }
    }

    // Use DB-stored uid in filters (must match soft delete / save draft paths).
    // Avoid .select() here: UPDATE … RETURNING can be empty under some RLS setups.
    const { error: updErr } = await profilesSupabase
      .from('activity_reports')
      .update(payload)
      .eq('id', rid)
      .eq('firebase_uid', rowUid)
      .eq('status', 'draft')

    if (updErr) {
      return { ok: false, message: updErr.message }
    }

    const verify = await fetchActivityReportById(rid)
    if (verify.ok && verify.row.status === 'submitted') {
      return { ok: true }
    }
    if (verify.ok && verify.row.status === 'draft') {
      return {
        ok: false,
        message:
          'Could not submit this draft (no rows updated). Check that your Profiles database allows UPDATE on activity_reports.',
      }
    }
    // Row no longer visible or status unclear — often SELECT RLS hiding “submitted” rows.
    if (!verify.ok) {
      return { ok: true }
    }

    return {
      ok: false,
      message:
        'Could not submit this draft. Try again or refresh the page.',
    }
  }

  const { error } = await profilesSupabase.from('activity_reports').insert(payload)

  if (error) {
    return { ok: false, message: error.message }
  }

  return { ok: true }
}

export function reportMatchesSearch(
  row: ActivityReportRow,
  q: string,
  creatorFullName?: string | null,
): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const hay = [
    row.title,
    row.detail,
    row.other_party_name,
    row.crm_constituent_no,
    creatorFullName,
    ...(row.attachment_urls ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
  return hay.includes(s)
}
