import { groupBalances } from '@/services/balance.service'
import { sessionSummaries } from '@/services/session.service'
import {
  members,
  accounts,
  ledger,
  groups,
  sessions,
  costLines,
  participants,
  CURRENT_MEMBER_ID,
  CURRENT_GROUP_ID,
} from '@/constants/mock'
import { Button } from '@/components/Button'
import { BalanceList } from './components/balance-list'
import { SessionList } from './components/session-list'
import Style from './page.module.scss'

export const metadata = {
  title: 'SplitWiser',
}

/**
 * B1 · Home
 *
 * Still reading from constants/mock.js, not Supabase. The screen is being
 * built against fixed data on purpose: the numbers are known (see the bottom
 * of mock.js), so anything wrong on screen is a rendering bug, never a data
 * one. The swap to `api/` happens once the layout is settled.
 *
 * Sessions list and the group switcher dropdown are the next two pieces.
 */
export default function HomePage() {
  const groupMembers = members.filter((m) => m.groupId === CURRENT_GROUP_ID)
  const group = groups.find((g) => g.id === CURRENT_GROUP_ID)

  const { rows } = groupBalances({
    ledger,
    members: groupMembers,
    accounts,
    myMemberId: CURRENT_MEMBER_ID,
  })

  const sessionRows = sessionSummaries({
    sessions,
    costLines,
    participants,
    members,
    accounts,
    groupId: CURRENT_GROUP_ID,
  })

  return (
    <main className={Style.page}>
      {/* Which group you're looking at has to be visible at all times — one
          account can belong to several, and logging a session into the wrong
          one is the mistake this line exists to prevent. */}
      <header className={Style.topBar}>
        <p className={Style.groupName}>{group.name}</p>
      </header>

      <BalanceList rows={rows} memberCount={groupMembers.length} />

      <SessionList rows={sessionRows} />

      {/* Not wired yet — the routes arrive with B2 and B5. Kept visible
          because "New session" is the one action this screen exists to lead
          to, and its placement is part of what's being reviewed. */}
      <footer className={Style.actions}>
        <Button fullWidth>New session</Button>
        <Button variant="secondary" fullWidth>
          Settle up
        </Button>
      </footer>
    </main>
  )
}
