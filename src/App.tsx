import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { auth, isFirebaseConfigured } from './lib/firebase'
import { AuthPage } from './components/AuthPage'
import { ConfigMissing } from './components/ConfigMissing'
import { ActivityReportViewPage } from './components/ActivityReportViewPage'
import { CreateActivityReportPage } from './components/CreateActivityReportPage'
import { ActivityReportsListPage } from './components/ActivityReportsListPage'
import { Dashboard } from './components/Dashboard'
import { DailyJournalChooseDatePage } from './components/DailyJournalChooseDatePage'
import { DailyJournalPage } from './components/DailyJournalPage'
import { JournalsListPage } from './components/JournalsListPage'
import { ProactiveInitiativeEditorPage } from './components/ProactiveInitiativeEditorPage'
import { ProactiveInitiativesListPage } from './components/ProactiveInitiativesListPage'
import { SessionLayout } from './components/SessionLayout'
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
    <BrowserRouter>
      <Routes>
        {!user ? (
          <>
            <Route
              path="/"
              element={
                <div className="app-root">
                  <AuthPage />
                </div>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <Route element={<SessionLayout />}>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route
              path="/journal"
              element={<DailyJournalChooseDatePage user={user} />}
            />
            <Route
              path="/journal/today"
              element={<Navigate to="/journal" replace />}
            />
            <Route
              path="/journal/:journalId"
              element={<DailyJournalPage user={user} />}
            />
            <Route
              path="/journals"
              element={<JournalsListPage user={user} />}
            />
            <Route
              path="/proactive/new"
              element={<ProactiveInitiativeEditorPage user={user} />}
            />
            <Route
              path="/proactive/:initiativeId"
              element={<ProactiveInitiativeEditorPage user={user} />}
            />
            <Route
              path="/proactive"
              element={<ProactiveInitiativesListPage user={user} />}
            />
            <Route
              path="/activity/reports"
              element={<ActivityReportsListPage user={user} />}
            />
            <Route
              path="/activity/new"
              element={<CreateActivityReportPage user={user} />}
            />
            <Route
              path="/activity/:id/edit"
              element={<CreateActivityReportPage user={user} />}
            />
            <Route
              path="/activity/:id"
              element={<ActivityReportViewPage user={user} />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  )
}

export default App
