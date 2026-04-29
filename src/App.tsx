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
import { DailyJournalPage } from './components/DailyJournalPage'
import { JournalsListPage } from './components/JournalsListPage'
import { ProactiveInitiativeEditorPage } from './components/ProactiveInitiativeEditorPage'
import { ProactiveInitiativesListPage } from './components/ProactiveInitiativesListPage'
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
        <Route
          path="/"
          element={
            <div className={user ? 'app-root app-root--session' : 'app-root'}>
              {user ? <Dashboard user={user} /> : <AuthPage />}
            </div>
          }
        />
        <Route
          path="/journal/today"
          element={
            user ? (
              <div className="app-root app-root--session app-root--wide">
                <DailyJournalPage user={user} />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/journal/:journalId"
          element={
            user ? (
              <div className="app-root app-root--session app-root--wide">
                <DailyJournalPage user={user} />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/journals"
          element={
            user ? (
              <div className="app-root app-root--session">
                <JournalsListPage user={user} />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/proactive/new"
          element={
            user ? (
              <div className="app-root app-root--session app-root--wide">
                <ProactiveInitiativeEditorPage user={user} />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/proactive/:initiativeId"
          element={
            user ? (
              <div className="app-root app-root--session app-root--wide">
                <ProactiveInitiativeEditorPage user={user} />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/proactive"
          element={
            user ? (
              <div className="app-root app-root--session">
                <ProactiveInitiativesListPage user={user} />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/activity/reports"
          element={
            user ? (
              <div className="app-root app-root--session">
                <ActivityReportsListPage user={user} />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/activity/new"
          element={
            user ? (
              <div className="app-root app-root--session app-root--wide">
                <CreateActivityReportPage user={user} />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/activity/:id/edit"
          element={
            user ? (
              <div className="app-root app-root--session app-root--wide">
                <CreateActivityReportPage user={user} />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/activity/:id"
          element={
            user ? (
              <div className="app-root app-root--session app-root--wide">
                <ActivityReportViewPage user={user} />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
