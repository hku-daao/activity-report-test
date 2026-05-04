import { profilesSupabase } from './profilesSupabase'

/** Row returned from search list; `detail` is filled after calling `getConstituentDetail`. */
export type ConstituentLookupRow = {
  lookupid: string
  /** From `search_constituents` **FORMATTEDNAME** (for display in the list). */
  formatted_name: string
  /** From `search_constituents` **NICKNAME**. */
  nickname: string
  /** Short label: formatted, else nickname, else lookup id. */
  display_name: string
  detail: Record<string, unknown> | null
  /** **SCORE** from RPC (0–100). */
  match_score?: number
}

const SEARCH_RPC = 'search_constituents'
const DETAIL_RPC = 'get_constituent_detail'

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

function isLikelyMissingRpcOrStaleCache(eg: {
  message?: string
  code?: string
  details?: string
}, fnHint: string): boolean {
  const msg = [eg.message, eg.details].filter(Boolean).join(' ')
  const code = eg.code ?? ''
  if (code === '42883') return true
  if (code === 'PGRST202' || code === 'PGRST203' || code === 'PGRST204')
    return true
  if (
    new RegExp(
      `could not find.*function public\\.${fnHint}|function public\\.${fnHint}.*does not exist`,
      'i',
    ).test(msg)
  )
    return true
  return false
}

function parseNumericScore(v: unknown): number | undefined {
  if (v == null) return undefined
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = Number.parseFloat(String(v))
  return Number.isFinite(n) ? n : undefined
}

/** Map RPC row keys case-insensitively (Postgres quoted identifiers vary). */
function rowFromSearchRpc(raw: unknown): {
  lookupid: string
  formatted_name: string
  nickname: string
  display_name: string
  score?: number
} | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const lower: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    lower[k.toLowerCase()] = v
  }
  const lookupid = String(
    o.LOOKUPID ?? o.lookupid ?? lower.lookupid ?? '',
  ).trim()
  if (!lookupid) return null
  const formatted_name = String(
    o.FORMATTEDNAME ?? o.formattedname ?? lower.formattedname ?? '',
  ).trim()
  const nickname = String(
    o.NICKNAME ?? o.nickname ?? lower.nickname ?? '',
  ).trim()
  const display_name = formatted_name || nickname || lookupid
  const score = parseNumericScore(o.SCORE ?? o.score ?? lower.score)
  return { lookupid, formatted_name, nickname, display_name, score }
}

/**
 * Constituent search via `search_constituents(search_query)` (see `001_search_constituents_function.sql`).
 */
export async function searchConstituents(
  searchQuery: string,
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
  const q = searchQuery.trim()
  if (!q) {
    return { ok: false, message: 'Enter a name before using Lookup.' }
  }

  const { data, error } = await profilesSupabase.rpc(SEARCH_RPC, {
    search_query: q,
  })

  if (error) {
    const eg = error as { message: string; details?: string; hint?: string; code?: string }
    const summary = rpcErrorSummary(eg)

    if (isLikelyMissingRpcOrStaleCache(eg, SEARCH_RPC)) {
      return {
        ok: false,
        message: `Constituent lookup failed (${summary}). Confirm VITE_PROFILES_SUPABASE_URL matches the project where you deployed ${SEARCH_RPC}. Try NOTIFY pgrst, 'reload schema'; ensure GRANT EXECUTE applies to anon.`,
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

  const rows: ConstituentLookupRow[] = []
  for (const r of data as unknown[]) {
    const parsed = rowFromSearchRpc(r)
    if (!parsed) continue
    rows.push({
      lookupid: parsed.lookupid,
      formatted_name: parsed.formatted_name,
      nickname: parsed.nickname,
      display_name: parsed.display_name,
      detail: null,
      match_score: parsed.score,
    })
  }

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

function parseDetailPayload(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        return p as Record<string, unknown>
      }
    } catch {
      return null
    }
  }
  return null
}

/**
 * Full detail JSON via `get_constituent_detail(p_lookup_id)` (see `002_get_constituent_detail.sql`).
 */
export async function getConstituentDetail(
  lookupId: string,
): Promise<
  | { ok: true; detail: Record<string, unknown> }
  | { ok: false; message: string }
> {
  if (!profilesSupabase) {
    return {
      ok: false,
      message: 'Supabase is not configured.',
    }
  }
  const id = lookupId.trim()
  if (!id) {
    return { ok: false, message: 'Missing constituent lookup ID.' }
  }

  const { data, error } = await profilesSupabase.rpc(DETAIL_RPC, {
    p_lookup_id: id,
  })

  if (error) {
    const eg = error as { message: string; details?: string; hint?: string; code?: string }
    const summary = rpcErrorSummary(eg)

    if (isLikelyMissingRpcOrStaleCache(eg, DETAIL_RPC)) {
      return {
        ok: false,
        message: `Could not load constituent detail (${summary}). Deploy ${DETAIL_RPC} and NOTIFY pgrst, 'reload schema';`,
      }
    }
    return {
      ok: false,
      message: summary,
    }
  }

  const detail = parseDetailPayload(data)
  return {
    ok: true,
    detail: detail ?? {},
  }
}
