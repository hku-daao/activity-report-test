import { accessSupabase } from './accessSupabase'

export type StaffRow = {
  id: number | string
  name: string | null
  email: string | null
  team_id: string | number | null
  app_id: string | number | null
  display_name: string | null
  director: boolean | string | number | null
}

export type TeamRow = {
  id: number | string
  team_id: string | number
  team_name: string | null
}

export type StaffDashboard = {
  staff: StaffRow
  team: TeamRow | null
  supervisors: StaffRow[]
  subordinates: StaffRow[]
}

/** Stable reference for hooks — do not use inline `[]` (new reference each render). */
export const EMPTY_SUBORDINATES: StaffRow[] = []

function normalizeKey(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

/**
 * Value used with `subordinate.supervisor_id` / `subordinate.subordinate_id`:
 * prefers `staff.app_id`; falls back to `staff.id` (UUID) when `app_id` is unset
 * so rows can reference either identifier.
 */
export function staffRelationshipKey(staff: StaffRow): string | null {
  return normalizeKey(staff.app_id) ?? normalizeKey(staff.id)
}

function displayLabel(s: StaffRow): string {
  const d = s.display_name?.trim()
  if (d) return d
  const n = s.name?.trim()
  if (n) return n
  return s.email ?? 'Unknown'
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Postgres uuid hex pattern for secondary lookup by `staff.id`. */
const UUID_HEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function dedupeStaff(rows: StaffRow[]): StaffRow[] {
  const map = new Map<string, StaffRow>()
  for (const r of rows) {
    map.set(String(r.id), r)
  }
  return [...map.values()]
}

/**
 * Loads `staff` rows for ids stored in `subordinate` (typically `staff.app_id`,
 * occasionally `staff.id` UUID depending on how keys were populated).
 */
async function fetchStaffForSubordinateKeys(
  rawIds: (string | number)[],
): Promise<StaffRow[]> {
  if (!accessSupabase) return []

  const keys = [
    ...new Set(
      rawIds.map((id) => normalizeKey(id)).filter((k): k is string => k != null),
    ),
  ]
  if (keys.length === 0) return []

  const { data: byApp, error: appErr } = await accessSupabase
    .from('staff')
    .select('*')
    .in('app_id', keys)

  if (appErr) {
    return []
  }

  let rows: StaffRow[] = [...((byApp ?? []) as StaffRow[])]

  function rowMatchesKey(r: StaffRow, k: string): boolean {
    return normalizeKey(r.app_id) === k || normalizeKey(r.id) === k
  }

  const satisfied = new Set<string>()
  for (const k of keys) {
    if (rows.some((r) => rowMatchesKey(r, k))) {
      satisfied.add(k)
    }
  }

  const stillNeeded = keys.filter((k) => !satisfied.has(k))
  const uuidKeys = stillNeeded.filter((k) => UUID_HEX.test(k))

  if (uuidKeys.length > 0) {
    const { data: byPk } = await accessSupabase
      .from('staff')
      .select('*')
      .in('id', uuidKeys)

    rows.push(...((byPk ?? []) as StaffRow[]))
  }

  return dedupeStaff(rows)
}

export async function loadStaffDashboard(
  loginEmail: string,
): Promise<
  | { ok: true; data: StaffDashboard }
  | { ok: false; reason: 'not_configured' | 'not_found' | 'error'; message?: string }
> {
  if (!accessSupabase) {
    return { ok: false, reason: 'not_configured' }
  }

  const normalized = normalizeEmail(loginEmail)

  const { data: staffRows, error: staffError } = await accessSupabase
    .from('staff')
    .select('*')
    .eq('email', normalized)

  if (staffError) {
    return {
      ok: false,
      reason: 'error',
      message: staffError.message,
    }
  }

  const staffList = (staffRows ?? []) as StaffRow[]
  if (staffList.length === 0) {
    const { data: fallback, error: fbErr } = await accessSupabase
      .from('staff')
      .select('*')
      .eq('email', loginEmail.trim())

    if (fbErr) {
      return { ok: false, reason: 'error', message: fbErr.message }
    }
    const fbList = (fallback ?? []) as StaffRow[]
    if (fbList.length === 0) {
      return { ok: false, reason: 'not_found' }
    }
    return buildDashboard(fbList[0])
  }

  return buildDashboard(staffList[0])
}

async function buildDashboard(
  staff: StaffRow,
): Promise<
  | { ok: true; data: StaffDashboard }
  | { ok: false; reason: 'error'; message?: string }
> {
  if (!accessSupabase) {
    return { ok: false, reason: 'error', message: 'Supabase client missing' }
  }

  let team: TeamRow | null = null
  const teamKey = normalizeKey(staff.team_id)
  if (teamKey) {
    const { data: teamRow, error: teamError } = await accessSupabase
      .from('team')
      .select('*')
      .eq('team_id', teamKey)
      .maybeSingle()

    if (teamError) {
      return { ok: false, reason: 'error', message: teamError.message }
    }
    team = teamRow as TeamRow | null
  }

  const relKey = staffRelationshipKey(staff)
  let supervisors: StaffRow[] = []
  let subordinates: StaffRow[] = []

  if (relKey) {
    const { data: supRows, error: supErr } = await accessSupabase
      .from('subordinate')
      .select('supervisor_id')
      .eq('subordinate_id', relKey)

    if (supErr) {
      return { ok: false, reason: 'error', message: supErr.message }
    }

    const supIds = [
      ...new Set(
        (supRows ?? [])
          .map((r: { supervisor_id: unknown }) => normalizeKey(r.supervisor_id))
          .filter((id): id is string => id != null),
      ),
    ]

    if (supIds.length > 0) {
      supervisors = await fetchStaffForSubordinateKeys(supIds)
      supervisors.sort((a, b) =>
        displayLabel(a).localeCompare(displayLabel(b), undefined, {
          sensitivity: 'base',
        }),
      )
    }

    const { data: subRows, error: subErr } = await accessSupabase
      .from('subordinate')
      .select('subordinate_id')
      .eq('supervisor_id', relKey)

    if (subErr) {
      return { ok: false, reason: 'error', message: subErr.message }
    }

    const subIds = [
      ...new Set(
        (subRows ?? [])
          .map((r: { subordinate_id: unknown }) => normalizeKey(r.subordinate_id))
          .filter((id): id is string => id != null),
      ),
    ]

    if (subIds.length > 0) {
      subordinates = await fetchStaffForSubordinateKeys(subIds)
      subordinates.sort((a, b) =>
        displayLabel(a).localeCompare(displayLabel(b), undefined, {
          sensitivity: 'base',
        }),
      )
    }
  }

  return {
    ok: true,
    data: {
      staff,
      team,
      supervisors,
      subordinates,
    },
  }
}

export function staffDisplayName(s: StaffRow): string {
  return displayLabel(s)
}

/** `name` field (full name); falls back to display name then email. For attending lists. */
export function staffFullName(s: StaffRow): string {
  const n = s.name?.trim()
  if (n) return n
  const d = s.display_name?.trim()
  if (d) return d
  return s.email ?? 'Unknown'
}
