import { accessSupabase } from './accessSupabase'
import type { StaffRow, TeamRow } from './staffAccess'
import { staffDisplayName } from './staffAccess'

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
