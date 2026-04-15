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
          <strong>Supabase:</strong> Project → Settings → API → Project URL and
          anon public key.
        </li>
      </ul>
    </div>
  )
}
