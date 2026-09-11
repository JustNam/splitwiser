'use client'

/**
 * B5 · Settle up — the list of debts, and recording payment.
 *
 * Two rules from the spec shape everything here:
 *
 *   1. One row per debt, naming the session it came from. Never one blurred
 *      total per person — the question this screen exists to answer is "why
 *      exactly this much".
 *   2. Each debt is paid in full. There is no amount field anywhere on the
 *      screen, and the total is displayed, never typed.
 *
 * ?member= narrows the screen to one person, which is where tapping a balance
 * row on Home lands. Only a filter over the same data — the maths, the
 * ticking and the write are identical either way.
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Dialog from '@mui/material/Dialog'
import { GroupsApi } from '@/api/groups'
import { PaymentsApi } from '@/api/payments'
import { Button } from '@/components/Button'
import { useAuth } from '@/hooks/useAuth'
import { pickCurrentGroup } from '@/lib/current-group'
import { displayName, formatVnd } from '@/services/money.service'
import { payableDebts } from '@/services/settle.service'
import Style from './style.module.scss'

export function SettleList() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const memberFilter = useSearchParams().get('member')

  const [state, setState] = useState({ status: 'loading' })

  // item id → true. Item ids are `${costLineId}|${memberId}`, built in
  // payableDebts(), so a debt keeps the same id across reloads.
  const [checked, setChecked] = useState({})

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (authLoading || !user) return

    let cancelled = false

    async function load() {
      const { data: groups, error: groupsError } = await GroupsApi.listMine(user.id)
      if (cancelled) return
      if (groupsError) return setState({ status: 'error', error: groupsError })
      if (groups.length === 0) return setState({ status: 'no-group' })

      const group = pickCurrentGroup(groups)
      const { data: snapshot, error: snapshotError } = await GroupsApi.getSnapshot(
        group.id
      )
      if (cancelled) return
      if (snapshotError) return setState({ status: 'error', error: snapshotError })

      setState({ status: 'ready', group, snapshot })
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

  if (state.status === 'no-group') {
    return <p className={Style.emptyBody}>You’re not in a group yet.</p>
  }

  const { group, snapshot } = state

  const all = payableDebts({
    ledger: snapshot.ledger,
    members: snapshot.members,
    accounts: snapshot.accounts,
    sessions: snapshot.sessions,
    costLines: snapshot.costLines,
    myMemberId: group.myMemberId,
  })

  // Looked up from the roster rather than from the rows below, because the
  // rows are empty in exactly the case the name is still needed: a person you
  // are square with.
  const person = memberFilter
    ? snapshot.members.find((member) => member.id === memberFilter)
    : null

  // An id that matches nobody is ignored rather than obeyed. Filtering on it
  // would empty the screen and then say "you're not owing anyone", which is a
  // statement about every debt you have, not about a broken link.
  const personName = person ? displayName(person, snapshot.accounts) : null
  const matches = (row) => !personName || row.memberId === memberFilter

  const owedByMe = all.owedByMe.filter(matches)
  const owedToMe = all.owedToMe.filter(matches)

  // Recomputed from what is on screen, not taken from payableDebts(): while
  // filtered, "Net" has to mean net with this person, or the number under the
  // list contradicts the list.
  const net =
    owedToMe.reduce((running, item) => running + item.amount, 0) -
    owedByMe.reduce((running, owedGroup) => running + owedGroup.total, 0)


  // The debts flattened out of their per-person groups, each carrying who it
  // is owed to. The groups are for reading; this list is for counting.
  const allItems = owedByMe.flatMap((owedGroup) =>
    owedGroup.items.map((item) => ({
      ...item,
      memberId: owedGroup.memberId,
      who: owedGroup.name,
    }))
  )

  const picked = allItems.filter((item) => checked[item.id])
  const total = picked.reduce((running, item) => running + item.amount, 0)

  function toggle(itemId) {
    setChecked((current) => ({ ...current, [itemId]: !current[itemId] }))
  }

  function selectAll(owedGroup) {
    setChecked((current) => {
      const next = { ...current }
      for (const item of owedGroup.items) next[item.id] = true
      return next
    })
  }

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)

    const { error: apiError } = await PaymentsApi.settle({
      groupId: group.id,
      items: picked.map((item) => ({
        costLineId: item.costLineId,
        memberId: item.memberId,
      })),
    })

    if (apiError) {
      setError(apiError)
      setSubmitting(false)
      setConfirmOpen(false)
      return
    }

    router.push('/')
  }

  if (owedByMe.length === 0 && owedToMe.length === 0) {
    return (
      <div className={Style.empty}>
        <p className={Style.emptyTitle}>
          {personName ? `Nothing to pay ${personName}` : 'You’re not owing anyone'}
        </p>
        <p className={Style.emptyBody}>
          {personName
            ? 'Nothing outstanding between the two of you.'
            : 'Everything on your side is settled. Balances update for everyone the moment either side marks an item paid.'}
        </p>
      </div>
    )
  }

  return (
    <>
      <h1 className={Style.title}>{personName ?? 'Pay someone'}</h1>

      <p className={Style.subtitle}>
        {personName
          ? `Every item between you and ${personName}. Tick the ones you’ve actually paid — each is paid in full.`
          : 'Tick the debts you’ve paid. Each one is paid in full — untick to pay less.'}
      </p>

      {owedByMe.map((owedGroup) => (
        <section key={owedGroup.memberId} className={Style.group}>
          <header className={Style.groupHeader}>
            <p className={Style.groupTitle}>
              You owe {owedGroup.name} {formatVnd(owedGroup.total)}
              {owedGroup.isGuest && <span className={Style.guest}>Guest</span>}
            </p>
            <button
              type="button"
              className={Style.selectAll}
              onClick={() => selectAll(owedGroup)}
              disabled={submitting}
            >
              Select all
            </button>
          </header>

          {owedGroup.items.map((item) => (
            // A real <input type="checkbox"> inside a <label>: the whole row
            // becomes the tap target, and the checkbox keeps its keyboard and
            // screen-reader behaviour without any of it being reimplemented.
            <label key={item.id} className={Style.item}>
              <input
                type="checkbox"
                className={Style.box}
                checked={Boolean(checked[item.id])}
                onChange={() => toggle(item.id)}
                disabled={submitting}
              />
              <span className={Style.itemInfo}>
                <span className={Style.itemLabel}>{item.label}</span>
                <span className={Style.itemSub}>{item.sub}</span>
              </span>
              <span className={Style.itemAmount}>{formatVnd(item.amount)}</span>
            </label>
          ))}
        </section>
      ))}

      {/* Shown, not hidden: the spec is explicit that a debt in the other
          direction still has to appear, or the numbers look wrong. It just
          isn't tickable — you can only record your own payments. */}
      {owedToMe.length > 0 && (
        <section className={Style.group}>
          <p className={Style.owingNote}>They owe you — nothing to pay here</p>

          {owedToMe.map((item) => (
            <div key={item.id} className={Style.readOnlyItem}>
              <span className={Style.itemInfo}>
                <span className={Style.itemLabel}>
                  {item.who} · {item.label}
                </span>
                <span className={Style.itemSub}>{item.sub}</span>
              </span>
              <span className={Style.itemSub}>{formatVnd(item.amount)}</span>
            </div>
          ))}
        </section>
      )}

      <div className={Style.netBox}>
        <p className={Style.netLabel}>
          {personName ? `Net with ${personName}` : 'Net across everyone'}
        </p>
        <p className={Style.netText}>
          {personName
            ? net >= 0
              ? `${personName} owes you ${formatVnd(net)}`
              : `You owe ${personName} ${formatVnd(-net)}`
            : net >= 0
              ? `You’re owed ${formatVnd(net)}`
              : `You owe ${formatVnd(-net)}`}
        </p>
      </div>

      {error && (
        <p className={Style.error} role="alert">
          {error}
        </p>
      )}

      {owedByMe.length > 0 && (
        <footer className={Style.bar}>
          <div className={Style.barSummary}>
            <span>
              {picked.length === 0
                ? 'nothing selected'
                : `${picked.length} ${picked.length === 1 ? 'item' : 'items'} selected`}
            </span>
            <span className={Style.barTotal}>{formatVnd(total)}</span>
          </div>

          <Button
            fullWidth
            onClick={() => setConfirmOpen(true)}
            disabled={picked.length === 0 || submitting}
          >
            Mark as paid
          </Button>
        </footer>
      )}

      {/* MUI for behaviour, our SCSS for the look — per constants/theme.js. A
          dialog is nearly all behaviour: focus trap, Escape, scroll lock. */}
      <Dialog
        open={confirmOpen && picked.length > 0}
        onClose={() => setConfirmOpen(false)}
        fullWidth
      >
        <div className={Style.confirm}>
          <p className={Style.confirmTitle}>Confirm payment</p>

          <div className={Style.confirmList}>
            {picked.map((item) => (
              <div key={item.id} className={Style.confirmRow}>
                <span>
                  {item.who} · {item.label}
                </span>
                <span>{formatVnd(item.amount)}</span>
              </div>
            ))}

            <div className={Style.confirmTotalRow}>
              <span>Total</span>
              <span className={Style.confirmTotal}>{formatVnd(total)}</span>
            </div>
          </div>

          <p className={Style.warning}>
            This can’t be undone. Only confirm once the money has actually moved.
          </p>

          <Button fullWidth onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Recording…' : 'Yes, it’s paid'}
          </Button>

          <button
            type="button"
            className={Style.goBack}
            onClick={() => setConfirmOpen(false)}
            disabled={submitting}
          >
            Go back
          </button>
        </div>
      </Dialog>
    </>
  )
}
