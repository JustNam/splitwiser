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
import CircularProgress from '@mui/material/CircularProgress'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { GroupsApi } from '@/api/groups'
import { PaymentsApi } from '@/api/payments'
import { Button } from '@/components/Button'
import { LinkButton } from '@/components/LinkButton'
import { LoadingRows } from '@/components/Loading'
import { RetryMessage } from '@/components/RetryMessage'
import { useToast } from '@/components/Toast'
import { PageHeader } from '@/components/PageHeader'
import { TextButton } from '@/components/TextButton'
import { TextLink } from '@/components/TextLink'
import { useAuth } from '@/hooks/useAuth'
import { pickCurrentGroup } from '@/lib/current-group'
import { readFromPath } from '@/lib/next-path'
import { displayName, formatVnd } from '@/services/money.service'
import { payableDebts } from '@/services/settle.service'
import Style from './style.module.scss'

export function SettleList() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const toast = useToast()

  // A dialog that lists every item being settled can be longer than a phone.
  // MUI's default paper keeps 32px of margin on each side, so on a 360px
  // screen the list gets 296px and then scrolls inside a box inside a page.
  // Full screen below `sm` is the pattern MUI itself recommends for this.
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'))

  const searchParams = useSearchParams()
  const memberFilter = searchParams.get('member')

  // Tapping a balance on /balances lands here. Back used to go to Home and
  // drop you out of the list you were working through.
  const backHref = readFromPath(searchParams)

  const [state, setState] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  function reload() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

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
  }, [authLoading, user, attempt])

  // Header in every state. This screen was the worst of them: its states are
  // reached by tapping a button on Home, and none of them drew a back arrow.
  if (authLoading || !user || state.status !== 'ready') {
    return (
      <>
        <PageHeader backHref={backHref} title="Settle up" />

        {(authLoading || state.status === 'loading') && <LoadingRows rows={3} />}

        {!authLoading && !user && (
          <p className={Style.error} role="alert">
            You need to <TextLink href="/signin">sign in</TextLink> first.
          </p>
        )}

        {user && state.status === 'error' && (
          <RetryMessage message={state.error} onRetry={reload} />
        )}

        {user && state.status === 'no-group' && (
          <p className={Style.emptyBody}>You’re not in a group yet.</p>
        )}
      </>
    )
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
      toast.error(apiError)
      setSubmitting(false)
      setConfirmOpen(false)
      return
    }

    // The screen is about to be replaced by Home, so the confirmation cannot
    // live on it. The toast outlives the navigation because its provider sits
    // above the router — which is the whole reason it is up there.
    const count = picked.length
    toast.success(`${count} ${count === 1 ? 'item' : 'items'} settled`)

    router.push('/')
  }

  if (owedByMe.length === 0 && owedToMe.length === 0) {
    // The header belongs here most of all. "Everything is settled" is not a
    // failure, it is the state a healthy group is in most of the time — and
    // it used to be a screen with nothing on it you could tap.
    return (
      <>
        <PageHeader backHref={backHref} title={personName ?? 'Settle up'} />

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

          {/* Filtered to one person and square with them, the useful next step
              is the rest of the list rather than the way you came in. */}
          {personName && (
            <LinkButton variant="secondary" href="/settle">
              See everyone
            </LinkButton>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader backHref={backHref} title={personName ?? 'Settle up'} />

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
        // Without this the dialog opens announcing nothing: a screen reader
        // reads out the name of the thing it has just trapped focus inside,
        // and there was no name to read.
        aria-labelledby="settle-confirm-title"
        // Same 444px as the leave-guard dialog, and for the same reason: the
        // app is a 480px column, so MUI's default 600px made a dialog wider
        // than the screen it was interrupting. Rows of "who / what / how
        // much" fit in it comfortably.
        maxWidth="xs"
        fullWidth
        fullScreen={fullScreen}
      >
        <div className={Style.confirm}>
          <h2 className={Style.confirmTitle} id="settle-confirm-title">
            Confirm
          </h2>

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
            {submitting && <CircularProgress size={16} color="inherit" />}
          {submitting ? 'Recording…' : 'Yes, it’s settled'}
          </Button>

          <Button
            variant="secondary"
            fullWidth
            onClick={() => setConfirmOpen(false)}
            disabled={submitting}
          >
            Go back
          </Button>
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
        {/* A heading, not a paragraph: it names the <section> it opens, and
            a section with no heading is a landmark a screen reader cannot
            tell you anything about. */}
        <h2 className={Style.groupTitle}>
          {heading}
          {entry.isGuest && <span className={Style.guest}>Guest</span>}
        </h2>
        <TextButton onClick={() => onSelectAll(entry)} disabled={disabled}>
          Select all
        </TextButton>
      </header>

      {/* A list, because it is one: without <ul> a screen reader cannot say
          how many debts there are or where one ends. */}
      <ul className={Style.items}>
        {entry.items.map((item) => (
          <li key={item.id}>
            {/* MUI's Checkbox still renders a real <input type="checkbox">,
                so keeping it inside the <label> keeps what that buys: the
                whole row is the tap target, and the keyboard and screen
                reader behaviour is the browser's, not ours. What changes is
                that the box is drawn by the app rather than by the operating
                system — the same reason the group <select> had to go. */}
            <label className={Style.item}>
              <Checkbox
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
          </li>
        ))}
      </ul>
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
