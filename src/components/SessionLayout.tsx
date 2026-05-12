import { useCallback, useEffect, useId, useState } from 'react'
import { signOut } from 'firebase/auth'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { auth } from '../lib/firebase'
import { isSessionWidePath } from '../lib/sessionWidePaths'

export function SessionLayout() {
  const location = useLocation()
  const wide = isSessionWidePath(location.pathname)
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const feedbackUrl = (
    import.meta.env.VITE_FEEDBACK_FORM_URL as string | undefined
  )?.trim()

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    close()
  }, [location.pathname, close])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const firebaseAuth = auth
  if (!firebaseAuth) {
    return null
  }

  const handleSignOut = () => {
    close()
    void signOut(firebaseAuth)
  }

  return (
    <div
      className={`app-root app-root--session app-root--with-session-menu${
        wide ? ' app-root--wide' : ''
      }`}
    >
      <button
        type="button"
        className="session-menu-trigger"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="session-menu-trigger-bars" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>

      <div
        className={`session-sidebar-backdrop${open ? ' is-visible' : ''}`}
        aria-hidden={!open}
        onClick={close}
      />

      <aside
        id={panelId}
        className={`session-sidebar${open ? ' is-open' : ''}`}
        aria-hidden={!open}
      >
        <div className="session-sidebar-header">
          <span className="session-sidebar-title">Menu</span>
          <button
            type="button"
            className="session-sidebar-close"
            aria-label="Close menu"
            onClick={close}
          >
            ×
          </button>
        </div>
        <nav className="session-sidebar-nav" aria-label="App menu">
          <Link to="/" className="session-sidebar-link" onClick={close}>
            Home
          </Link>
          {feedbackUrl ? (
            <a
              href={feedbackUrl}
              className="session-sidebar-link"
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
            >
              Feedback
            </a>
          ) : null}
          <button
            type="button"
            className="session-sidebar-link session-sidebar-link--danger"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </nav>
      </aside>

      <Outlet />
    </div>
  )
}
