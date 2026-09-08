import { formatVnd, displayName } from '@/services/money.service'
import { groupBalances } from '@/services/balance.service'
import {
  members,
  accounts,
  ledger,
  CURRENT_MEMBER_ID,
  CURRENT_GROUP_ID,
} from '@/constants/mock'

export const metadata = {
  title: 'Service checks · SplitWiser',
}

/**
 * A scratch page for eyeballing the pure services against the mock data.
 * Not linked from anywhere and not part of the product — it moved here off
 * `/` when Home took that route.
 *
 * Expected answers live at the bottom of constants/mock.js.
 */
export default function DevPage() {
  const groupMembers = members.filter((m) => m.groupId === CURRENT_GROUP_ID)
  const balances = groupBalances({
    ledger,
    members: groupMembers,
    accounts,
    myMemberId: CURRENT_MEMBER_ID,
  })

  const checks = [
    ['formatVnd(90000)', formatVnd(90000), '90.000đ'],
    ['formatVnd(7500)', formatVnd(7500), '7.500đ'],
    ['formatVnd(105000)', formatVnd(105000), '105.000đ'],
    ['formatVnd(0)', formatVnd(0), '0đ'],
    ['displayName(m1) roster', displayName(members[0], accounts), 'Trân'],
    ['displayName(m5) guest', displayName(members[4], accounts), 'Nam'],
    ['balances rows', String(balances.rows.length), '4'],
    ['balances order', balances.rows.map((r) => r.name).join(','), 'Thắng,Lý,Triết,Nam'],
    ['totalOwedToMe', formatVnd(balances.totalOwedToMe), '262.500đ'],
    ['totalIOwe', formatVnd(balances.totalIOwe), '67.500đ'],
    ['net', formatVnd(balances.net), '195.000đ'],
  ]

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>Service checks</h1>
      {checks.map(([label, got, want]) => (
        <div key={label}>
          {got === want ? '✅' : '❌'} {label} → got <b>{String(got)}</b>, want{' '}
          <b>{want}</b>
        </div>
      ))}
    </main>
  )
}
