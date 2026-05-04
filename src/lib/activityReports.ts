import type { User } from 'firebase/auth'
import {
  parseJsonAttachmentItems,
  serializeAttachmentForDb,
  type StorageAttachmentItem,
} from './attachmentItems'
import { profilesSupabase } from './profilesSupabase'
import { fetchFirebaseUidsForEmails } from './profile'

export type TeamFilterValue = '__all__' | string

export type ActivityReportFormState = {
  title: string
  teamFilter: TeamFilterValue
  attendingStaffIds: (string | number)[]
  otherPeopleEnabled: boolean
  /** Other colleagues not in the staff list — same split-into-rows UX as donors. */
  otherPeopleNames: string[]
  /** Donor / Prospect / Guest — one entry per person; stored in DB as newline-separated text. */
  otherPartyNames: string[]
  /** Honorific / title per row (optional; from older data); aligned by index with `otherPartyNames`. */
  otherPartyTitles: string[]
  /** CRM constituent (lookup) id per name row; aligned by index with `otherPartyNames`. */
  otherPartyConstituentIds: string[]
  crmConstituentNo: string
  eventDateTime: string
  /** When true, duration fields are hidden; use `eventEndDateTime` instead. */
  multipleDaysEvent: boolean
  eventEndDateTime: string
  durationHours: number
  durationMinutes: number
  detail: string
  attachmentItems: StorageAttachmentItem[]
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
  /** Parallel to each non-blank line in `other_party_name` (order preserved). */
  other_party_constituent_ids?: string[] | null
  /** Parallel honorific/title per line (optional). */
  other_party_titles?: string[] | null
  crm_constituent_no: string | null
  event_at: string | null
  multiple_days_event?: boolean
  event_end_at?: string | null
  duration_minutes: number
  detail: string
  attachment_urls: string[] | null
  /** Parallel to `attachment_urls`; may be absent on older rows. */
  attachment_descriptions?: string[] | null
  /** New-format attachments (links + Firebase files). Prefer over legacy URL arrays when present. */
  attachment_items?: unknown
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
    otherPartyNames: [''],
    otherPartyTitles: [''],
    otherPartyConstituentIds: [''],
    crmConstituentNo: '',
    eventDateTime: '',
    multipleDaysEvent: false,
    eventEndDateTime: '',
    durationHours: 1,
    durationMinutes: 0,
    detail: '',
    attachmentItems: [],
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

/** Parse stored `other_party_name` (newline-separated) into one row per name. */
export function otherPartyNamesFromDb(text: string | null | undefined): string[] {
  const raw = text?.trim()
  if (!raw) return ['']
  const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  return lines.length > 0 ? lines : ['']
}

/** Migrate drafts that stored separate first/last into one name line. */
function combineLegacyFirstLast(first: string, last: string): string {
  const f = first.trim()
  const l = last.trim()
  if (f && l) return `${f} ${l}`
  return f || l
}

/** Serialize donor/guest names for `other_party_name`. */
export function otherPartyNamesToDb(names: string[]): string | null {
  const lines = names.map((s) => s.trim()).filter(Boolean)
  return lines.length > 0 ? lines.join('\n') : null
}

function parseOtherPartyConstituentIdsFromRow(
  row: Pick<ActivityReportRow, 'other_party_constituent_ids'>,
): string[] {
  const raw = row.other_party_constituent_ids
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.map((x) => (x == null ? '' : String(x).trim()))
  }
  return []
}

/** Pads or trims so `ids[i]` lines up with `otherPartyNames[i]`. */
export function alignConstituentIdsToPartyNames(
  otherPartyNames: string[],
  ids: string[],
): string[] {
  const n = otherPartyNames.length
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push((ids[i] ?? '').trim())
  }
  return out
}

/** Pads or trims so `titles[i]` lines up with `otherPartyNames[i]`. */
export function alignTitlesToPartyNames(
  otherPartyNames: string[],
  titles: string[],
): string[] {
  const n = otherPartyNames.length
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push((titles[i] ?? '').trim())
  }
  return out
}

function parseOtherPartyTitlesFromRow(
  row: Pick<ActivityReportRow, 'other_party_titles'>,
): string[] {
  const raw = row.other_party_titles
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.map((x) => (x == null ? '' : String(x).trim()))
  }
  return []
}

/** Pairs only non-blank name rows; same order for DB arrays and newline text. */
export function zipOtherPartyNameAndConstituentIds(
  otherPartyNames: string[],
  otherPartyConstituentIds: string[],
  otherPartyTitles: string[],
): {
  namesText: string | null
  idArray: string[] | null
  titlesArray: string[] | null
} {
  const pairs: { name: string; id: string; title: string }[] = []
  for (let i = 0; i < otherPartyNames.length; i++) {
    const name = (otherPartyNames[i] ?? '').trim()
    if (!name) continue
    pairs.push({
      name,
      id: (otherPartyConstituentIds[i] ?? '').trim(),
      title: (otherPartyTitles[i] ?? '').trim(),
    })
  }
  if (pairs.length === 0) {
    return { namesText: null, idArray: null, titlesArray: null }
  }
  return {
    namesText: pairs.map((p) => p.name).join('\n'),
    idArray: pairs.map((p) => p.id),
    titlesArray: pairs.map((p) => p.title),
  }
}

export function mergeWithDefaults(
  partial: Partial<ActivityReportFormState> | null,
): ActivityReportFormState {
  const base = defaultFormState()
  if (!partial) return base
  const legacy = partial as Partial<ActivityReportFormState> & {
    attachmentUrls?: string[]
    otherPartyName?: string
  }
  const { attachmentUrls: _legacyUrls, otherPartyName: _legacyPartyLine, ...restPartial } =
    legacy
  const otherPartyNamesFromPartial = (): string[] => {
    if (Array.isArray(partial.otherPartyNames)) {
      return partial.otherPartyNames.length > 0
        ? partial.otherPartyNames.map((s) => String(s))
        : ['']
    }
    if (typeof _legacyPartyLine === 'string' && _legacyPartyLine.trim()) {
      return otherPartyNamesFromDb(_legacyPartyLine)
    }
    return base.otherPartyNames
  }
  let otherPartyNamesResolved = otherPartyNamesFromPartial()
  const partialSplit = partial as Partial<ActivityReportFormState> & {
    otherPartyFirstNames?: string[]
    otherPartyLastNames?: string[]
  }
  if (
    Array.isArray(partialSplit.otherPartyFirstNames) &&
    partialSplit.otherPartyFirstNames.length > 0
  ) {
    const lastArr = Array.isArray(partialSplit.otherPartyLastNames)
      ? partialSplit.otherPartyLastNames.map((s) => String(s))
      : []
    const firstArr = partialSplit.otherPartyFirstNames.map((s) => String(s))
    const maxLen = Math.max(
      otherPartyNamesResolved.length,
      firstArr.length,
      lastArr.length,
    )
    otherPartyNamesResolved = Array.from({ length: maxLen }, (_, i) => {
      const combined = combineLegacyFirstLast(
        firstArr[i] ?? '',
        lastArr[i] ?? '',
      ).trim()
      const fallback = String(otherPartyNamesResolved[i] ?? '').trim()
      return combined || fallback
    })
    if (otherPartyNamesResolved.every((s) => !String(s).trim())) {
      otherPartyNamesResolved = ['']
    }
  }
  const otherPartyConstituentIdsFromPartial = (): string[] => {
    if (Array.isArray(partial.otherPartyConstituentIds)) {
      return alignConstituentIdsToPartyNames(
        otherPartyNamesResolved,
        partial.otherPartyConstituentIds,
      )
    }
    return alignConstituentIdsToPartyNames(otherPartyNamesResolved, [])
  }
  const otherPartyTitlesFromPartial = (): string[] => {
    if (Array.isArray(partial.otherPartyTitles)) {
      return alignTitlesToPartyNames(
        otherPartyNamesResolved,
        partial.otherPartyTitles,
      )
    }
    return alignTitlesToPartyNames(otherPartyNamesResolved, [])
  }
  return {
    ...base,
    ...restPartial,
    title: typeof partial.title === 'string' ? partial.title : base.title,
    attendingStaffIds: Array.isArray(partial.attendingStaffIds)
      ? partial.attendingStaffIds
      : base.attendingStaffIds,
    otherPeopleNames:
      Array.isArray(partial.otherPeopleNames) &&
      partial.otherPeopleNames.length > 0
        ? partial.otherPeopleNames
        : base.otherPeopleNames,
    otherPartyNames: otherPartyNamesResolved,
    otherPartyTitles: otherPartyTitlesFromPartial(),
    otherPartyConstituentIds: otherPartyConstituentIdsFromPartial(),
    attachmentItems:
      normalizeAttachmentItemsFromPartial(legacy) ?? base.attachmentItems,
    multipleDaysEvent:
      typeof partial.multipleDaysEvent === 'boolean'
        ? partial.multipleDaysEvent
        : base.multipleDaysEvent,
    eventEndDateTime:
      typeof partial.eventEndDateTime === 'string'
        ? partial.eventEndDateTime
        : base.eventEndDateTime,
  }
}

function normalizeAttachmentItemsFromPartial(
  partial: Partial<ActivityReportFormState> & { attachmentUrls?: string[] },
): ActivityReportFormState['attachmentItems'] | null {
  if (
    Array.isArray(partial.attachmentItems) &&
    partial.attachmentItems.length > 0
  ) {
    const first = partial.attachmentItems[0] as unknown
    if (
      first &&
      typeof first === 'object' &&
      'kind' in (first as Record<string, unknown>)
    ) {
      return partial.attachmentItems as StorageAttachmentItem[]
    }
    return (partial.attachmentItems as { url?: string; description?: string }[]).map(
      (x) => ({
        kind: 'link' as const,
        url: typeof x?.url === 'string' ? x.url : '',
        description:
          typeof x?.description === 'string' ? x.description : '',
      }),
    )
  }
  if (
    Array.isArray(partial.attachmentUrls) &&
    partial.attachmentUrls.length > 0
  ) {
    return partial.attachmentUrls.map((url) => ({
      kind: 'link' as const,
      url: typeof url === 'string' ? url : '',
      description: '',
    }))
  }
  return null
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

/** Normalizes other_people_names (other colleagues) from DB (array, or occasional string/JSON). */
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

  const partyNames = otherPartyNamesFromDb(row.other_party_name)
  return {
    title: row.title?.trim() ?? '',
    teamFilter,
    attendingStaffIds: parseAttendingIds(row.attending_staff_ids),
    otherPeopleEnabled:
      Boolean(row.other_people_enabled) || otherNames.length > 0,
    otherPeopleNames: otherNames.length > 0 ? otherNames : [''],
    otherPartyNames: partyNames,
    otherPartyTitles: alignTitlesToPartyNames(
      partyNames,
      parseOtherPartyTitlesFromRow(row),
    ),
    otherPartyConstituentIds: alignConstituentIdsToPartyNames(
      partyNames,
      parseOtherPartyConstituentIdsFromRow(row),
    ),
    crmConstituentNo: row.crm_constituent_no ?? '',
    eventDateTime: isoToDatetimeLocal(row.event_at),
    multipleDaysEvent: Boolean(row.multiple_days_event),
    eventEndDateTime: isoToDatetimeLocal(row.event_end_at ?? null),
    durationHours: hours,
    durationMinutes: minutes,
    detail: row.detail ?? '',
    attachmentItems: attachmentItemsFromRow(row),
  }
}

export function attachmentItemsFromRow(
  row: ActivityReportRow,
): StorageAttachmentItem[] {
  const parsed = parseJsonAttachmentItems(row.attachment_items)
  if (parsed && parsed.length > 0) {
    return parsed
  }
  const urls = row.attachment_urls ?? []
  const descs = row.attachment_descriptions ?? []
  if (urls.length === 0 && descs.length === 0) {
    return []
  }
  const n = Math.max(urls.length, descs.length)
  return Array.from({ length: n }, (_, i) => ({
    kind: 'link' as const,
    url: urls[i] != null ? String(urls[i]) : '',
    description: descs[i] != null ? String(descs[i]) : '',
  }))
}

function computeDurationMinutes(state: ActivityReportFormState): number {
  if (state.multipleDaysEvent) {
    if (!state.eventDateTime.trim() || !state.eventEndDateTime.trim()) {
      return 0
    }
    const start = new Date(state.eventDateTime).getTime()
    const end = new Date(state.eventEndDateTime).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return 0
    }
    return Math.max(0, Math.floor((end - start) / 60000))
  }
  return Math.max(
    0,
    (Number(state.durationHours) || 0) * 60 +
      (Number(state.durationMinutes) || 0),
  )
}

function buildRowPayload(user: User, state: ActivityReportFormState) {
  const durationMinutes = computeDurationMinutes(state)

  const serializedAttachments = serializeAttachmentForDb(state.attachmentItems)

  const otherPeopleNames = state.otherPeopleEnabled
    ? state.otherPeopleNames.map((n) => n.trim()).filter(Boolean)
    : []
  const partyZip = zipOtherPartyNameAndConstituentIds(
    state.otherPartyNames,
    state.otherPartyConstituentIds,
    state.otherPartyTitles,
  )

  return {
    firebase_uid: user.uid,
    title: state.title.trim() || null,
    team_filter:
      state.teamFilter === '__all__' ? 'all' : String(state.teamFilter),
    attending_staff_ids: state.attendingStaffIds.map((id) => String(id)),
    other_people_enabled: state.otherPeopleEnabled,
    other_people_names: otherPeopleNames,
    other_party_name: partyZip.namesText,
    other_party_constituent_ids: partyZip.idArray ?? [],
    other_party_titles: partyZip.titlesArray ?? [],
    crm_constituent_no: state.crmConstituentNo.trim() || null,
    event_at: state.eventDateTime
      ? new Date(state.eventDateTime).toISOString()
      : null,
    multiple_days_event: state.multipleDaysEvent,
    event_end_at:
      state.multipleDaysEvent && state.eventEndDateTime.trim()
        ? new Date(state.eventEndDateTime).toISOString()
        : null,
    duration_minutes: durationMinutes,
    detail: state.detail.trim(),
    attachment_items:
      serializedAttachments.length > 0 ? serializedAttachments : [],
    attachment_urls: [] as string[],
    attachment_descriptions: [] as string[],
    status: 'submitted' as const,
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
    .order('updated_at', { ascending: false })

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

  const payload = buildRowPayload(user, state)

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

export function reportMatchesSearch(
  row: ActivityReportRow,
  q: string,
  creatorFullName?: string | null,
): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const attItems = attachmentItemsFromRow(row)
  const hay = [
    row.title,
    row.detail,
    row.other_party_name,
    row.crm_constituent_no,
    (row.other_party_constituent_ids ?? []).join('\n'),
    (row.other_party_titles ?? []).join('\n'),
    creatorFullName,
    ...(row.attachment_urls ?? []),
    ...(row.attachment_descriptions ?? []),
    JSON.stringify(attItems),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
  return hay.includes(s)
}
