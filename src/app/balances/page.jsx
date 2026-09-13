import Link from 'next/link'
import { AllBalances } from './components/all-balances'
import Style from './page.module.scss'

export const metadata = {
  title: 'Balances · SplitWiser',
}

/**
 * Every open balance, for when Home's five aren't all of them.
 *
 * Not one of the ten screens in the spec — it exists because Home caps its
 * lists, and a cap without a way past it hides money from people.
 */
export default function BalancesPage() {
  return (
    <main className={Style.page}>
      <header className={Style.header}>
        <Link href="/" className={Style.back} aria-label="Back">
          ←
        </Link>
      </header>

      <AllBalances />
    </main>
  )
}
