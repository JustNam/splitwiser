'use client'

/**
 * The full Balances list — the same component Home renders, with no limit
 * passed. Whatever the row looks like there, it looks like here.
 */

import { useGroupSnapshot } from '@/hooks/useGroupSnapshot'
import { groupBalances } from '@/services/balance.service'
import { BalanceList } from '@/app/components/balance-list'
import { TextLink } from '@/components/TextLink'
import Style from './style.module.scss'

export function AllBalances() {
  const state = useGroupSnapshot()

  if (state.status === 'loading') return null

  if (state.status === 'signed-out') {
    return (
      <p className={Style.error} role="alert">
        You need to <TextLink href="/signin">sign in</TextLink> first.
      </p>
    )
  }

  if (state.status === 'error') {
    return (
      <p className={Style.error} role="alert">
        {state.error}
      </p>
    )
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

  return <BalanceList rows={rows} memberCount={snapshot.members.length} />
}
