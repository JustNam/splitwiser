'use client'

/**
 * B2 · New session — form.
 *
 * Cut down for v1 to the case the spec calls the default: ONE cost line, one
 * payer, split equally. The other four split methods already work in
 * split.service.js; only the UI for them is missing, and adding it later
 * changes nothing about the save.
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

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { GroupsApi } from '@/api/groups'
import { InvitesApi } from '@/api/invites'
import { SessionsApi } from '@/api/sessions'
import { Button } from '@/components/Button'
import { useAuth } from '@/hooks/useAuth'
import { pickCurrentGroup } from '@/lib/current-group'
import { displayName, formatVnd } from '@/services/money.service'
import {
  formatSessionDate,
  lastPlayedByMember,
  latestLineUp,
} from '@/services/session.service'
import {
  SPLIT_ADJUSTED,
  SPLIT_EQUAL,
  SPLIT_EXACT,
  SPLIT_PERCENT,
  SPLIT_SHARES,
  computeSplit,
  distribute,
  leftToAssign,
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

const SPLIT_METHODS = [
  { value: SPLIT_EQUAL, label: 'Equally' },
  { value: SPLIT_EXACT, label: 'By exact amounts' },
  { value: SPLIT_PERCENT, label: 'By percentage' },
  { value: SPLIT_SHARES, label: 'By shares' },
  { value: SPLIT_ADJUSTED, label: 'Equally, adjusted' },
]

/**
 * What each method starts from when you switch to it: the equal split, said
 * in that method's own units. Switching never breaks a split that was already
 * correct — it just hands you the controls to change it.
 */
function seedInputs(method, participantIds, total) {
  const ones = participantIds.map(() => 1)
  const seed = {}

  if (method === SPLIT_EXACT) {
    const amounts = distribute(total, ones)
    participantIds.forEach((id, i) => {
      seed[id] = amounts[i]
    })
  }

  if (method === SPLIT_PERCENT) {
    // distribute(100, ...) rather than Math.floor(100 / n): three people get
    // 34/33/33, which is 100. Flooring gives 33/33/33, and the screen would
    // open already refusing to save.
    const percents = distribute(100, ones)
    participantIds.forEach((id, i) => {
      seed[id] = percents[i]
    })
  }

  if (method === SPLIT_SHARES) {
    for (const id of participantIds) seed[id] = 1
  }

  if (method === SPLIT_ADJUSTED) {
    for (const id of participantIds) seed[id] = 0
  }

  return seed
}

export function NewSessionForm() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  // The group and its people. One object because they arrive together and are
  // useless apart.
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const [date, setDate] = useState(todayIso)

  // Digits only, as a string. Kept as text because '' and 0 are different
  // things to a form: one is "hasn't typed yet", the other is a real amount.
  const [amountText, setAmountText] = useState('')
  const [payerId, setPayerId] = useState('')
  const [note, setNote] = useState('')

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

  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false

    async function load() {
      const { data: groups, error: groupsError } = await GroupsApi.listMine(user.id)
      if (cancelled) return
      if (groupsError) return setLoadError(groupsError)
      if (groups.length === 0) return setLoadError('You are not in a group yet.')

      const group = pickCurrentGroup(groups)

      // The whole snapshot rather than just the roster: who played last week,
      // and who plays often, both decide what this screen shows first.
      const { data: snapshot, error: snapshotError } = await GroupsApi.getSnapshot(
        group.id
      )
      if (cancelled) return
      if (snapshotError) return setLoadError(snapshotError)

      setData({ group, ...snapshot })

      // Start from last week's line-up: the same people mostly turn up, so
      // the common case is no taps at all. A group that has never played
      // falls back to everyone, which is right when there are two of you.
      const lineUp = latestLineUp(snapshot.sessions, snapshot.participants)
      const starting = lineUp.length > 0 ? lineUp : snapshot.members.map((m) => m.id)

      setPresent(Object.fromEntries(starting.map((memberId) => [memberId, true])))
      setPayerId(group.myMemberId)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [authLoading, user])

  if (authLoading) return null

  if (!user) {
    return (
      <p className={Style.error} role="alert">
        You need to{' '}
        <Link href="/signin" className={Style.link}>
          sign in
        </Link>{' '}
        before you can log a session.
      </p>
    )
  }

  if (loadError) {
    return (
      <p className={Style.error} role="alert">
        {loadError}
      </p>
    )
  }

  if (!data) return null

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

    const byDate = (lastPlayed.get(b.id) ?? '').localeCompare(lastPlayed.get(a.id) ?? '')
    if (byDate !== 0) return byDate

    return nameOf(a).localeCompare(nameOf(b))
  })

  // A search box below this many people is a box nobody needs.
  const SEARCHABLE_FROM = 8
  const searchable = members.length >= SEARCHABLE_FROM

  const query = search.trim().toLowerCase()
  const visible =
    query === '' ? ordered : ordered.filter((m) => nameOf(m).toLowerCase().includes(query))

  const lastSession = data.sessions[0]

  const total = Number(amountText || 0)

  // The real amounts, from the same tested function the save uses. Not a
  // preview of what will be stored — it IS what gets stored.
  const shares =
    total > 0 && participantIds.length > 0
      ? computeSplit({ total, participantIds, method, inputs })
      : {}

  const shareAmounts = Object.values(shares)
  const baseShare = shareAmounts.length > 0 ? Math.min(...shareAmounts) : 0

  // A total that doesn't divide evenly leaves a few đồng over, and they have
  // to go to somebody. The spec is explicit that whoever gets them must be
  // visible rather than buried in a rounding.
  const extraNames = participants
    .filter((member) => shares[member.id] > baseShare)
    .map(nameOf)

  const inputTotal = participantIds.reduce(
    (running, id) => running + (inputs[id] ?? 0),
    0
  )
  const remaining = leftToAssign(total, shares)

  /**
   * Each method is wrong in its own way, so each is checked on its own terms.
   *
   * Percent is the one that catches people out: distribute() shares the total
   * in PROPORTION to the weights, so 30/30/30 still hands out every đồng and
   * leftToAssign() reports nothing left. The error is in the percentages, not
   * in the money, so that is where it has to be caught.
   *
   * Shares never fail to add up either — any positive weights work — so the
   * only bad case is everyone on zero.
   */
  const splitProblem =
    method === SPLIT_EQUAL
      ? null
      : method === SPLIT_PERCENT
        ? inputTotal === 100
          ? null
          : `Percentages add up to ${inputTotal}%, not 100%.`
        : method === SPLIT_SHARES
          ? inputTotal > 0
            ? null
            : 'Give at least one person a share.'
          : remaining === 0
            ? null
            : remaining > 0
              ? `${formatVnd(remaining)} is not assigned to anyone yet.`
              : `The split is ${formatVnd(-remaining)} over the total.`

  // What the line under the rows says. Not always a remainder: with shares
  // there is nothing to run out of, so it reports the rate instead.
  const splitReadout =
    method === SPLIT_PERCENT
      ? `Assigned ${inputTotal}%`
      : method === SPLIT_SHARES
        ? `Per share ${formatVnd(inputTotal > 0 ? Math.floor(total / inputTotal) : 0)}`
        : remaining === 0
          ? 'All assigned'
          : remaining > 0
            ? `Left to assign ${formatVnd(remaining)}`
            : `Over by ${formatVnd(-remaining)}`

  // Ordered by which fix comes first, so the message points at the next thing
  // to do rather than the last thing missing.
  const blockedText =
    total <= 0
      ? 'Enter how much the session cost.'
      : participantIds.length === 0
        ? 'Tick at least one person who played.'
        : payerId === ''
          ? 'Choose who paid.'
          : splitProblem

  function handleAmountChange(event) {
    // Strip everything that isn't a digit, so a pasted "300.000đ" becomes
    // 300000 rather than NaN.
    setAmountText(event.target.value.replace(/[^0-9]/g, '').slice(0, 12))
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

  /**
   * Spread whatever is missing across everyone, in this method's own units:
   * đồng for exact and adjusted, percentage points for percent. Always lands
   * exactly on target, because distribute() hands out the remainder rather
   * than rounding it away — and it copes with a negative gap, which is what
   * "over by" needs.
   */
  function splitTheRest() {
    const gap = method === SPLIT_PERCENT ? 100 - inputTotal : remaining
    const spread = distribute(gap, participantIds.map(() => 1))

    setInputs((current) => {
      const next = { ...current }
      participantIds.forEach((id, i) => {
        next[id] = (next[id] ?? 0) + spread[i]
      })
      return next
    })
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

      setData((current) => ({ ...current, members: [...current.members, member] }))
      setPendingGuests((current) => current.filter((row) => row.id !== guest.id))
      setPresent((current) => ({ ...current, [member.id]: true }))
    }

    // Swap the placeholders for the ids the database gave back. The amounts
    // are carried over untouched rather than recomputed — they already add up
    // to the total exactly, and recomputing invites them not to.
    const swap = (id) => realId.get(id) ?? id

    const { error: apiError } = await SessionsApi.create({
      groupId: data.group.id,
      date,
      lines: [
        {
          note: note.trim() === '' ? null : note.trim(),
          amount: total,
          payerMemberId: swap(payerId),
          shares: Object.fromEntries(
            Object.entries(shares).map(([id, amount]) => [swap(id), amount])
          ),
        },
      ],
      participantIds: participantIds.map(swap),
    })

    if (apiError) {
      setError(apiError)
      setSubmitting(false)
      return
    }

    // The spec sends this to B3 (session detail) to confirm. That screen
    // doesn't exist yet, so Home — where the new numbers appear — stands in.
    router.push('/')
  }

  return (
    <form className={Style.form} onSubmit={handleSubmit} noValidate>
      <TextField
        label="Date"
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        // Without shrink the label sits on top of the date placeholder, which
        // a date input always shows.
        InputLabelProps={{ shrink: true }}
        fullWidth
        disabled={submitting}
      />

      <div className={Style.amountBlock}>
        <label className={Style.amountLabel} htmlFor="amount">
          Amount
        </label>
        {/* Not a MUI field: this is the one number the whole screen is about,
            and the design gives it its own oversized treatment. */}
        <input
          id="amount"
          className={Style.amountInput}
          value={amountText === '' ? '' : formatVnd(total)}
          onChange={handleAmountChange}
          // A numeric keypad on a phone. type="number" gives one too, but it
          // also allows "e", "-" and spinner arrows.
          inputMode="numeric"
          placeholder="0đ"
          disabled={submitting}
        />
      </div>

      <TextField
        select
        label="Paid by"
        value={payerId}
        onChange={(event) => setPayerId(event.target.value)}
        fullWidth
        disabled={submitting}
      >
        {members.map((member) => (
          <MenuItem key={member.id} value={member.id}>
            {nameOf(member)}
            {member.type === 'guest' ? ' (guest)' : ''}
          </MenuItem>
        ))}
      </TextField>

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
          <p className={Style.sectionMeta}>
            {participants.length} of {members.length}
          </p>
        </header>

        {/* Both, not a single toggle: with a long roster you sometimes want to
            start from nobody and sometimes from everybody, and a toggle makes
            you guess which one it will do. */}
        <div className={Style.pickRow}>
          <button
            type="button"
            className={Style.pickAction}
            onClick={() => setAll(true)}
            disabled={submitting}
          >
            Everyone
          </button>
          <button
            type="button"
            className={Style.pickAction}
            onClick={() => setAll(false)}
            disabled={submitting}
          >
            Nobody
          </button>

          {lastSession && (
            <p className={Style.pickNote}>
              Starting from {formatSessionDate(lastSession.date)}
            </p>
          )}
        </div>

        {searchable && (
          <input
            className={Style.searchInput}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search names"
            disabled={submitting}
          />
        )}

        <div className={Style.chips}>
          {visible.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => toggle(member.id)}
              // aria-pressed is what tells a screen reader this is a toggle
              // rather than a button that does something.
              aria-pressed={Boolean(present[member.id])}
              className={clsx(Style.chip, present[member.id] && Style.chipOn)}
              disabled={submitting}
            >
              {nameOf(member)}
            </button>
          ))}

          {visible.length === 0 && (
            <p className={Style.hint}>Nobody here by that name.</p>
          )}
        </div>

        {pendingGuests.length > 0 && (
          <p className={Style.hint}>
            {pendingGuests.map((guest) => guest.name).join(', ')}{' '}
            {pendingGuests.length === 1 ? 'joins' : 'join'} the group when you save
            this session.
          </p>
        )}

        {/* Closed by default. The fields and their explanation only appear for
            the person who actually came to add someone. */}
        {addingGuest ? (
          <div className={Style.guestBlock}>
            <div className={Style.guestRow}>
              <input
                className={Style.guestInput}
                value={guestName}
                onChange={(event) => {
                  setGuestName(event.target.value)
                  setGuestClash(null)
                }}
                placeholder="Name"
                disabled={submitting}
                autoFocus
              />
              <input
                className={Style.guestInput}
                value={guestEmail}
                onChange={(event) => setGuestEmail(event.target.value)}
                placeholder="Email (optional)"
                inputMode="email"
                disabled={submitting}
              />
            </div>

            <p className={Style.hint}>
              Email is optional, but worth adding: we’ll invite them, and when
              they sign up everything they owe or are owed comes with them.
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
        ) : (
          <button
            type="button"
            className={Style.addGuestLink}
            onClick={() => setAddingGuest(true)}
            disabled={submitting}
          >
            + Add a guest
          </button>
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

      <section className={Style.section}>
        <header className={Style.sectionHeader}>
          <h2 className={Style.sectionTitle}>Split</h2>
        </header>

        <TextField
          select
          label="How"
          value={method}
          onChange={(event) => changeMethod(event.target.value)}
          fullWidth
          disabled={submitting}
        >
          {SPLIT_METHODS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        {total <= 0 || participants.length === 0 ? (
          <p className={Style.hint}>
            Enter an amount and tick who played to see the split.
          </p>
        ) : method === SPLIT_EQUAL ? (
          <>
            <p className={Style.splitSentence}>
              {formatVnd(baseShare)} each for {participants.map(nameOf).join(', ')}.
            </p>
            {extraNames.length > 0 && (
              <p className={Style.hint}>
                {extraNames.join(', ')} {extraNames.length === 1 ? 'pays' : 'pay'} 1đ
                more — {formatVnd(total)} doesn’t divide evenly.
              </p>
            )}
          </>
        ) : (
          <>
            <div className={Style.splitRows}>
              {participants.map((member) => (
                <SplitRow
                  key={member.id}
                  name={nameOf(member)}
                  method={method}
                  value={inputs[member.id] ?? 0}
                  onChange={(value) => setInput(member.id, value)}
                  output={formatVnd(shares[member.id] ?? 0)}
                  disabled={submitting}
                />
              ))}
            </div>

            <div className={Style.splitFoot}>
              <p className={clsx(Style.readout, splitProblem && Style.readoutBad)}>
                {splitReadout}
              </p>

              {/* Nothing to balance with shares: any positive weights divide
                  the total exactly, so there is never a remainder. */}
              {method !== SPLIT_SHARES && (
                <button
                  type="button"
                  className={Style.splitAction}
                  onClick={splitTheRest}
                  disabled={submitting}
                >
                  Split the rest evenly
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <footer className={Style.footer}>
        {blockedText && <p className={Style.blocked}>{blockedText}</p>}

        {error && (
          <p className={Style.error} role="alert">
            {error}
          </p>
        )}

        <div className={Style.footerSummary}>
          <span>
            {participants.length} playing · {formatVnd(baseShare)} each
          </span>
          <span className={Style.footerTotal}>{formatVnd(total)}</span>
        </div>

        <Button type="submit" fullWidth disabled={Boolean(blockedText) || submitting}>
          {submitting ? 'Saving…' : 'Save session'}
        </Button>
      </footer>
    </form>
  )
}

/**
 * One person's line in a non-equal split.
 *
 * The control changes with the method, but the shape does not: name on the
 * left, what you set in the middle, what it comes to on the right. Shares get
 * a stepper rather than a text field because the numbers are 1, 2, maybe 3,
 * and typing is the wrong tool for a number you nudge.
 */
function SplitRow({ name, method, value, onChange, output, disabled }) {
  // Digits only — except for `adjusted`, where a minus sign is the whole
  // point: it is the method for "everyone equally, but Nam owes 20.000đ less".
  function handleText(event) {
    const raw = event.target.value
    const signed = method === SPLIT_ADJUSTED && raw.trim().startsWith('-')
    const digits = raw.replace(/[^0-9]/g, '')
    const size = digits === '' ? 0 : Number(digits)
    onChange(signed ? -size : size)
  }

  return (
    <div className={Style.splitRow}>
      <span className={Style.splitName}>{name}</span>

      {method === SPLIT_SHARES ? (
        <span className={Style.stepper}>
          <button
            type="button"
            className={Style.stepperButton}
            onClick={() => onChange(Math.max(0, value - 1))}
            disabled={disabled}
            aria-label={`One less share for ${name}`}
          >
            −
          </button>
          <span className={Style.stepperValue}>{value}</span>
          <button
            type="button"
            className={Style.stepperButton}
            onClick={() => onChange(value + 1)}
            disabled={disabled}
            aria-label={`One more share for ${name}`}
          >
            +
          </button>
        </span>
      ) : (
        <span className={Style.splitField}>
          <input
            className={Style.splitInput}
            value={method === SPLIT_ADJUSTED && value > 0 ? `+${value}` : String(value)}
            onChange={handleText}
            inputMode="numeric"
            disabled={disabled}
            aria-label={`${name}'s share`}
          />
          {method === SPLIT_PERCENT && <span className={Style.suffix}>%</span>}
        </span>
      )}

      <span className={Style.splitOutput}>{output}</span>
    </div>
  )
}
