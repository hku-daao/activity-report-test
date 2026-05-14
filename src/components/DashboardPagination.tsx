type Props = {
  page: number
  pageCount: number
  totalItems: number
  pageSize: number
  onPageChange: (nextPage: number) => void
  /** Passed to `aria-label` on the nav element */
  navLabel: string
}

export function DashboardPagination({
  page,
  pageCount,
  totalItems,
  pageSize,
  onPageChange,
  navLabel,
}: Props) {
  if (totalItems === 0 || pageCount <= 1) {
    return null
  }

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  return (
    <nav className="dashboard-pagination" aria-label={navLabel}>
      <span className="dashboard-pagination-summary">
        Showing {start}–{end} of {totalItems}
      </span>
      <div className="dashboard-pagination-buttons">
        <button
          type="button"
          className="auth-submit secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className="dashboard-pagination-page">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          className="auth-submit secondary"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  )
}
