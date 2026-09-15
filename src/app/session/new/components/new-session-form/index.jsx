'use client'

/**
 * B2 · New session — form.
 *
 * A session can have several costs, each with its own payer — the court paid
 * by one person, the shuttles by another. One is the default and looks like a
 * single form; the rest appear only if asked for, so the common case never
 * shows the words "cost line".
 *
 * The split is worked out PER COST LINE, which is the unit the design splits:
 * "five ways to split a cost line's total". The method is chosen once for the
 * session and its weights apply to every line.
 *
 * A guest added here is NOT written to the database until the session is
 * saved. Writing on Add meant a mistyped name, or a form abandoned half way,
 * left a person in the group for good — and nothing in the app can remove
 * them. Until Save they are held locally under a temporary id.
 *
 * The email is optional and is about later, not now: when that person signs
 * up and confirms the address, this row becomes their membership with its
 * whole history attached (migration 0008). Optional because the spec makes a
 * point of a guest needing only a name — this is the action repeated most
 * often, usually standing at the court with one more person turning up.
 */

import { useRef, useState } from 'react'
import { useSignedOutRedirect } from '@/hooks/useSignedOutRedirect'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import { GroupsApi } from '@/api/groups'
import { InvitesApi } from '@/api/invites'
import { SessionsApi } from '@/api/sessions'
import { Button } from '@/components/Button'
import { Chip, ChipGroup } from '@/components/Chip'
import { SectionHeader } from '@/components/SectionHeader'
import { SplitPicker } from '@/components/SplitPicker'
import { TextButton } from '@/components/TextButton'
import AddIcon from '@mui/icons-material/Add'
import Collapse from '@mui/material/Collapse'
import { LoadingForm } from '@/components/Loading'
import { PageHeader } from '@/components/PageHeader'
import { PayerPicker } from '@/components/PayerPicker'
import { RetryMessage } from '@/components/RetryMessage'
import { useToast } from '@/components/Toast'
import { LinkButton } from '@/components/LinkButton'
import { useGroupData } from '@/components/GroupDataProvider'
import { displayName, formatVnd } from '@/services/money.service'
import {
  formatSessionDate,
  lastPlayedByMember,
  latestLineUp,
} from '@/services/session.service'
import { seedInputs, splitPlan, spreadTheRest } from '@/services/split-plan.service'
import {
  SPLIT_ADJUSTED,
  SPLIT_EQUAL,
  SPLIT_EXACT,
} from '@/services/split.service'
import Style from './style.module.scss'

/**
 * Today as 'YYYY-MM-DD', which is what <input type="date"> expects.
 *
 * Built from the local parts on purpose. toISOString() converts to UTC first,
 * so anywhere east of London it hands back yesterday for part of the day — in
 * Vietnam, every session logged before 7am would land on the wrong date.
 */
function todayIso() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function NewSessionForm() {
  const {
    status,
    group,
    snapshot,
    error: loadError,
    reload,
    revalidate,
    patch,
  } = useGroupData()

  useSignedOutRedirect(status)

  const router = useRouter()
  const toast = useToast()

  // Which group this screen's opening line-up was worked out from. Seeding
  // has to happen once per group, not once per render and not again every
  // time the shared copy is refreshed underneath.
  const [seededFor, setSeededFor] = useState(null)

  const [date, setDate] = useState(todayIso)

  // One entry per cost. `amountText` is digits as a string, because '' and 0
  // are different things to a form: one is "hasn't typed yet", the other is a
  // real amount. `key` is for React, since rows are added and removed and an
  // index would reassign the wrong field to the wrong row.
  const [lines, setLines] = useState([
    { key: 1, note: '', amountText: '', payerId: '' },
  ])

  // memberId -> true. An object rather than an array because the question
  // asked of it is always "is this one ticked?".
  const [present, setPresent] = useState({})

  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')

  // Collapsed until asked for. Adding a guest is the exception — most weeks
  // it is the same people — and two empty fields sitting open suggest
  // otherwise.
  const [addingGuest, setAddingGuest] = useState(false)

  // Only rendered once the roster is long enough to be worth searching.
  const [search, setSearch] = useState('')
  const [guestClash, setGuestClash] = useState(null)

  // Guests typed in but not yet written. Each carries a temporary id of the
  // form 'new:1'. Everything downstream — the chips, computeSplit(), the
  // "Paid by" select — only ever treats an id as an opaque string, so a
  // placeholder works everywhere a real one does, right up to the save.
  const [pendingGuests, setPendingGuests] = useState([])

  // The line-up this screen STARTED from, as a sorted string. Ticking people
  // is work too, and the leave guard has to tell "I chose these twelve" from
  // "the screen guessed these twelve for me".
  //
  // State, not a ref: it is read while rendering, and a ref read during
  // render is a value React has not promised to have kept up to date.
  const [seed, setSeed] = useState('')

  const [method, setMethod] = useState(SPLIT_EQUAL)

  // memberId -> a number whose MEANING is set by `method`: đồng, percent,
  // share count, or đồng to add on top of an equal share. Cleared whenever
  // the method changes, because 50 does not mean the same thing twice.
  const [inputs, setInputs] = useState({})

  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // A ref, not state: bumping it must not cause a render, and it has to
  // survive one without being reset.
  const nextGuestKey = useRef(1)


  const nextLineKey = useRef(2)

  // Seeding the form from the data it was fetched with, during render rather
  // than in an effect. This is React's own pattern for adjusting state when
  // what it was derived from changes: setting state while rendering makes
  // React re-run this component before it paints, so nobody sees the empty
  // version first. An effect would run after the paint, and the screen would
  // flash an empty line-up.
  if (status === 'ready' && seededFor !== group.id) {
    // Start from last week's line-up: the same people mostly turn up, so the
    // common case is no taps at all. A group that has never played falls back
    // to everyone, which is right when there are two of you.
    const lineUp = latestLineUp(snapshot.sessions, snapshot.participants)
    const starting = lineUp.length > 0 ? lineUp : snapshot.members.map((m) => m.id)

    setSeed([...starting].sort().join(','))
    setPresent(Object.fromEntries(starting.map((memberId) => [memberId, true])))

    // "I paid" pre-selected: it is the common case, and the select is right
    // there for the weeks it isn't.
    setLines([{ key: 1, note: '', amountText: '', payerId: group.myMemberId }])

    setSeededFor(group.id)
  }

  const header = <PageHeader title="New session" />


  if (status === 'error') {
    return (
      <>
        {header}
        <RetryMessage message={loadError} onRetry={reload} />
      </>
    )
  }

  // Not an error, a missing prerequisite — and the two ways to fix it are one
  // tap away, so they go here rather than leaving the screen as a sentence
  // with no way out of it.
  if (status === 'no-group') {
    return (
      <>
        {header}
        <p className={Style.hint}>You are not in a group yet.</p>

        <div className={Style.noGroupActions}>
          <LinkButton href="/group/new">New group</LinkButton>
          <LinkButton variant="secondary" href="/join">
            Join with a code
          </LinkButton>
        </div>
      </>
    )
  }

  // Waiting on the fetch, or on the line-up being worked out from it. Both
  // are "there is nothing to show yet".
  if (status !== 'ready' || seededFor !== group.id) {
    return (
      <>
        {header}
        <LoadingForm fields={3} />
      </>
    )
  }

  const data = { group, ...snapshot }

  // ---- everything below is derived from state, recomputed every render ----

  const { accounts } = data

  // Real members plus the ones waiting to be written. Shaped like a member
  // row so nothing below has to know the difference.
  const members = [...data.members, ...pendingGuests]
  const nameOf = (member) => displayName(member, accounts)

  const participants = members.filter((member) => present[member.id])
  const participantIds = participants.map((member) => member.id)

  // Regulars first, then whoever played longest ago, then names. A pending
  // guest has never played and sorts to the end — but they were just typed
  // in, so they are pulled to the front instead.
  const lastPlayed = lastPlayedByMember(data.sessions, data.participants)
  const ordered = [...members].sort((a, b) => {
    const aNew = a.id.startsWith('new:')
    const bNew = b.id.startsWith('new:')
    if (aNew !== bNew) return aNew ? -1 : 1

    const byDate = (lastPlayed.get(b.id) ?? '').localeCompare(
      lastPlayed.get(a.id) ?? ''
    )
    if (byDate !== 0) return byDate

    return nameOf(a).localeCompare(nameOf(b))
  })

  // A search box below this many people is a box nobody needs.
  const SEARCHABLE_FROM = 8
  const searchable = members.length >= SEARCHABLE_FROM

  const query = search.trim().toLowerCase()
  const visible =
    query === ''
      ? ordered
      : ordered.filter((m) => nameOf(m).toLowerCase().includes(query))

  const lastSession = data.sessions[0]

  const multiLine = lines.length > 1
  const lineTotals = lines.map((line) => Number(line.amountText || 0))

  // The amounts, and whether they can be saved. Both screens ask the same
  // question of the same function.
  const plan = splitPlan({ lineTotals, participantIds, method, inputs })
  const { lineShares, total } = plan

  // Only meaningful when everybody owes the same, which is only under an
  // equal split — and even then the odd đồng makes one person differ, so it
  // is the smallest.
  const shareAmounts = Object.values(plan.shares)
  const evenShare = shareAmounts.length > 0 ? Math.min(...shareAmounts) : null

  // Ordered by which fix comes first, so the message points at the next thing
  // to do rather than the last thing missing.
  const blockedText = lineTotals.some((amount) => amount <= 0)
    ? multiLine
      ? 'Every cost needs an amount above zero.'
      : 'Enter how much the session cost.'
    : participantIds.length === 0
      ? 'Tick at least one person who played.'
      : lines.some((line) => line.payerId === '')
        ? 'Choose who paid.'
        : plan.problem

  function updateLine(key, patch) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line))
    )
  }

  function setLineAmount(key, raw) {
    // Strip everything that isn't a digit, so a pasted "300.000đ" becomes
    // 300000 rather than NaN.
    updateLine(key, { amountText: raw.replace(/[^0-9]/g, '').slice(0, 12) })
  }

  function addLine() {
    const key = nextLineKey.current
    nextLineKey.current += 1

    setLines((current) => [
      ...current,
      { key, note: '', amountText: '', payerId: data.group.myMemberId },
    ])

    // Exact and Adjusted stop being offered once there are two costs, so a
    // split already typed in đồng has to go back to something that survives
    // the change rather than silently meaning something else.
    if (method === SPLIT_EXACT || method === SPLIT_ADJUSTED) {
      setMethod(SPLIT_EQUAL)
      setInputs({})
    }
  }

  function removeLine(key) {
    setLines((current) => current.filter((line) => line.key !== key))
  }

  function toggle(memberId) {
    setPresent((current) => ({ ...current, [memberId]: !current[memberId] }))
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

  function setAll(value) {
    setPresent(Object.fromEntries(members.map((member) => [member.id, value])))
  }

  function handleAddGuest() {
    const name = guestName.trim()
    if (name === '') return

    // What the design wants for a clash isn't an error — it's the offer to
    // reuse the person already in the group. add_guest() refuses duplicates
    // too, but only with a message; the offer needs the existing member.
    const existing = members.find(
      (member) =>
        member.type === 'guest' && nameOf(member).toLowerCase() === name.toLowerCase()
    )
    if (existing) return setGuestClash(existing)

    // Nothing leaves the browser here. `new:` is not a uuid, so it cannot
    // collide with a real member id.
    const guest = {
      id: `new:${nextGuestKey.current}`,
      name,
      email: guestEmail.trim() === '' ? null : guestEmail.trim(),
      type: 'guest',
      accountId: null,
    }
    nextGuestKey.current += 1

    setPendingGuests((current) => [...current, guest])
    setPresent((current) => ({ ...current, [guest.id]: true }))
    setGuestName('')
    setGuestEmail('')
    setAddingGuest(false)
  }

  function useExistingGuest() {
    setPresent((current) => ({ ...current, [guestClash.id]: true }))
    setGuestClash(null)
    setGuestName('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (blockedText) return

    setSubmitting(true)
    setError(null)

    // The guests become real here, and only here. A guest that is written
    // moves out of pendingGuests immediately, so pressing Save again after a
    // failure doesn't try to create the same person twice.
    const realId = new Map()

    for (const guest of pendingGuests) {
      const { data: member, error: guestError } = await GroupsApi.addGuest(
        data.group.id,
        guest.name,
        guest.email
      )

      if (guestError) {
        setError(guestError)
        setSubmitting(false)
        return
      }

      realId.set(guest.id, member.id)

      // Only a guest gets invited. An email that already had an account comes
      // back as a roster member — they are in the group and need no email.
      //
      // Not awaited: the session is what the user pressed the button for, and
      // a mail server having a bad day must not stand between them and it.
      if (guest.email && member.type === 'guest') {
        InvitesApi.send({ email: guest.email, groupId: data.group.id })
      }

      // Into the shared copy, so the roster this screen shows and the one
      // every other screen shows stay the same list.
      patch((current) => ({
        snapshot: {
          ...current.snapshot,
          members: [...current.snapshot.members, member],
        },
      }))
      setPendingGuests((current) => current.filter((row) => row.id !== guest.id))
      setPresent((current) => ({ ...current, [member.id]: true }))
    }

    // Swap the placeholders for the ids the database gave back. The amounts
    // are carried over untouched rather than recomputed — they already add up
    // to the total exactly, and recomputing invites them not to.
    const swap = (id) => realId.get(id) ?? id

    const { data: created, error: apiError } = await SessionsApi.create({
      groupId: data.group.id,
      date,
      lines: lines.map((line, index) => ({
        note: line.note.trim() === '' ? null : line.note.trim(),
        amount: lineTotals[index],
        payerMemberId: swap(line.payerId),
        shares: Object.fromEntries(
          Object.entries(lineShares[index]).map(([id, amount]) => [swap(id), amount])
        ),
      })),
      participantIds: participantIds.map(swap),
    })

    if (apiError) {
      setError(apiError)
      toast.error(apiError)
      setSubmitting(false)
      return
    }

    toast.success('Session saved')

    // B3 is about to render this session out of the shared copy, which does
    // not have it yet. Background refresh: the screen fills in rather than
    // blanking on arrival.
    revalidate()

    // Straight to B3, which the spec calls the confirmation you see right
    // after logging a session. This used to go to Home because B3 did not
    // exist; it does now, and Home makes you hunt for the thing you just
    // saved in order to check it came out right.
    router.push(`/session/${created.id}`)
  }

  // What leaving would throw away. Money typed and names typed, plus a
  // line-up that is no longer the one the screen guessed — ticking twelve of
  // thirty people is work, and it is lost as completely as the amount is.
  const dirty =
    lines.some((line) => line.amountText !== '' || line.note.trim() !== '') ||
    pendingGuests.length > 0 ||
    guestName.trim() !== '' ||
    [...participantIds].sort().join(',') !== seed

  return (
    <form className={Style.form} onSubmit={handleSubmit} noValidate>
      <PageHeader
        title="New session"
        guard={{
          when: dirty && !submitting,
          message: 'This session hasn’t been saved. Nothing is recorded yet.',
        }}
      />

      <TextField
        label="Date"
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        // Without shrink the label sits on top of the date placeholder, which
        // a date input always shows.
        slotProps={{ inputLabel: { shrink: true } }}
        fullWidth
        disabled={submitting}
      />

      {/* One cost looks like a plain form: an amount, who paid, what for. The
          word "cost line" appears nowhere, because the common case is one
          person paying for one thing and it should not have to know about the
          concept at all. */}
      {lines.length === 1 ? (
        <>
          <TextField
            label="Amount"
            value={lines[0].amountText === '' ? '' : formatVnd(lineTotals[0])}
            onChange={(event) => setLineAmount(lines[0].key, event.target.value)}
            placeholder="0đ"
            // A numeric keypad on a phone. type="number" gives one too, but it
            // also allows "e", "-" and spinner arrows.
            slotProps={{
              htmlInput: { inputMode: 'numeric', className: Style.amountInput },
            }}
            fullWidth
            disabled={submitting}
          />

          <PayerPicker
            members={members}
            nameOf={nameOf}
            value={lines[0].payerId}
            onChange={(payerId) => updateLine(lines[0].key, { payerId })}
            disabled={submitting}
          />

          <TextField
            label="What for"
            value={lines[0].note}
            onChange={(event) => updateLine(lines[0].key, { note: event.target.value })}
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
              <li key={line.key} className={Style.costLine}>
                <div className={Style.costRow}>
                  <TextField
                    label="What for"
                    value={line.note}
                    onChange={(event) =>
                      updateLine(line.key, { note: event.target.value })
                    }
                    placeholder="Courts"
                    size="small"
                    className={Style.costNote}
                    disabled={submitting}
                  />
                  <TextField
                    label="Amount"
                    value={line.amountText === '' ? '' : formatVnd(lineTotals[index])}
                    onChange={(event) => setLineAmount(line.key, event.target.value)}
                    slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                    size="small"
                    className={Style.costAmount}
                    disabled={submitting}
                  />
                </div>

                <div className={Style.costRow}>
                  <PayerPicker
                    members={members}
                    nameOf={nameOf}
                    value={line.payerId}
                    onChange={(payerId) => updateLine(line.key, { payerId })}
                    size="small"
                    disabled={submitting}
                  />

                  <TextButton
                    onClick={() => removeLine(line.key)}
                    disabled={submitting}
                  >
                    Remove
                  </TextButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The wireframe's own words. It says what the second cost is FOR,
          which "+ Add cost" would not: the point is that somebody else paid
          for something. */}
      <TextButton onClick={addLine} disabled={submitting}>
        <AddIcon fontSize="small" />
        Someone paid for something else
      </TextButton>

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

        {/* Both, not a single toggle: with a long roster you sometimes want to
            start from nobody and sometimes from everybody, and a toggle makes
            you guess which one it will do.

            Quiet, and only once the roster is long enough to need the search
            box. At four people they save nobody a tap, and in brand red they
            were a third different red in a block that already had the picked
            chips and the focused field. */}
        {(searchable || lastSession) && (
          <div className={Style.pickRow}>
            {searchable && (
              <>
                <TextButton
                  tone="quiet"
                  onClick={() => setAll(true)}
                  disabled={submitting}
                >
                  Everyone
                </TextButton>
                <TextButton
                  tone="quiet"
                  onClick={() => setAll(false)}
                  disabled={submitting}
                >
                  Nobody
                </TextButton>
              </>
            )}

            {/* Says what it means, and only while it is true.
                "Starting from 14 Sep" named a date without saying what
                started, and it stayed on screen after the line-up had been
                changed — at which point it was simply wrong. `seed` is the
                line-up this screen opened with, so comparing against it is
                how the sentence knows to leave. */}
            {lastSession && [...participantIds].sort().join(',') === seed && (
              <p className={Style.pickNote}>
                Same players as {formatSessionDate(lastSession.date)}
              </p>
            )}
          </div>
        )}

        {searchable && (
          <TextField
            label="Search names"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            size="small"
            fullWidth
            disabled={submitting}
          />
        )}

        <ChipGroup>
          {visible.map((member) => (
            <Chip
              key={member.id}
              selected={Boolean(present[member.id])}
              onClick={() => toggle(member.id)}
              disabled={submitting}
            >
              {nameOf(member)}
            </Chip>
          ))}

          {visible.length === 0 && (
            <p className={Style.hint}>Nobody here by that name.</p>
          )}
        </ChipGroup>

        {pendingGuests.length > 0 && (
          <p className={Style.hint}>
            {pendingGuests.map((guest) => guest.name).join(', ')}{' '}
            {pendingGuests.length === 1 ? 'joins' : 'join'} the group when you save this
            session.
          </p>
        )}

        {/* Closed by default. The fields and their explanation only appear for
            the person who actually came to add someone. */}
        {/* Collapse rather than a bare conditional — a block that appears
            with no transition reads as the page jumping. */}
        <Collapse in={addingGuest} unmountOnExit>
          <div className={Style.guestBlock}>
            <div className={Style.guestRow}>
              <TextField
                label="Name"
                value={guestName}
                onChange={(event) => {
                  setGuestName(event.target.value)
                  setGuestClash(null)
                }}
                size="small"
                autoFocus
                disabled={submitting}
              />
              <TextField
                label="Email (optional)"
                value={guestEmail}
                onChange={(event) => setGuestEmail(event.target.value)}
                slotProps={{ htmlInput: { inputMode: 'email' } }}
                size="small"
                disabled={submitting}
              />
            </div>

            <p className={Style.hint}>
              With an email we invite them, and their balance follows them.
            </p>

            <div className={Style.guestActions}>
              <Button
                onClick={handleAddGuest}
                disabled={guestName.trim() === '' || submitting}
              >
                Add
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setAddingGuest(false)
                  setGuestName('')
                  setGuestEmail('')
                  setGuestClash(null)
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Collapse>

        {!addingGuest && (
          <TextButton onClick={() => setAddingGuest(true)} disabled={submitting}>
            <AddIcon fontSize="small" />
            Add a guest
          </TextButton>
        )}

        {guestClash && (
          <div className={Style.clash}>
            <p className={Style.clashText}>
              There’s already a guest called {nameOf(guestClash)} in this group.
            </p>
            <div className={Style.clashActions}>
              <Button onClick={useExistingGuest}>Use the same person</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setGuestClash(null)
                  setGuestName('')
                }}
              >
                Pick another name
              </Button>
            </div>
          </div>
        )}
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

      <footer className={Style.footer}>
        {blockedText && <p className={Style.blocked}>{blockedText}</p>}

        {error && (
          <p className={Style.error} role="alert">
            {error}
          </p>
        )}

        <div className={Style.footerSummary}>
          {/* "each" only after an equal split. Under any other method people
              owe different amounts, and one of them printed next to the word
              "each" is the wrong number for everybody else. */}
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
          {submitting ? 'Saving…' : 'Save session'}
        </Button>
      </footer>
    </form>
  )
}
