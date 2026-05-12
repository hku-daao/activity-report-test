/** Matches prior `app-root--wide` wrappers in `App.tsx` for session routes. */
export function isSessionWidePath(pathname: string): boolean {
  if (pathname === '/journal') return true
  if (pathname.startsWith('/journal/')) return true
  if (pathname === '/proactive/new') return true
  if (/^\/proactive\/[^/]+$/.test(pathname)) return true
  if (pathname === '/activity/new') return true
  if (/^\/activity\/[^/]+\/edit$/.test(pathname)) return true
  if (/^\/activity\/[^/]+$/.test(pathname) && pathname !== '/activity/reports') {
    return true
  }
  return false
}
