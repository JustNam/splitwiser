import Link from 'next/link'
import { AllSessions } from './components/all-sessions'
import Style from './page.module.scss'

export const metadata = {
  title: 'Sessions · SplitWiser',
}

/**
 * Every session in the group, newest first. The counterpart to /balances:
 * Home shows five of each, and this is where the rest live.
 */
export default function SessionsPage() {
  return (
    <main className={Style.page}>
      <header className={Style.header}>
        <Link href="/" className={Style.back} aria-label="Back">
          ←
        </Link>
      </header>

      <AllSessions />
    </main>
  )
}
