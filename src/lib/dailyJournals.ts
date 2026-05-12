import type { User } from 'firebase/auth'
import {
  parseJsonAttachmentItems,
  serializeAttachmentForDb,
  type StorageAttachmentItem,
} from './attachmentItems'
import { fetchFirebaseUidsForEmails } from './profile'
import { profilesSupabase } from './profilesSupabase'
import type { StaffRow } from './staffAccess'

export type DailyJournalRow = {
  id: string
  firebase_uid: string
  /** ISO date string `YYYY-MM-DD` from Postgres `date`. */
  journal_date: string
  title: string
  body: string
  created_at: string
  updated_at: string
  attachment_items: StorageAttachmentItem[]
  /** Set when the entry is soft-deleted (still in DB). */
  deleted_at?: string | null
}

function normalizeJournalRow(data: Record<string, unknown>): DailyJournalRow {
  const parsed = parseJsonAttachmentItems(data.attachment_items)
  const deletedRaw = data.deleted_at
  return {
    id: String(data.id),
    firebase_uid: String(data.firebase_uid ?? ''),
    journal_date: String(data.journal_date ?? ''),
    title: typeof data.title === 'string' ? data.title : String(data.title ?? ''),
    body: typeof data.body === 'string' ? data.body : String(data.body ?? ''),
    created_at: String(data.created_at ?? ''),
    updated_at: String(data.updated_at ?? ''),
    attachment_items: parsed ?? [],
    deleted_at:
      deletedRaw === null || deletedRaw === undefined
        ? null
        : String(deletedRaw),
  }
}

/** Local calendar date as `YYYY-MM-DD` (user’s browser timezone). */
export function localJournalDateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function journalTitleForDate(dateKey: string): string {
  return `Journal of ${dateKey}`
}

/** `true` when `s` is a real calendar day in `YYYY-MM-DD` form. */
export function isValidJournalDateKey(s: string): boolean {
  const t = s.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false
  const [y, m, d] = t.split('-').map((x) => Number(x))
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

export async function fetchJournalByUserAndDate(
  firebaseUid: string,
  journalDate: string,
): Promise<
  { ok: true; row: DailyJournalRow | null } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const uid = firebaseUid.trim()
  const d = journalDate.trim()
  const { data, error } = await profilesSupabase
    .from('daily_journals')
    .select('*')
    .eq('firebase_uid', uid)
    .eq('journal_date', d)
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data) {
    return { ok: true, row: null }
  }
  return { ok: true, row: normalizeJournalRow(data as Record<string, unknown>) }
}

export async function fetchJournalByIdForUser(
  journalId: string,
  firebaseUid: string,
): Promise<
  { ok: true; row: DailyJournalRow } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const id = journalId.trim()
  const uid = firebaseUid.trim()
  const { data, error } = await profilesSupabase
    .from('daily_journals')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data) {
    return { ok: false, message: 'Journal not found.' }
  }
  const row = normalizeJournalRow(data as Record<string, unknown>)
  if (String(row.firebase_uid).trim() !== uid) {
    return { ok: false, message: 'You can only open your own journals.' }
  }
  return { ok: true, row }
}

/** Owner or a listed subordinate (supervisor view). */
export async function fetchJournalByIdForViewer(
  journalId: string,
  user: User,
  subordinates: StaffRow[],
): Promise<
  { ok: true; row: DailyJournalRow } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const id = journalId.trim()
  const { data, error } = await profilesSupabase
    .from('daily_journals')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data) {
    return { ok: false, message: 'Journal not found.' }
  }
  const row = normalizeJournalRow(data as Record<string, unknown>)
  if (String(row.firebase_uid).trim() === user.uid.trim()) {
    return { ok: true, row }
  }
  const emails = subordinates
    .map((s) => s.email?.trim().toLowerCase())
    .filter((e): e is string => Boolean(e))
  const subUids =
    emails.length > 0 ? await fetchFirebaseUidsForEmails(emails) : []
  if (subUids.includes(row.firebase_uid)) {
    return { ok: true, row }
  }
  return { ok: false, message: 'You can only open your own journals.' }
}

/**
 * Returns this user’s journal for `journalDate` (`YYYY-MM-DD`), inserting a row
 * if none exists (title `Journal of yyyy-mm-dd`, creator = firebase_uid).
 */
export async function getOrCreateJournalForUserDate(
  user: User,
  journalDate: string,
): Promise<
  { ok: true; row: DailyJournalRow } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const dateKey = journalDate.trim()
  if (!isValidJournalDateKey(dateKey)) {
    return { ok: false, message: 'Pick a valid calendar date.' }
  }
  const uid = user.uid.trim()
  const title = journalTitleForDate(dateKey)

  const existing = await fetchJournalByUserAndDate(uid, dateKey)
  if (!existing.ok) {
    return { ok: false, message: existing.message }
  }
  if (existing.row) {
    return { ok: true, row: existing.row }
  }

  const now = new Date().toISOString()
  const { data, error } = await profilesSupabase
    .from('daily_journals')
    .insert({
      firebase_uid: uid,
      journal_date: dateKey,
      title,
      body: '',
      attachment_items: [],
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .maybeSingle()

  if (!error && data) {
    return { ok: true, row: normalizeJournalRow(data as Record<string, unknown>) }
  }

  // Race: another tab created the same day
  if (error && (error.code === '23505' || /duplicate key/i.test(error.message))) {
    const again = await fetchJournalByUserAndDate(uid, dateKey)
    if (again.ok && again.row) {
      return { ok: true, row: again.row }
    }
  }

  return {
    ok: false,
    message: error?.message ?? 'Could not create journal for that day.',
  }
}

export async function getOrCreateTodayJournal(
  user: User,
): Promise<
  { ok: true; row: DailyJournalRow } | { ok: false; message: string }
> {
  return getOrCreateJournalForUserDate(user, localJournalDateKey())
}

export async function saveJournalBody(
  journalId: string,
  firebaseUid: string,
  body: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return saveJournalBodyAndAttachments(journalId, firebaseUid, body, undefined)
}

export async function saveJournalBodyAndAttachments(
  journalId: string,
  firebaseUid: string,
  body: string,
  attachmentItems: StorageAttachmentItem[] | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const id = journalId.trim()
  const uid = firebaseUid.trim()
  const now = new Date().toISOString()

  const update: Record<string, unknown> = { body, updated_at: now }
  if (attachmentItems !== undefined) {
    const serialized = serializeAttachmentForDb(attachmentItems)
    update.attachment_items = serialized.length > 0 ? serialized : []
  }

  const { data, error } = await profilesSupabase
    .from('daily_journals')
    .update(update)
    .eq('id', id)
    .eq('firebase_uid', uid)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data?.id) {
    return {
      ok: false,
      message:
        'Could not save (no row updated). Check that the daily_journals table exists and RLS allows update.',
    }
  }
  return { ok: true }
}

export async function listJournalsForUser(
  firebaseUid: string,
  options?: { includeDeleted?: boolean },
): Promise<
  { ok: true; rows: DailyJournalRow[] } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const uid = firebaseUid.trim()
  let q = profilesSupabase
    .from('daily_journals')
    .select('*')
    .eq('firebase_uid', uid)
    .order('journal_date', { ascending: false })
  if (!options?.includeDeleted) {
    q = q.is('deleted_at', null)
  }
  const { data, error } = await q

  if (error) {
    return { ok: false, message: error.message }
  }
  const rows = (data ?? []).map((d) =>
    normalizeJournalRow(d as Record<string, unknown>),
  )
  return { ok: true, rows }
}

export async function listJournalsForFirebaseUids(
  firebaseUids: string[],
  options?: { includeDeleted?: boolean },
): Promise<
  { ok: true; rows: DailyJournalRow[] } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const uids = [...new Set(firebaseUids.map((u) => u.trim()).filter(Boolean))]
  if (uids.length === 0) {
    return { ok: true, rows: [] }
  }
  let q = profilesSupabase
    .from('daily_journals')
    .select('*')
    .in('firebase_uid', uids)
    .order('journal_date', { ascending: false })
  if (!options?.includeDeleted) {
    q = q.is('deleted_at', null)
  }
  const { data, error } = await q

  if (error) {
    return { ok: false, message: error.message }
  }
  const rows = (data ?? []).map((d) =>
    normalizeJournalRow(d as Record<string, unknown>),
  )
  return { ok: true, rows }
}

export async function softDeleteDailyJournal(
  journalId: string,
  firebaseUid: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const id = journalId.trim()
  const uid = firebaseUid.trim()
  const now = new Date().toISOString()
  const { data, error } = await profilesSupabase
    .from('daily_journals')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .eq('firebase_uid', uid)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data?.id) {
    return {
      ok: false,
      message:
        'Could not delete (no row updated). The journal may already be deleted, or the deleted_at column is missing — run supabase_daily_journals.sql on your database.',
    }
  }
  return { ok: true }
}

export async function restoreDailyJournal(
  journalId: string,
  firebaseUid: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const id = journalId.trim()
  const uid = firebaseUid.trim()
  const now = new Date().toISOString()
  const { data, error } = await profilesSupabase
    .from('daily_journals')
    .update({ deleted_at: null, updated_at: now })
    .eq('id', id)
    .eq('firebase_uid', uid)
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data?.id) {
    return { ok: false, message: 'Could not restore entry.' }
  }
  return { ok: true }
}
