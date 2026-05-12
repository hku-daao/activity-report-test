import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  distinctTeamIdsFromPool,
  filterStaffPoolByTeams,
  poolTeamRowsFromDistinctIds,
  resolveScopeFirebaseUids,
  staffPoolForSupervisor,
  type SupervisorScopeResolution,
} from '../lib/supervisorScope'
import { EMPTY_SUBORDINATES, type StaffRow, type TeamRow } from '../lib/staffAccess'

export function useSupervisorScope(
  user: User,
  viewerStaff: StaffRow,
  subordinates: StaffRow[],
  allTeams: TeamRow[],
) {
  /** Avoid unstable `[]` from callers (new reference each render ⇒ infinite fetch loops). */
  const subs =
    subordinates.length === 0 ? EMPTY_SUBORDINATES : subordinates

  const hasSubordinates = subs.length > 0
  const fullPool = useMemo(
    () => staffPoolForSupervisor(viewerStaff, subs),
    [viewerStaff, subs],
  )
  const fullPoolTeamIds = useMemo(
    () => distinctTeamIdsFromPool(fullPool),
    [fullPool],
  )
  const poolTeamRows = useMemo(
    () => poolTeamRowsFromDistinctIds(fullPoolTeamIds, allTeams),
    [fullPoolTeamIds, allTeams],
  )

  const [includeSubordinates, setIncludeSubordinates] = useState(true)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])

  useEffect(() => {
    setSelectedTeamIds(poolTeamRows.map((t) => String(t.team_id)))
  }, [poolTeamRows])

  const staffAfterTeams = useMemo(
    () =>
      filterStaffPoolByTeams(
        fullPool,
        selectedTeamIds,
        fullPoolTeamIds,
      ),
    [fullPool, selectedTeamIds, fullPoolTeamIds],
  )

  useEffect(() => {
    setSelectedStaffIds(staffAfterTeams.map((s) => String(s.id)))
  }, [staffAfterTeams])

  const resolveUids = useCallback(async () => {
    const resolution: SupervisorScopeResolution = {
      includeSubordinates: hasSubordinates && includeSubordinates,
      selectedTeamIds,
      selectedStaffIds,
      fullPoolTeamIds,
    }
    return resolveScopeFirebaseUids(
      user,
      viewerStaff,
      subs,
      resolution,
    )
  }, [
    user,
    viewerStaff,
    subs,
    hasSubordinates,
    includeSubordinates,
    selectedTeamIds,
    selectedStaffIds,
    fullPoolTeamIds,
  ])

  const toggleTeam = useCallback((teamId: string) => {
    const id = String(teamId)
    setSelectedTeamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [])

  const selectAllTeams = useCallback(() => {
    setSelectedTeamIds(poolTeamRows.map((t) => String(t.team_id)))
  }, [poolTeamRows])

  const toggleStaff = useCallback((staffId: string) => {
    const id = String(staffId)
    setSelectedStaffIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [])

  const selectAllStaff = useCallback(() => {
    setSelectedStaffIds(staffAfterTeams.map((s) => String(s.id)))
  }, [staffAfterTeams])

  return {
    hasSubordinates,
    includeSubordinates,
    setIncludeSubordinates,
    poolTeamRows,
    fullPoolTeamIds,
    selectedTeamIds,
    staffAfterTeams,
    selectedStaffIds,
    toggleTeam,
    selectAllTeams,
    toggleStaff,
    selectAllStaff,
    resolveUids,
  }
}
