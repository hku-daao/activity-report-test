import type { User } from 'firebase/auth'
import {
  listStoragePathsFromItems,
  parseJsonAttachmentItems,
  serializeAttachmentForDb,
  type StorageAttachmentItem,
} from './attachmentItems'
import { fetchFirebaseUidsForEmails } from './profile'
import { profilesSupabase } from './profilesSupabase'
import type { StaffRow } from './staffAccess'

export type ProactiveAttachmentItem = StorageAttachmentItem

export type ProactiveInitiativeRow = {
  id: string
  firebase_uid: string
  title: string
  body: string
  created_at: string
  updated_at: string
  /** Normalized; empty if the column is missing. */
  attachment_items: ProactiveAttachmentItem[]
  /** Set when the entry is soft-deleted (still in DB). */
  deleted_at?: string | null
}

function normalizeInitiativeRow(
  data: Record<string, unknown>,
): ProactiveInitiativeRow {
  const parsed = parseJsonAttachmentItems(data.attachment_items)
  const {
    id,
    firebase_uid,
    title,
    body,
    created_at,
    updated_at,
    deleted_at,
  } = data
  return {
    id: String(id),
    firebase_uid: String(firebase_uid),
    title: typeof title === 'string' ? title : String(title ?? ''),
    body: typeof body === 'string' ? body : String(body ?? ''),
    created_at: String(created_at ?? ''),
    updated_at: String(updated_at ?? ''),
    attachment_items: parsed ?? [],
    deleted_at:
      deleted_at === null || deleted_at === undefined
        ? null
        : String(deleted_at),
  }
}

export { listStoragePathsFromItems }

export async function fetchInitiativeByIdForUser(
  initiativeId: string,
  firebaseUid: string,
): Promise<
  { ok: true; row: ProactiveInitiativeRow } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const id = initiativeId.trim()
  const uid = firebaseUid.trim()
  const { data, error } = await profilesSupabase
    .from('proactive_initiatives')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data) {
    return { ok: false, message: 'Entry not found.' }
  }
  const row = normalizeInitiativeRow(data as Record<string, unknown>)
  if (String(row.firebase_uid).trim() !== uid) {
    return { ok: false, message: 'You can only open your own entries.' }
  }
  return { ok: true, row }
}

/** Owner or a listed subordinate (supervisor view). */
export async function fetchInitiativeByIdForViewer(
  initiativeId: string,
  user: User,
  subordinates: StaffRow[],
): Promise<
  { ok: true; row: ProactiveInitiativeRow } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const id = initiativeId.trim()
  const { data, error } = await profilesSupabase
    .from('proactive_initiatives')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data) {
    return { ok: false, message: 'Entry not found.' }
  }
  const row = normalizeInitiativeRow(data as Record<string, unknown>)
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
  return { ok: false, message: 'You can only open your own entries.' }
}

export async function insertProactiveInitiative(
  user: User,
  title: string,
  body: string,
  attachmentItems: ProactiveAttachmentItem[] = [],
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const uid = user.uid.trim()
  const now = new Date().toISOString()
  const serialized = serializeAttachmentForDb(attachmentItems)
  const { data, error } = await profilesSupabase
    .from('proactive_initiatives')
    .insert({
      firebase_uid: uid,
      title: title.trim(),
      body,
      created_at: now,
      updated_at: now,
      attachment_items: serialized.length > 0 ? serialized : [],
    })
    .select('id')
    .maybeSingle()

  if (error) {
    return { ok: false, message: error.message }
  }
  if (!data?.id) {
    return { ok: false, message: 'Could not create entry.' }
  }
  return { ok: true, id: data.id as string }
}

export async function updateProactiveInitiative(
  initiativeId: string,
  firebaseUid: string,
  title: string,
  body: string,
  attachmentItems: ProactiveAttachmentItem[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const id = initiativeId.trim()
  const uid = firebaseUid.trim()
  const now = new Date().toISOString()
  const serialized = serializeAttachmentForDb(attachmentItems)

  const { data, error } = await profilesSupabase
    .from('proactive_initiatives')
    .update({
      title: title.trim(),
      body,
      updated_at: now,
      attachment_items: serialized.length > 0 ? serialized : [],
    })
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
        'Could not save (no row updated). Check proactive_initiatives table and RLS.',
    }
  }
  return { ok: true }
}

export async function listProactiveInitiativesForUser(
  firebaseUid: string,
  options?: { includeDeleted?: boolean },
): Promise<
  { ok: true; rows: ProactiveInitiativeRow[] } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const uid = firebaseUid.trim()
  let q = profilesSupabase
    .from('proactive_initiatives')
    .select('*')
    .eq('firebase_uid', uid)
    .order('updated_at', { ascending: false })
  if (!options?.includeDeleted) {
    q = q.is('deleted_at', null)
  }
  const { data, error } = await q

  if (error) {
    return { ok: false, message: error.message }
  }
  const rows = (data ?? []).map((d) =>
    normalizeInitiativeRow(d as Record<string, unknown>),
  )
  return { ok: true, rows }
}

export async function listProactiveInitiativesForFirebaseUids(
  firebaseUids: string[],
  options?: { includeDeleted?: boolean },
): Promise<
  { ok: true; rows: ProactiveInitiativeRow[] } | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const uids = [...new Set(firebaseUids.map((u) => u.trim()).filter(Boolean))]
  if (uids.length === 0) {
    return { ok: true, rows: [] }
  }
  let q = profilesSupabase
    .from('proactive_initiatives')
    .select('*')
    .in('firebase_uid', uids)
    .order('updated_at', { ascending: false })
  if (!options?.includeDeleted) {
    q = q.is('deleted_at', null)
  }
  const { data, error } = await q

  if (error) {
    return { ok: false, message: error.message }
  }
  const rows = (data ?? []).map((d) =>
    normalizeInitiativeRow(d as Record<string, unknown>),
  )
  return { ok: true, rows }
}

export async function softDeleteProactiveInitiative(
  initiativeId: string,
  firebaseUid: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const id = initiativeId.trim()
  const uid = firebaseUid.trim()
  const now = new Date().toISOString()
  const { data, error } = await profilesSupabase
    .from('proactive_initiatives')
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
        'Could not delete (no row updated). The entry may already be deleted, or the deleted_at column is missing — run supabase_proactive_initiatives.sql on your database.',
    }
  }
  return { ok: true }
}

export async function restoreProactiveInitiative(
  initiativeId: string,
  firebaseUid: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!profilesSupabase) {
    return { ok: false, message: 'Profiles Supabase is not configured.' }
  }
  const id = initiativeId.trim()
  const uid = firebaseUid.trim()
  const now = new Date().toISOString()
  const { data, error } = await profilesSupabase
    .from('proactive_initiatives')
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
