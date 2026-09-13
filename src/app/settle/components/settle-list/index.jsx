'use client'

/**
 * B5 · Settle up — the list of debts, and recording that one is done.
 *
 * Two rules from the spec shape everything here:
 *
 *   1. One row per debt, naming the session it came from. Never one blurred
 *      total per person — the question this screen exists to answer is "why
 *      exactly this much".
 *   2. Each debt is settled in full. There is no amount field anywhere on the
 *      screen, and the totals are displayed, never typed.
 *
 * Both directions are tickable. The spec only had the person who owes marking
 * their own payment, but "I paid you" and "you paid me" are one event seen
 * from two chairs, and the second is the safer claim of the two: saying
 * somebody paid you gives up a claim on money, so there is nothing to gain by
 * saying it falsely.
 *
 * ?member= narrows the screen to one person, which is where tapping a balance
 * row on Home lands. Only a filter over the same data.
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Dialog from '@mui/material/Dialog'
import { GroupsApi } from '@/api/groups'
import { PaymentsApi } from '@/api/payments'
import { Button } from '@/components/Button'
import { PageHeader } from '@/components/PageHeader'
import { TextButton } from '@/components/TextButton'
import { TextLink } from '@/components/TextLink'
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
  // payableDebts(). A pair can only lean one way at a time, so one map covers
  // both directions without collisions.
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
  // would empty the screen and then say "nothing outstanding", which is a
  // statement about every debt you have, not about a broken link.
  const personName = person ? displayName(person, snapshot.accounts) : null
  const matches = (row) => !personName || row.memberId === memberFilter

  const owedByMe = all.owedByMe.filter(matches)
  const owedToMe = all.owedToMe.filter(matches)

  // Recomputed from what is on screen, not taken from payableDebts(): while
  // filtered, "Net" has to mean net with this person, or the number under the
  // list contradicts the list.
  const net =
    owedToMe.reduce((running, row) => running + row.total, 0) -
    owedByMe.reduce((running, row) => running + row.total, 0)

  const flatten = (groups, direction) =>
    groups.flatMap((entry) =>
      entry.items.map((item) => ({ ...item, direction, who: entry.name }))
    )

  const allItems = [...flatten(owedByMe, 'out'), ...flatten(owedToMe, 'in')]
  const picked = allItems.filter((item) => checked[item.id])

  const sum = (direction) =>
    picked
      .filter((item) => item.direction === direction)
      .reduce((running, item) => running + item.amount, 0)

  const paying = sum('out')
  const receiving = sum('in')

  function toggle(itemId) {
    setChecked((current) => ({ ...current, [itemId]: !current[itemId] }))
  }

  function selectAll(entry) {
    setChecked((current) => {
      const next = { ...current }
      for (const item of entry.items) next[item.id] = true
      return next
    })
  }

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)

    // Only which debt and with whom. settle_up() reads the amount and works
    // out the direction from the ledger itself.
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
          {personName
            ? `Nothing to settle with ${personName}`
            : 'Everything is settled'}
        </p>
        <p className={Style.emptyBody}>
          {personName
            ? 'Nothing outstanding between the two of you.'
            : 'Nobody owes you and you owe nobody. Balances update for everyone the moment either side marks an item settled.'}
        </p>
      </div>
    )
  }

  return (
    <>
      <PageHeader title={personName ?? 'Settle up'} />

      <p className={Style.subtitle}>
        {personName
          ? `Every item between you and ${personName}. Tick what has actually changed hands — each is settled in full.`
          : 'Tick what has actually changed hands, in either direction. Each item is settled in full.'}
      </p>

      {owedByMe.map((entry) => (
        <DebtGroup
          key={`out-${entry.memberId}`}
          entry={entry}
          heading={`You owe ${entry.name} ${formatVnd(entry.total)}`}
          checked={checked}
          onToggle={toggle}
          onSelectAll={selectAll}
          disabled={submitting}
        />
      ))}

      {owedToMe.map((entry) => (
        <DebtGroup
          key={`in-${entry.memberId}`}
          entry={entry}
          heading={`${entry.name} owes you ${formatVnd(entry.total)}`}
          checked={checked}
          onToggle={toggle}
          onSelectAll={selectAll}
          disabled={submitting}
        />
      ))}

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

      <footer className={Style.bar}>
        <div className={Style.barSummary}>
          <span>
            {picked.length === 0
              ? 'nothing selected'
              : `${picked.length} ${picked.length === 1 ? 'item' : 'items'} selected`}
          </span>

          {/* Two numbers rather than one net, because they are opposite
              movements of real money: 50.000đ out of your pocket and 20.000đ
              into it is not "30.000đ". */}
          <span className={Style.barTotals}>
            {paying > 0 && <span>You pay {formatVnd(paying)}</span>}
            {receiving > 0 && <span>You receive {formatVnd(receiving)}</span>}
          </span>
        </div>

        <Button
          fullWidth
          onClick={() => setConfirmOpen(true)}
          disabled={picked.length === 0 || submitting}
        >
          Mark as settled
        </Button>
      </footer>

      {/* MUI for behaviour, our SCSS for the look — per constants/theme.js. A
          dialog is nearly all behaviour: focus trap, Escape, scroll lock. */}
      <Dialog
        open={confirmOpen && picked.length > 0}
        onClose={() => setConfirmOpen(false)}
        fullWidth
      >
        <div className={Style.confirm}>
          <p className={Style.confirmTitle}>Confirm</p>

          {/* Split by direction: a list mixing "you paid" and "they paid you"
              without saying which is how the wrong one gets confirmed. */}
          <ConfirmSection
            title="You paid"
            items={picked.filter((item) => item.direction === 'out')}
            total={paying}
          />
          <ConfirmSection
            title="They paid you"
            items={picked.filter((item) => item.direction === 'in')}
            total={receiving}
          />

          <p className={Style.warning}>
            This can’t be undone. Only confirm once the money has actually moved.
          </p>

          <Button fullWidth onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Recording…' : 'Yes, it’s settled'}
          </Button>

          <TextButton
            tone="quiet"
            onClick={() => setConfirmOpen(false)}
            disabled={submitting}
          >
            Go back
          </TextButton>
        </div>
      </Dialog>
    </>
  )
}

/**
 * One person's debts in one direction. The same block either way round — only
 * the heading says which.
 */
function DebtGroup({ entry, heading, checked, onToggle, onSelectAll, disabled }) {
  return (
    <section className={Style.group}>
      <header className={Style.groupHeader}>
        <p className={Style.groupTitle}>
          {heading}
          {entry.isGuest && <span className={Style.guest}>Guest</span>}
        </p>
        <TextButton onClick={() => onSelectAll(entry)} disabled={disabled}>
          Select all
        </TextButton>
      </header>

      {entry.items.map((item) => (
        // A real <input type="checkbox"> inside a <label>: the whole row
        // becomes the tap target, and the checkbox keeps its keyboard and
        // screen-reader behaviour without any of it being reimplemented.
        <label key={item.id} className={Style.item}>
          <input
            type="checkbox"
            className={Style.box}
            checked={Boolean(checked[item.id])}
            onChange={() => onToggle(item.id)}
            disabled={disabled}
          />
          <span className={Style.itemInfo}>
            <span className={Style.itemLabel}>{item.label}</span>
            <span className={Style.itemSub}>{item.sub}</span>
          </span>
          <span className={Style.itemAmount}>{formatVnd(item.amount)}</span>
        </label>
      ))}
    </section>
  )
}

function ConfirmSection({ title, items, total }) {
  if (items.length === 0) return null

  return (
    <div className={Style.confirmList}>
      <p className={Style.confirmHeading}>{title}</p>

      {items.map((item) => (
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
  )
}
