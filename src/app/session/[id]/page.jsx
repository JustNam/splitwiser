import Link from 'next/link'
import { SessionDetail } from './components/session-detail'
import Style from './page.module.scss'

export const metadata = {
  title: 'Session · SplitWiser',
}

/**
 * B3 · Session detail
 *
 * `[id]` in the folder name makes this route match /session/<anything>. The
 * static /session/new wins over it, because Next matches a literal segment
 * before a dynamic one.
 *
 * The title of this screen is the session's date, which only exists once the
 * data has loaded — so unlike the other screens, the header here holds just
 * the back arrow.
 */
export default function SessionDetailPage() {
  return (
    <main className={Style.page}>
      <header className={Style.header}>
        <Link href="/" className={Style.back} aria-label="Back">
          ←
        </Link>
      </header>

      <SessionDetail />
    </main>
  )
}
