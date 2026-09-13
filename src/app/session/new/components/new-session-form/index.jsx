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
import { SPLIT_EQUAL, computeSplit } from '@/services/split.service'
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
  const [guestClash, setGuestClash] = useState(null)

  // Guests typed in but not yet written. Each carries a temporary id of the
  // form 'new:1'. Everything downstream — the chips, computeSplit(), the
  // "Paid by" select — only ever treats an id as an opaque string, so a
  // placeholder works everywhere a real one does, right up to the save.
  const [pendingGuests, setPendingGuests] = useState([])

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
      const { data: roster, error: rosterError } = await GroupsApi.listMembers(group.id)
      if (cancelled) return
      if (rosterError) return setLoadError(rosterError)

      setData({ group, ...roster })

      // Everyone ticked, and "I paid" pre-selected: the common case should
      // need no taps at all. Turnout changes every week, and unticking two
      // people is faster than ticking five.
      setPresent(Object.fromEntries(roster.members.map((member) => [member.id, true])))
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

  const total = Number(amountText || 0)

  // The real amounts, from the same tested function the save uses. Not a
  // preview of what will be stored — it IS what gets stored.
  const shares =
    total > 0 && participantIds.length > 0
      ? computeSplit({ total, participantIds, method: SPLIT_EQUAL })
      : {}

  const shareAmounts = Object.values(shares)
  const baseShare = shareAmounts.length > 0 ? Math.min(...shareAmounts) : 0

  // A total that doesn't divide evenly leaves a few đồng over, and they have
  // to go to somebody. The spec is explicit that whoever gets them must be
  // visible rather than buried in a rounding.
  const extraNames = participants
    .filter((member) => shares[member.id] > baseShare)
    .map(nameOf)

  // Ordered by which fix comes first, so the message points at the next thing
  // to do rather than the last thing missing.
  const blockedText =
    total <= 0
      ? 'Enter how much the session cost.'
      : participantIds.length === 0
        ? 'Tick at least one person who played.'
        : payerId === ''
          ? 'Choose who paid.'
          : null

  function handleAmountChange(event) {
    // Strip everything that isn't a digit, so a pasted "300.000đ" becomes
    // 300000 rather than NaN.
    setAmountText(event.target.value.replace(/[^0-9]/g, '').slice(0, 12))
  }

  function toggle(memberId) {
    setPresent((current) => ({ ...current, [memberId]: !current[memberId] }))
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
          <p className={Style.sectionMeta}>{participants.length} playing</p>
        </header>

        <div className={Style.chips}>
          {members.map((member) => (
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
        </div>

        <p className={Style.hint}>
          Email is optional, but worth adding: we’ll invite them, and when they
          sign up everything they owe or are owed comes with them.
        </p>

        {pendingGuests.length > 0 && (
          <p className={Style.hint}>
            {pendingGuests.map((guest) => guest.name).join(', ')}{' '}
            {pendingGuests.length === 1 ? 'joins' : 'join'} the group when you save
            this session.
          </p>
        )}

        <div className={Style.guestRow}>
          <input
            className={Style.guestInput}
            value={guestName}
            onChange={(event) => {
              setGuestName(event.target.value)
              setGuestClash(null)
            }}
            placeholder="Add a guest — name"
            disabled={submitting}
          />
          <input
            className={Style.guestInput}
            value={guestEmail}
            onChange={(event) => setGuestEmail(event.target.value)}
            placeholder="Email (optional)"
            inputMode="email"
            disabled={submitting}
          />
          <Button onClick={handleAddGuest} disabled={guestName.trim() === '' || submitting}>
            Add
          </Button>
        </div>

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
          <p className={Style.sectionMeta}>Equally</p>
        </header>

        {total > 0 && participants.length > 0 ? (
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
          <p className={Style.hint}>
            Enter an amount and tick who played to see the split.
          </p>
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
