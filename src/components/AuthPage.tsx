import { useState, type FormEvent } from 'react'
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '../lib/firebase'

type Mode = 'login' | 'signup' | 'reset'

export function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const firebaseAuth = auth
  if (!firebaseAuth) {
    return null
  }

  const resetFeedback = () => {
    setMessage(null)
    setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    resetFeedback()
    setLoading(true)
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)
      } else if (mode === 'signup') {
        await createUserWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password,
        )
      } else {
        await sendPasswordResetEmail(firebaseAuth, email.trim())
        setMessage('Check your inbox for a password reset link.')
      }
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

  const showPassword = mode !== 'reset'

  return (
    <div className="auth-shell">
      <header className="auth-header">
        <h1 className="auth-title">Activity Report</h1>
        <p className="auth-subtitle">
          Sign in with Firebase. Your data lives in Supabase.
        </p>
      </header>

      <nav className="auth-modes" aria-label="Authentication options">
        <button
          type="button"
          className={mode === 'login' ? 'is-active' : ''}
          onClick={() => {
            setMode('login')
            resetFeedback()
          }}
        >
          Log in
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'is-active' : ''}
          onClick={() => {
            setMode('signup')
            resetFeedback()
          }}
        >
          Create account
        </button>
        <button
          type="button"
          className={mode === 'reset' ? 'is-active' : ''}
          onClick={() => {
            setMode('reset')
            resetFeedback()
          }}
        >
          Reset password
        </button>
      </nav>

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
        {showPassword ? (
          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
            />
          </label>
        ) : null}

        <button type="submit" className="auth-submit" disabled={loading}>
          {loading
            ? 'Please wait…'
            : mode === 'login'
              ? 'Log in'
              : mode === 'signup'
                ? 'Create account'
                : 'Send reset email'}
        </button>
      </form>

      {message ? <p className="feedback success">{message}</p> : null}
      {error ? <p className="feedback error">{error}</p> : null}
    </div>
  )
}

function friendlyAuthError(code: string, err: unknown): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'That email is already registered. Try logging in instead.'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Incorrect email or password.'
    case 'auth/weak-password':
      return 'Use a stronger password (at least 6 characters).'
    case 'auth/user-not-found':
      return 'No account found for that email.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.'
    default:
      if (err instanceof Error) return err.message
      return 'Something went wrong. Please try again.'
  }
}
