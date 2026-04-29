import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { isAccessSupabaseConfigured } from '../lib/accessSupabase'
import {
  loadStaffDashboard,
  type StaffDashboard,
} from '../lib/staffAccess'

export type StaffDashboardLoadState =
  | { status: 'loading' }
  | { status: 'denied'; reason: 'not_found' | 'not_configured' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: StaffDashboard }

export function useStaffDashboardState(user: User): {
  email: string
  accessOk: boolean
  state: StaffDashboardLoadState
} {
  const email = user.email ?? ''
  const accessOk = isAccessSupabaseConfigured()
  const [state, setState] = useState<StaffDashboardLoadState>(() =>
    accessOk && email
      ? { status: 'loading' }
      : {
          status: 'denied',
          reason: 'not_configured',
        },
  )

  useEffect(() => {
    if (!accessOk || !email) {
      return
    }
    let cancelled = false
    void loadStaffDashboard(email).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setState({ status: 'ready', data: result.data })
        return
      }
      if (result.reason === 'not_found') {
        setState({ status: 'denied', reason: 'not_found' })
        return
      }
      if (result.reason === 'not_configured') {
        setState({ status: 'denied', reason: 'not_configured' })
        return
      }
      setState({
        status: 'error',
        message: result.message ?? 'Could not load your profile.',
      })
    })
    return () => {
      cancelled = true
    }
  }, [user, accessOk, email])

  return { email, accessOk, state }
}
