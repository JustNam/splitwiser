/**
 * The data behind B3 · Session detail. Pure functions.
 *
 * Two definitions from CourtTab_Database_Design.md drive everything here:
 *
 *   Phải trả (due)  = every ledger row that is NOT a payment, signed
 *   Đã trả  (paid)  = every payment row, signed
 *
 * `due − paid` is then the whole story: 0 is settled, positive is still owing,
 * negative is overpaid. No row type needs a special case, and the same
 * formula covers a reverse debt — the payer ending up owing money back after
 * a correction — without any mechanism of its own.
 *
 * Both are worked out per cost line and only then added up. A net across
 * several people would be meaningless: owing Nam 50.000đ while Triết owes you
 * 20.000đ is not "30.000đ outstanding".
 */

import { displayName } from './money.service'
import { formatSessionDate } from './session.service'

// ---------------------------------------------------------------------------
// sessionDetail
// ---------------------------------------------------------------------------
/**
 * Everything B3 shows about one session.
 *
 * @param {object} params
 * @param {object} params.session
 * @param {object[]} params.costLines - the whole group's; filtered here
 * @param {object[]} params.participants
 * @param {object[]} params.ledger
 * @param {object[]} params.members
 * @param {object[]} params.accounts
 * @param {string} params.myMemberId
 * @returns {object}
 */
export function sessionDetail({
  session,
  costLines,
  participants,
  ledger,
  members,
  accounts,
  myMemberId,
}) {
  const memberOf = (memberId) => members.find((member) => member.id === memberId)
  const nameOf = (memberId) => {
    const member = memberOf(memberId)
    return member ? displayName(member, accounts) : 'Someone'
  }

  const sessionCostLines = costLines.filter((line) => line.sessionId === session.id)
  const sessionLedger = ledger.filter((row) => row.sessionId === session.id)

  const playedIds = participants
    .filter((row) => row.sessionId === session.id)
    .map((row) => row.memberId)

  const total = sessionCostLines.reduce((running, line) => running + line.amount, 0)

  const lines = sessionCostLines.map((line) => ({
    id: line.id,
    note: line.note ?? 'Session cost',
    payerText: `${nameOf(line.payerMemberId)} paid${
      memberOf(line.payerMemberId)?.type === 'guest' ? ' · guest' : ''
    }`,
    amount: line.amount,
  }))

  const people = buildPeople({ sessionCostLines, sessionLedger, playedIds }).map(
    (person) => ({
      ...person,
      name:
        person.memberId === myMemberId
          ? `${nameOf(person.memberId)} (you)`
          : nameOf(person.memberId),
      isGuest: memberOf(person.memberId)?.type === 'guest',
    })
  )

  return {
    id: session.id,
    date: session.date,
    dateLabel: formatSessionDate(session.date),
    total,
    // "1 cost · 2 played" — a one-line sanity check on the session.
    meta: `${lines.length} ${lines.length === 1 ? 'cost' : 'costs'} · ${
      playedIds.length
    } played`,
    lines,
    people,
  }
}

// ---------------------------------------------------------------------------
// buildPeople
// ---------------------------------------------------------------------------
/**
 * The "Who played" list: what each person's share is, and where it stands.
 */
function buildPeople({ sessionCostLines, sessionLedger, playedIds }) {
  const zeros = () => new Map(playedIds.map((id) => [id, 0]))

  const share = zeros() //       what they owe for the session
  const charged = zeros() //     the part of that which was a charge to them
  const outstanding = zeros() // still to pay
  const overpaid = zeros() //    paid more than they owe
  const handedOver = zeros() //  money actually moved, for B4's warning

  const payers = new Set(sessionCostLines.map((line) => line.payerMemberId))

  for (const line of sessionCostLines) {
    const rows = sessionLedger.filter((row) => row.costLineId === line.id)
    const payerId = line.payerMemberId

    let assigned = 0

    for (const memberId of playedIds) {
      const { due, paid } = dueAndPaid(rows, memberId)

      if (memberId !== payerId) {
        share.set(memberId, share.get(memberId) + due)
        assigned += due
      }

      // A charge, not a credit. Someone with a negative due is owed money on
      // this line rather than charged for it.
      if (due > 0) charged.set(memberId, charged.get(memberId) + due)

      handedOver.set(memberId, handedOver.get(memberId) + paid)

      const net = due - paid
      if (net > 0) {
        outstanding.set(memberId, outstanding.get(memberId) + net)
      } else if (net < 0 && due > 0) {
        // `due > 0` matters: the payer's own line always nets negative — they
        // are owed money by everyone else — and being owed is not the same
        // thing as having paid too much.
        overpaid.set(memberId, overpaid.get(memberId) - net)
      }
    }

    // The payer's share is the one number never written to the ledger — a
    // debt to yourself isn't a debt — so it comes out as the remainder of the
    // cost once everyone else's share is taken off.
    if (share.has(payerId))
      share.set(payerId, share.get(payerId) + line.amount - assigned)
  }

  return playedIds.map((memberId) => ({
    memberId,
    amount: share.get(memberId),
    // What this person still has to hand over. B3 reads it to decide whether
    // "Pay my share" is a button that means anything to the person looking.
    outstanding: outstanding.get(memberId),
    // Positive when this person has handed money over. B4 warns before an
    // edit changes the share of someone who has already paid.
    paid: handedOver.get(memberId),
    ...status({
      charged: charged.get(memberId),
      outstanding: outstanding.get(memberId),
      overpaid: overpaid.get(memberId),
      paidALine: payers.has(memberId),
    }),
  }))
}

/**
 * One person's position on one cost line.
 *
 * The sign convention is the whole trick: a payment is stored receiver →
 * payer, the mirror image of the debt it clears, so flipping its sign back is
 * what turns it into "money this person handed over".
 */
function dueAndPaid(rows, memberId) {
  let due = 0
  let paid = 0

  for (const row of rows) {
    const sign = row.debtorId === memberId ? 1 : row.creditorId === memberId ? -1 : 0
    if (sign === 0) continue

    if (row.type === 'payment') paid -= sign * row.amount
    else due += sign * row.amount
  }

  return { due, paid }
}

/**
 * The words next to a person's amount. `tone` only reinforces them — the
 * status is never carried by colour alone.
 */
function status({ charged, outstanding, overpaid, paidALine }) {
  // The reverse debt: never charged anything, yet owing money. It happens
  // when a correction lands after the bill was already settled, and the
  // person who ends up owing is usually the one who paid for everyone.
  if (charged === 0 && outstanding > 0) {
    return { status: 'owes back', statusAmount: outstanding, tone: 'warn' }
  }

  // Before "paid": someone who overpaid is settled AND owed money back, and
  // the second half is the part they need to see.
  if (overpaid > 0) {
    return { status: 'overpaid', statusAmount: overpaid, tone: 'warn' }
  }

  if (charged === 0) {
    return { status: paidALine ? 'paid the bill' : 'nothing to pay', tone: 'muted' }
  }

  if (outstanding === 0) return { status: 'paid', tone: 'good' }
  if (outstanding === charged) return { status: 'unpaid', tone: 'muted' }

  return { status: 'short', statusAmount: outstanding, tone: 'muted' }
}
