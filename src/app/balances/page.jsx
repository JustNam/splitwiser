import { AllBalances } from './components/all-balances'
import { PageHeader } from '@/components/PageHeader'
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
      <PageHeader title="Balances" />

      <AllBalances />
    </main>
  )
}
