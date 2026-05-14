const DEFAULT_PAGE_SIZE = 20
const MIN_PAGE_SIZE = 1
const MAX_PAGE_SIZE = 200

/**
 * Max entries per page on list dashboards (journals, proactive, activity reports).
 * Set `VITE_DASHBOARD_PAGE_SIZE` in `.env` (integer). Invalid or empty uses default.
 */
export function getDashboardPageSize(): number {
  const raw = import.meta.env.VITE_DASHBOARD_PAGE_SIZE
  if (raw === undefined || raw === '') {
    return DEFAULT_PAGE_SIZE
  }
  const n = Number.parseInt(String(raw).trim(), 10)
  if (!Number.isFinite(n) || n < MIN_PAGE_SIZE) {
    return DEFAULT_PAGE_SIZE
  }
  return Math.min(MAX_PAGE_SIZE, n)
}
