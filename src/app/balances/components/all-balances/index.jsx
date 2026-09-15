'use client'

/**
 * The full Balances list — the same component Home renders, with no limit
 * passed. Whatever the row looks like there, it looks like here.
 */

import { useGroupSnapshot } from '@/hooks/useGroupSnapshot'
import { useSignedOutRedirect } from '@/hooks/useSignedOutRedirect'
import { groupBalances } from '@/services/balance.service'
import { BalanceList } from '@/app/components/balance-list'
import { LoadingRows } from '@/components/Loading'
import { RetryMessage } from '@/components/RetryMessage'
import Style from './style.module.scss'

export function AllBalances() {
  const state = useGroupSnapshot()

  useSignedOutRedirect(state.status)

  if (state.status === 'loading') return <LoadingRows rows={4} />

  if (state.status === 'error') {
    return <RetryMessage message={state.error} onRetry={state.reload} />
  }

  if (state.status === 'no-group') {
    return <p className={Style.note}>You’re not in a group yet.</p>
  }

  const { group, snapshot } = state

  const { rows } = groupBalances({
    ledger: snapshot.ledger,
    members: snapshot.members,
    accounts: snapshot.accounts,
    myMemberId: group.myMemberId,
  })

  return (
    <BalanceList rows={rows} memberCount={snapshot.members.length} from="/balances" />
  )
}
