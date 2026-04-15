import { accessSupabase } from './accessSupabase'
import { profilesSupabase } from './profilesSupabase'
import type { StaffRow, TeamRow } from './staffAccess'
import { staffDisplayName, staffFullName } from './staffAccess'

/** Supports single team_id or comma-separated team ids on staff.team_id. */
export function parseStaffTeamIds(staff: StaffRow): (string | number)[] {
  const raw = staff.team_id
  if (raw == null || raw === '') return []
  if (typeof raw === 'string' && raw.includes(',')) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return [raw]
}

export async function fetchTeamsAlphabetical(): Promise<
  { ok: true; teams: TeamRow[] } | { ok: false; message: string }
> {
  if (!accessSupabase) {
    return { ok: false, message: 'Access Supabase is not configured' }
  }
  const { data, error } = await accessSupabase
    .from('team')
    .select('*')
    .order('team_name', { ascending: true, nullsFirst: false })

  if (error) {
    return { ok: false, message: error.message }
  }
  return { ok: true, teams: (data ?? []) as TeamRow[] }
}

export type CreatorDirectoryByUid = {
  teamIdsByUid: Map<string, string[]>
  /** Creator label for dashboard: full name from staff when available, else email. */
  fullNameByUid: Map<string, string>
}

/**
 * For each Firebase UID, resolve team id(s) and display name via profiles → staff.
 * Used for dashboard team filter, creator label, and search.
 */
export async function fetchCreatorDirectoryByFirebaseUids(
  firebaseUids: string[],
): Promise<CreatorDirectoryByUid> {
  const teamIdsByUid = new Map<string, string[]>()
  const fullNameByUid = new Map<string, string>()
  if (!profilesSupabase || !accessSupabase || firebaseUids.length === 0) {
    return { teamIdsByUid, fullNameByUid }
  }

  const unique = [...new Set(firebaseUids.map((u) => u.trim()).filter(Boolean))]
  if (unique.length === 0) return { teamIdsByUid, fullNameByUid }

  const { data: profileRows, error: profileError } = await profilesSupabase
    .from('profiles')
    .select('firebase_uid, email')
    .in('firebase_uid', unique)

  if (profileError || !profileRows?.length) {
    return { teamIdsByUid, fullNameByUid }
  }

  const emails = [
    ...new Set(
      (profileRows as { firebase_uid: string; email: string | null }[])
        .map((p) => p.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e)),
    ),
  ]
  if (emails.length === 0) return { teamIdsByUid, fullNameByUid }

  const { data: staffRows, error: staffError } = await accessSupabase
    .from('staff')
    .select('email, team_id, name, display_name')
    .in('email', emails)

  const emailToStaff = new Map<string, StaffRow>()
  if (!staffError && staffRows?.length) {
    for (const s of staffRows as StaffRow[]) {
      const em = s.email?.trim().toLowerCase()
      if (em && !emailToStaff.has(em)) {
        emailToStaff.set(em, s)
      }
    }
  }

  for (const p of profileRows as {
    firebase_uid: string
    email: string | null
  }[]) {
    const uid = p.firebase_uid?.trim()
    const em = p.email?.trim().toLowerCase()
    if (!uid || !em) continue

    const staff = emailToStaff.get(em)
    if (staff) {
      fullNameByUid.set(uid, staffFullName(staff))
      const ids = parseStaffTeamIds(staff).map((id) => String(id))
      if (ids.length > 0) {
        teamIdsByUid.set(uid, ids)
      }
    } else {
      const rawEmail = p.email?.trim()
      if (rawEmail) {
        fullNameByUid.set(uid, rawEmail)
      }
    }
  }

  return { teamIdsByUid, fullNameByUid }
}

/**
 * For each Firebase UID, resolve team id(s) from the access `staff` table via
 * profiles (email). Used to filter activity reports by the creator’s team, not
 * the report’s internal team_filter field.
 */
export async function fetchCreatorTeamIdsByFirebaseUids(
  firebaseUids: string[],
): Promise<Map<string, string[]>> {
  const { teamIdsByUid } = await fetchCreatorDirectoryByFirebaseUids(firebaseUids)
  return teamIdsByUid
}

/** Whether the report’s creator belongs to any of the selected dashboard teams. */
export function reportMatchesCreatorTeamFilter(
  creatorTeamIds: string[] | undefined,
  selectedTeamIds: 'all' | string[],
): boolean {
  if (selectedTeamIds === 'all') return true
  if (selectedTeamIds.length === 0) return false
  if (!creatorTeamIds || creatorTeamIds.length === 0) return false
  return creatorTeamIds.some((tid) =>
    selectedTeamIds.some((s) => String(s) === String(tid)),
  )
}

export async function fetchAllStaff(): Promise<
  { ok: true; staff: StaffRow[] } | { ok: false; message: string }
> {
  if (!accessSupabase) {
    return { ok: false, message: 'Access Supabase is not configured' }
  }
  const { data, error } = await accessSupabase.from('staff').select('*')

  if (error) {
    return { ok: false, message: error.message }
  }
  const list = (data ?? []) as StaffRow[]
  list.sort((a, b) =>
    staffDisplayName(a).localeCompare(staffDisplayName(b), undefined, {
      sensitivity: 'base',
    }),
  )
  return { ok: true, staff: list }
}

function staffBelongsToTeam(s: StaffRow, teamId: string): boolean {
  const ids = parseStaffTeamIds(s)
  return ids.some((id) => String(id) === String(teamId))
}

export function filterStaffByTeam(
  staffList: StaffRow[],
  teamFilter: '__all__' | string,
  excludeStaffId: StaffRow['id'] | null,
): StaffRow[] {
  return staffList.filter((s) => {
    if (excludeStaffId != null && String(s.id) === String(excludeStaffId)) {
      return false
    }
    if (teamFilter === '__all__') return true
    return staffBelongsToTeam(s, teamFilter)
  })
}

/** Default team value for dropdown: first of user's teams in alphabetical order by team name. */
export function defaultTeamFilterValue(
  userTeamIds: (string | number)[],
  teams: TeamRow[],
): '__all__' | string {
  if (userTeamIds.length === 0) {
    return '__all__'
  }
  const resolved = userTeamIds
    .map((id) => teams.find((t) => String(t.team_id) === String(id)))
    .filter((t): t is TeamRow => t != null)
    .sort((a, b) =>
      (a.team_name ?? '').localeCompare(b.team_name ?? '', undefined, {
        sensitivity: 'base',
      }),
    )
  if (resolved.length === 0) {
    return String(userTeamIds[0])
  }
  return String(resolved[0].team_id)
}
