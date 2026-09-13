import Link from 'next/link'
import Style from './style.module.scss'

/**
 * The top of every screen below Home: a way back, the title, and sometimes
 * one action on the right.
 *
 * It exists because there were nine copies of the back arrow and the title
 * was an h1 on one screen, an h2 on four and an h3 on three. Which size a
 * heading is should not depend on which file somebody was in that day.
 *
 * `title` may be omitted while data is still loading, which is why the two
 * screens whose title IS the data — a session's date, the group's name —
 * render this from inside their client component.
 */
export function PageHeader({ backHref = '/', title, action }) {
  return (
    <header className={Style.header}>
      <Link href={backHref} className={Style.back} aria-label="Back">
        ←
      </Link>

      {title && <h1 className={Style.title}>{title}</h1>}

      {action && <div className={Style.action}>{action}</div>}
    </header>
  )
}
