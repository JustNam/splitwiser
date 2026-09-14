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
 * Costs are a list, as they are on B2 — a session can have several, each
 * with its own payer. The split stays equal here: changing HOW a session is
 * divided is a different job from correcting what it cost, and mixing the two
 * into one screen makes the preview impossible to read.
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import TextField from '@mui/material/TextField'
import { GroupsApi } from '@/api/groups'
import { SessionsApi } from '@/api/sessions'
import { Button } from '@/components/Button'
import { Chip, ChipGroup } from '@/components/Chip'
import { SectionHeader } from '@/components/SectionHeader'
import { PageHeader } from '@/components/PageHeader'
import { TextLink } from '@/components/TextLink'
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

  // One entry per cost, seeded from what is recorded. `costLineId` is what
  // ties a row back to the ledger it has to correct — edit_session() works
  // out each person's delta against the rows already on that line.
  const [lines, setLines] = useState([])

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

      const costLines = snapshot.costLines.filter(
        (line) => line.sessionId === session.id
      )

      setState({ status: 'ready', group, snapshot, session, costLines })

      // Prefilled with what is recorded now — the point of the screen is to
      // change one thing, not to retype the session.
      setDate(session.date)
      setLines(
        costLines.map((line) => ({
          costLineId: line.id,
          note: line.note ?? '',
          amountText: String(line.amount),
          amountWas: line.amount,
          noteWas: line.note ?? '',
        }))
      )
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
        You need to <TextLink href="/signin">sign in</TextLink> first.
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

  const { group, snapshot, session, costLines } = state

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

  const lineTotals = lines.map((line) => Number(line.amountText || 0))
  const total = lineTotals.reduce((running, amount) => running + amount, 0)

  // Per cost line, because each has its own payer and a share is owed to the
  // person who paid THAT cost.
  const lineShares = lines.map((line, index) =>
    lineTotals[index] > 0 && participantIds.length > 0
      ? computeSplit({
          total: lineTotals[index],
          participantIds,
          method: SPLIT_EQUAL,
        })
      : {}
  )

  const nextShares = {}
  for (const perLine of lineShares) {
    for (const [memberId, amount] of Object.entries(perLine)) {
      nextShares[memberId] = (nextShares[memberId] ?? 0) + amount
    }
  }

  // Everyone the edit touches: who plays now, plus anyone who used to and
  // doesn't any more. The second half is what makes a removal visible.
  const touchedIds = [...new Set([...currentById.keys(), ...participantIds])]

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
    lines.some(
      (line, index) =>
        lineTotals[index] !== line.amountWas || line.note.trim() !== line.noteWas
    ) ||
    preview.some((row) => row.changed)

  const blockedText = lineTotals.some((amount) => amount <= 0)
    ? lines.length === 1
      ? 'Enter how much the session cost.'
      : 'Every cost needs an amount above zero.'
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
      parts.push(
        `Date: ${formatSessionDate(session.date)} → ${formatSessionDate(date)}`
      )
    }

    lines.forEach((line, index) => {
      if (lineTotals[index] !== line.amountWas) {
        parts.push(
          `${line.note.trim() || 'Cost'}: ${formatVnd(line.amountWas)} → ${formatVnd(
            lineTotals[index]
          )}`
        )
      }
    })

    const out = preview.filter((row) => row.isOut).map((row) => row.name)
    const added = preview
      .filter((row) => !row.isOut && !currentById.has(row.memberId))
      .map((row) => row.name)

    if (out.length > 0) parts.push(`Out: ${out.join(', ')}`)
    if (added.length > 0) parts.push(`In: ${added.join(', ')}`)

    const sentence = parts.length > 0 ? parts.join(' · ') : 'Session edited'
    return why.trim() === '' ? sentence : `${sentence} — ${why.trim()}`
  }

  function payerTextFor(costLineId) {
    const costLine = costLines.find((row) => row.id === costLineId)
    return costLine ? `Paid by ${nameOfId(costLine.payerMemberId)}` : ''
  }

  function updateLine(costLineId, patch) {
    setLines((current) =>
      current.map((line) =>
        line.costLineId === costLineId ? { ...line, ...patch } : line
      )
    )
  }

  function setLineAmount(costLineId, raw) {
    updateLine(costLineId, { amountText: raw.replace(/[^0-9]/g, '').slice(0, 12) })
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
      lines: lines.map((line, index) => ({
        costLineId: line.costLineId,
        note: line.note.trim() === '' ? null : line.note.trim(),
        amount: lineTotals[index],
        shares: lineShares[index],
      })),
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
      <PageHeader backHref={`/session/${session.id}`} title="Edit session" />

      <p className={Style.lede}>
        {current.dateLabel} · change anything below. Everyone’s share is worked out for
        you.
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

      {/* One cost keeps the plain layout it had; several become a list, the
          same shape as New session. `Was …` under a field is the point of
          this screen: you are correcting a number, so the old one has to stay
          in view while you type the new one. */}
      {lines.length === 1 ? (
        <>
          <TextField
            label="Amount"
            value={lines[0].amountText === '' ? '' : formatVnd(lineTotals[0])}
            onChange={(event) => setLineAmount(lines[0].costLineId, event.target.value)}
            placeholder="0đ"
            inputProps={{ inputMode: 'numeric', className: Style.amountInput }}
            helperText={
              lineTotals[0] !== lines[0].amountWas
                ? `Was ${formatVnd(lines[0].amountWas)}`
                : undefined
            }
            fullWidth
            disabled={submitting}
          />

          <TextField
            label="What for"
            value={lines[0].note}
            onChange={(event) =>
              updateLine(lines[0].costLineId, { note: event.target.value })
            }
            placeholder="Courts"
            fullWidth
            disabled={submitting}
          />
        </>
      ) : (
        <section className={Style.section}>
          <SectionHeader meta={formatVnd(total)}>Costs</SectionHeader>

          <ul className={Style.costList}>
            {lines.map((line, index) => (
              <li key={line.costLineId} className={Style.costLine}>
                <div className={Style.costRow}>
                  <TextField
                    label="What for"
                    value={line.note}
                    onChange={(event) =>
                      updateLine(line.costLineId, { note: event.target.value })
                    }
                    placeholder="Courts"
                    size="small"
                    className={Style.costNote}
                    disabled={submitting}
                  />
                  <TextField
                    label="Amount"
                    value={line.amountText === '' ? '' : formatVnd(lineTotals[index])}
                    onChange={(event) =>
                      setLineAmount(line.costLineId, event.target.value)
                    }
                    inputProps={{ inputMode: 'numeric' }}
                    helperText={
                      lineTotals[index] !== line.amountWas
                        ? `Was ${formatVnd(line.amountWas)}`
                        : undefined
                    }
                    size="small"
                    className={Style.costAmount}
                    disabled={submitting}
                  />
                </div>

                {/* No payer select and no remove button. Both change which
                    ledger rows a cost line's debts belong to, which is a
                    different correction from "it cost less than I typed" —
                    and the one this screen's preview can explain. */}
                <p className={Style.hint}>{payerTextFor(line.costLineId)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={Style.section}>
        <SectionHeader meta={<>{participants.length} playing</>}>
          Who played
        </SectionHeader>

        <ChipGroup>
          {members.map((member) => (
            <Chip
              key={member.id}
              selected={Boolean(present[member.id])}
              onClick={() => toggle(member.id)}
              disabled={submitting}
            >
              {nameOf(member)}
            </Chip>
          ))}
        </ChipGroup>
      </section>

      <section className={Style.section}>
        <SectionHeader>What changes</SectionHeader>

        <ul className={Style.rows}>
          {preview.map((row) => (
            <li key={row.memberId} className={Style.row}>
              <span className={Style.rowName}>
                {row.name}
                {row.isOut && <span className={Style.outTag}>Out</span>}
              </span>

              <span className={clsx(Style.change, row.changed && Style.changed)}>
                {formatVnd(row.was)} → {formatVnd(row.next)}
              </span>
            </li>
          ))}
        </ul>

        <p className={Style.hint}>
          The original numbers stay recorded. This is saved as a separate edit, shown on
          the session with your name on it.
        </p>
      </section>

      {warnings.length > 0 && (
        <section className={Style.warnBox}>
          {warnings.map((row) => (
            <p key={row.memberId} className={Style.warnText}>
              {row.name} already paid {formatVnd(row.paid)}. Their share becomes{' '}
              {formatVnd(row.next)}, so {formatVnd(row.paid - row.next)} comes back to
              them — it shows up as a debt for whoever paid the bill.
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
