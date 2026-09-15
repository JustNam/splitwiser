'use client'

/**
 * B3 · Session detail — the body of the screen.
 *
 * The spec calls this two screens in one: the confirmation you see right after
 * logging a session, and the place you come back to when a number looks
 * wrong. Both want the same thing on screen, so it is one component.
 */

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import { GroupsApi } from '@/api/groups'
import { useAuth } from '@/hooks/useAuth'
import { pickCurrentGroup } from '@/lib/current-group'
import { readFromPath } from '@/lib/next-path'
import { formatVnd } from '@/services/money.service'
import { sessionDetail } from '@/services/session-detail.service'
import { LoadingRows } from '@/components/Loading'
import { RetryMessage } from '@/components/RetryMessage'
import { Avatar } from '@/components/Avatar'
import { PageHeader } from '@/components/PageHeader'
import { SectionHeader } from '@/components/SectionHeader'
import { TextLink } from '@/components/TextLink'
import { LinkButton } from '@/components/LinkButton'
import Style from './style.module.scss'

export function SessionDetail() {
  const { user, loading: authLoading } = useAuth()

  // useParams reads the [id] out of the URL. The server-component way of
  // getting it doesn't apply here — this component is a client one, because
  // it needs to know who is signed in.
  const { id } = useParams()

  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  function reload() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  // Which list this session was opened out of. Back used to be hardcoded to
  // Home, so tapping a session from /sessions or /activity and coming back
  // lost your place in the list you were reading.
  const backHref = readFromPath(useSearchParams())

  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false

    async function load() {
      const { data: groups, error: groupsError } = await GroupsApi.listMine(user.id)
      if (cancelled) return
      if (groupsError) return setState({ status: 'error', error: groupsError })
      if (groups.length === 0) return setState({ status: 'not-found' })

      const group = pickCurrentGroup(groups)

      // The whole group's snapshot for one session — more than is needed, but
      // it reuses the query Home already relies on. A query for one session
      // is worth writing once sessions get numerous enough to notice.
      const { data: snapshot, error: snapshotError } = await GroupsApi.getSnapshot(
        group.id
      )
      if (cancelled) return
      if (snapshotError) return setState({ status: 'error', error: snapshotError })

      const session = snapshot.sessions.find((row) => row.id === id)
      if (!session) return setState({ status: 'not-found' })

      setState({ status: 'ready', group, snapshot, session })
    }

    load()

    return () => {
      cancelled = true
    }
  }, [authLoading, user, id, attempt])

  // Header in every state. A failed load used to leave a bare sentence with
  // no back arrow anywhere on it.
  if (authLoading || !user || state.status !== 'ready') {
    return (
      <>
        <PageHeader backHref={backHref} title="Session" />

        {(authLoading || state.status === 'loading') && <LoadingRows rows={3} />}

        {!authLoading && !user && (
          <p className={Style.error} role="alert">
            You need to <TextLink href="/signin">sign in</TextLink> first.
          </p>
        )}

        {user && state.status === 'error' && (
          <RetryMessage message={state.error} onRetry={reload} />
        )}

        {user && state.status === 'not-found' && (
          <p className={Style.note}>That session isn’t in your group.</p>
        )}
      </>
    )
  }

  const { group, snapshot, session } = state

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

      {/* Nothing writes adjustment rows until B4 exists, so this section is
          invisible for now. It is here because the rule it implements — the
          original numbers stay, edits are listed apart — is the one thing the
          whole data design was built around. */}
      {detail.edits.length > 0 && (
        <section className={Style.section}>
          <SectionHeader>Edits</SectionHeader>

          <ul className={Style.rows}>
            {detail.edits.map((edit) => (
              <li key={edit.id} className={Style.editRow}>
                <span className={Style.rowLabel}>{edit.text}</span>
                <span className={Style.rowSub}>{edit.by}</span>
              </li>
            ))}
          </ul>

          <p className={Style.note}>Nothing is overwritten — edits are listed here.</p>
        </section>
      )}

      <p className={Style.trail}>{detail.trail}</p>

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
