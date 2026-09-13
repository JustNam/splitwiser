/**
 * The data behind B5 · Settle up. Pure functions.
 *
 * Home answers "how much do I owe this person". B5 has to answer the next
 * question — "why exactly that much" — so nothing here is aggregated per
 * person until the individual debts have been worked out first: one debt per
 * cost line, naming the session it came from.
 *
 * Both directions come back in the same shape. Either side can record that a
 * debt is done: "I paid you" and "you paid me" are the same event seen from
 * two chairs, and whoever opens the app first should be able to say so.
 */

import { displayName } from './money.service'
import { formatSessionDate } from './session.service'

// ---------------------------------------------------------------------------
// payableDebts
// ---------------------------------------------------------------------------
/**
 * Every open debt between me and everyone else, split by cost line.
 *
 * @param {object} params
 * @param {object[]} params.ledger
 * @param {object[]} params.members - members of ONE group
 * @param {object[]} params.accounts
 * @param {object[]} params.sessions
 * @param {object[]} params.costLines
 * @param {string} params.myMemberId
 * @returns {{
 *   owedByMe: Group[],
 *   owedToMe: Group[],
 *   net: number,
 * }} where Group is
 *   { memberId, name, isGuest, total,
 *     items: [{ id, costLineId, memberId, label, sub, amount }] }
 */
export function payableDebts({
  ledger,
  members,
  accounts,
  sessions,
  costLines,
  myMemberId,
}) {
  // One pass over the ledger, accumulating a signed total per
  // (cost line × other person). Positive means I owe; negative means they do.
  //
  // A Map rather than an object because the key is built from two ids and a
  // Map keeps them as data instead of turning them into object properties.
  const nets = new Map()

  for (const row of ledger) {
    let other
    let sign

    if (row.debtorId === myMemberId) {
      other = row.creditorId
      sign = 1
    } else if (row.creditorId === myMemberId) {
      other = row.debtorId
      sign = -1
    } else {
      // A debt between two other people. Real, but not mine to settle.
      continue
    }

    const key = `${row.costLineId}|${other}`
    nets.set(key, (nets.get(key) ?? 0) + sign * row.amount)
  }

  const byMemberId = new Map(members.map((member) => [member.id, member]))
  const costLineById = new Map(costLines.map((line) => [line.id, line]))
  const sessionById = new Map(sessions.map((session) => [session.id, session]))

  // memberId → the group row being built for them, one map per direction
  const iOwe = new Map()
  const theyOwe = new Map()

  for (const [key, net] of nets) {
    if (net === 0) continue

    const [costLineId, otherId] = key.split('|')

    const costLine = costLineById.get(costLineId)
    const other = byMemberId.get(otherId)

    // A member or cost line missing from the snapshot means the two were read
    // at different moments. Skipping is safer than showing half a row.
    if (!costLine || !other) continue

    const session = sessionById.get(costLine.sessionId)

    const item = {
      id: key,
      costLineId,
      memberId: otherId,
      label: costLine.note ?? 'Session cost',
      sub: session ? formatSessionDate(session.date) : '',
      amount: Math.abs(net),
    }

    const into = net > 0 ? iOwe : theyOwe

    if (!into.has(otherId)) {
      into.set(otherId, {
        memberId: otherId,
        name: displayName(other, accounts),
        isGuest: other.type === 'guest',
        total: 0,
        items: [],
      })
    }

    const group = into.get(otherId)
    group.items.push(item)
    group.total += item.amount
  }

  const owedByMe = sortGroups([...iOwe.values()])
  const owedToMe = sortGroups([...theyOwe.values()])

  const totalOwedToMe = owedToMe.reduce((running, group) => running + group.total, 0)
  const totalIOwe = owedByMe.reduce((running, group) => running + group.total, 0)

  return { owedByMe, owedToMe, net: totalOwedToMe - totalIOwe }
}

/**
 * Largest first, at both levels: the debt most worth clearing goes on top.
 */
function sortGroups(groups) {
  groups.sort((a, b) => b.total - a.total)
  for (const group of groups) {
    group.items.sort((a, b) => b.amount - a.amount)
  }
  return groups
}
