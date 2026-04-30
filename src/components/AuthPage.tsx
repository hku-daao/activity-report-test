import { useState, type FormEvent } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { AppLogo } from './AppLogo'

export function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const firebaseAuth = auth
  if (!firebaseAuth) {
    return null
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : ''
      setError(friendlyAuthError(code, err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <AppLogo variant="auth" />
        <h1 className="auth-title">Activity Report</h1>
      </header>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            disabled={loading}
          />
        </label>

        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Please wait…' : 'Log in'}
        </button>
      </form>

      {error ? <p className="feedback error">{error}</p> : null}
    </div>
  )
}

function friendlyAuthError(code: string, err: unknown): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Incorrect email or password.'
    case 'auth/user-not-found':
      return 'No account found for that email.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.'
    default:
      if (err instanceof Error) return err.message
      return 'Something went wrong. Please try again.'
  }
}
