type Props = {
  /** `auth` = larger, centered (sign-in). `bar` = compact (dashboard headers). */
  variant?: 'bar' | 'auth'
}

/**
 * Site mark: `public/logo.png` (HKU-style Activity Report artwork). Decorative when a
 * visible title sits next to it; use `aria-hidden` in those cases.
 */
export function AppLogo({ variant = 'bar' }: Props) {
  return (
    <img
      src="/logo.png"
      alt=""
      aria-hidden
      className={
        variant === 'auth' ? 'app-logo app-logo--auth' : 'app-logo'
      }
      decoding="async"
    />
  )
}
