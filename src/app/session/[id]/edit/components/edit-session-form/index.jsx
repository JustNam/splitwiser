'use client'

/**
 * B4 · Edit session — form.
 *
 * Three things make this different from B2, and all three come straight from
 * the spec:
 *
 *   1. You type the numbers that should be TRUE. Nobody works out a
 *      difference by hand — edit_session() does that against what is
 *      recorded.
 *   2. A preview of how every person's share moves, before saving. One edit
 *      can change five people's money at once.
 *   3. A warning when the edit hits somebody who has already paid, because
 *      that turns their payment into money owed back to them.
 *
 * Matching B2, v1 edits a single cost line split equally.
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import TextField from '@mui/material/TextField'
import { GroupsApi } from '@/api/groups'
import { SessionsApi } from '@/api/sessions'
import { Button } from '@/components/Button'
import { useAuth } from '@/hooks/useAuth'
import { pickCurrentGroup } from '@/lib/current-group'
import { displayName, formatVnd } from '@/services/money.service'
import { formatSessionDate } from '@/services/session.service'
import { sessionDetail } from '@/services/session-detail.service'
import { SPLIT_EQUAL, computeSplit } from '@/services/split.service'
import Style from './style.module.scss'

export function EditSessionForm() {
  const { user, loading: authLoading } = useAuth()
  const { id } = useParams()
  const router = useRouter()

  const [state, setState] = useState({ status: 'loading' })

  const [date, setDate] = useState('')
  const [amountText, setAmountText] = useState('')
  const [note, setNote] = useState('')
  const [present, setPresent] = useState({})
  const [why, setWhy] = useState('')

  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false

    async function load() {
      const { data: groups, error: groupsError } = await GroupsApi.listMine(user.id)
      if (cancelled) return
      if (groupsError) return setState({ status: 'error', error: groupsError })
      if (groups.length === 0) return setState({ status: 'not-found' })

      const group = pickCurrentGroup(groups)
      const { data: snapshot, error: snapshotError } = await GroupsApi.getSnapshot(
        group.id
      )
      if (cancelled) return
      if (snapshotError) return setState({ status: 'error', error: snapshotError })

      const session = snapshot.sessions.find((row) => row.id === id)
      if (!session) return setState({ status: 'not-found' })

      const lines = snapshot.costLines.filter((line) => line.sessionId === session.id)

      // Refuse rather than mangle. v1 has no UI for a second cost line, and
      // saving would silently drop it.
      if (lines.length !== 1) return setState({ status: 'too-complex' })

      const line = lines[0]

      setState({ status: 'ready', group, snapshot, session, line })

      // Prefill with what is recorded now — the point of the screen is to
      // change one thing, not retype the session.
      setDate(session.date)
      setAmountText(String(line.amount))
      setNote(line.note ?? '')
      setPresent(
        Object.fromEntries(
          snapshot.participants
            .filter((row) => row.sessionId === session.id)
            .map((row) => [row.memberId, true])
        )
      )
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
    return <p className={Style.hint}>That session isn’t in your group.</p>
  }

  if (state.status === 'too-complex') {
    return (
      <p className={Style.hint}>
        This session has more than one cost. Editing those isn’t built yet.
      </p>
    )
  }

  const { group, snapshot, session, line } = state

  // What is recorded right now, from the same function B3 renders.
  const current = sessionDetail({
    session,
    costLines: snapshot.costLines,
    participants: snapshot.participants,
    ledger: snapshot.ledger,
    members: snapshot.members,
    accounts: snapshot.accounts,
    myMemberId: group.myMemberId,
  })

  const currentById = new Map(current.people.map((person) => [person.memberId, person]))

  const members = snapshot.members
  const nameOf = (member) => displayName(member, snapshot.accounts)
  const nameOfId = (memberId) => {
    const member = members.find((row) => row.id === memberId)
    return member ? nameOf(member) : 'Someone'
  }

  const participants = members.filter((member) => present[member.id])
  const participantIds = participants.map((member) => member.id)

  const total = Number(amountText || 0)

  const nextShares =
    total > 0 && participantIds.length > 0
      ? computeSplit({ total, participantIds, method: SPLIT_EQUAL })
      : {}

  // Everyone the edit touches: who plays now, plus anyone who used to and
  // doesn't any more. The second half is what makes a removal visible.
  const touchedIds = [
    ...new Set([...currentById.keys(), ...participantIds]),
  ]

  const preview = touchedIds.map((memberId) => {
    const was = currentById.get(memberId)?.amount ?? 0
    const next = nextShares[memberId] ?? 0

    return {
      memberId,
      name: nameOfId(memberId),
      was,
      next,
      isOut: !present[memberId],
      changed: was !== next,
      paid: currentById.get(memberId)?.paid ?? 0,
    }
  })

  // Someone who has handed money over and whose share is dropping ends up
  // owed the difference. It's not an error, but it is a consequence the
  // person editing has to see BEFORE saving.
  const warnings = preview.filter((row) => row.paid > 0 && row.paid > row.next)

  const changedAnything =
    date !== session.date ||
    total !== line.amount ||
    note.trim() !== (line.note ?? '') ||
    preview.some((row) => row.changed)

  const blockedText =
    total <= 0
      ? 'Enter how much the session cost.'
      : participantIds.length === 0
        ? 'Tick at least one person who played.'
        : !changedAnything
          ? 'Nothing has changed yet.'
          : null

  /**
   * The sentence stored on every adjustment row, and the only thing B3 shows
   * about this edit. It has to read as something a person did — the spec
   * forbids surfacing "adjustment −24.000đ each".
   */
  function summary() {
    const parts = []

    if (date !== session.date) {
      parts.push(`Date: ${formatSessionDate(session.date)} → ${formatSessionDate(date)}`)
    }

    if (total !== line.amount) {
      parts.push(
        `${note.trim() || 'Cost'}: ${formatVnd(line.amount)} → ${formatVnd(total)}`
      )
    }

    const out = preview.filter((row) => row.isOut).map((row) => row.name)
    const added = preview
      .filter((row) => !row.isOut && !currentById.has(row.memberId))
      .map((row) => row.name)

    if (out.length > 0) parts.push(`Out: ${out.join(', ')}`)
    if (added.length > 0) parts.push(`In: ${added.join(', ')}`)

    const sentence = parts.length > 0 ? parts.join(' · ') : 'Session edited'
    return why.trim() === '' ? sentence : `${sentence} — ${why.trim()}`
  }

  function handleAmountChange(event) {
    setAmountText(event.target.value.replace(/[^0-9]/g, '').slice(0, 12))
  }

  function toggle(memberId) {
    setPresent((currentPresent) => ({
      ...currentPresent,
      [memberId]: !currentPresent[memberId],
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (blockedText) return

    setSubmitting(true)
    setError(null)

    const { error: apiError } = await SessionsApi.edit({
      sessionId: session.id,
      date,
      lines: [
        {
          costLineId: line.id,
          note: note.trim() === '' ? null : note.trim(),
          amount: total,
          shares: nextShares,
        },
      ],
      participantIds,
      summary: summary(),
    })

    if (apiError) {
      setError(apiError)
      setSubmitting(false)
      return
    }

    router.push(`/session/${session.id}`)
  }

  return (
    <form className={Style.form} onSubmit={handleSubmit} noValidate>
      <header className={Style.header}>
        <Link href={`/session/${session.id}`} className={Style.back} aria-label="Back">
          ←
        </Link>
        <h1 className={Style.title}>Edit session</h1>
      </header>

      <p className={Style.lede}>
        {current.dateLabel} · change anything below. Everyone’s share is worked
        out for you.
      </p>

      <TextField
        label="Date"
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        InputLabelProps={{ shrink: true }}
        fullWidth
        disabled={submitting}
      />

      <div className={Style.amountBlock}>
        <label className={Style.amountLabel} htmlFor="amount">
          Amount
        </label>
        <input
          id="amount"
          className={Style.amountInput}
          value={amountText === '' ? '' : formatVnd(total)}
          onChange={handleAmountChange}
          inputMode="numeric"
          placeholder="0đ"
          disabled={submitting}
        />
        {total !== line.amount && (
          <p className={Style.hint}>Was {formatVnd(line.amount)}</p>
        )}
      </div>

      <TextField
        label="What for"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Courts"
        fullWidth
        disabled={submitting}
      />

      <section className={Style.section}>
        <header className={Style.sectionHeader}>
          <h2 className={Style.sectionTitle}>Who played</h2>
          <p className={Style.sectionMeta}>{participants.length} playing</p>
        </header>

        <div className={Style.chips}>
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => toggle(member.id)}
              aria-pressed={Boolean(present[member.id])}
              className={clsx(Style.chip, present[member.id] && Style.chipOn)}
              disabled={submitting}
            >
              {nameOf(member)}
            </button>
          ))}
        </div>
      </section>

      <section className={Style.section}>
        <h2 className={Style.sectionTitle}>What changes</h2>

        <div className={Style.rows}>
          {preview.map((row) => (
            <div key={row.memberId} className={Style.row}>
              <span className={Style.rowName}>
                {row.name}
                {row.isOut && <span className={Style.outTag}>Out</span>}
              </span>

              <span className={clsx(Style.change, row.changed && Style.changed)}>
                {formatVnd(row.was)} → {formatVnd(row.next)}
              </span>
            </div>
          ))}
        </div>

        <p className={Style.hint}>
          The original numbers stay recorded. This is saved as a separate edit,
          shown on the session with your name on it.
        </p>
      </section>

      {warnings.length > 0 && (
        <section className={Style.warnBox}>
          {warnings.map((row) => (
            <p key={row.memberId} className={Style.warnText}>
              {row.name} already paid {formatVnd(row.paid)}. Their share becomes{' '}
              {formatVnd(row.next)}, so {formatVnd(row.paid - row.next)} comes back
              to them — it shows up as a debt for whoever paid the bill.
            </p>
          ))}
        </section>
      )}

      <TextField
        label="Why (optional)"
        value={why}
        onChange={(event) => setWhy(event.target.value)}
        placeholder="Booked 2 courts, not 3"
        fullWidth
        disabled={submitting}
      />

      <footer className={Style.footer}>
        {blockedText && <p className={Style.blocked}>{blockedText}</p>}

        {error && (
          <p className={Style.error} role="alert">
            {error}
          </p>
        )}

        <Button type="submit" fullWidth disabled={Boolean(blockedText) || submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>
      </footer>
    </form>
  )
}
