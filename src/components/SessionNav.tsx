import { useNavigate } from 'react-router-dom'

/** Staff directory display name (same source as the former “Your information” block). */
export function SessionUserBeforeLogout({ label }: { label: string | null }) {
  const text = label?.trim()
  if (!text) return null
  return (
    <span className="dashboard-session-user" title={text}>
      {text}
    </span>
  )
}

/** Browser-style back (not a link to home). On `/` the home screen omits this control. */
export function SessionBackButton() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      className="dashboard-back-btn"
      onClick={() => navigate(-1)}
      aria-label="Go back to the previous page"
    >
      ← Back
    </button>
  )
}
