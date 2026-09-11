import { Suspense } from 'react'
import Link from 'next/link'
import { SettleList } from './components/settle-list'
import Style from './page.module.scss'

export const metadata = {
  title: 'Pay someone · SplitWiser',
}

/**
 * B5 · Settle up
 *
 * Reached two ways: the Settle up button on Home, which lists every debt, and
 * tapping one person there, which filters to them. The heading changes with
 * it, so it lives in the client component rather than here.
 */
export default function SettlePage() {
  return (
    <main className={Style.page}>
      <header className={Style.header}>
        <Link href="/" className={Style.back} aria-label="Back">
          ←
        </Link>
      </header>

      {/* The filter is read from ?member=, which isn't known when this page is
          prerendered — Next requires a Suspense boundary around anything that
          reads the query string. */}
      <Suspense fallback={null}>
        <SettleList />
      </Suspense>
    </main>
  )
}
