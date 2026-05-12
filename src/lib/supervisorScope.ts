import type { User } from 'firebase/auth'
import { fetchFirebaseUidsForEmails } from './profile'
import { parseStaffTeamIds } from './teamsAndStaff'
import type { StaffRow, TeamRow } from './staffAccess'

/** Viewer plus direct subordinates from `subordinate` / `staff` (deduped by staff id). */
export function staffPoolForSupervisor(
  viewer: StaffRow,
  subordinates: StaffRow[],
): StaffRow[] {
  const map = new Map<string, StaffRow>()
  map.set(String(viewer.id), viewer)
  for (const s of subordinates) {
    map.set(String(s.id), s)
  }
  return [...map.values()]
}

export function distinctTeamIdsFromPool(pool: StaffRow[]): string[] {
  const set = new Set<string>()
  for (const s of pool) {
    for (const tid of parseStaffTeamIds(s)) {
      set.add(String(tid))
    }
  }
  return [...set]
}

/** Team rows that appear in the pool, sorted by name. */
export function poolTeamRowsFromDistinctIds(
  distinctIds: string[],
  allTeams: TeamRow[],
): TeamRow[] {
  const rows = distinctIds
    .map((id) => allTeams.find((t) => String(t.team_id) === String(id)))
    .filter((t): t is TeamRow => t != null)
  rows.sort((a, b) =>
    (a.team_name ?? '').localeCompare(b.team_name ?? '', undefined, {
      sensitivity: 'base',
    }),
  )
  return rows
}

function isFullSelection(selected: string[], fullSet: string[]): boolean {
  if (fullSet.length === 0) return true
  const sel = new Set(selected.map(String))
  return fullSet.every((id) => sel.has(String(id)))
}

/** Narrow staff pool by team multiselect; “all teams” = no narrowing. */
export function filterStaffPoolByTeams(
  pool: StaffRow[],
  selectedTeamIds: string[],
  allPoolTeamIds: string[],
): StaffRow[] {
  if (
    allPoolTeamIds.length === 0 ||
    selectedTeamIds.length === 0 ||
    isFullSelection(selectedTeamIds, allPoolTeamIds)
  ) {
    return pool
  }
  const sel = new Set(selectedTeamIds.map(String))
  return pool.filter((s) =>
    parseStaffTeamIds(s).some((tid) => sel.has(String(tid))),
  )
}

/** Narrow by selected staff rows; “all” = no narrowing. */
export function filterStaffPoolByStaffIds(
  pool: StaffRow[],
  selectedStaffIds: string[],
): StaffRow[] {
  const poolIds = pool.map((s) => String(s.id))
  if (
    selectedStaffIds.length === 0 ||
    isFullSelection(selectedStaffIds, poolIds)
  ) {
    return pool
  }
  const sel = new Set(selectedStaffIds.map(String))
  return pool.filter((s) => sel.has(String(s.id)))
}

export type SupervisorScopeResolution = {
  includeSubordinates: boolean
  selectedTeamIds: string[]
  selectedStaffIds: string[]
  /** Distinct team ids from viewer + subordinates (for “all teams” checks). */
  fullPoolTeamIds: string[]
}

/**
 * Resolves Firebase UIDs for dashboard queries from access-list staff + profiles.
 * When `includeSubordinates` is false or there are no subordinates, returns `[user.uid]`.
 */
export async function resolveScopeFirebaseUids(
  user: User,
  viewerStaff: StaffRow,
  subordinates: StaffRow[],
  opts: SupervisorScopeResolution,
): Promise<string[]> {
  if (!opts.includeSubordinates || subordinates.length === 0) {
    return [user.uid]
  }

  let pool = staffPoolForSupervisor(viewerStaff, subordinates)
  pool = filterStaffPoolByTeams(
    pool,
    opts.selectedTeamIds,
    opts.fullPoolTeamIds,
  )
  pool = filterStaffPoolByStaffIds(pool, opts.selectedStaffIds)

  const emails = pool
    .map((s) => s.email?.trim().toLowerCase())
    .filter((e): e is string => Boolean(e))

  const uids = await fetchFirebaseUidsForEmails(emails)
  const out = new Set<string>(uids)
  const userEmail = user.email?.trim().toLowerCase()
  for (const s of pool) {
    const em = s.email?.trim().toLowerCase()
    if (em && userEmail && em === userEmail) {
      out.add(user.uid)
    }
  }
  return [...out]
}
