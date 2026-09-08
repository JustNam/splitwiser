/**
 * Balance math — ledger rows → "who owes whom". Pure functions, like
 * money.service.js.
 *
 * There is no balance column anywhere. Every number is derived from the ledger
 * on the spot, which is what keeps an append-only ledger safe: no stored total
 * can drift out of sync with it.
 */

// Sort keys for the Balances list. Strings can't be subtracted, so each
// direction gets a number: lower sorts higher up the screen.
const DIRECTION_ORDER = { 'they-owe-me': 0, 'i-owe-them': 1 }

// ---------------------------------------------------------------------------
// netBetween
// ---------------------------------------------------------------------------
/**
 * Net position between me and one other member.
 *
 *   netBetween(ledger, 'm1', 'm2') → { theyOweMe: 90000, iOweThem: 7500, net: 82500 }
 *
 * `type` is deliberately ignored: a `payment` row is stored receiver → payer,
 * the opposite direction of the `share` it cancels, so it subtracts itself
 * just by being counted. `adjustment` too. One formula, three row types.
 *
 * @param {object[]} ledger
 * @param {string} myMemberId
 * @param {string} otherMemberId
 * @returns {{ theyOweMe: number, iOweThem: number, net: number }} net > 0 when
 *   they owe me, < 0 when I owe them.
 */
export function netBetween(ledger, myMemberId, otherMemberId) {
  let theyOweMe = 0
  let iOweThem = 0

  for (const row of ledger) {
    if (row.debtorId === otherMemberId && row.creditorId === myMemberId) {
      theyOweMe += row.amount
    } else if (row.debtorId === myMemberId && row.creditorId === otherMemberId) {
      iOweThem += row.amount
    }
  }

  return { theyOweMe, iOweThem, net: theyOweMe - iOweThem }
}

// ---------------------------------------------------------------------------
// groupBalances
// ---------------------------------------------------------------------------
/**
 * Every open balance in one group, from one person's view — the data behind
 * the Balances block on Home. Settled pairs are dropped.
 *
 * `members` must already be narrowed to one group; the ledger needs no
 * filtering because it only ever pairs members within a group.
 *
 * @param {object} params
 * @param {object[]} params.ledger
 * @param {object[]} params.members - members of ONE group
 * @param {object[]} params.accounts
 * @param {string} params.myMemberId
 * @returns {{
 *   rows: Array<{
 *     memberId: string, name: string, isGuest: boolean,
 *     amount: number, direction: 'they-owe-me' | 'i-owe-them',
 *   }>,
 *   totalOwedToMe: number,
 *   totalIOwe: number,
 *   net: number,
 * }}
 */
export function groupBalances({ ledger, members, accounts, myMemberId }) {
  const rows = []
  let totalOwedToMe = 0
  let totalIOwe = 0

  for (const member of members) {
    if (member.id === myMemberId) continue

    const { net } = netBetween(ledger, myMemberId, member.id)
    if (net === 0) continue

    if (net > 0) totalOwedToMe += net
    else totalIOwe += -net

    rows.push({
      memberId: member.id,
      name: member.name ?? accounts.find((a) => a.id === member.accountId)?.name,
      isGuest: member.type === 'guest',
      // Always positive — direction is its own field, so no screen has to read
      // meaning into a minus sign.
      amount: Math.abs(net),
      direction: net > 0 ? 'they-owe-me' : 'i-owe-them',
    })
  }

  rows.sort((a, b) => {
    // Direction decides first: everyone who owes me sits above everyone I owe.
    const byDirection = DIRECTION_ORDER[a.direction] - DIRECTION_ORDER[b.direction]
    if (byDirection !== 0) return byDirection

    // Same direction — largest amount first.
    return b.amount - a.amount
  })

  return { rows, totalOwedToMe, totalIOwe, net: totalOwedToMe - totalIOwe }
}
