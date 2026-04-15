import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, isFirebaseConfigured } from './lib/firebase'
import { AuthPage } from './components/AuthPage'
import { ConfigMissing } from './components/ConfigMissing'
import { Dashboard } from './components/Dashboard'
import './App.css'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(
    () => !isFirebaseConfigured() || auth === undefined,
  )

  useEffect(() => {
    if (!isFirebaseConfigured() || !auth) {
      return
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setReady(true)
    })
    return unsub
  }, [])

  if (!ready) {
    return (
      <div className="app-root">
        <p className="loading">Loading…</p>
      </div>
    )
  }

  if (!isFirebaseConfigured() || !auth) {
    return (
      <div className="app-root">
        <ConfigMissing />
      </div>
    )
  }

  return (
    <div className="app-root">
      {user ? <Dashboard user={user} /> : <AuthPage />}
    </div>
  )
}

export default App
