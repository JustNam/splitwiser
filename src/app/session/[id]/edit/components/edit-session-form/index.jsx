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

import { useState } from 'react'
import { useSignedOutRedirect } from '@/hooks/useSignedOutRedirect'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import { SessionsApi } from '@/api/sessions'
import { Button } from '@/components/Button'
import { SplitPicker } from '@/components/SplitPicker'
import { SectionHeader } from '@/components/SectionHeader'
import { LoadingForm } from '@/components/Loading'
import { RetryMessage } from '@/components/RetryMessage'
import { useToast } from '@/components/Toast'
import { PageHeader } from '@/components/PageHeader'
import { PayerPicker } from '@/components/PayerPicker'
import { PlayerPicker } from '@/components/PlayerPicker'
import { useGroupData } from '@/components/GroupDataProvider'
import { displayName, formatVnd } from '@/services/money.service'
import { formatSessionDate } from '@/services/session.service'
import { sessionDetail } from '@/services/session-detail.service'
import {
  readBackSplit,
  seedInputs,
  splitPlan,
  spreadTheRest,
} from '@/services/split-plan.service'
import { SPLIT_EQUAL } from '@/services/split.service'
import Style from './style.module.scss'

export function EditSessionForm() {
  const {
    status,
    group,
    snapshot,
    error: loadError,
    reload,
    revalidate,
  } = useGroupData()

  useSignedOutRedirect(status)

  const { id } = useParams()
  const router = useRouter()
  const toast = useToast()

  // Which session this form was filled in from. Prefilling happens once per
  // session, not on every render and not again when the shared copy refreshes
  // underneath — that would throw away what is being typed.
  const [seededFor, setSeededFor] = useState(null)

  const [date, setDate] = useState('')

  // One entry per cost, seeded from what is recorded. `costLineId` is what
  // ties a row back to the ledger it has to correct — edit_session() works
  // out each person's delta against the rows already on that line.
  const [lines, setLines] = useState([])

  const [present, setPresent] = useState({})
  const [why, setWhy] = useState('')

  const [method, setMethod] = useState(SPLIT_EQUAL)
  const [inputs, setInputs] = useState({})

  // Whether anybody has typed into the split. Decides if changing the line-up
  // may re-seed it, or has to leave what was entered alone.
  const [inputsTouched, setInputsTouched] = useState(false)

  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const session =
    status === 'ready' ? snapshot.sessions.find((row) => row.id === id) : null

  const costLines = session
    ? snapshot.costLines.filter((line) => line.sessionId === session.id)
    : []

  // What is recorded right now, from the same function B3 renders. Worked out
  // before the seeding below rather than after it, because the split has to
  // be read back out of these amounts — they are the only surviving record of
  // how the session was divided.
  const current = session
    ? sessionDetail({
        session,
        costLines: snapshot.costLines,
        participants: snapshot.participants,
        ledger: snapshot.ledger,
        members: snapshot.members,
        accounts: snapshot.accounts,
        myMemberId: group.myMemberId,
      })
    : null

  // Prefilled with what is recorded now — the point of the screen is to
  // change one thing, not to retype the session. During render rather than in
  // an effect: React re-runs this before painting, so nobody sees the empty
  // form first.
  if (session && seededFor !== session.id) {
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

    const playing = Object.fromEntries(
      snapshot.participants
        .filter((row) => row.sessionId === session.id)
        .map((row) => [row.memberId, true])
    )
    setPresent(playing)

    // The split too. Without this the form opened on Equally regardless of
    // how the session had actually been divided, so a 70/30 session became
    // 50/50 the moment anything at all was saved — and the leave guard asked
    // about unsaved changes on a form nobody had touched.
    const seeded = readBackSplit({
      lineTotals: costLines.map((line) => line.amount),
      // The roster's order, which is the order the form itself builds
      // participantIds in below — not the participants table's.
      participantIds: snapshot.members
        .filter((member) => playing[member.id])
        .map((member) => member.id),
      recorded: Object.fromEntries(
        current.people.map((person) => [person.memberId, person.amount])
      ),
    })

    setMethod(seeded.method)
    setInputs(seeded.inputs)

    // Recorded numbers are not numbers somebody has typed on this screen, so
    // adding a player still re-seeds rather than leaving them on 0.
    setInputsTouched(false)

    setSeededFor(session.id)
  }

  // Header in every state. A failed load used to leave a bare sentence with
  // no back arrow anywhere on it.
  if (status !== 'ready' || !session || seededFor !== session.id) {
    // backHref is the default '/' here on purpose: the session id in the URL
    // is the one thing that just failed to resolve, so sending someone back
    // to /session/<that id> is sending them to the same wall.
    return (
      <>
        <PageHeader title="Edit session" />

        {(status === 'loading' || (status === 'ready' && session)) && (
          <LoadingForm fields={3} />
        )}

        {status === 'error' && <RetryMessage message={loadError} onRetry={reload} />}

        {(status === 'no-group' || (status === 'ready' && !session)) && (
          <p className={Style.hint}>That session isn’t in your group.</p>
        )}
      </>
    )
  }


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

  // Only meaningful when everybody owes the same, which is only under an
  // equal split — and even then the odd đồng makes one person differ, so it
  // is the smallest.
  const shareAmounts = Object.values(plan.shares)
  const evenShare = shareAmounts.length > 0 ? Math.min(...shareAmounts) : null

  // Everyone the edit touches: who plays now, plus anyone who used to and
  // doesn't any more. The second half is what makes a removal visible.
  const touchedIds = [...new Set([...currentById.keys(), ...participantIds])]

  const everyone = touchedIds.map((memberId) => {
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

  // The section is called What changes, so it lists what changes. Everybody
  // whose share is the same afterwards was a row saying "nothing happened to
  // this person" — at thirty players, thirty of them.
  // What the section below lists. The warnings and the checks underneath
  // deliberately keep reading `everyone`: somebody who has already paid
  // matters to the payer-change warning whether or not their own share
  // moved, and filtering them out of that would drop a real warning to tidy
  // a list.
  const preview = everyone.filter((row) => row.changed)
  const unchanged = everyone.length - preview.length

  // Someone who has handed money over and whose share is dropping ends up
  // owed the difference. It's not an error, but it is a consequence the
  // person editing has to see BEFORE saving.
  const warnings = everyone.filter((row) => row.paid > 0 && row.paid > row.next)

  // Changing who paid does not move money that has already changed hands.
  // Whoever was paid keeps it and ends up owing it back, which is right but
  // is not what anyone expects from editing a dropdown.
  const movedPayer = lines.filter((line) => line.payerId !== line.payerWas)
  const alreadyPaid = everyone.filter((row) => row.paid > 0)

  const changedAnything =
    date !== session.date ||
    lines.some(
      (line, index) =>
        lineTotals[index] !== line.amountWas ||
        line.note.trim() !== line.noteWas ||
        line.payerId !== line.payerWas
    ) ||
    everyone.some((row) => row.changed)

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

    const out = everyone.filter((row) => row.isOut).map((row) => row.name)
    const added = everyone
      .filter((row) => !row.isOut && !currentById.has(row.memberId))
      .map((row) => row.name)

    if (out.length > 0) parts.push(`Out: ${out.join(', ')}`)
    if (added.length > 0) parts.push(`In: ${added.join(', ')}`)

    const sentence = parts.length > 0 ? parts.join(' · ') : 'Session edited'
    return why.trim() === '' ? sentence : `${sentence} — ${why.trim()}`
  }

  /**
   * Re-seed the split when the line-up changes.
   *
   * A percentage or a share count describes a SET of people. Tick somebody in
   * afterwards and the old numbers no longer describe anybody: the newcomer
   * sits at 0 and the column stops adding to 100, on a screen that then
   * refuses to save and does not say the line-up is why.
   *
   * Only while nobody has typed. Numbers somebody entered on purpose are the
   * one thing this must not quietly rewrite — there, the newcomer stays at 0,
   * the readout says how far off the total is, and "Split the rest evenly" is
   * the deliberate fix.
   */
  function reseedFor(nextPresent) {
    if (inputsTouched) return

    const nextIds = members.filter((m) => nextPresent[m.id]).map((m) => m.id)
    setInputs(seedInputs(method, nextIds, total))
  }

  function changeMethod(nextMethod) {
    setMethod(nextMethod)
    setInputs(seedInputs(nextMethod, participantIds, total))
    setInputsTouched(false)
  }

  function setInput(memberId, value) {
    setInputs((current) => ({ ...current, [memberId]: value }))
    setInputsTouched(true)
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
    // Built here rather than in a setState updater: the updater has to stay
    // a pure function, and React may run it twice.
    const next = { ...present, [memberId]: !present[memberId] }
    setPresent(next)
    reseedFor(next)
  }

  function setAll(value) {
    const next = Object.fromEntries(members.map((member) => [member.id, value]))
    setPresent(next)
    reseedFor(next)
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
    revalidate()

    // replace, not push — see the note on the same line in New session. The
    // entry being replaced is the spare one the leave guard pushed.
    router.replace(`/session/${session.id}`)
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
          {/* Amount and who paid on one row, what it was for underneath —
              the same shape as a session with several costs, so the form does
              not rearrange itself when a second one is added. */}
          <div className={Style.costRow}>
            <TextField
              label="Amount"
              value={lines[0].amountText === '' ? '' : formatVnd(lineTotals[0])}
              onChange={(event) =>
                setLineAmount(lines[0].costLineId, event.target.value)
              }
              placeholder="0đ"
              className={Style.costAmount}
              slotProps={{
                htmlInput: { inputMode: 'numeric', className: Style.amountInput },
              }}
              helperText={
                lineTotals[0] !== lines[0].amountWas
                  ? `Was ${formatVnd(lines[0].amountWas)}`
                  : undefined
              }
              disabled={submitting}
            />

            <PayerPicker
              className={Style.costPayer}
              members={members}
              nameOf={nameOf}
              value={lines[0].payerId}
              onChange={(payerId) => updateLine(lines[0].costLineId, { payerId })}
              disabled={submitting}
            />
          </div>

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
                {/* How much, then who paid, then what it was for — the same
                    order as the single-cost layout above, and the order
                    somebody reads a receipt in. */}
                <div className={Style.costRow}>
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

                  <PayerPicker
                    className={Style.costPayer}
                    members={members}
                    nameOf={nameOf}
                    value={line.payerId}
                    onChange={(payerId) => updateLine(line.costLineId, { payerId })}
                    size="small"
                    disabled={submitting}
                  />
                </div>

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
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={Style.section}>
        <SectionHeader
          meta={
            <>
              {participants.length} of {members.length}
            </>
          }
        >
          Who played
        </SectionHeader>

        {/* The same control New session uses. This screen had a bare wall of
            chips with no search and no Everyone/Nobody — the two screens
            asked the same question and answered it differently. */}
        <PlayerPicker
          members={members}
          nameOf={nameOf}
          present={present}
          onToggle={toggle}
          onSetAll={setAll}
          disabled={submitting}
        />
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
        <SectionHeader
          meta={unchanged > 0 ? <>{unchanged} unchanged</> : null}
        >
          What changes
        </SectionHeader>

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

        {/* The same running total New session ends with. Editing is where
            the numbers are most likely to be wrong, so it is the screen that
            needed it most and was the one without it. */}
        <div className={Style.footerSummary}>
          <span>
            {participants.length} playing
            {method === SPLIT_EQUAL && evenShare !== null
              ? ` · ${formatVnd(evenShare)} each`
              : ''}
          </span>
          <span className={Style.footerTotal}>{formatVnd(total)}</span>
        </div>

        <Button type="submit" fullWidth disabled={Boolean(blockedText) || submitting}>
          {submitting && <CircularProgress size={16} color="inherit" />}
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>
      </footer>
    </form>
  )
}
