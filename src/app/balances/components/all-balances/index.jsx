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

  if (state.status !== 'ready') {
    return (
      <>
        {state.status === 'error' ? (
          <RetryMessage message={state.error} onRetry={state.reload} />
        ) : state.status === 'no-group' ? (
          <p className={Style.note}>You’re not in a group yet.</p>
        ) : (
          // 'loading' and 'signed-out' both land here. Signed out used to
          // fall past these checks and destructure an undefined snapshot,
          // which threw before useSignedOutRedirect — an effect — ever got
          // to run. Testing for 'ready' rather than listing the states is
          // what stops the next status added doing the same thing.
          <LoadingRows rows={4} />
        )}
      </>
    )
  }

  const { group, snapshot } = state

  const { rows, net } = groupBalances({
    ledger: snapshot.ledger,
    members: snapshot.members,
    accounts: snapshot.accounts,
    myMemberId: group.myMemberId,
  })

  return (
    <BalanceList
      rows={rows}
      net={net}
      memberCount={snapshot.members.length}
      from="/balances"
    />
  )
}
