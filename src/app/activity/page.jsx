import { ActivityFeed } from './components/activity-feed'
import Style from './page.module.scss'

export const metadata = {
  title: 'Activity · SplitWiser',
}

/**
 * Who changed what, across the whole group.
 *
 * Not one of the ten screens in the spec. It is the other half of a rule the
 * app had already adopted from Splitwise — anyone may edit anyone's session —
 * which is only safe alongside a record of who did.
 */
export default function ActivityPage() {
  return (
    <main className={Style.page}>
      <ActivityFeed />
    </main>
  )
}
