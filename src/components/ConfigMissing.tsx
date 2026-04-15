export function ConfigMissing() {
  return (
    <div className="auth-shell">
      <header className="auth-header">
        <h1 className="auth-title">Configuration needed</h1>
        <p className="auth-subtitle">
          Add Firebase and Supabase variables to a <code>.env</code> file in the
          project root (see <code>.env.example</code>), then restart the dev
          server.
        </p>
      </header>
      <ul className="config-list">
        <li>
          <strong>Firebase:</strong> Console → Project settings → Your apps →
          Web app config.
        </li>
        <li>
          <strong>Access list Supabase:</strong>{' '}
          <code>VITE_ACCESS_SUPABASE_URL</code> and{' '}
          <code>VITE_ACCESS_SUPABASE_ANON_KEY</code> — tables{' '}
          <code>staff</code>, <code>team</code>, <code>subordinate</code>.
        </li>
        <li>
          <strong>Profiles Supabase:</strong>{' '}
          <code>VITE_PROFILES_SUPABASE_URL</code> and{' '}
          <code>VITE_PROFILES_SUPABASE_ANON_KEY</code> — table{' '}
          <code>profiles</code> (Firebase UID sync).
        </li>
      </ul>
    </div>
  )
}
