'use client'

/**
 * The full Sessions list — the same component Home renders, with no limit
 * passed.
 */

import Link from 'next/link'
import { useGroupSnapshot } from '@/hooks/useGroupSnapshot'
import { sessionSummaries } from '@/services/session.service'
import { SessionList } from '@/app/components/session-list'
import Style from './style.module.scss'

export function AllSessions() {
  const state = useGroupSnapshot()

  if (state.status === 'loading') return null

  if (state.status === 'signed-out') {
    return (
      <p className={Style.error} role="alert">
        You need to{' '}
        <Link href="/signin" className={Style.link}>
          sign in
        </Link>{' '}
        first.
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

  const rows = sessionSummaries({
    sessions: snapshot.sessions,
    costLines: snapshot.costLines,
    participants: snapshot.participants,
    members: snapshot.members,
    accounts: snapshot.accounts,
    groupId: group.id,
  })

  return <SessionList rows={rows} />
}
