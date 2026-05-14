/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_ACCESS_SUPABASE_URL?: string
  readonly VITE_ACCESS_SUPABASE_ANON_KEY?: string
  readonly VITE_PROFILES_SUPABASE_URL?: string
  readonly VITE_PROFILES_SUPABASE_ANON_KEY?: string
  /** Max rows per page on list dashboards (integer). Default 20; clamped 1–200. */
  readonly VITE_DASHBOARD_PAGE_SIZE?: string
  /** Optional. When set, the session menu shows a Feedback link to this URL. */
  readonly VITE_FEEDBACK_FORM_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
