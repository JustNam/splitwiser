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
 * with its own payer, and both the payer and the way it is divided can be
 * corrected here.
 *
 * Changing the payer is the one correction with a trap in it, and the trap is
 * in the SQL rather than here: migration 0010 cancels what people were
 * CHARGED rather than what they still owe, so somebody who already paid the
 * old payer ends up owed that money back instead of quietly losing it.
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import { GroupsApi } from '@/api/groups'
import { SessionsApi } from '@/api/sessions'
import { Button } from '@/components/Button'
import { Chip, ChipGroup } from '@/components/Chip'
import { SplitPicker } from '@/components/SplitPicker'
import { SectionHeader } from '@/components/SectionHeader'
import { LoadingForm } from '@/components/Loading'
import { RetryMessage } from '@/components/RetryMessage'
import { useToast } from '@/components/Toast'
import { PageHeader } from '@/components/PageHeader'
import { TextLink } from '@/components/TextLink'
import { useAuth } from '@/hooks/useAuth'
import { pickCurrentGroup } from '@/lib/current-group'
import { displayName, formatVnd } from '@/services/money.service'
import { formatSessionDate } from '@/services/session.service'
import { sessionDetail } from '@/services/session-detail.service'
import { seedInputs, splitPlan, spreadTheRest } from '@/services/split-plan.service'
import { SPLIT_EQUAL } from '@/services/split.service'
import Style from './style.module.scss'

export function EditSessionForm() {
  const { user, loading: authLoading } = useAuth()
  const { id } = useParams()
  const router = useRouter()
  const toast = useToast()

  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  function reload() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  const [date, setDate] = useState('')

  // One entry per cost, seeded from what is recorded. `costLineId` is what
  // ties a row back to the ledger it has to correct — edit_session() works
  // out each person's delta against the rows already on that line.
  const [lines, setLines] = useState([])

  const [present, setPresent] = useState({})
  const [why, setWhy] = useState('')

  const [method, setMethod] = useState(SPLIT_EQUAL)
  const [inputs, setInputs] = useState({})

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
          payerId: line.payerMemberId,
          amountWas: line.amount,
          noteWas: line.note ?? '',
          payerWas: line.payerMemberId,
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
  }, [authLoading, user, id, attempt])

  // Header in every state. A failed load used to leave a bare sentence with
  // no back arrow anywhere on it.
  if (authLoading || !user || state.status !== 'ready') {
    // backHref is the default '/' here on purpose: the session id in the URL
    // is the one thing that just failed to resolve, so sending someone back
    // to /session/<that id> is sending them to the same wall.
    return (
      <>
        <PageHeader title="Edit session" />

        {(authLoading || state.status === 'loading') && <LoadingForm fields={3} />}

        {!authLoading && !user && (
          <p className={Style.error} role="alert">
            You need to <TextLink href="/signin">sign in</TextLink> first.
          </p>
        )}

        {user && state.status === 'error' && (
          <RetryMessage message={state.error} onRetry={reload} />
        )}

        {user && state.status === 'not-found' && (
          <p className={Style.hint}>That session isn’t in your group.</p>
        )}
      </>
    )
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

  const multiLine = lines.length > 1
  const lineTotals = lines.map((line) => Number(line.amountText || 0))

  const plan = splitPlan({ lineTotals, participantIds, method, inputs })
  const { lineShares, total } = plan
  const nextShares = plan.shares

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

  // Changing who paid does not move money that has already changed hands.
  // Whoever was paid keeps it and ends up owing it back, which is right but
  // is not what anyone expects from editing a dropdown.
  const movedPayer = lines.filter((line) => line.payerId !== line.payerWas)
  const alreadyPaid = preview.filter((row) => row.paid > 0)

  const changedAnything =
    date !== session.date ||
    lines.some(
      (line, index) =>
        lineTotals[index] !== line.amountWas ||
        line.note.trim() !== line.noteWas ||
        line.payerId !== line.payerWas
    ) ||
    preview.some((row) => row.changed)

  const blockedText = lineTotals.some((amount) => amount <= 0)
    ? lines.length === 1
      ? 'Enter how much the session cost.'
      : 'Every cost needs an amount above zero.'
    : participantIds.length === 0
      ? 'Tick at least one person who played.'
      : lines.some((line) => line.payerId === '')
        ? 'Choose who paid.'
        : plan.problem
          ? plan.problem
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

    lines.forEach((line) => {
      if (line.payerId !== line.payerWas) {
        parts.push(
          `${line.note.trim() || 'Cost'}: paid by ${nameOfId(
            line.payerWas
          )} → ${nameOfId(line.payerId)}`
        )
      }
    })

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

  function changeMethod(nextMethod) {
    setMethod(nextMethod)
    setInputs(seedInputs(nextMethod, participantIds, total))
  }

  function setInput(memberId, value) {
    setInputs((current) => ({ ...current, [memberId]: value }))
  }

  function splitTheRest() {
    setInputs(spreadTheRest({ participantIds, method, inputs, ...plan }))
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
        payerMemberId: line.payerId,
        shares: lineShares[index],
      })),
      participantIds,
      summary: summary(),
    })

    if (apiError) {
      setError(apiError)
      toast.error(apiError)
      setSubmitting(false)
      return
    }

    toast.success('Changes saved')
    router.push(`/session/${session.id}`)
  }

  return (
    <form className={Style.form} onSubmit={handleSubmit} noValidate>
      <PageHeader
        backHref={`/session/${session.id}`}
        title="Edit session"
        guard={{
          when: changedAnything && !submitting,
          message: 'These changes haven’t been saved. The session stays as it was.',
        }}
      />

      <p className={Style.lede}>
        {current.dateLabel} · change anything below. Everyone’s share is worked out for
        you.
      </p>

      <TextField
        label="Date"
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
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
            slotProps={{
              htmlInput: { inputMode: 'numeric', className: Style.amountInput },
            }}
            helperText={
              lineTotals[0] !== lines[0].amountWas
                ? `Was ${formatVnd(lines[0].amountWas)}`
                : undefined
            }
            fullWidth
            disabled={submitting}
          />

          <FormControl fullWidth disabled={submitting}>
            <InputLabel id="payer-label">Paid by</InputLabel>
            <Select
              labelId="payer-label"
              label="Paid by"
              value={lines[0].payerId}
              onChange={(event) =>
                updateLine(lines[0].costLineId, { payerId: event.target.value })
              }
            >
              {members.map((member) => (
                <MenuItem key={member.id} value={member.id}>
                  {nameOf(member)}
                  {member.type === 'guest' ? ' (guest)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

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
                    slotProps={{ htmlInput: { inputMode: 'numeric' } }}
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

                <FormControl size="small" fullWidth disabled={submitting}>
                  <InputLabel id={`payer-${line.costLineId}`}>Paid by</InputLabel>
                  <Select
                    labelId={`payer-${line.costLineId}`}
                    label="Paid by"
                    value={line.payerId}
                    onChange={(event) =>
                      updateLine(line.costLineId, { payerId: event.target.value })
                    }
                  >
                    {members.map((member) => (
                      <MenuItem key={member.id} value={member.id}>
                        {nameOf(member)}
                        {member.type === 'guest' ? ' (guest)' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
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

      <SplitPicker
        plan={plan}
        method={method}
        inputs={inputs}
        participants={participants}
        nameOf={nameOf}
        multiLine={multiLine}
        disabled={submitting}
        onMethodChange={changeMethod}
        onInputChange={setInput}
        onSplitTheRest={splitTheRest}
      />

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

      {(warnings.length > 0 || (movedPayer.length > 0 && alreadyPaid.length > 0)) && (
        <section className={Style.warnBox}>
          {movedPayer.length > 0 && alreadyPaid.length > 0 && (
            <p className={Style.warnText}>
              {alreadyPaid.map((row) => row.name).join(', ')} already paid{' '}
              {movedPayer.map((line) => nameOfId(line.payerWas)).join(', ')}. That money
              stays where it went, so it becomes a debt back to them rather than
              disappearing.
            </p>
          )}

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
