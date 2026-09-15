'use client'

/**
 * B3 · Session detail — the body of the screen.
 *
 * The spec calls this two screens in one: the confirmation you see right after
 * logging a session, and the place you come back to when a number looks
 * wrong. Both want the same thing on screen, so it is one component.
 */

import { useParams, useSearchParams } from 'next/navigation'
import { useSignedOutRedirect } from '@/hooks/useSignedOutRedirect'
import Link from 'next/link'
import clsx from 'clsx'
import { useGroupData } from '@/components/GroupDataProvider'
import { readFromPath } from '@/lib/next-path'
import { formatVnd } from '@/services/money.service'
import { activityFeed, formatMoment } from '@/services/activity.service'
import { sessionDetail } from '@/services/session-detail.service'
import { LoadingRows } from '@/components/Loading'
import { RetryMessage } from '@/components/RetryMessage'
import { Avatar } from '@/components/Avatar'
import { PageHeader } from '@/components/PageHeader'
import { SectionHeader } from '@/components/SectionHeader'
import { TextLink } from '@/components/TextLink'
import { LinkButton } from '@/components/LinkButton'
import Style from './style.module.scss'

/* On this screen the session is a given, so the labels say what happened to
   it rather than repeating its date. */
const KIND = {
  logged: 'Created',
  edited: 'Edited',
  settled: 'Settled',
}

export function SessionDetail() {
  // The group comes from the shared copy. This screen used to fetch the whole
  // snapshot itself to show one session, so opening a session from a list
  // downloaded everything the list had just downloaded.
  const { status, group, snapshot, error: loadError, reload } = useGroupData()

  useSignedOutRedirect(status)

  // useParams reads the [id] out of the URL. The server-component way of
  // getting it doesn't apply here — this component is a client one, because
  // it needs to know who is signed in.
  const { id } = useParams()

  // Which list this session was opened out of. Back used to be hardcoded to
  // Home, so tapping a session from /sessions or /activity and coming back
  // lost your place in the list you were reading.
  const backHref = readFromPath(useSearchParams())

  // The session is found in the shared snapshot rather than fetched. A URL
  // naming a session from another group, or one that has been removed, ends
  // up here as `undefined` — which is the not-found case.
  const session =
    status === 'ready' ? snapshot.sessions.find((row) => row.id === id) : null

  // Header in every state. A failed load used to leave a bare sentence with
  // no back arrow anywhere on it.
  if (status !== 'ready' || !session) {
    return (
      <>
        <PageHeader backHref={backHref} title="Session" />

        {status === 'loading' && <LoadingRows rows={3} />}

        {status === 'error' && <RetryMessage message={loadError} onRetry={reload} />}

        {(status === 'no-group' || (status === 'ready' && !session)) && (
          <p className={Style.note}>That session isn’t in your group.</p>
        )}
      </>
    )
  }

  const detail = sessionDetail({
    session,
    costLines: snapshot.costLines,
    participants: snapshot.participants,
    ledger: snapshot.ledger,
    members: snapshot.members,
    accounts: snapshot.accounts,
    myMemberId: group.myMemberId,
  })

  // Who still owes what, on THIS session. The footer button used to be
  // unconditional, so the person who paid for everybody — the one the others
  // owe — was invited to "Pay my share".
  // Everything that has happened to THIS session, newest first. The same
  // function the Activity screen uses, filtered — one definition of what an
  // event is, so the two screens cannot come to disagree about the history
  // of the same evening.
  const history = activityFeed({
    sessions: snapshot.sessions,
    costLines: snapshot.costLines,
    ledger: snapshot.ledger,
    members: snapshot.members,
    accounts: snapshot.accounts,
    myMemberId: group.myMemberId,
  }).filter((event) => event.sessionId === session.id)

  const me = detail.people.find((person) => person.memberId === group.myMemberId)
  const iOwe = (me?.outstanding ?? 0) > 0
  const othersOwe = detail.people.some(
    (person) => person.memberId !== group.myMemberId && person.outstanding > 0
  )

  return (
    <>
      <PageHeader
        backHref={backHref}
        title={<time dateTime={detail.date}>{detail.dateLabel}</time>}
        action={<TextLink href={`/session/${detail.id}/edit`}>Edit</TextLink>}
      />

      <p className={Style.meta}>
        {formatVnd(detail.total)} · {detail.meta}
      </p>

      <section className={Style.section}>
        <SectionHeader>Costs</SectionHeader>

        <ul className={Style.rows}>
          {detail.lines.map((line) => (
            <li key={line.id} className={Style.row}>
              <span className={Style.rowInfo}>
                <span className={Style.rowLabel}>{line.note}</span>
                <span className={Style.rowSub}>{line.payerText}</span>
              </span>
              <span className={Style.rowAmount}>{formatVnd(line.amount)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={Style.section}>
        <SectionHeader
          meta={
            <>
              {detail.people.length} {detail.people.length === 1 ? 'person' : 'people'}
            </>
          }
        >
          Who played
        </SectionHeader>

        <ul className={Style.rows}>
          {detail.people.map((person) => (
            <li key={person.memberId} className={Style.row}>
              <Avatar name={person.name} size="sm" />

              {/* Name and status in one column, amount in the other. Four
                  columns — avatar, name, status, amount — left about 50px for
                  the name on a 360px phone, and a status is a fact ABOUT the
                  person, so under their name is where it belongs anyway. */}
              <span className={Style.rowInfo}>
                <span className={Style.rowLabel}>
                  {person.name}
                  {person.isGuest && (
                    <span className={clsx(Style.rowSub, Style.guestTag)}> · Guest</span>
                  )}
                </span>

                {/* Words carry the meaning; the class only tints them. */}
                <span className={clsx(Style.status, Style[person.tone])}>
                  {person.status}
                  {person.statusAmount ? ` ${formatVnd(person.statusAmount)}` : ''}
                </span>
              </span>

              <span className={Style.rowAmount}>{formatVnd(person.amount)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Not just the edits. Who logged it, who has settled against it and
          who changed it are the same question asked three ways — "what has
          happened to this session" — and splitting them across a section and
          a footnote meant no single place answered it. */}
      {history.length > 0 && (
        <section className={Style.section}>
          <SectionHeader>Activity</SectionHeader>

          <ul className={Style.rows}>
            {history.map((event) => (
              <li key={event.id} className={Style.editRow}>
                <span className={Style.editText}>
                  {KIND[event.kind]}
                  {event.kind === 'edited' && event.text !== 'edited a session'
                    ? ` · ${event.text}`
                    : ''}
                  {event.kind === 'settled' ? ` · ${formatVnd(event.amount)}` : ''}
                </span>

                {/* Who and when on the same line as what. Stacked, two edits
                    with no reason typed read the same thing twice over a
                    name, and the one thing telling them apart was missing. */}
                <span className={Style.editBy}>
                  {event.actor} ·{' '}
                  <time dateTime={event.at}>{formatMoment(event.at)}</time>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Both routes land on B5, which is where money is recorded either
          way — only the words change, because "pay" and "collect" are not the
          same errand. Neither is offered to somebody with nothing to do. */}
      {iOwe ? (
        <footer className={Style.actions}>
          <LinkButton href="/settle">Pay my share</LinkButton>
        </footer>
      ) : othersOwe ? (
        <footer className={Style.actions}>
          <LinkButton variant="secondary" href="/settle">
            See what you’re owed
          </LinkButton>
        </footer>
      ) : null}
    </>
  )
}
