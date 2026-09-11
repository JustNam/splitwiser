/**
 * The data behind B5 · Settle up. Pure functions.
 *
 * Home answers "how much do I owe this person". B5 has to answer the next
 * question — "why exactly that much" — so nothing here is aggregated per
 * person until the individual debts have been worked out first: one debt per
 * cost line, naming the session it came from.
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
 *   owedByMe: Array<{
 *     memberId: string, name: string, isGuest: boolean, total: number,
 *     items: Array<{ id: string, costLineId: string, label: string,
 *                    sub: string, amount: number }>,
 *   }>,
 *   owedToMe: Array<{ id: string, memberId: string, who: string,
 *                     label: string, sub: string, amount: number }>,
 *   net: number,
 * }}
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

  // memberId → the group row being built for them
  const owedGroups = new Map()
  const owedToMe = []

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
      label: costLine.note ?? 'Session cost',
      sub: session ? formatSessionDate(session.date) : '',
      amount: Math.abs(net),
    }

    if (net < 0) {
      owedToMe.push({ ...item, memberId: otherId, who: displayName(other, accounts) })
      continue
    }

    if (!owedGroups.has(otherId)) {
      owedGroups.set(otherId, {
        memberId: otherId,
        name: displayName(other, accounts),
        isGuest: other.type === 'guest',
        total: 0,
        items: [],
      })
    }

    const owedGroup = owedGroups.get(otherId)
    owedGroup.items.push(item)
    owedGroup.total += item.amount
  }

  const owedByMe = [...owedGroups.values()]

  // Largest first, at both levels: the debt most worth clearing is the one to
  // put at the top.
  owedByMe.sort((a, b) => b.total - a.total)
  for (const owedGroup of owedByMe) {
    owedGroup.items.sort((a, b) => b.amount - a.amount)
  }
  owedToMe.sort((a, b) => b.amount - a.amount)

  const totalOwedToMe = owedToMe.reduce((running, item) => running + item.amount, 0)
  const totalIOwe = owedByMe.reduce((running, owedGroup) => running + owedGroup.total, 0)

  return { owedByMe, owedToMe, net: totalOwedToMe - totalIOwe }
}
