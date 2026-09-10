'use client'

/**
 * B3 · Session detail — the body of the screen.
 *
 * The spec calls this two screens in one: the confirmation you see right after
 * logging a session, and the place you come back to when a number looks
 * wrong. Both want the same thing on screen, so it is one component.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import { GroupsApi } from '@/api/groups'
import { useAuth } from '@/hooks/useAuth'
import { pickCurrentGroup } from '@/lib/current-group'
import { formatVnd } from '@/services/money.service'
import { sessionDetail } from '@/services/session-detail.service'
import Style from './style.module.scss'

export function SessionDetail() {
  const { user, loading: authLoading } = useAuth()

  // useParams reads the [id] out of the URL. The server-component way of
  // getting it doesn't apply here — this component is a client one, because
  // it needs to know who is signed in.
  const { id } = useParams()

  const [state, setState] = useState({ status: 'loading' })

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
  }, [authLoading, user, id])

  if (authLoading) return null

  if (!user) {
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

  if (state.status === 'loading') return null

  if (state.status === 'error') {
    return (
      <p className={Style.error} role="alert">
        {state.error}
      </p>
    )
  }

  if (state.status === 'not-found') {
    return <p className={Style.note}>That session isn’t in your group.</p>
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

  return (
    <>
      <div className={Style.titleBlock}>
        <div className={Style.titleRow}>
          <h1 className={Style.title}>{detail.dateLabel}</h1>
          {/* The wireframe puts Edit in the header. It lives here instead,
              because the header is a Server Component and this is where the
              session id is known. */}
          <Link href={`/session/${detail.id}/edit`} className={Style.edit}>
            Edit
          </Link>
        </div>
        <p className={Style.meta}>
          {formatVnd(detail.total)} · {detail.meta}
        </p>
      </div>

      <section className={Style.section}>
        <h2 className={Style.sectionTitle}>Costs</h2>

        <div className={Style.rows}>
          {detail.lines.map((line) => (
            <div key={line.id} className={Style.row}>
              <span className={Style.rowInfo}>
                <span className={Style.rowLabel}>{line.note}</span>
                <span className={Style.rowSub}>{line.payerText}</span>
              </span>
              <span className={Style.rowAmount}>{formatVnd(line.amount)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={Style.section}>
        <header className={Style.sectionHeader}>
          <h2 className={Style.sectionTitle}>Who played</h2>
          <p className={Style.sectionMeta}>
            {detail.people.length}{' '}
            {detail.people.length === 1 ? 'person' : 'people'}
          </p>
        </header>

        <div className={Style.rows}>
          {detail.people.map((person) => (
            <div key={person.memberId} className={Style.row}>
              <span className={Style.rowInfo}>
                <span className={Style.rowLabel}>{person.name}</span>
                {person.isGuest && <span className={Style.rowSub}>Guest</span>}
              </span>

              {/* Words carry the meaning; the class only tints them. */}
              <span className={clsx(Style.status, Style[person.tone])}>
                {person.status}
                {person.statusAmount ? ` ${formatVnd(person.statusAmount)}` : ''}
              </span>

              <span className={Style.rowAmount}>{formatVnd(person.amount)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Nothing writes adjustment rows until B4 exists, so this section is
          invisible for now. It is here because the rule it implements — the
          original numbers stay, edits are listed apart — is the one thing the
          whole data design was built around. */}
      {detail.edits.length > 0 && (
        <section className={Style.section}>
          <h2 className={Style.sectionTitle}>Edits</h2>

          <div className={Style.rows}>
            {detail.edits.map((edit) => (
              <div key={edit.id} className={Style.editRow}>
                <span className={Style.rowLabel}>{edit.text}</span>
                <span className={Style.rowSub}>{edit.by}</span>
              </div>
            ))}
          </div>

          <p className={Style.note}>
            The original numbers above are what was first recorded. Edits are
            listed separately — nothing is overwritten.
          </p>
        </section>
      )}

      <p className={Style.trail}>{detail.trail}</p>

      <footer className={Style.actions}>
        <Link href="/settle" className={Style.primaryLink}>
          Pay my share
        </Link>
      </footer>
    </>
  )
}
