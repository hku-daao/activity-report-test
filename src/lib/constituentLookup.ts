import { profilesSupabase } from './profilesSupabase'

/** Row returned from `search_v_query_constituent` RPC. */
export type ConstituentLookupRow = {
  lookupid: string
  display_name: string
  /** CRM fields for “View details” in the multiple-match dialog (from SQL jsonb). */
  detail: Record<string, unknown> | null
  /** Trigram-based match quality (0–100), best-first when returned by RPC. */
  match_score?: number
}

function parseRpcNumericScore(v: unknown): number | undefined {
  if (v == null) return undefined
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = Number.parseFloat(String(v))
  return Number.isFinite(n) ? n : undefined
}

const RPC_NAME = 'search_v_query_constituent'

/** Must match SQL default for `p_limit`; sending explicitly avoids PostgREST overload ambiguity (e.g. PGRST203). */
const RPC_DEFAULT_LIMIT = 25

function rpcErrorSummary(eg: {
  message?: string
  details?: string
  hint?: string
  code?: string
}): string {
  return [eg.code && `code ${eg.code}`, eg.message, eg.details, eg.hint]
    .filter(Boolean)
    .join(' — ')
}

/** PostgREST / Postgres signals that the RPC is missing, overloaded, or out of sync with the cache. */
function isLikelyMissingRpcOrStaleCache(eg: {
  message?: string
  code?: string
  details?: string
}): boolean {
  const msg = [eg.message, eg.details].filter(Boolean).join(' ')
  const code = eg.code ?? ''
  if (code === '42883') return true
  if (code === 'PGRST202' || code === 'PGRST203' || code === 'PGRST204') return true
  if (/could not find.*function public\.search_v_query_constituent|function public\.search_v_query_constituent.*does not exist/i.test(msg))
    return true
  return false
}

/**
 * Searches the CRM view (wrapped by the RPC). Last name matches **KEYNAME**; first name matches
 * **FIRSTNAME** or **MIDDLENAME**; or the combined name matches **NICKNAME**. Pass honorific
 * `title` separately; the RPC blends CRM title into the score when provided.
 */
export async function searchVQueryConstituent(
  firstName: string,
  lastName: string,
  options?: { title?: string },
): Promise<
  | { ok: true; rows: ConstituentLookupRow[] }
  | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return {
      ok: false,
      message: 'Supabase is not configured.',
    }
  }
  const f = firstName.trim()
  const l = lastName.trim()
  const t = (options?.title ?? '').trim()
  if (!f && !l) {
    return { ok: false, message: 'Enter a first or last name before using Lookup.' }
  }

  const { data, error } = await profilesSupabase.rpc(RPC_NAME, {
    p_first: f,
    p_last: l,
    p_title: t,
    p_limit: RPC_DEFAULT_LIMIT,
  })

  if (error) {
    const eg = error as { message: string; details?: string; hint?: string; code?: string }
    const summary = rpcErrorSummary(eg)

    if (isLikelyMissingRpcOrStaleCache(eg)) {
      const pgHint =
        /similarity|pg_trgm|\b%\s*operator|undefined_function/i.test(summary)
          ? ' If the detail mentions similarity/pg_trgm, redeploy `supabase_constituent_lookup.sql` (helpers need `search_path` including the `extensions` schema on Supabase). '
          : ' '
      return {
        ok: false,
        message: `Constituent lookup failed (${summary}).${pgHint}Confirm VITE_PROFILES_SUPABASE_URL matches the project where you ran the SQL. Try NOTIFY pgrst, 'reload schema'; ensure search_v_query_constituent exists and GRANT EXECUTE applies to anon.`,
      }
    }
    return {
      ok: false,
      message: `${summary} If you recently changed the function, run in Supabase SQL: NOTIFY pgrst, 'reload schema';`,
    }
  }

  if (!data || !Array.isArray(data)) {
    return { ok: true, rows: [] }
  }

  const rows: ConstituentLookupRow[] = (data as {
    lookupid?: unknown
    display_name?: unknown
    detail?: unknown
    match_score?: unknown
  }[])
    .map((r) => {
      let detail: Record<string, unknown> | null = null
      if (r.detail != null && typeof r.detail === 'object' && !Array.isArray(r.detail)) {
        detail = r.detail as Record<string, unknown>
      } else if (r.detail != null && typeof r.detail === 'string') {
        try {
          const p = JSON.parse(r.detail) as unknown
          if (p && typeof p === 'object' && !Array.isArray(p)) {
            detail = p as Record<string, unknown>
          }
        } catch {
          detail = null
        }
      }
      return {
        lookupid: r.lookupid != null ? String(r.lookupid) : '',
        display_name: r.display_name != null ? String(r.display_name) : '',
        detail,
        match_score: parseRpcNumericScore(r.match_score),
      }
    })
    .filter((r) => r.lookupid)

  rows.sort((a, b) => {
    const sb = b.match_score
    const sa = a.match_score
    if (sb != null && sa != null && sb !== sa) return sb - sa
    if (sb != null && sa == null) return 1
    if (sb == null && sa != null) return -1
    return a.display_name.localeCompare(b.display_name, undefined, {
      sensitivity: 'base',
    })
  })

  return { ok: true, rows }
}
