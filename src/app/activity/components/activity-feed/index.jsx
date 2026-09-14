'use client'

/**
 * Everything that has happened in the group, newest first.
 *
 * Anybody here can edit anybody's session — the same rule Splitwise settled
 * on, because whoever spots a mistake should be able to fix it. That rule is
 * only safe next to a record of who changed what, which is what this is. The
 * per-session Edits list was not enough: you can only read it if you already
 * suspect the right session.
 */

import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { Loading } from '@/components/Loading'
import { RetryMessage } from '@/components/RetryMessage'
import { PageHeader } from '@/components/PageHeader'
import { TextLink } from '@/components/TextLink'
import { useGroupSnapshot } from '@/hooks/useGroupSnapshot'
import { writeLastSeen } from '@/lib/last-seen'
import { withFrom } from '@/lib/next-path'
import { useAuth } from '@/hooks/useAuth'
import { formatVnd } from '@/services/money.service'
import { activityFeed, formatMoment } from '@/services/activity.service'
import Style from './style.module.scss'

const KIND_LABEL = {
  logged: 'Logged',
  edited: 'Edited',
  settled: 'Settled',
}

export function ActivityFeed() {
  const state = useGroupSnapshot()
  const { user } = useAuth()

  // Marked once per visit, not on every render. Reading the feed is what
  // "seen" means, so the moment of opening is the right timestamp.
  const marked = useRef(false)

  useEffect(() => {
    if (state.status !== 'ready' || !user || marked.current) return

    marked.current = true
    writeLastSeen(user.id, new Date().toISOString())
  }, [state.status, user])

  // The header is drawn in EVERY state, not only the ready one. Without it a
  // screen that fails to load carries no back arrow and no link at all, and
  // the browser's own Back button becomes the only way out of the app.
  if (state.status !== 'ready') {
    return (
      <>
        <PageHeader title="Activity" />

        {state.status === 'loading' && <Loading />}

        {state.status === 'signed-out' && (
          <p className={Style.error} role="alert">
            You need to <TextLink href="/signin">sign in</TextLink> first.
          </p>
        )}

        {state.status === 'error' && (
          <RetryMessage message={state.error} onRetry={state.reload} />
        )}

        {state.status === 'no-group' && (
          <p className={Style.note}>You’re not in a group yet.</p>
        )}
      </>
    )
  }

  const { group, snapshot } = state

  const events = activityFeed({
    sessions: snapshot.sessions,
    costLines: snapshot.costLines,
    ledger: snapshot.ledger,
    members: snapshot.members,
    accounts: snapshot.accounts,
    myMemberId: group.myMemberId,
  })

  return (
    <>
      <PageHeader title="Activity" />

      {events.length === 0 ? (
        <p className={Style.note}>Nothing has happened in this group yet.</p>
      ) : (
        <ul className={Style.list}>
          {events.map((event) => (
            <li key={event.id} className={Style.row}>
              <span className={clsx(Style.tag, Style[event.kind])}>
                {KIND_LABEL[event.kind]}
              </span>

              <span className={Style.body}>
                <span className={Style.text}>
                  <span className={Style.actor}>{event.actor}</span> {event.text}
                  {event.amount ? ` · ${formatVnd(event.amount)}` : ''}
                </span>

                <span className={Style.meta}>
                  <time dateTime={event.at}>{formatMoment(event.at)}</time>
                  {/* Said out loud rather than left to colour: this is the
                      line that tells you your own money moved. */}
                  {event.concernsMe && <span className={Style.mine}>Your money</span>}
                </span>
              </span>

              <TextLink href={withFrom(`/session/${event.sessionId}`, '/activity')}>
                Open
              </TextLink>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
