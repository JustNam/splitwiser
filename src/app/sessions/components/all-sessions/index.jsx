'use client'

/**
 * The full Sessions list — the same component Home renders, with no limit
 * passed.
 */

import { useGroupSnapshot } from '@/hooks/useGroupSnapshot'
import { useSignedOutRedirect } from '@/hooks/useSignedOutRedirect'
import { sessionSummaries } from '@/services/session.service'
import { SessionList } from '@/app/components/session-list'
import { LoadingRows } from '@/components/Loading'
import { RetryMessage } from '@/components/RetryMessage'
import Style from './style.module.scss'

export function AllSessions() {
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

  const rows = sessionSummaries({
    sessions: snapshot.sessions,
    costLines: snapshot.costLines,
    participants: snapshot.participants,
    members: snapshot.members,
    accounts: snapshot.accounts,
    groupId: group.id,
  })

  return <SessionList rows={rows} from="/sessions" />
}
