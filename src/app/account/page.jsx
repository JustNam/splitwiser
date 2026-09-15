import { AccountDetail } from './components/account-detail'
import Style from './page.module.scss'

export const metadata = {
  title: 'Account · SplitWiser',
}

/**
 * Your name and your email — the one record that is yours rather than a
 * group's. Sign out lives here too; it was on the group page for want of
 * anywhere better, which made leaving your account a thing you did from a
 * screen about other people.
 */
export default function AccountPage() {
  return (
    <main className={Style.page}>
      <AccountDetail />
    </main>
  )
}
