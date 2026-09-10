import Link from 'next/link'
import { SettleList } from './components/settle-list'
import Style from './page.module.scss'

export const metadata = {
  title: 'Pay someone · SplitWiser',
}

/**
 * B5 · Settle up
 *
 * The spec also reaches this screen by tapping one person on Home, which
 * filters it to that person. Not built yet — the unfiltered list is the same
 * screen with nothing hidden, so filtering is an addition rather than a
 * rewrite.
 */
export default function SettlePage() {
  return (
    <main className={Style.page}>
      <header className={Style.header}>
        <Link href="/" className={Style.back} aria-label="Back">
          ←
        </Link>
        <h1 className={Style.title}>Pay someone</h1>
      </header>

      <SettleList />
    </main>
  )
}
