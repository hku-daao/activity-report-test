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
  if (staff.team_id != null && staff.team_id !== '') {
    const { data: teamRow, error: teamError } = await accessSupabase
      .from('team')
      .select('*')
      .eq('team_id', staff.team_id)
      .maybeSingle()

    if (teamError) {
      return { ok: false, reason: 'error', message: teamError.message }
    }
    team = teamRow as TeamRow | null
  }

  const appId = staff.app_id
  let supervisors: StaffRow[] = []
  let subordinates: StaffRow[] = []

  if (appId != null && appId !== '') {
    const { data: supRows, error: supErr } = await accessSupabase
      .from('subordinate')
      .select('supervisor_id')
      .eq('subordinate_id', appId)

    if (supErr) {
      return { ok: false, reason: 'error', message: supErr.message }
    }

    const supIds = [
      ...new Set(
        (supRows ?? [])
          .map((r: { supervisor_id: unknown }) => r.supervisor_id)
          .filter((id) => id != null && id !== ''),
      ),
    ] as (string | number)[]

    if (supIds.length > 0) {
      const { data: supStaff, error: supStaffErr } = await accessSupabase
        .from('staff')
        .select('*')
        .in('app_id', supIds)

      if (supStaffErr) {
        return { ok: false, reason: 'error', message: supStaffErr.message }
      }
      supervisors = (supStaff ?? []) as StaffRow[]
      supervisors.sort((a, b) =>
        displayLabel(a).localeCompare(displayLabel(b), undefined, {
          sensitivity: 'base',
        }),
      )
    }

    const { data: subRows, error: subErr } = await accessSupabase
      .from('subordinate')
      .select('subordinate_id')
      .eq('supervisor_id', appId)

    if (subErr) {
      return { ok: false, reason: 'error', message: subErr.message }
    }

    const subIds = [
      ...new Set(
        (subRows ?? [])
          .map((r: { subordinate_id: unknown }) => r.subordinate_id)
          .filter((id) => id != null && id !== ''),
      ),
    ] as (string | number)[]

    if (subIds.length > 0) {
      const { data: subStaff, error: subStaffErr } = await accessSupabase
        .from('staff')
        .select('*')
        .in('app_id', subIds)

      if (subStaffErr) {
        return { ok: false, reason: 'error', message: subStaffErr.message }
      }
      subordinates = (subStaff ?? []) as StaffRow[]
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
