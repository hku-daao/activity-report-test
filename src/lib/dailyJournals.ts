import type { User } from 'firebase/auth'
import {
  parseJsonAttachmentItems,
  serializeAttachmentForDb,
  type StorageAttachmentItem,
} from './attachmentItems'
import { profilesSupabase } from './profilesSupabase'

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
}

function normalizeJournalRow(data: Record<string, unknown>): DailyJournalRow {
  const parsed = parseJsonAttachmentItems(data.attachment_items)
  return {
    id: String(data.id),
    firebase_uid: String(data.firebase_uid ?? ''),
    journal_date: String(data.journal_date ?? ''),
    title: typeof data.title === 'string' ? data.title : String(data.title ?? ''),
    body: typeof data.body === 'string' ? data.body : String(data.body ?? ''),
    created_at: String(data.created_at ?? ''),
    updated_at: String(data.updated_at ?? ''),
    attachment_items: parsed ?? [],
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

/**
 * Returns today’s journal for this user, inserting a new row if none exists
 * (title `Journal of yyyy-mm-dd`, creator = firebase_uid).
 */
export async function getOrCreateTodayJournal(
  user: User,
): Promise<
  { ok: true; row: DailyJournalRow } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const uid = user.uid.trim()
  const dateKey = localJournalDateKey()
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
    message: error?.message ?? 'Could not create today’s journal.',
  }
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
): Promise<
  { ok: true; rows: DailyJournalRow[] } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const uid = firebaseUid.trim()
  const { data, error } = await profilesSupabase
    .from('daily_journals')
    .select('*')
    .eq('firebase_uid', uid)
    .order('journal_date', { ascending: false })

  if (error) {
    return { ok: false, message: error.message }
  }
  const rows = (data ?? []).map((d) =>
    normalizeJournalRow(d as Record<string, unknown>),
  )
  return { ok: true, rows }
}
